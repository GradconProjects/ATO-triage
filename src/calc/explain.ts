import type { EstimateLine, EstimateSection, LineStatus, ManualReviewItem } from './types';

/**
 * Explain-trail helpers. Every number the estimate shows is backed by an EstimateLine built here.
 * Line ids are stable per input (module.topic[@itemId]) so the report and tests can address them.
 */

export interface LineInit {
  id: string;
  section: EstimateSection;
  label: string;
  amountCents: number;
  ruleId: string;
  inputs?: string[];
  formula: string;
  status?: LineStatus;
  note?: string;
  category?: string;
  itemId?: string | null;
  detail?: EstimateLine['detail'];
  informational?: boolean;
  provisional?: boolean;
  heldOut?: boolean;
}

/** Build one line with defaults (status computed, no inputs). */
export function line(init: LineInit): EstimateLine {
  const out: EstimateLine = {
    id: init.id,
    section: init.section,
    label: init.label,
    amountCents: Math.trunc(init.amountCents),
    ruleId: init.ruleId,
    inputs: init.inputs ?? [],
    formula: init.formula,
    status: init.status ?? 'computed',
  };
  if (init.note !== undefined) out.note = init.note;
  if (init.category !== undefined) out.category = init.category;
  if (init.itemId !== undefined) out.itemId = init.itemId;
  if (init.detail !== undefined) out.detail = init.detail;
  if (init.informational) out.informational = true;
  if (init.provisional) out.provisional = true;
  if (init.heldOut) out.heldOut = true;
  return out;
}

/** Line id for a question instance: `${prefix}@${itemId}` when inside a repeater. */
export function lineId(prefix: string, itemId?: string | null): string {
  return itemId ? `${prefix}@${itemId}` : prefix;
}

/** Collects lines, guaranteeing unique ids (a duplicate id gets a `#n` suffix). */
export class LineBuilder {
  private readonly items: EstimateLine[] = [];
  private readonly seen = new Map<string, number>();

  add(init: LineInit): EstimateLine {
    const l = line(init);
    const count = this.seen.get(l.id) ?? 0;
    this.seen.set(l.id, count + 1);
    if (count > 0) l.id = `${l.id}#${count + 1}`;
    this.items.push(l);
    return l;
  }

  /** Convenience: a computed line. */
  computed(init: Omit<LineInit, 'status'>): EstimateLine {
    return this.add({ ...init, status: 'computed' });
  }

  /** Convenience: an excluded line (amount shown, never counted). */
  excluded(init: Omit<LineInit, 'status'> & { note: string }): EstimateLine {
    return this.add({ ...init, status: 'excluded' });
  }

  /** Convenience: a manual-review line (income and deduction lines are counted provisionally unless heldOut). */
  review(init: Omit<LineInit, 'status'> & { note: string }): EstimateLine {
    return this.add({ ...init, status: 'manual_review' });
  }

  lines(): EstimateLine[] {
    return [...this.items];
  }

  bySection(section: EstimateSection): EstimateLine[] {
    return this.items.filter((l) => l.section === section);
  }

  /** Sum of computed, non-informational amounts in a section. */
  sumSection(section: EstimateSection): number {
    return this.items
      .filter((l) => l.section === section && l.status === 'computed' && !l.informational)
      .reduce((acc, l) => acc + l.amountCents, 0);
  }
}

/** Build a ManualReviewItem. */
export function manualReview(module: string, reason: string, questionIds: string[], amountCents?: number): ManualReviewItem {
  const item: ManualReviewItem = { module, reason, questionIds: [...questionIds] };
  if (amountCents !== undefined) item.amountCents = Math.trunc(amountCents);
  return item;
}
