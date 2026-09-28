import { GOV_TYPES, Q } from '../../questions/ids';
import type { CreditKind } from '../../engine/types';
import type { CalcContext } from '../context';
import { lineId } from '../explain';

const KNOWN_CREDITS: Array<{ id: string; kind: CreditKind; label: string }> = [
  { id: Q.emp.withheld, kind: 'payg_withheld', label: 'PAYG tax withheld (employer)' },
  { id: Q.comp.weeklyWithheld, kind: 'payg_withheld', label: 'PAYG tax withheld (WorkCover)' },
  ...GOV_TYPES.map((t) => ({ id: Q.gov.withheld(t), kind: 'payg_withheld' as CreditKind, label: `PAYG tax withheld (government ${t.replace(/_/g, ' ')})` })),
  { id: Q.sup.withheld, kind: 'payg_withheld', label: 'PAYG tax withheld (super)' },
  { id: Q.inv.interestTfnWithheld, kind: 'tfn_withheld', label: 'TFN amounts withheld (interest)' },
  { id: Q.inv.divTfnWithheld, kind: 'tfn_withheld', label: 'TFN amounts withheld (dividends)' },
  { id: Q.inv.trustTfnWithheld, kind: 'tfn_withheld', label: 'TFN amounts withheld (trust)' },
  { id: Q.off.paygInstalments, kind: 'payg_instalment', label: 'PAYG instalments paid' },
  { id: Q.inv.divFrankingCredit, kind: 'franking_credit', label: 'Franking credits (dividends)' },
  { id: Q.inv.trustFrankingCredit, kind: 'franking_credit', label: 'Franking credits (trust)' },
  { id: Q.bus.ptCredits, kind: 'franking_credit', label: 'Franking credits (partnership/trust)' },
];

const LABELS: Record<CreditKind, string> = {
  payg_withheld: 'PAYG tax withheld',
  payg_instalment: 'PAYG instalments',
  franking_credit: 'Franking credits',
  tfn_withheld: 'TFN amounts withheld',
  foreign_tax_paid: 'Foreign tax paid',
};

/** Step 8: refundable credits. Foreign tax paid is not a credit here (it flows through FITO). */
export function computeCredits(cx: CalcContext): number {
  const fy = cx.rules.fy;
  let total = 0;
  const done = new Set<string>();
  const addCredit = (id: string, itemId: string | null, kind: CreditKind, label: string, cents: number, key: string) => {
    if (done.has(key)) return;
    done.add(key);
    total += cents;
    cx.lines.computed({ id: lineId(`credit.${id}`, itemId), section: 'credits', label, amountCents: cents, ruleId: `${fy}.credit.${kind}`, inputs: [id], formula: `${label} ${cents / 100}`, category: kind, itemId });
  };
  for (const k of KNOWN_CREDITS) {
    for (const { itemId, cents, key } of cx.centsInstances(k.id)) addCredit(k.id, itemId, k.kind, k.label, cents, key);
  }
  for (const q of cx.questions) {
    if (q.type !== 'money' || !q.credit || q.credit === 'foreign_tax_paid') continue;
    for (const { itemId, cents, key } of cx.centsInstances(q.id)) addCredit(q.id, itemId, q.credit, `${LABELS[q.credit]}: ${q.prompt}`, cents, key);
  }
  cx.setStatus('credits', done.size > 0 ? 'computed' : 'not_applicable');
  return total;
}
