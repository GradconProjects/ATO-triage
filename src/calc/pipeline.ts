import { Q } from '../questions/ids';
import { CalcContext } from './context';
import { floorToDollar } from './money';
import type { CalcInput, Estimate, EstimateTotals } from './types';
import { computeIncome } from './modules/income';
import { computeRental } from './modules/rental';
import { computeCgt } from './modules/cgt';
import { computeDeductions, NON_WORK_CATEGORIES } from './modules/deductions';
import type { DeductionCategory } from '../engine/types';
import { computeCar } from './modules/car';
import { computeHomeOffice } from './modules/home-office';
import { computeLaundry } from './modules/laundry';
import { computeSuperDeduction } from './modules/super';
import { computeGrossTax, residencyKind } from './modules/tax-scale';
import { computeLito } from './modules/lito';
import { computeSapto } from './modules/sapto';
import { computeOtherOffsets } from './modules/offsets';
import { collectArrears, computeLspia } from './modules/lspia';
import { computeMedicare } from './modules/medicare';
import { computeMls } from './modules/mls';
import { computeStudyLoan } from './modules/study-debt';
import { computeCredits } from './modules/withholding';

/** Every module key that appears in `moduleStatus` (defaulting to not_applicable). */
export const CALC_MODULES = [
  'income', 'rental', 'cgt', 'deductions', 'decline_in_value', 'car', 'home_office', 'laundry', 'super_contribution',
  'tax_scale', 'lito', 'sapto', 'offsets', 'fito', 'phi_rebate', 'lspia', 'medicare', 'mls', 'study_loan', 'credits',
] as const;

/**
 * Section 8 pipeline, fixed order:
 * 1 assessable income (incl. net rent and net capital gain) -> 2 deductions -> 3 taxable income (floored to the
 * dollar, negative -> 0 and carried forward) -> 4 gross tax -> 5 non-refundable offsets (capped at gross tax)
 * -> 6 Medicare levy and surcharge -> 7 study loan -> 8 refundable credits -> 9 result.
 */
export function calculate(input: CalcInput): Estimate {
  const cx = new CalcContext(input);
  for (const m of CALC_MODULES) cx.moduleStatus[m] = 'not_applicable';

  // 1. Income.
  const income = computeIncome(cx);
  const rentNet = computeRental(cx);
  const cgt = computeCgt(cx);
  const assessableConfirmed = income.assessableCents + rentNet + cgt.netCapitalGainCents;

  // 2. Deductions.
  const ded = computeDeductions(cx);
  const car = computeCar(cx);
  const wfh = computeHomeOffice(cx);
  const laundry = computeLaundry(cx);
  const superDed = computeSuperDeduction(cx, income.rescCents);
  const deductionsConfirmed = ded.deductionsCents + car + wfh + laundry + superDed;

  // Amounts under review are counted provisionally, as entered, so the estimate reflects what has
  // been answered; each stays flagged for review. A line marked heldOut is not counted (a likely
  // double count, or an amount usually not taxed at marginal rates).
  let provisionalIncome = 0;
  let provisionalDeductions = 0;
  let provisionalWorkRelated = 0;
  let heldOut = 0;
  for (const l of cx.lines.lines()) {
    if (l.status !== 'manual_review' || l.informational || (l.section !== 'income' && l.section !== 'deductions')) continue;
    if (l.heldOut) {
      heldOut += Math.abs(l.amountCents);
      continue;
    }
    l.provisional = true;
    if (l.section === 'income') provisionalIncome += l.amountCents;
    else {
      provisionalDeductions += l.amountCents;
      if (!NON_WORK_CATEGORIES.has(l.category as DeductionCategory)) provisionalWorkRelated += l.amountCents;
    }
  }
  const assessable = assessableConfirmed + provisionalIncome;
  const deductions = deductionsConfirmed + provisionalDeductions;
  const workRelated = ded.workRelatedCents + car + wfh + laundry + provisionalWorkRelated;
  if (provisionalIncome || provisionalDeductions) {
    cx.assume(`Amounts under review are included provisionally as entered (income ${provisionalIncome / 100}, deductions ${provisionalDeductions / 100}); the result changes if the review finds otherwise.`);
  }

  // 3. Taxable income.
  const rawTaxable = floorToDollar(assessable - deductions);
  const taxable = Math.max(0, rawTaxable);
  const carriedForwardLoss = rawTaxable < 0 ? -rawTaxable : 0;
  cx.lines.computed({ id: 'taxable_income', section: 'taxable_income', label: 'Taxable income', amountCents: taxable, ruleId: `${cx.rules.fy}.taxableIncome`, inputs: [], formula: `assessable income ${assessable / 100} - deductions ${deductions / 100}, rounded down to the dollar${carriedForwardLoss ? ` (loss ${carriedForwardLoss / 100} carried forward)` : ''}` });
  for (const d of income.deferredLosses) if (d.closingCents > 0) cx.assume(`${d.activity}: deferred non-commercial loss of ${d.closingCents / 100} carried forward (kept separate from capital losses).`);
  if (carriedForwardLoss > 0) cx.review('taxable_income', `Deductions exceed income by ${carriedForwardLoss / 100}; the loss is carried forward (non-commercial loss rules may apply).`, [], carriedForwardLoss);

  // 4. Gross tax.
  const kind = residencyKind(cx);
  const isResident = kind === 'resident' || kind === 'temporary' || kind === 'unknown';
  const gross = computeGrossTax(cx, taxable);

  // 5. Offsets.
  const litoAmt = computeLito(cx, taxable, isResident);
  const saptoAmt = computeSapto(cx, taxable, income.rfbCents, income.rescCents);
  const other = computeOtherOffsets(cx, { taxableCents: taxable, grossTaxCents: gross.grossTaxCents, foreignIncomeCents: income.foreignIncomeCents, rfbCents: income.rfbCents, rescCents: income.rescCents });
  const lspiaAmt = computeLspia(cx, { taxableCents: taxable, lumpSumECents: income.lumpSumECents });
  // Non-refundable offsets reduce income tax only (never the Medicare levy) and cannot go below nil.
  // Refundable offsets are kept apart and are paid out in full even when income tax is nil.
  const offsetsRaw = litoAmt + saptoAmt + other.offsetsCents + lspiaAmt;
  const offsets = Math.min(offsetsRaw, gross.grossTaxCents);
  if (offsetsRaw > gross.grossTaxCents) cx.assume(`Non-refundable offsets (${offsetsRaw / 100}) exceed gross tax; only ${gross.grossTaxCents / 100} can be used and the rest is lost (non-refundable offsets are not paid out).`);
  const taxAfterOffsets = gross.grossTaxCents - offsets;
  const refundableOffsets = other.refundableCents;
  const phiRecovery = other.phiLiabilityCents;

  // 6. Medicare levy and surcharge.
  const medicare = computeMedicare(cx, taxable, collectArrears(cx, income.lumpSumECents));
  const mls = computeMls(cx, taxable, income.rfbCents, income.rescCents, medicare.exempt);

  // 7. Study loan.
  const study = computeStudyLoan(cx, taxable, income.rfbCents, income.rescCents);

  // 8. Credits.
  const credits = computeCredits(cx);

  // 9. Result.
  const result = credits + refundableOffsets - (taxAfterOffsets + phiRecovery + medicare.levyCents + mls + study);
  cx.lines.computed({ id: 'result', section: 'result', label: result >= 0 ? 'Estimated refund' : 'Estimated amount owing', amountCents: result, ruleId: `${cx.rules.fy}.result`, inputs: [], formula: `credits ${credits / 100} + refundable offsets ${refundableOffsets / 100} - (tax after non-refundable offsets ${taxAfterOffsets / 100} + private health rebate recovered ${phiRecovery / 100} + Medicare ${medicare.levyCents / 100} + MLS ${mls / 100} + study loan ${study / 100})` });

  const totals: EstimateTotals = {
    assessableIncomeCents: assessable,
    deductionsCents: deductions,
    taxableIncomeCents: taxable,
    grossTaxCents: gross.grossTaxCents,
    offsetsCents: offsets,
    taxAfterOffsetsCents: taxAfterOffsets,
    medicareLevyCents: medicare.levyCents,
    mlsCents: mls,
    studyLoanCents: study,
    creditsCents: credits,
    resultCents: result,
    carriedForwardLossCents: carriedForwardLoss,
    capitalLossCarriedForwardCents: cgt.capitalLossCarriedForwardCents,
    workRelatedDeductionsCents: workRelated,
    phiLiabilityCents: phiRecovery,
    provisionalIncomeCents: provisionalIncome,
    provisionalDeductionsCents: provisionalDeductions,
    heldOutCents: heldOut,
    refundableOffsetsCents: refundableOffsets,
  };

  // A year whose rule table still carries forward unconfirmed values is a limitation of the estimate.
  if (cx.rules.unconfirmed?.length) {
    cx.review('rules', `Some ${cx.fy} rates are not yet confirmed by the ATO: ${cx.rules.unconfirmed.join('; ')}. The estimate may change when they are published.`, []);
    cx.markUncertain('rules.unconfirmed');
  }
    // Anything answered "not sure" among the calc's key gate questions is uncertain for the range.
  if (cx.a.isNotSure(Q.res.status)) cx.markUncertain(Q.res.status);

  return {
    fy: cx.fy,
    ruleSetVersion: cx.rules.version,
    lines: cx.lines.lines(),
    totals,
    manualReview: [...cx.reviews],
    assumptions: [...cx.assumptions],
    uncertainInputs: [...cx.uncertain],
    moduleStatus: { ...cx.moduleStatus },
    deferredLosses: income.deferredLosses,
  };
}
