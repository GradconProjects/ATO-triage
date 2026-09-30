import { describe, expect, it } from 'vitest';
import { AnswerView } from '@/src/engine/answers';
import { GROUPS, Q } from '@/src/questions/ids';
import { QUESTION_BANK } from '@/src/questions';
import { buildPrefillPreview, sourceRefFor } from '@/src/lib/prior-year/prefill';
import { a, c, item, run } from '../calc/fixture';

const EV = 'ev1';
const ACT = 'act1';
const TOOL = 'tool1';
const priorItems = [item('e1', GROUPS.employer), item(EV, GROUPS.cgtEvent), item(ACT, GROUPS.businessActivity), item(TOOL, GROUPS.toolItem)];
const priorAnswers = [
  a(Q.res.status, 'resident_full'),
  a(Q.emp.name, 'Acme Care', 'e1'), a(Q.emp.gross, c(80000), 'e1'), a(Q.emp.withheld, c(18000), 'e1'),
  // Capital: $11,000 brought in, a $3,000 short-term gain uses part of it.
  a(Q.cgt.events, ['crypto']), a(Q.cgt.assetType, 'crypto', EV), a(Q.cgt.description, '0.1 BTC', EV),
  a(Q.cgt.acquiredDate, '2024-09-01', EV), a(Q.cgt.disposedDate, '2025-03-01', EV), a(Q.cgt.costBase, c(2000), EV), a(Q.cgt.proceeds, c(5000), EV), a(Q.cgt.ownershipPct, 100, EV),
  a(Q.cgt.priorLosses, c(11000)), a(Q.cgt.priorLossesOrigin, ['derivatives']), a(Q.cgt.cryptoMethod, 'fifo'),
  // Separate activity: $7,500 loss, no test met -> deferred.
  a(Q.bus.activityAny, 'yes'), a(Q.bus.activityName, 'Trading signals', ACT), a(Q.bus.activityIncome, 0, ACT),
  a(Q.bus.activityExpSubscriptions, c(1500), ACT), a(Q.bus.activityExpOther, c(6000), ACT), a(Q.bus.activityLossTests, ['none'], ACT),
  // A $1,000 laptop first used 1 July 2024, 4-year life, 100% work.
  a(Q.ded.toolAny, 'yes'), a(Q.ded.toolItem, 'Laptop', TOOL), a(Q.ded.toolCost, c(1000), TOOL), a(Q.ded.toolDate, '2024-07-01', TOOL),
  a(Q.ded.toolEffectiveLife, 4, TOOL), a(Q.ded.toolWorkPct, 100, TOOL), a(Q.ded.toolPaid, 'paid_not_reimbursed', TOOL),
];
const prior = () => {
  const estimate = run(priorAnswers, { items: priorItems, questions: [...QUESTION_BANK] });
  const view = new AnswerView(priorAnswers.map((x, i) => ({ questionId: x.id, repeaterItemId: x.item ?? null, value: x.value, state: 'answered' as const, source: 'user' as const, version: i + 1 })), priorItems);
  return { caseId: 'prior-case', fy: '2024-25', status: 'final', view, items: priorItems, estimate };
};
const target = (answers: { id: string; value: unknown; item?: string | null }[] = []) => ({
  fy: '2025-26', view: new AnswerView(answers.map((x, i) => ({ questionId: x.id, repeaterItemId: x.item ?? null, value: x.value, state: 'answered' as const, source: 'user' as const, version: i + 1 })), []),
  items: [], questions: QUESTION_BANK, capitalThresholdCents: 30000,
});

describe('prior-year prefill preview', () => {
  const byQ = (p: ReturnType<typeof buildPrefillPreview>, id: string) => p.filter((x) => x.questionId === id);

  it('uses the earlier year\'s computed closing capital loss, not its entered opening balance', () => {
    const p = buildPrefillPreview(prior(), target());
    const loss = byQ(p, Q.cgt.priorLosses)[0]!;
    expect(loss.value).toBe(c(8000));
    expect(loss.category).toBe('opening_balance');
    expect(loss.reconciliation).toContain('opening $11,000.00');
    expect(loss.reconciliation).toContain('closing $8,000.00');
    // The history of where the losses came from is kept for review, not converted.
    expect(byQ(p, Q.cgt.priorLossesOrigin)[0]!.value).toEqual(['derivatives']);
  });

  it('warns instead of pre-ticking when the earlier year\'s capital gains were still in review', () => {
    const src = prior();
    src.estimate = run(priorAnswers.filter((x) => x.id !== Q.cgt.cryptoMethod), { items: priorItems, questions: [...QUESTION_BANK] });
    const loss = buildPrefillPreview(src, target()).find((x) => x.questionId === Q.cgt.priorLosses)!;
    expect(loss.warning).toContain('review');
    expect(loss.selected).toBe(false);
  });

  it('keeps deferred business losses separate, per activity, from capital losses', () => {
    const p = buildPrefillPreview(prior(), target());
    const d = byQ(p, Q.bus.activityPriorDeferred)[0]!;
    expect(d.value).toBe(c(7500));
    expect(d.sourceItemId).toBe(ACT);
    expect(d.targetItemId).toBeNull();
    expect(byQ(p, Q.bus.activityName)[0]!.value).toBe('Trading signals');
    expect(p.some((x) => x.questionId === Q.cgt.priorLosses && x.value === c(7500))).toBe(false);
  });

  it('continues depreciation from the written-down value, never the original cost', () => {
    const p = buildPrefillPreview(prior(), target());
    const ov = byQ(p, Q.ded.toolOpeningValue)[0]!;
    expect(ov.value).toBe(c(500)); // $1,000 x 200%/4 x 365/365 = $500 decline
    expect(byQ(p, Q.ded.toolCost)[0]!.value).toBe(c(1000)); // purchase detail kept, not re-claimed
    expect(byQ(p, Q.ded.toolDate)[0]!.value).toBe('2024-07-01'); // purchase date not reset
  });

  it('never carries forward income, withholding, expenses or loss-test answers', () => {
    const ids = new Set(buildPrefillPreview(prior(), target()).map((x) => x.questionId));
    for (const id of [Q.emp.gross, Q.emp.withheld, Q.bus.activityIncome, Q.bus.activityExpSubscriptions, Q.bus.activityExpOther, Q.bus.activityLossTests, Q.ded.toolWorkPct, Q.cgt.proceeds]) expect(ids.has(id), id).toBe(false);
    expect(buildPrefillPreview(prior(), target()).find((x) => x.questionId === Q.res.status)?.category).toBe('annual_fact');
  });

  it('flags conflicts with current answers and does not pre-tick them', () => {
    const p = buildPrefillPreview(prior(), target([{ id: Q.res.status, value: 'temporary' }]));
    const r = byQ(p, Q.res.status)[0]!;
    expect(r.conflict).toBeDefined();
    expect(r.selected).toBe(false);
  });

  it('records the source year and case on every value', () => {
    const p = buildPrefillPreview(prior(), target());
    const ref = sourceRefFor(byQ(p, Q.cgt.priorLosses)[0]!, { caseId: 'prior-case', fy: '2024-25' });
    expect(ref).toMatchObject({ kind: 'prior_year', fromCaseId: 'prior-case', fy: '2024-25', category: 'opening_balance' });
  });
});

describe('prefill from an uploaded prior-year notice', () => {
  const doc = {
    documentKind: 'notice_of_assessment' as const, financialYear: '2024-25', taxableIncome: 80000,
    netCapitalLossesCarriedForward: 8000, deferredLosses: [{ activity: 'Trading signals', amount: 7500 }], notes: '',
  };
  it('keeps capital losses and deferred business losses apart and records the document', async () => {
    const { buildDocumentPreview } = await import('@/src/lib/prior-year/prefill');
    const p = buildDocumentPreview(doc, { fileName: 'noa-2025.pdf' }, target());
    expect(p.find((x) => x.questionId === Q.cgt.priorLosses)?.value).toBe(c(8000));
    const d = p.find((x) => x.questionId === Q.bus.activityPriorDeferred)!;
    expect(d.value).toBe(c(7500));
    expect(d.reconciliation).toContain('noa-2025.pdf');
    const ref = sourceRefFor(d, { fy: '2024-25', documentId: 'doc-1', documentName: 'noa-2025.pdf' });
    expect(ref).toMatchObject({ kind: 'prior_year', documentId: 'doc-1', fileName: 'noa-2025.pdf', category: 'opening_balance' });
  });
  it('warns when the document is not for an earlier year', async () => {
    const { buildDocumentPreview } = await import('@/src/lib/prior-year/prefill');
    const p = buildDocumentPreview({ ...doc, financialYear: '2025-26' }, { fileName: 'x.pdf' }, target());
    expect(p.find((x) => x.questionId === Q.cgt.priorLosses)?.selected).toBe(false);
  });
});
