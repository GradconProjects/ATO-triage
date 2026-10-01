/**
 * Prior-year prefill (extends the "Start new year" copy of stable facts).
 *
 * Builds a reviewable preview of values from an earlier case of the same profile:
 * - reusable details (employer, rental, business identity, platforms, depreciating assets),
 * - opening balances worked out from the earlier year's closing records (never its entered
 *   opening balance): capital losses carried forward, deferred losses per activity, asset values,
 * - annual facts shown only as suggestions (residency, spouse, cover...).
 *
 * Nothing is confirmed by the prefill: every value is written as `imported` with its source and
 * must be confirmed in the interview before it counts. Income, withholding, expense amounts,
 * work-use percentages, trading results, loss-test answers and health-cover details are never
 * proposed.
 */
import type { AnswerView } from '../../engine/answers';
import type { Question, RepeaterItem, SourceRef } from '../../engine/types';
import type { Estimate } from '../../calc/types';
import { formatCents } from '../../engine/validation';
import { GROUPS, Q } from '../../questions/ids';
import type { ExtractedPriorYear } from '../documents/extract';

export type PrefillCategory = 'reusable' | 'opening_balance' | 'annual_fact';

export interface PrefillProposal {
  /** Stable key for selection: `${questionId}@${sourceItemId ?? ''}`. */
  key: string;
  questionId: string;
  prompt: string;
  category: PrefillCategory;
  value: unknown;
  display: string;
  /** Repeater placement: the earlier item, and the current item it maps to (null = a new item). */
  groupId?: string;
  sourceItemId?: string;
  itemLabel?: string;
  targetItemId?: string | null;
  /** The current answer, when one exists and differs. */
  conflict?: { display: string; state: string };
  /** How an opening balance was worked out from the earlier year's closing records. */
  reconciliation?: string;
  warning?: string;
  /** Pre-ticked in the preview (never when it conflicts with a current answer). */
  selected: boolean;
}

export interface PrefillSource {
  caseId: string;
  fy: string;
  status: string;
  view: AnswerView;
  items: RepeaterItem[];
  /** Freshly recalculated from the earlier case's current answers (so later amendments count). */
  estimate: Estimate;
  documentName?: string;
}

export interface PrefillTarget {
  fy: string;
  view: AnswerView;
  items: RepeaterItem[];
  questions: readonly Question[];
  capitalThresholdCents: number;
}

const norm = (s: unknown) => (typeof s === 'string' ? s.toLowerCase().replace(/pty|ltd|limited|the|[^a-z0-9]/g, '') : '');

/** Annual facts: shown as suggestions only. Amount-type annual facts are never proposed. */
const ANNUAL_FACTS = [Q.res.status, Q.fam.spouse, Q.phi.cover, 'loan.types', Q.rent.any, Q.bus.soleTrader, Q.bus.activityAny, Q.cgt.derivativesAny, Q.ded.toolAny];
const REUSABLE_TOP = [Q.bus.abn, Q.bus.name, Q.cgt.platforms, Q.cgt.priorLossesOrigin, Q.cgt.priorLossesCorrection];
const REUSABLE_GROUPS: Record<string, { fields: string[]; match: string[]; facts?: string[] }> = {
  // PHI: insurer and membership are reusable; last year's spouse election is only offered for confirmation.
  // Premiums, rebate received, statement lines, coverage, tiers and spouse consent are never carried.
  [GROUPS.phiPolicy]: { fields: ['phi.policy.insurer', Q.phi.policyMembership], match: [Q.phi.policyMembership, 'phi.policy.insurer'], facts: [Q.phi.policyElection] },
  [GROUPS.employer]: { fields: [Q.emp.name, Q.emp.abn, Q.emp.occupation, Q.emp.otherTags], match: [Q.emp.abn, Q.emp.name] },
  [GROUPS.rentalProperty]: { fields: [Q.rent.address, Q.rent.ownershipPct], match: [Q.rent.address] },
  [GROUPS.businessActivity]: { fields: [Q.bus.activityName, Q.bus.activityKind, Q.bus.activityAbn], match: [Q.bus.activityAbn, Q.bus.activityName] },
  // Only depreciating assets: items under the instant threshold were fully claimed last year.
  [GROUPS.toolItem]: { fields: [Q.ded.toolItem, Q.ded.toolCost, Q.ded.toolDate, Q.ded.toolEffectiveLife], match: [Q.ded.toolItem] },
};

export function displayFor(q: Question | undefined, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (q?.type === 'money' && typeof v === 'number') return formatCents(v);
  const label = (x: unknown) => q?.options?.find((o) => o.value === x)?.label ?? String(x);
  if (Array.isArray(v)) return v.map(label).join(', ');
  if (q?.type === 'single' || q?.type === 'yes_no_unsure') return v === 'yes' ? 'Yes' : v === 'no' ? 'No' : label(v);
  if (typeof v === 'object' && v && 'from' in v && 'to' in v) return `${(v as { from: string }).from} to ${(v as { to: string }).to}`;
  return String(v);
}

export function buildPrefillPreview(src: PrefillSource, tgt: PrefillTarget): PrefillProposal[] {
  const byId = new Map(tgt.questions.map((q) => [q.id, q]));
  const out: PrefillProposal[] = [];
  const itemMap = new Map<string, string | null>();

  const push = (p: Omit<PrefillProposal, 'key' | 'prompt' | 'display' | 'selected' | 'conflict'> & { display?: string }) => {
    if (!byId.has(p.questionId)) return;
    const q = byId.get(p.questionId);
    const target = p.targetItemId ?? null;
    const current = p.groupId && target === null ? undefined : tgt.view.get(p.questionId, target);
    const display = p.display ?? displayFor(q, p.value);
    const hasCurrent = current && (current.state === 'answered' || current.state === 'imported' || current.state === 'not_sure');
    const same = hasCurrent && JSON.stringify(current.value) === JSON.stringify(p.value);
    if (same && current.state === 'answered') return; // already confirmed with the same value
    const conflict = hasCurrent && !same ? { display: current.state === 'not_sure' ? 'Not sure' : displayFor(q, current.value), state: current.state } : undefined;
    out.push({ ...p, key: `${p.questionId}@${p.sourceItemId ?? ''}`, prompt: q?.prompt ?? p.questionId, display, ...(conflict ? { conflict } : {}), selected: !conflict && !p.warning });
  };
  const answered = (id: string, item: string | null = null) => {
    const r = src.view.get(id, item);
    return r && r.state === 'answered' ? r.value : undefined;
  };

  // 1. Annual facts (suggestions only).
  for (const id of ANNUAL_FACTS) {
    const v = answered(id);
    if (v !== undefined) push({ questionId: id, category: 'annual_fact', value: v });
  }
  // 2. Reusable top-level details.
  for (const id of REUSABLE_TOP) {
    const v = answered(id);
    if (v !== undefined && !(Array.isArray(v) && v.length === 0)) push({ questionId: id, category: 'reusable', value: v });
  }
  // 3. Reusable repeater items, matched to current items where possible.
  for (const [groupId, spec] of Object.entries(REUSABLE_GROUPS)) {
    const current = tgt.items.filter((i) => i.groupId === groupId);
    const taken = new Set<string>();
    for (const it of src.items.filter((i) => i.groupId === groupId)) {
      if (groupId === GROUPS.toolItem) {
        const cost = answered(Q.ded.toolCost, it.id);
        if (typeof cost !== 'number' || cost < tgt.capitalThresholdCents) continue;
      }
      const label = String(answered(spec.fields[0]!, it.id) ?? '');
      let target: string | null = null;
      for (const m of spec.match) {
        const v = norm(answered(m, it.id));
        if (!v) continue;
        const hit = current.find((c) => !taken.has(c.id) && norm(tgt.view.get(m, c.id)?.value) === v);
        if (hit) { target = hit.id; break; }
      }
      if (target) taken.add(target);
      itemMap.set(it.id, target);
      for (const f of spec.fields) {
        const v = answered(f, it.id);
        if (v !== undefined) push({ questionId: f, category: 'reusable', value: v, groupId, sourceItemId: it.id, itemLabel: label, targetItemId: target });
      }
      for (const f of spec.facts ?? []) {
        const v = answered(f, it.id);
        if (v !== undefined) push({ questionId: f, category: 'annual_fact', value: v, groupId, sourceItemId: it.id, itemLabel: label, targetItemId: target });
      }
    }
  }

  const draft = src.status !== 'final' ? `The ${src.fy} case is still a draft; its closing figures can change.` : undefined;

  // 4a. Capital losses carried forward: the earlier year's computed closing balance.
  {
    const closing = src.estimate.totals.capitalLossCarriedForwardCents;
    const net = src.estimate.lines.find((l) => l.id === 'income.cgt.net');
    const entered = answered(Q.cgt.priorLosses);
    if (closing > 0 || typeof entered === 'number') {
      const opening = typeof entered === 'number' ? entered : 0;
      const d = net?.detail ?? {};
      const currentLosses = Number(d['currentLossesCents'] ?? 0);
      const used = opening + currentLosses - closing;
      const reconciliation = `${src.fy}: opening ${formatCents(opening)} + losses made that year ${formatCents(currentLosses)} - used against gains ${formatCents(Math.max(0, used))} = closing ${formatCents(closing)}.`;
      const inReview = src.estimate.moduleStatus['cgt'] === 'manual_review' ? `Some ${src.fy} capital gains items were still in review, so that year's closing balance may change once they are settled.` : undefined;
      const warning = [inReview, draft].filter(Boolean).join(' ') || undefined;
      if (closing > 0) {
        push({ questionId: Q.cgt.priorLossesAny, category: 'opening_balance', value: 'yes', reconciliation });
        push({ questionId: Q.cgt.priorLosses, category: 'opening_balance', value: closing, reconciliation, ...(warning ? { warning } : {}) });
      }
    }
  }
  // 4b. Deferred non-commercial losses, one balance per activity.
  for (const row of src.estimate.deferredLosses ?? []) {
    const reconciliation = `${src.fy} ${row.activity}: opening ${formatCents(row.openingCents)} - used ${formatCents(row.usedCents)} + loss deferred ${formatCents(row.status === 'deferred' ? row.currentLossCents : 0)} = closing ${formatCents(row.closingCents)}.`;
    const warning = row.status === 'review' ? `A loss test was ticked in ${src.fy}, so whether that year's loss was allowed or deferred must be confirmed before the balance is used.` : draft;
    if (row.closingCents <= 0 && row.status !== 'review') continue;
    if (row.activityId === 'main') push({ questionId: Q.bus.priorDeferred, category: 'opening_balance', value: row.closingCents, reconciliation, ...(warning ? { warning } : {}) });
    else {
      const target = itemMap.has(row.activityId) ? (itemMap.get(row.activityId) ?? null) : null;
      push({ questionId: Q.bus.activityPriorDeferred, category: 'opening_balance', value: row.closingCents, reconciliation, groupId: GROUPS.businessActivity, sourceItemId: row.activityId, itemLabel: row.activity, targetItemId: target, ...(warning ? { warning } : {}) });
    }
  }
  // 4c. Depreciating assets: opening value = the earlier year's closing (written-down) value.
  for (const line of src.estimate.lines) {
    if (!line.itemId || !line.id.startsWith(`ded.${Q.ded.toolCost}`)) continue;
    const closing = Number(line.detail?.['closingValueCents'] ?? NaN);
    if (!Number.isFinite(closing) || closing <= 0 || !itemMap.has(line.itemId)) continue;
    const base = Number(line.detail?.['openingValueCents'] ?? line.detail?.['costCents'] ?? 0);
    push({
      questionId: Q.ded.toolOpeningValue, category: 'opening_balance', value: closing, groupId: GROUPS.toolItem, sourceItemId: line.itemId,
      itemLabel: String(answered(Q.ded.toolItem, line.itemId) ?? 'Asset'), targetItemId: itemMap.get(line.itemId) ?? null,
      reconciliation: `${src.fy}: value ${formatCents(base)} - decline in value ${formatCents(base - closing)} = closing ${formatCents(closing)}. Check it is still used for work and was not sold.`,
      ...(draft ? { warning: draft } : {}),
    });
  }
  // 4d. Historical taxable income for back-pay (lump sum E) years that match the earlier case.
  for (const it of tgt.items.filter((i) => i.groupId === GROUPS.lumpSumEYear)) {
    if (tgt.view.get(Q.comp.lseFy, it.id)?.value !== src.fy) continue;
    push({ questionId: Q.comp.lseTaxableIncome, category: 'reusable', value: src.estimate.totals.taxableIncomeCents, groupId: GROUPS.lumpSumEYear, sourceItemId: it.id, itemLabel: src.fy, targetItemId: it.id, reconciliation: `Taxable income worked out for ${src.fy} in that year's case.`, ...(draft ? { warning: draft } : {}) });
  }
  return out;
}

export function sourceRefFor(p: PrefillProposal, src: { caseId?: string; fy: string; documentId?: string; documentName?: string }): SourceRef {
  return {
    kind: 'prior_year', fy: src.fy, category: p.category,
    ...(src.caseId ? { fromCaseId: src.caseId } : {}),
    ...(src.documentId ? { documentId: src.documentId } : {}),
    ...(src.documentName ? { fileName: src.documentName } : {}),
    ...(p.reconciliation ? { note: p.reconciliation } : {}),
  };
}

/**
 * Proposals from an uploaded prior-year notice, return or activity record. Closing balances as
 * printed on it; capital losses and deferred business losses stay in their own places.
 */
export function buildDocumentPreview(doc: ExtractedPriorYear, meta: { fileName: string }, tgt: PrefillTarget): PrefillProposal[] {
  const byId = new Map(tgt.questions.map((q) => [q.id, q]));
  const out: PrefillProposal[] = [];
  const fy = doc.financialYear ?? 'earlier year';
  const kind = doc.documentKind.replace(/_/g, ' ');
  const earlierWarning = doc.financialYear && doc.financialYear >= tgt.fy ? `This document is for ${doc.financialYear}, which is not earlier than ${tgt.fy}. Check you uploaded last year's document.` : undefined;
  const add = (p: Omit<PrefillProposal, 'key' | 'prompt' | 'display' | 'selected'>) => {
    const q = byId.get(p.questionId);
    if (!q) return;
    const current = p.groupId && !p.targetItemId ? undefined : tgt.view.get(p.questionId, p.targetItemId ?? null);
    const conflict = current && (current.state === 'answered' || current.state === 'imported') && JSON.stringify(current.value) !== JSON.stringify(p.value) ? { display: displayFor(q, current.value), state: current.state } : undefined;
    if (current?.state === 'answered' && !conflict) return;
    out.push({ ...p, key: `${p.questionId}@${p.sourceItemId ?? ''}`, prompt: q.prompt, display: displayFor(q, p.value), ...(conflict ? { conflict } : {}), selected: !conflict && !p.warning });
  };
  const note = `As printed on the ${fy} ${kind} (${meta.fileName}).`;
  if (doc.netCapitalLossesCarriedForward !== null && doc.netCapitalLossesCarriedForward > 0) {
    const cents = Math.round(doc.netCapitalLossesCarriedForward * 100);
    add({ questionId: Q.cgt.priorLossesAny, category: 'opening_balance', value: 'yes', reconciliation: note });
    add({ questionId: Q.cgt.priorLosses, category: 'opening_balance', value: cents, reconciliation: `${note} Closing net capital losses carried forward.`, ...(earlierWarning ? { warning: earlierWarning } : {}) });
  }
  const activities = tgt.items.filter((i) => i.groupId === GROUPS.businessActivity);
  doc.deferredLosses.forEach((d, n) => {
    const cents = Math.round(d.amount * 100);
    if (!(cents > 0)) return;
    const reconciliation = `${note} Deferred non-commercial loss of "${d.activity}".`;
    if (norm(tgt.view.get(Q.bus.name)?.value) && norm(tgt.view.get(Q.bus.name)?.value) === norm(d.activity)) {
      add({ questionId: Q.bus.priorDeferred, category: 'opening_balance', value: cents, reconciliation, ...(earlierWarning ? { warning: earlierWarning } : {}) });
      return;
    }
    const hit = activities.find((i) => norm(tgt.view.get(Q.bus.activityName, i.id)?.value) === norm(d.activity));
    const src = `doc-activity-${n}`;
    if (!hit) add({ questionId: Q.bus.activityName, category: 'reusable', value: d.activity, groupId: GROUPS.businessActivity, sourceItemId: src, itemLabel: d.activity, targetItemId: null, reconciliation: note });
    add({ questionId: Q.bus.activityPriorDeferred, category: 'opening_balance', value: cents, reconciliation, groupId: GROUPS.businessActivity, sourceItemId: src, itemLabel: d.activity, targetItemId: hit?.id ?? null, ...(earlierWarning ? { warning: earlierWarning } : {}) });
  });
  if (doc.taxableIncome !== null && doc.financialYear) {
    for (const it of tgt.items.filter((i) => i.groupId === GROUPS.lumpSumEYear)) {
      if (tgt.view.get(Q.comp.lseFy, it.id)?.value !== doc.financialYear) continue;
      add({ questionId: Q.comp.lseTaxableIncome, category: 'reusable', value: Math.round(doc.taxableIncome * 100), groupId: GROUPS.lumpSumEYear, sourceItemId: it.id, itemLabel: doc.financialYear, targetItemId: it.id, reconciliation: `${note} Taxable income for that year.` });
    }
  }
  return out;
}
