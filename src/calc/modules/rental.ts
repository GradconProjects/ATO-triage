import { GROUPS, Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { pct } from '../money';

const EXPENSES: Array<{ id: string; label: string; capital?: boolean; repairs?: boolean }> = [
  { id: Q.rent.expInterest, label: 'loan interest' },
  { id: Q.rent.expCouncil, label: 'council rates' },
  { id: Q.rent.expWater, label: 'water' },
  { id: Q.rent.expInsurance, label: 'insurance' },
  { id: Q.rent.expAgent, label: 'agent fees' },
  { id: Q.rent.expRepairs, label: 'repairs and maintenance', repairs: true },
  { id: Q.rent.expCapitalWorks, label: 'capital works', capital: true },
  { id: Q.rent.expDepreciation, label: 'depreciation', capital: true },
  { id: Q.rent.expOther, label: 'other expenses' },
];

/**
 * Rental: per property net = (income - expenses) x ownership %. Capital works and depreciation are
 * included as entered but flagged; initial repairs are excluded and flagged. Net losses reduce income.
 */
export function computeRental(cx: CalcContext): number {
  const fy = cx.rules.fy;
  let total = 0;
  let touched = false;
  for (const it of cx.items(GROUPS.rentalProperty)) {
    const id = it.id;
    const vis = (q: string) => cx.visible.has(`${q}@${id}`);
    const income = vis(Q.rent.income) ? cx.a.cents(Q.rent.income, id) : undefined;
    const expenses = EXPENSES.map((e) => ({ ...e, cents: vis(e.id) ? cx.a.cents(e.id, id) : undefined })).filter((e): e is typeof e & { cents: number } => e.cents !== undefined);
    if (income === undefined && expenses.length === 0) continue;
    touched = true;
    const address = cx.a.string(Q.rent.address, id);
    const label = `Rental property${address ? ` (${address})` : ''}`;
    let ownership = cx.a.number(Q.rent.ownershipPct, id);
    if (ownership === undefined) {
      ownership = 100;
      cx.assume(`${label}: ownership share not answered; 100% assumed.`);
    }
    const initial = cx.a.string(Q.rent.initialRepairs, id);
    const initialNotSure = cx.a.isNotSure(Q.rent.initialRepairs, id);
    let deductible = 0;
    const parts: string[] = [];
    for (const e of expenses) {
      if (e.repairs && (initial === 'yes' || initialNotSure)) {
        const reason = initial === 'yes' ? 'Initial repairs (fixing defects that existed at purchase) are capital, not deductible.' : 'Not sure whether repairs were initial repairs after purchase.';
        cx.lines.review({ id: `income.rent.${e.id}@${id}`, section: 'income', label: `${label}: repairs`, amountCents: e.cents, ruleId: `${fy}.rental.initialRepairs`, inputs: [e.id, Q.rent.initialRepairs], formula: `${e.cents / 100} excluded pending review`, note: reason, category: 'rent', itemId: id, informational: true });
        cx.review('rental', `${label}: ${reason}`, [e.id, Q.rent.initialRepairs], e.cents);
        cx.markUncertain(`${e.id}@${id}`);
        cx.setStatus('rental', 'manual_review');
        continue;
      }
      if (e.capital) {
        cx.review('rental', `${label}: ${e.label} included as entered; check the capital works / depreciation schedule.`, [e.id], e.cents);
        cx.lines.computed({ id: `income.rent.${e.id}@${id}`, section: 'income', label: `${label}: ${e.label}`, amountCents: -e.cents, ruleId: `${fy}.rental.capital`, inputs: [e.id], formula: `${e.cents / 100} as entered (flagged)`, note: 'Capital works and depreciation need a quantity surveyor schedule or the ATO rates; included as entered.', category: 'rent', itemId: id, informational: true });
      } else {
        cx.lines.computed({ id: `income.rent.${e.id}@${id}`, section: 'income', label: `${label}: ${e.label}`, amountCents: -e.cents, ruleId: `${fy}.rental`, inputs: [e.id], formula: `${e.cents / 100}`, category: 'rent', itemId: id, informational: true });
      }
      deductible += e.cents;
      parts.push(`${e.label} ${e.cents / 100}`);
    }
    const gross = income ?? 0;
    const net = pct(gross - deductible, ownership);
    if (cx.a.string(Q.rent.shortStay, id) === 'yes') cx.assume(`${label}: short-stay/holiday use; expenses must be apportioned for private use days.`);
    total += net;
    if (cx.moduleStatus['rental'] !== 'manual_review') cx.setStatus('rental', 'computed');
    cx.lines.computed({ id: `income.rent.net@${id}`, section: 'income', label: `${label}: net rent`, amountCents: net, ruleId: `${fy}.rental`, inputs: [Q.rent.income, Q.rent.ownershipPct, ...expenses.map((e) => e.id)], formula: `(rent ${gross / 100} - expenses ${deductible / 100}${parts.length ? ` [${parts.join(', ')}]` : ''}) x ${ownership}%`, category: 'rent', itemId: id, detail: { grossRentCents: gross, expensesCents: deductible, ownershipPct: ownership } });
  }
  if (!touched) cx.setStatus('rental', 'not_applicable');
  return total;
}
