/**
 * Short "how this works" notes shown in grey italics under a question. Figures are read from the
 * case's rule set, so each tax year shows its own thresholds and rates.
 */
import type { FY } from '../engine/types';
import { getRuleSet, type RuleSet } from '../rules';
import { Q } from './ids';

const $ = (n: number) => `$${n.toLocaleString('en-AU')}`;
const pc = (n: number) => `${Number(n.toFixed(3))}%`;

function mlsBands(r: RuleSet): string {
  const [t0, t1, t2] = r.mls.tiers;
  if (!t0 || !t1 || !t2) return '';
  return `Base: up to ${$(t0.singleTo!)} single / ${$(t0.familyTo!)} family. Tier 1: up to ${$(t1.singleTo!)} / ${$(t1.familyTo!)}. Tier 2: up to ${$(t2.singleTo!)} / ${$(t2.familyTo!)}. Tier 3: above that.`;
}
const MLS_INCOME = 'income for Medicare levy surcharge purposes (taxable income plus reportable fringe benefits, reportable super contributions and net investment losses)';

const TIPS: Record<string, (r: RuleSet) => string> = {
  [Q.phi.policyTier]: (r) => {
    const rb = r.phiRebate;
    const rate = (i: number) => (rb[i] ? pc(rb[i]!.under65) : '');
    return `Your tier is set by your ${MLS_INCOME}; a couple uses combined income. ${r.fy}: ${mlsBands(r)} Family thresholds rise ${$(r.mls.familyChildIncrement)} for each dependent child after the first. Rebate if under 65: base ${rate(0)}, tier 1 ${rate(1)}, tier 2 ${rate(2)}, tier 3 nil (higher at 65+). The percentages can change slightly from 1 April.`;
  },
  [Q.phi.cover]: (r) => {
    const t = r.mls.tiers;
    return `Without private hospital cover, the Medicare levy surcharge is ${t.slice(1).map((x) => pc(x.rate * 100)).join(', ')} of income (tier 1, 2, 3) once your ${MLS_INCOME} passes ${$(t[0]?.singleTo ?? 0)} single or ${$(t[0]?.familyTo ?? 0)} family (${r.fy}).`;
  },
  [Q.emp.rfb]: () => 'Shown on your income statement when your employer gave you more than $2,000 of fringe benefits (for example a work car for private use or salary-packaged items). It is not taxed as income, but it counts for the Medicare levy surcharge, private health tier and HELP repayments.',
  [Q.emp.resc]: () => 'Extra super your employer paid because you salary-sacrificed or agreed to it, on top of the compulsory super guarantee. The compulsory amount is not reportable. Like fringe benefits, it counts for the surcharge, private health tier and HELP repayments.',
  [Q.emp.lumpA]: () => 'Unused annual leave or long service leave paid out when you left a job. Type R: you left because of redundancy, early retirement or invalidity. Type T: any other reason, such as resigning.',
  [Q.emp.lumpAType]: () => 'R = redundancy, early retirement or invalidity (taxed at no more than 30%). T = left for any other reason, such as resigning or being dismissed.',
  [Q.emp.lumpB]: () => 'Long service leave built up before 16 August 1978, paid out when you left. Only 5% of it is taxable. Rare today.',
  [Q.emp.lumpD]: () => 'The tax-free part of a genuine redundancy or early retirement payment. It is not taxed, but it is still reported.',
  [Q.emp.lumpE]: () => 'Back pay from earlier years, paid to you this year. If $1,200 or more, it may be treated as if paid in the years it relates to, which can lower the tax through an offset.',
  [Q.ded.carMethod]: (r) => `Cents per km: ${r.carCentsPerKm}c for each work km, up to ${r.carMaxKm.toLocaleString('en-AU')} km per car, no receipts needed, but you must be able to show how you worked out the km. Logbook: a 12-week logbook gives your work-use %, applied to all car costs; keep receipts. Logbook usually wins for high work use or an expensive car.`,
  [Q.ded.wfhMethod]: (r) => `Fixed rate: ${r.wfhFixedRatePerHour}c for each hour worked at home, covering electricity, gas, phone, internet and stationery; you need a record of every hour (a timesheet or diary, not an estimate). Actual cost: the work share of each real expense, which needs detailed records. Office furniture and equipment are claimed separately under either method.`,
  [Q.fam.spouse]: () => 'A spouse is someone you were married to or lived with as a couple (de facto), of any sex. Having a spouse switches you to the family thresholds for the Medicare levy surcharge and private health tier.',
  [Q.fam.spouseTaxableIncome]: (r) => `Added to yours to test the family thresholds. ${r.fy} surcharge and private health family thresholds start at ${$(r.mls.tiers[0]?.familyTo ?? 0)}.`,
  [Q.fam.dependantsCount]: (r) => `Children under 21, or full-time students under 25, whom you supported. Each child after the first raises the family surcharge and private health thresholds by ${$(r.mls.familyChildIncrement)}. Having a child also lets a single parent use the family thresholds.`,
  [Q.off.saptoEligible]: () => 'Age Pension age is 67. You may also qualify if you received a service pension or similar from Veterans’ Affairs. Eligible seniors get a higher tax-free threshold through the senior and pensioner tax offset.',
  [Q.off.zone]: () => 'Zone A and B are remote parts of Australia listed by the ATO (Zone A is the most remote). You must have lived or worked there for at least 183 days of the year. A special area is a very remote part of a zone.',
  [Q.res.status]: () => 'Usually you are an Australian resident for tax if you live here and intend to stay, even while travelling. Someone who spends more than half the year here can be a resident too. Temporary visa holders are usually temporary residents; working holiday makers are taxed at their own rates.',
};

/** The grey-italic note for a question in a given tax year, or undefined. */
export function questionTip(questionId: string, fy: FY): string | undefined {
  const tip = TIPS[questionId];
  return tip ? tip(getRuleSet(fy)) : undefined;
}
