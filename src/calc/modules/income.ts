import { FOREIGN_TYPES, GOV_TYPES, GROUPS, Q } from '../../questions/ids';
import type { Question } from '../../engine/types';
import { pct } from '../money';
import type { CalcContext } from '../context';
import type { DeferredLossRow } from '../types';
import { lineId } from '../explain';
import { resolveTreatment } from '../treatment';
import { residencyKind } from './tax-scale';

export interface IncomeResult {
  assessableCents: number;
  /** Lump sum E amounts included in income (LSPIA input). */
  lumpSumECents: number;
  /** Foreign income included as assessable (FITO apportionment). */
  foreignIncomeCents: number;
  /** Franking credits grossed up into income (dividends, trusts, partnerships). */
  frankingCreditsCents: number;
  rfbCents: number;
  rescCents: number;
  salaryCents: number;
  deferredLosses: DeferredLossRow[];
}

type IncomeTreatment = 'I' | 'N' | 'R';

interface IncomeItem {
  idPrefix: string;
  itemId: string | null;
  label: string;
  cents: number;
  /** Amount actually assessable when I (defaults to cents). */
  assessableCents?: number;
  category: string;
  inputs: string[];
  formula: string;
  ruleId: string;
  treatment: IncomeTreatment;
  note?: string;
  key: string;
}

/** Ids the special income handlers own; the data-driven loop skips them. */
export const SPECIAL_INCOME_IDS = new Set<string>([
  Q.emp.gross, Q.emp.lumpA, Q.emp.lumpB, Q.emp.lumpD, Q.emp.lumpE, Q.emp.rfb, Q.emp.resc,
  Q.emp.otherPayCash, Q.emp.otherPayTips, Q.emp.otherPayGifts, Q.emp.otherPayDirector, Q.emp.otherPayLabourHire, Q.emp.otherPayOtherAmount,
  Q.allow.amount,
  Q.comp.weeklyAmount, Q.comp.arrearsAmount, Q.comp.weeklyIncludesArrears, Q.comp.medicalAmount, Q.comp.impairmentAmount, Q.comp.economicLossAmount,
  Q.comp.commonLawAmount, Q.comp.interestAmount, Q.comp.legalAmount, Q.comp.incomeProtectionAmount, Q.comp.sicknessAmount,
  Q.comp.otherAmount, Q.comp.etpAmount, Q.comp.lseAmount, Q.comp.lseTaxableIncome,
  ...GOV_TYPES.map((t) => Q.gov.amount(t)),
  Q.sup.amount,
  Q.inv.interestAmount, Q.inv.divUnfranked, Q.inv.divFranked, Q.inv.divFrankingCredit,
  Q.inv.trustIncome, Q.inv.trustFrankingCredit, Q.inv.trustCgDiscounted, Q.inv.trustCgOther, Q.inv.trustForeignIncome, Q.inv.trustForeignTax,
  Q.inv.essDiscount,
  Q.rent.income, Q.rent.expInterest, Q.rent.expCouncil, Q.rent.expWater, Q.rent.expInsurance, Q.rent.expAgent, Q.rent.expRepairs,
  Q.rent.expCapitalWorks, Q.rent.expDepreciation, Q.rent.expOther,
  Q.cgt.proceeds, Q.cgt.costBase, Q.cgt.priorLosses, Q.cgt.cryptoIncome, Q.cgt.derivativesNet,
  ...FOREIGN_TYPES.map((t) => Q.fgn.amount(t)),
  Q.fgn.taxPaid,
  Q.bus.income, Q.bus.expenses, Q.bus.ptShare, Q.bus.ptCredits, Q.bus.priorDeferred,
  Q.bus.activityIncome, Q.bus.activityExpSubscriptions, Q.bus.activityExpPlatform, Q.bus.activityExpOther, Q.bus.activityPriorDeferred,
  Q.chef.tipsAmount,
  Q.fam.spouseTaxableIncome, Q.fam.spouseRfb, Q.fam.spouseRsc,
  Q.core.assessedResult,
]);

function emit(cx: CalcContext, it: IncomeItem): number {
  const id = lineId(it.idPrefix, it.itemId);
  const assessable = it.assessableCents ?? it.cents;
  if (it.treatment === 'I') {
    cx.lines.computed({
      id, section: 'income', label: it.label, amountCents: assessable, ruleId: it.ruleId, inputs: it.inputs,
      formula: it.formula, category: it.category, itemId: it.itemId, ...(it.note ? { note: it.note } : {}),
    });
    return assessable;
  }
  if (it.treatment === 'N') {
    cx.lines.excluded({
      id, section: 'income', label: it.label, amountCents: it.cents, ruleId: it.ruleId, inputs: it.inputs,
      formula: it.formula, category: it.category, itemId: it.itemId, note: it.note ?? 'Not assessable income.',
    });
    return 0;
  }
  cx.lines.review({
    id, section: 'income', label: it.label, amountCents: it.cents, ruleId: it.ruleId, inputs: it.inputs,
    formula: it.formula, category: it.category, itemId: it.itemId, note: it.note ?? 'Needs manual review before it can be included.',
  });
  cx.review('income', `${it.label}: ${it.note ?? 'treatment needs manual review'}`, it.inputs, it.cents);
  cx.markUncertain(it.key);
  cx.setStatus('income', 'manual_review');
  return 0;
}

function keyOf(id: string, itemId: string | null): string {
  return itemId ? `${id}@${itemId}` : id;
}

/** Step 1: assessable income. */
export function computeIncome(cx: CalcContext): IncomeResult {
  const fy = cx.rules.fy;
  const res: IncomeResult = { assessableCents: 0, lumpSumECents: 0, foreignIncomeCents: 0, frankingCreditsCents: 0, rfbCents: 0, rescCents: 0, salaryCents: 0, deferredLosses: [] };
  let touched = false;
  const add = (it: IncomeItem) => {
    touched = true;
    const c = emit(cx, it);
    res.assessableCents += c;
    return c;
  };
  const simple = (id: string, itemId: string | null, label: string, category: string, treatment: IncomeTreatment, ruleId: string, note?: string, extraInputs: string[] = []) => {
    const cents = cx.a.cents(id, itemId);
    if (cents === undefined) return 0;
    const key = keyOf(id, itemId);
    if (!cx.visible.has(key)) return 0;
    return add({ idPrefix: `income.${id}`, itemId, label, cents, category, inputs: [id, ...extraInputs], formula: treatment === 'I' ? `${label} ${cents / 100}` : `${label} ${cents / 100} (${treatment === 'N' ? 'not assessable' : 'review'})`, ruleId, treatment, key, ...(note ? { note } : {}) });
  };

  // Employment (repeater 'employer').
  for (const { itemId, cents } of cx.centsInstances(Q.emp.gross)) {
    res.salaryCents += add({ idPrefix: 'income.salary', itemId, label: 'Salary and wages', cents, category: 'salary', inputs: [Q.emp.gross], formula: `gross payments ${cents / 100}`, ruleId: `${fy}.income.salary`, treatment: 'I', key: keyOf(Q.emp.gross, itemId) });
  }
  for (const { itemId, cents } of cx.centsInstances(Q.emp.lumpA)) {
    const type = cx.a.string(Q.emp.lumpAType, itemId);
    add({ idPrefix: 'income.lump_a', itemId, label: 'Lump sum A (unused leave)', cents, category: 'lump_sum_a', inputs: [Q.emp.lumpA, Q.emp.lumpAType], formula: `lump sum A ${cents / 100} fully assessable${type ? ` (type ${type})` : ''}`, ruleId: `${fy}.income.lumpA`, treatment: 'I', key: keyOf(Q.emp.lumpA, itemId), note: type === 'R' ? 'Type R lump sum A: a tax offset may limit tax to 30%; not modelled.' : undefined });
  }
  for (const { itemId, cents } of cx.centsInstances(Q.emp.lumpB)) {
    add({ idPrefix: 'income.lump_b', itemId, label: 'Lump sum B (5% assessable)', cents, assessableCents: pct(cents, 5), category: 'lump_sum_b', inputs: [Q.emp.lumpB], formula: `5% x ${cents / 100}`, ruleId: `${fy}.income.lumpB`, treatment: 'I', key: keyOf(Q.emp.lumpB, itemId) });
  }
  for (const { itemId, cents } of cx.centsInstances(Q.emp.lumpD)) {
    add({ idPrefix: 'income.lump_d', itemId, label: 'Lump sum D (tax-free redundancy)', cents, category: 'lump_sum_d', inputs: [Q.emp.lumpD], formula: `lump sum D ${cents / 100} not assessable`, ruleId: `${fy}.income.lumpD`, treatment: 'N', key: keyOf(Q.emp.lumpD, itemId), note: 'Lump sum D is the tax-free part of a genuine redundancy; not included in income.' });
  }
  for (const { itemId, cents } of cx.centsInstances(Q.emp.lumpE)) {
    res.lumpSumECents += add({ idPrefix: 'income.lump_e', itemId, label: 'Lump sum E (back payment)', cents, category: 'lump_sum_e', inputs: [Q.emp.lumpE], formula: `lump sum E ${cents / 100} assessable (LSPIA offset checked separately)`, ruleId: `${fy}.income.lumpE`, treatment: 'I', key: keyOf(Q.emp.lumpE, itemId) });
  }
  for (const { cents } of cx.centsInstances(Q.emp.rfb)) res.rfbCents += cents;
  for (const { cents } of cx.centsInstances(Q.emp.resc)) res.rescCents += cents;

  simple(Q.emp.otherPayCash, null, 'Cash wages', 'other_employment', 'I', `${fy}.income.otherPay`);
  simple(Q.emp.otherPayTips, null, 'Tips', 'other_employment', 'I', `${fy}.income.otherPay`);
  simple(Q.emp.otherPayDirector, null, 'Director fees', 'other_employment', 'I', `${fy}.income.otherPay`);
  simple(Q.emp.otherPayLabourHire, null, 'Labour hire payments', 'other_employment', 'I', `${fy}.income.otherPay`);
  simple(Q.emp.otherPayGifts, null, 'Gifts from clients', 'other_employment', 'R', `${fy}.income.otherPay`, 'Gifts can be income when they relate to your work; needs review.');
  simple(Q.emp.otherPayOtherAmount, null, 'Other payments', 'other_employment', 'R', `${fy}.income.otherPay`, 'Unclassified payment; needs review.', [Q.emp.otherPayOtherText]);
  simple(Q.chef.tipsAmount, null, 'Tips and gratuities', 'other_employment', 'I', `${fy}.income.tips`);

  // Allowances by nature.
  for (const { itemId, cents } of cx.centsInstances(Q.allow.amount)) {
    const nature = cx.a.string(Q.allow.nature, itemId);
    const type = cx.a.string(Q.allow.type, itemId) ?? 'allowance';
    const inputs = [Q.allow.amount, Q.allow.nature, Q.allow.type];
    const key = keyOf(Q.allow.amount, itemId);
    if (nature === 'reimbursement') {
      add({ idPrefix: 'income.allowance', itemId, label: `Reimbursement (${type})`, cents, category: 'allowance', inputs, formula: `reimbursement of actual cost ${cents / 100}`, ruleId: `${fy}.income.allowance`, treatment: 'N', key, note: 'A reimbursement of actual costs is not income, and the matching expense cannot be claimed.' });
    } else if (nature === undefined) {
      add({ idPrefix: 'income.allowance', itemId, label: `Allowance or reimbursement (${type})`, cents, category: 'allowance', inputs, formula: `${cents / 100} (allowance vs reimbursement ${cx.a.isNotSure(Q.allow.nature, itemId) ? 'not sure' : 'not answered'})`, ruleId: `${fy}.income.allowance`, treatment: 'R', key, note: cx.a.isNotSure(Q.allow.nature, itemId) ? 'Not sure whether this was an allowance or a reimbursement.' : 'Whether this was an allowance or a reimbursement has not been answered.' });
    } else if (nature === 'allowance') {
      add({ idPrefix: 'income.allowance', itemId, label: `Allowance (${type})`, cents, category: 'allowance', inputs, formula: `allowance ${cents / 100} assessable`, ruleId: `${fy}.income.allowance`, treatment: 'I', key });
    } else {
      add({ idPrefix: 'income.allowance', itemId, label: `Allowance (${type})`, cents, category: 'allowance', inputs, formula: `${cents / 100}`, ruleId: `${fy}.income.allowance`, treatment: 'R', key, note: 'Nature of the payment not recognised.' });
    }
  }

  // Compensation and termination.
  // WorkCover weekly payments: when the gross already includes the arrears (lump sum E), only the
  // remainder is counted here so the arrears are counted once; unknown -> review.
  {
    const weekly = cx.visible.has(Q.comp.weeklyAmount) ? cx.a.cents(Q.comp.weeklyAmount) : undefined;
    const arrears = cx.visible.has(Q.comp.arrearsAmount) ? cx.a.cents(Q.comp.arrearsAmount) : undefined;
    const incl = cx.visible.has(Q.comp.weeklyIncludesArrears) ? cx.a.string(Q.comp.weeklyIncludesArrears) : undefined;
    if (weekly !== undefined) {
      const inputs = [Q.comp.weeklyAmount, ...(arrears !== undefined ? [Q.comp.weeklyIncludesArrears] : [])];
      if (arrears !== undefined && incl === 'yes') {
        add({ idPrefix: `income.${Q.comp.weeklyAmount}`, itemId: null, label: 'WorkCover weekly payments (excluding the arrears)', cents: weekly - arrears, category: 'compensation', inputs, formula: `gross ${weekly / 100} includes arrears ${arrears / 100}: ${weekly / 100} - ${arrears / 100}`, ruleId: `${fy}.income.compensation`, treatment: 'I', key: Q.comp.weeklyAmount });
      } else if (arrears !== undefined && incl !== 'no' && weekly >= arrears) {
        // Not confirmed: the part of the gross that is income either way is counted; only the
        // possible overlap with the arrears (already counted on its own line) is held for review.
        add({ idPrefix: `income.${Q.comp.weeklyAmount}`, itemId: null, label: 'WorkCover weekly payments (excluding a possible overlap with the arrears)', cents: weekly - arrears, category: 'compensation', inputs, formula: `gross ${weekly / 100} - possible arrears overlap ${arrears / 100}`, ruleId: `${fy}.income.compensation`, treatment: 'I', key: Q.comp.weeklyAmount });
        add({ idPrefix: `income.${Q.comp.weeklyAmount}.overlap`, itemId: null, label: 'WorkCover weekly payments: possible double count of the arrears', cents: arrears, category: 'compensation', inputs: [Q.comp.weeklyIncludesArrears, Q.comp.arrearsAmount], formula: `${arrears / 100} counted in income only if the gross does not already include the arrears`, ruleId: `${fy}.income.compensation`, treatment: 'R', key: Q.comp.weeklyIncludesArrears, note: 'Confirm whether the weekly gross already includes the lump sum E arrears. If it does not, this amount is also income.' });
      } else {
        add({ idPrefix: `income.${Q.comp.weeklyAmount}`, itemId: null, label: 'WorkCover weekly payments', cents: weekly, category: 'compensation', inputs, formula: `WorkCover weekly payments ${weekly / 100}`, ruleId: `${fy}.income.compensation`, treatment: 'I', key: Q.comp.weeklyAmount });
      }
    }
  }
  simple(Q.comp.incomeProtectionAmount, null, 'Income protection insurance payments', 'compensation', 'I', `${fy}.income.compensation`);
  simple(Q.comp.sicknessAmount, null, 'Sickness and accident insurance payments', 'compensation', 'I', `${fy}.income.compensation`);
  simple(Q.comp.interestAmount, null, 'Interest on a compensation payment', 'interest', 'I', `${fy}.income.compensation`);
  simple(Q.comp.medicalAmount, null, 'Medical, treatment and rehabilitation reimbursements', 'compensation', 'N', `${fy}.income.compensation`, 'Reimbursed medical and rehabilitation costs are not income.');
  simple(Q.comp.legalAmount, null, 'Legal costs reimbursed', 'compensation', 'N', `${fy}.income.compensation`, 'Reimbursed legal costs are not income.');
  simple(Q.comp.impairmentAmount, null, 'Permanent impairment lump sum', 'compensation', 'R', `${fy}.income.compensation`, 'Usually a capital amount (not income), but it depends on the settlement terms. Excluded pending review.');
  simple(Q.comp.economicLossAmount, null, 'Economic loss lump sum', 'compensation', 'R', `${fy}.income.compensation`, 'Loss-of-earning-capacity lump sums are usually capital, but depend on the settlement terms. Excluded pending review.');
  simple(Q.comp.commonLawAmount, null, 'Common-law settlement', 'compensation', 'R', `${fy}.income.compensation`, 'Common-law settlements are usually capital, but depend on the settlement terms. Excluded pending review.');
  simple(Q.comp.otherAmount, null, 'Other compensation payment', 'compensation', 'R', `${fy}.income.compensation`, 'Unclassified compensation payment; needs review.', [Q.comp.otherText]);
  {
    const cents = cx.a.cents(Q.comp.arrearsAmount);
    if (cents !== undefined && cx.visible.has(Q.comp.arrearsAmount)) {
      res.lumpSumECents += add({ idPrefix: `income.${Q.comp.arrearsAmount}`, itemId: null, label: 'Arrears of weekly payments (lump sum E)', cents, category: 'lump_sum_e', inputs: [Q.comp.arrearsAmount], formula: `arrears ${cents / 100} assessable (LSPIA offset checked separately)`, ruleId: `${fy}.income.lumpE`, treatment: 'I', key: Q.comp.arrearsAmount });
    }
  }
  simple(Q.comp.etpAmount, null, 'Employment termination payment', 'etp', 'R', `${fy}.income.etp`, 'ETP components are taxed by code and cap; always manual review.', [Q.comp.etpCode]);

  // Government payments.
  for (const type of GOV_TYPES) {
    const id = Q.gov.amount(type);
    const treatment: IncomeTreatment = type === 'other' ? 'R' : 'I';
    simple(id, null, `Government payment (${type.replace(/_/g, ' ')})`, 'government', treatment, `${fy}.income.government`, treatment === 'R' ? 'Some government payments are exempt; needs review.' : undefined);
  }

  // Super income.
  {
    const cents = cx.a.cents(Q.sup.amount);
    if (cents !== undefined && cx.visible.has(Q.sup.amount)) {
      const element = cx.a.string(Q.sup.element);
      const age = cx.a.number(Q.sup.age);
      const inputs = [Q.sup.amount, Q.sup.element, Q.sup.age];
      if (element === 'taxed' && age !== undefined && age >= 60) {
        add({ idPrefix: 'income.super', itemId: null, label: 'Super income (taxed element, age 60+)', cents, category: 'super_income', inputs, formula: `taxed element received at ${age}: tax-free`, ruleId: `${fy}.income.super`, treatment: 'N', key: Q.sup.amount, note: 'Tax-free, not included: taxed-element super benefits received at 60 or over are not assessable.' });
      } else {
        add({ idPrefix: 'income.super', itemId: null, label: 'Super income', cents, category: 'super_income', inputs, formula: `${cents / 100} (${element ?? 'element unknown'}, age ${age ?? 'unknown'})`, ruleId: `${fy}.income.super`, treatment: 'R', key: Q.sup.amount, note: 'Super benefits other than a taxed element at 60+ are taxed by component; always manual review.' });
      }
    }
  }

  // Interest by ownership share.
  for (const { itemId, cents } of cx.centsInstances(Q.inv.interestAmount)) {
    let share = cx.a.number(Q.inv.interestSharePct, itemId);
    if (share === undefined) {
      share = 100;
      cx.assume('Interest account ownership share not answered: 100% assumed.');
    }
    const bank = cx.a.string(Q.inv.interestBank, itemId);
    add({ idPrefix: 'income.interest', itemId, label: `Interest${bank ? ` (${bank})` : ''}`, cents, assessableCents: pct(cents, share), category: 'interest', inputs: [Q.inv.interestAmount, Q.inv.interestSharePct], formula: `${cents / 100} x ${share}% share`, ruleId: `${fy}.income.interest`, treatment: 'I', key: keyOf(Q.inv.interestAmount, itemId) });
  }

  // Dividends with franking credit gross-up.
  for (const it of cx.items(GROUPS.dividend)) {
    const holding = cx.a.string(Q.inv.divHolding, it.id);
    const suffix = holding ? ` (${holding})` : '';
    const un = cx.visible.has(keyOf(Q.inv.divUnfranked, it.id)) ? cx.a.cents(Q.inv.divUnfranked, it.id) : undefined;
    const fr = cx.visible.has(keyOf(Q.inv.divFranked, it.id)) ? cx.a.cents(Q.inv.divFranked, it.id) : undefined;
    const fc = cx.visible.has(keyOf(Q.inv.divFrankingCredit, it.id)) ? cx.a.cents(Q.inv.divFrankingCredit, it.id) : undefined;
    if (un !== undefined) add({ idPrefix: 'income.dividend.unfranked', itemId: it.id, label: `Unfranked dividends${suffix}`, cents: un, category: 'dividend_unfranked', inputs: [Q.inv.divUnfranked], formula: `unfranked ${un / 100}`, ruleId: `${fy}.income.dividend`, treatment: 'I', key: keyOf(Q.inv.divUnfranked, it.id) });
    if (fr !== undefined) add({ idPrefix: 'income.dividend.franked', itemId: it.id, label: `Franked dividends${suffix}`, cents: fr, category: 'dividend_franked', inputs: [Q.inv.divFranked], formula: `franked ${fr / 100}`, ruleId: `${fy}.income.dividend`, treatment: 'I', key: keyOf(Q.inv.divFranked, it.id) });
    if (fc !== undefined) {
      res.frankingCreditsCents += add({ idPrefix: 'income.dividend.franking_credit', itemId: it.id, label: `Franking credits${suffix}`, cents: fc, category: 'franking_credit', inputs: [Q.inv.divFrankingCredit], formula: `franking credit ${fc / 100} grossed up into income (and claimed as a refundable credit)`, ruleId: `${fy}.income.dividend`, treatment: 'I', key: keyOf(Q.inv.divFrankingCredit, it.id) });
    }
  }

  // Trust / managed fund distributions (capital gain components handled by the CGT module).
  for (const it of cx.items(GROUPS.trustDist)) {
    const name = cx.a.string(Q.inv.trustName, it.id);
    const suffix = name ? ` (${name})` : '';
    const inc = cx.visible.has(keyOf(Q.inv.trustIncome, it.id)) ? cx.a.cents(Q.inv.trustIncome, it.id) : undefined;
    const fc = cx.visible.has(keyOf(Q.inv.trustFrankingCredit, it.id)) ? cx.a.cents(Q.inv.trustFrankingCredit, it.id) : undefined;
    const fi = cx.visible.has(keyOf(Q.inv.trustForeignIncome, it.id)) ? cx.a.cents(Q.inv.trustForeignIncome, it.id) : undefined;
    if (inc !== undefined) add({ idPrefix: 'income.trust.income', itemId: it.id, label: `Trust distribution income${suffix}`, cents: inc, category: 'trust', inputs: [Q.inv.trustIncome], formula: `non-primary production income ${inc / 100}`, ruleId: `${fy}.income.trust`, treatment: 'I', key: keyOf(Q.inv.trustIncome, it.id) });
    if (fc !== undefined) res.frankingCreditsCents += add({ idPrefix: 'income.trust.franking_credit', itemId: it.id, label: `Trust franking credits${suffix}`, cents: fc, category: 'franking_credit', inputs: [Q.inv.trustFrankingCredit], formula: `franking credit ${fc / 100} grossed up into income`, ruleId: `${fy}.income.trust`, treatment: 'I', key: keyOf(Q.inv.trustFrankingCredit, it.id) });
    if (fi !== undefined) res.foreignIncomeCents += add({ idPrefix: 'income.trust.foreign', itemId: it.id, label: `Trust foreign income${suffix}`, cents: fi, category: 'foreign', inputs: [Q.inv.trustForeignIncome], formula: `foreign income ${fi / 100}`, ruleId: `${fy}.income.trust`, treatment: 'I', key: keyOf(Q.inv.trustForeignIncome, it.id) });
  }

  simple(Q.inv.essDiscount, null, 'Employee share scheme discount', 'ess', 'R', `${fy}.income.ess`, 'ESS discounts depend on the scheme type (taxed-upfront, deferral, start-up); needs review.', [Q.inv.ess]);

  // Business / sole trader (the main business) and each separate business activity.
  // One authoritative record per activity: income less its own expenses, entered once.
  const LOSS_TESTS = ['income_20k', 'profit_3_of_5', 'property_500k', 'assets_100k'];
  const activity = (a: {
    activityId: string; itemId: string | null; name: string; income: number; expenses: number; expenseParts: string;
    opening: number; tests: string[] | undefined; inputs: string[]; psiRisk: boolean; incomeKey: string;
  }) => {
    const net = a.income - a.expenses;
    const idPrefix = a.itemId ? 'income.business.activity' : 'income.business';
    const row: DeferredLossRow = { activityId: a.activityId, activity: a.name, openingCents: a.opening, currentLossCents: 0, usedCents: 0, closingCents: a.opening, status: 'none' };
    if (net >= 0) {
      // Earlier deferred losses of this activity can only be used against this activity's profit.
      const used = Math.min(a.opening, net);
      row.usedCents = used;
      row.closingCents = a.opening - used;
      const cents = net - used;
      const formula = `income ${a.income / 100} - expenses ${a.expenses / 100}${a.expenseParts}${used ? ` - earlier deferred loss applied ${used / 100}` : ''}`;
      if (a.psiRisk) add({ idPrefix, itemId: a.itemId, label: `${a.name}: net income (PSI rules may apply)`, cents, category: 'business', inputs: a.inputs, formula, ruleId: `${fy}.income.business`, treatment: 'R', key: a.incomeKey, note: 'Personal services income rules may limit deductions; needs review.' });
      else add({ idPrefix, itemId: a.itemId, label: `${a.name}: net income`, cents, category: 'business', inputs: a.inputs, formula, ruleId: `${fy}.income.business`, treatment: 'I', key: a.incomeKey });
    } else {
      const loss = -net;
      row.currentLossCents = loss;
      const testMet = (a.tests ?? []).some((t) => LOSS_TESTS.includes(t));
      const formula = `income ${a.income / 100} - expenses ${a.expenses / 100}${a.expenseParts} = loss ${loss / 100}`;
      if (testMet) {
        row.status = 'review';
        add({ idPrefix, itemId: a.itemId, label: `${a.name}: net loss`, cents: net, category: 'business', inputs: a.inputs, formula, ruleId: `${fy}.income.business`, treatment: 'R', key: a.incomeKey, note: 'A non-commercial loss test was ticked; confirm it before the loss can offset other income.' });
      } else {
        row.status = 'deferred';
        row.closingCents = a.opening + loss;
        touched = true;
        cx.lines.excluded({
          id: lineId(idPrefix, a.itemId), section: 'income', label: `${a.name}: deferred non-commercial loss`, amountCents: net, ruleId: `${fy}.income.business.ncl`,
          inputs: a.inputs, formula, category: 'business', itemId: a.itemId,
          note: `No non-commercial loss test is met${a.tests === undefined ? ' (not yet answered)' : ''}, so the loss does not reduce other income this year. It is carried forward (${row.closingCents / 100}) for later profit from this activity.`,
        });
        if (a.tests === undefined || a.tests.includes('not_sure')) cx.review('business', `${a.name}: confirm whether a non-commercial loss test is met this year; until then the ${loss / 100} loss is deferred.`, a.inputs, loss);
      }
    }
    res.deferredLosses.push(row);
  };
  {
    const income = cx.visible.has(Q.bus.income) ? cx.a.cents(Q.bus.income) : undefined;
    if (income !== undefined) {
      const expenses = (cx.visible.has(Q.bus.expenses) ? cx.a.cents(Q.bus.expenses) : undefined) ?? 0;
      const psi80 = cx.a.string(Q.bus.psi80);
      const psiNotSure = cx.a.isNotSure(Q.bus.psi80);
      const results = cx.a.string(Q.bus.psiResults);
      const opening = (cx.visible.has(Q.bus.priorDeferred) ? cx.a.cents(Q.bus.priorDeferred) : undefined) ?? 0;
      const tests = cx.visible.has(Q.bus.lossTests) ? cx.a.list(Q.bus.lossTests) : undefined;
      activity({
        activityId: 'main', itemId: null, name: cx.a.string(Q.bus.name)?.trim() || 'Business', income, expenses, expenseParts: '', opening, tests,
        inputs: [Q.bus.income, Q.bus.expenses, Q.bus.psi80, Q.bus.psiResults, ...(opening ? [Q.bus.priorDeferred] : []), ...(tests ? [Q.bus.lossTests] : [])],
        psiRisk: (psi80 === 'yes' || psiNotSure) && results !== 'yes', incomeKey: Q.bus.income,
      });
    }
  }
  for (const it of cx.items(GROUPS.businessActivity)) {
    const v = (id: string) => (cx.visible.has(keyOf(id, it.id)) ? cx.a.cents(id, it.id) : undefined);
    const income = v(Q.bus.activityIncome);
    const parts: [string, number | undefined][] = [
      ['subscriptions', v(Q.bus.activityExpSubscriptions)],
      ['platform fees', v(Q.bus.activityExpPlatform)],
      ['other', v(Q.bus.activityExpOther)],
    ];
    const entered = parts.filter((p): p is [string, number] => p[1] !== undefined);
    if (income === undefined && entered.length === 0) continue;
    const expenses = entered.reduce((acc, [, c]) => acc + c, 0);
    const opening = v(Q.bus.activityPriorDeferred) ?? 0;
    const testsKey = keyOf(Q.bus.activityLossTests, it.id);
    const tests = cx.visible.has(testsKey) ? cx.a.list(Q.bus.activityLossTests, it.id) : undefined;
    activity({
      activityId: it.id, itemId: it.id, name: cx.a.string(Q.bus.activityName, it.id)?.trim() || 'Business activity', income: income ?? 0, expenses,
      expenseParts: entered.length ? ` (${entered.map(([l, c]) => `${l} ${c / 100}`).join(' + ')})` : '', opening, tests,
      inputs: [Q.bus.activityIncome, ...entered.map(([l]) => (l === 'subscriptions' ? Q.bus.activityExpSubscriptions : l === 'platform fees' ? Q.bus.activityExpPlatform : Q.bus.activityExpOther)), ...(opening ? [Q.bus.activityPriorDeferred] : []), ...(tests ? [Q.bus.activityLossTests] : [])],
      psiRisk: false, incomeKey: keyOf(Q.bus.activityIncome, it.id),
    });
  }
  for (const { itemId, cents } of cx.centsInstances(Q.bus.ptShare)) {
    const name = cx.a.string(Q.bus.ptName, itemId);
    const suffix = name ? ` (${name})` : '';
    if (cents < 0) add({ idPrefix: 'income.pt.share', itemId, label: `Partnership/trust loss share${suffix}`, cents, category: 'partnership_trust', inputs: [Q.bus.ptShare], formula: `${cents / 100} loss share`, ruleId: `${fy}.income.partnership`, treatment: 'R', key: keyOf(Q.bus.ptShare, itemId), note: 'A partnership or trust loss needs review (loss rules).' });
    else add({ idPrefix: 'income.pt.share', itemId, label: `Partnership/trust income share${suffix}`, cents, category: 'partnership_trust', inputs: [Q.bus.ptShare], formula: `${cents / 100}`, ruleId: `${fy}.income.partnership`, treatment: 'I', key: keyOf(Q.bus.ptShare, itemId) });
  }
  for (const { itemId, cents } of cx.centsInstances(Q.bus.ptCredits)) {
    res.frankingCreditsCents += add({ idPrefix: 'income.pt.credits', itemId, label: 'Partnership/trust franking credits', cents, category: 'franking_credit', inputs: [Q.bus.ptCredits], formula: `franking credit ${cents / 100} grossed up into income`, ruleId: `${fy}.income.partnership`, treatment: 'I', key: keyOf(Q.bus.ptCredits, itemId) });
  }

  simple(Q.cgt.cryptoIncome, null, 'Crypto income (staking, airdrops)', 'crypto_income', 'I', `${fy}.income.crypto`);
  // Derivatives traded as an investment: always review (capital or revenue depends on the facts).
  // Derivatives traded as a business are entered once as a business activity instead.
  {
    const cents = cx.visible.has(Q.cgt.derivativesNet) ? cx.a.cents(Q.cgt.derivativesNet) : undefined;
    if (cents !== undefined) add({ idPrefix: 'income.derivatives', itemId: null, label: cents < 0 ? 'Futures and derivatives net loss (classification needed)' : 'Futures and derivatives net gain (classification needed)', cents, category: 'derivatives', inputs: [Q.cgt.derivativesAny, Q.cgt.derivativesNature, Q.cgt.derivativesNet], formula: `net result ${cents / 100}`, ruleId: `${fy}.income.derivatives`, treatment: 'R', key: Q.cgt.derivativesNet, note: 'Whether derivative results are capital or revenue depends on how the trading was carried on. Not added to income or used as a loss until reviewed.' });
  }

  // Foreign income: bank meta first, else residency-based default.
  {
    const kind = residencyKind(cx);
    for (const type of FOREIGN_TYPES) {
      const id = Q.fgn.amount(type);
      const cents = cx.visible.has(id) ? cx.a.cents(id) : undefined;
      if (cents === undefined) continue;
      const q = cx.question(id);
      let treatment: IncomeTreatment;
      let note: string | undefined;
      if (q?.income?.treatment !== undefined) {
        const r = resolveTreatment(cx, q.income.treatment, null, 'I');
        treatment = r.treatment === 'I' || r.treatment === 'N' ? r.treatment : 'R';
        if (treatment === 'R') note = 'Treatment of this foreign income depends on residency; needs review.';
      } else if (kind === 'temporary') {
        treatment = 'R';
        note = 'Temporary residents are generally not taxed on foreign-sourced income; needs review.';
      } else if (kind === 'foreign') {
        treatment = 'N';
        note = 'Foreign residents are not taxed in Australia on foreign-sourced income.';
      } else {
        treatment = 'I';
      }
      const c = add({ idPrefix: `income.${id}`, itemId: null, label: `Foreign ${type.replace(/_/g, ' ')} income`, cents, category: 'foreign', inputs: [id, Q.res.status], formula: `${cents / 100} (${treatment === 'I' ? 'assessable' : treatment === 'N' ? 'not assessable' : 'review'})`, ruleId: `${fy}.income.foreign`, treatment, key: id, ...(note ? { note } : {}) });
      if (treatment === 'I') res.foreignIncomeCents += c;
    }
  }

  // Data-driven: any other money question with income meta.
  for (const q of cx.questions) {
    if (q.type !== 'money' || !q.income || SPECIAL_INCOME_IDS.has(q.id)) continue;
    for (const { itemId, cents, key } of cx.centsInstances(q.id)) {
      const r = resolveTreatment(cx, q.income.treatment, itemId, 'I');
      const treatment: IncomeTreatment = r.treatment === 'I' || r.treatment === 'N' ? r.treatment : 'R';
      const inputs = r.via ? [q.id, r.via] : [q.id];
      const c = add({ idPrefix: `income.${q.id}`, itemId, label: q.prompt, cents, category: q.income.category, inputs, formula: `${cents / 100}${r.via ? ` (${r.via} = ${r.value ?? 'unanswered'} -> ${treatment})` : ''}`, ruleId: `${fy}.income.${q.income.category}`, treatment, key, note: treatment === 'R' ? 'Treatment could not be resolved from the answers; needs review.' : undefined });
      if (treatment === 'I' && q.income.category === 'foreign') res.foreignIncomeCents += c;
      if (treatment === 'I' && q.income.category === 'lump_sum_e') res.lumpSumECents += c;
    }
  }

  if (touched && cx.moduleStatus['income'] !== 'manual_review') cx.setStatus('income', 'computed');
  if (!touched) cx.setStatus('income', 'not_applicable');
  return res;
}

/** Sum of a money question over its visible instances (helper for other modules). */
export function sumVisible(cx: CalcContext, questionId: string): number {
  return cx.centsInstances(questionId).reduce((acc, i) => acc + i.cents, 0);
}

export function isMoneyIncomeQuestion(q: Question): boolean {
  return q.type === 'money' && q.income !== undefined;
}
