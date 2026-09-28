/**
 * Consistency flags: an answer contradicts another answer or a tax rule, so the estimate has
 * already excluded or adjusted something and the user should know why.
 */
import { Q, GROUPS, PAID_OPTIONS } from '../questions/ids';
import { answerKey, formatCents, instancesOf, perInstance } from './helpers';
import type { FlagInstance, FlagRule } from './types';

const ATO = {
  reimbursements: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/deductions-for-work-expenses-and-other-expenses',
  car: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/cars-transport-and-travel/motor-vehicle-and-car-expenses',
  licences: 'https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/self-education-expenses',
  rentalRepairs: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/residential-rental-properties/rental-expenses-to-claim/rental-expenses-you-can-claim-now',
};

export const EXPENSE_REIMBURSED: FlagRule = perInstance(
  {
    code: 'EXPENSE_REIMBURSED',
    kind: 'consistency',
    severity: 'warning',
    atoRef: ATO.reimbursements,
  },
  (a, ctx): FlagInstance[] => {
    const out: FlagInstance[] = [];
    for (const q of ctx.questions) {
      if (!q.deduction) continue;
      const paidId = `${q.deduction.base}.paid`;
      for (const itemId of instancesOf(a, q)) {
        if (!a.has(q.id, itemId)) continue;
        if (a.string(paidId, itemId) !== PAID_OPTIONS.paidFullyReimbursed) continue;
        out.push({
          questionIds: [answerKey(q.id, itemId), answerKey(paidId, itemId)],
          message: `You entered ${formatCents(a.cents(q.id, itemId) ?? 0)} for "${q.prompt}" and said it was fully reimbursed. Reimbursed costs are not deductible, so this amount has been left out of your deductions.`,
        });
      }
    }
    return out;
  },
);

export const CAR_HOME_TO_WORK: FlagRule = {
  code: 'CAR_HOME_TO_WORK',
  kind: 'consistency',
  severity: 'warning',
  questionIds: [Q.ded.carTripTypes, Q.ded.carException],
  atoRef: ATO.car,
  when: (a) => {
    const trips = a.list(Q.ded.carTripTypes) ?? [];
    if (!trips.includes('home_to_work')) return false;
    if (a.isNotSure(Q.ded.carException)) return false;
    const exception = a.string(Q.ded.carException);
    return exception === undefined || exception === 'none';
  },
  message: () =>
    'Some of your car trips were between home and work. Ordinary travel between home and your regular workplace is private, so those kilometres have been excluded. Check whether one of the exceptions (bulky tools with no secure storage at work, shifting workplaces, or home as a genuine work base) applies to you.',
};

const FIRST_STAGES = ['first', 'first_check'];

export const LICENCE_FIRST: FlagRule = perInstance(
  {
    code: 'LICENCE_FIRST',
    kind: 'consistency',
    severity: 'warning',
    atoRef: ATO.licences,
  },
  (a): FlagInstance[] => {
    const pairs: Array<{ stage: string; amount: string; label: string }> = [
      { stage: Q.dsw.checksStage, amount: Q.dsw.checksAmount, label: 'working with children, NDIS or police check' },
      { stage: Q.con.licenceStage, amount: Q.con.licenceAmount, label: 'licence or card' },
      { stage: Q.chef.certStage, amount: Q.chef.certAmount, label: 'certificate' },
    ];
    const out: FlagInstance[] = [];
    for (const p of pairs) {
      const stage = a.string(p.stage);
      const amount = a.cents(p.amount) ?? 0;
      if (stage !== undefined && FIRST_STAGES.includes(stage) && amount > 0) {
        out.push({
          questionIds: [p.stage, p.amount],
          message: `You entered ${formatCents(amount)} for a first-time ${p.label}. The cost of getting a licence, check or certificate for the first time is generally not deductible, so it has been left out. Renewals are treated differently.`,
        });
      }
    }
    return out;
  },
);

export const RENTAL_INITIAL_REPAIRS: FlagRule = perInstance(
  {
    code: 'RENTAL_INITIAL_REPAIRS',
    kind: 'consistency',
    severity: 'warning',
    atoRef: ATO.rentalRepairs,
  },
  (a): FlagInstance[] => {
    const out: FlagInstance[] = [];
    for (const it of a.items(GROUPS.rentalProperty)) {
      if (a.string(Q.rent.initialRepairs, it.id) !== 'yes') continue;
      const repairs = a.cents(Q.rent.expRepairs, it.id) ?? 0;
      if (repairs <= 0) continue;
      out.push({
        questionIds: [answerKey(Q.rent.initialRepairs, it.id), answerKey(Q.rent.expRepairs, it.id)],
        message: `You entered ${formatCents(repairs)} of repairs for a rental property and said some repairs fixed problems that existed when you bought it. Repairs to fix defects that existed at purchase are usually capital, not an immediate deduction. Check which part of the repairs relates to damage that happened while it was rented.`,
      });
    }
    return out;
  },
);

export const CONSISTENCY_RULES: FlagRule[] = [EXPENSE_REIMBURSED, CAR_HOME_TO_WORK, LICENCE_FIRST, RENTAL_INITIAL_REPAIRS];
