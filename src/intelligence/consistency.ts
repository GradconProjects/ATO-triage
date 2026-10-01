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

const CGT_LOSSES_ATO = 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/capital-losses';
const NCL_ATO = 'https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/losses/non-commercial-losses';

/**
 * Carried-forward capital losses that came (at least partly) from derivatives. Futures losses are
 * often revenue or business losses, not capital losses. The balance is never converted here: it
 * stays as entered until a reviewed correction is recorded.
 */
export const PRIOR_LOSS_CLASSIFICATION: FlagRule = {
  code: 'PRIOR_LOSS_CLASSIFICATION',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.cgt.priorLosses, Q.cgt.priorLossesOrigin, Q.cgt.priorLossesCorrection],
  atoRef: CGT_LOSSES_ATO,
  when: (a, ctx) =>
    ctx.visible.has(Q.cgt.priorLossesOrigin) && (a.list(Q.cgt.priorLossesOrigin) ?? []).includes('derivatives') && !(a.string(Q.cgt.priorLossesCorrection) ?? '').trim(),
  message: (a) =>
    `Your ${formatCents(a.cents(Q.cgt.priorLosses) ?? 0)} of carried-forward capital losses includes futures or derivatives losses. Those are often revenue or business losses rather than capital losses. They have been kept exactly as classified in the earlier year. Ask a registered tax agent to check; if the earlier year is amended, record the correction and its evidence, and update the balance.`,
};

export const DERIVATIVES_CLASSIFY: FlagRule = {
  code: 'DERIVATIVES_CLASSIFY',
  kind: 'review',
  severity: 'warning',
  questionIds: [Q.cgt.derivativesAny, Q.cgt.derivativesNature],
  atoRef: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments',
  when: (a, ctx) => a.string(Q.cgt.derivativesAny) === 'yes' && ctx.visible.has(Q.cgt.derivativesNature) && a.string(Q.cgt.derivativesNature) !== 'investment' && a.string(Q.cgt.derivativesNature) !== 'business',
  message: () => 'You traded futures or other derivatives but have not said whether it was investing or a business. The result is not counted until that is settled, because the two are taxed differently.',
};

export const DERIVATIVES_BUSINESS_MISSING: FlagRule = {
  code: 'DERIVATIVES_BUSINESS_MISSING',
  kind: 'missing',
  severity: 'warning',
  questionIds: [Q.cgt.derivativesNature, Q.bus.activityAny],
  atoRef: NCL_ATO,
  when: (a) => {
    if (a.string(Q.cgt.derivativesNature) !== 'business') return false;
    return !a.items(GROUPS.businessActivity).some((it) => ['derivatives_trading', 'crypto_trading'].includes(a.string(Q.bus.activityKind, it.id) ?? ''));
  },
  message: () => 'You said your derivatives trading was run as a business, but there is no trading activity under Business activities yet. Add it there once, with its income and expenses, so its result (and any deferred loss) is worked out in one place.',
};

const normName = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().replace(/pty|ltd|limited|the|[^a-z0-9]/g, '') : '');

/**
 * Possible duplicates across sources: the same amount entered as a work deduction and as a
 * business-activity expense, two activities or employers that look like the same one, or the
 * same allowance twice. Nothing is removed: repeated payments can be genuine, so the user checks.
 */
export const POSSIBLE_DUPLICATE: FlagRule = perInstance(
  { code: 'POSSIBLE_DUPLICATE', kind: 'consistency', severity: 'warning', atoRef: ATO.reimbursements },
  (a, ctx): FlagInstance[] => {
    const out: FlagInstance[] = [];
    const activityExpenses: { key: string; cents: number; label: string }[] = [];
    for (const it of a.items(GROUPS.businessActivity)) {
      const name = a.string(Q.bus.activityName, it.id) ?? 'a business activity';
      for (const id of [Q.bus.activityExpSubscriptions, Q.bus.activityExpPlatform, Q.bus.activityExpOther]) {
        const cents = a.cents(id, it.id);
        if (cents && cents > 0) activityExpenses.push({ key: answerKey(id, it.id), cents, label: name });
      }
    }
    for (const q of ctx.questions) {
      if (!q.deduction) continue;
      for (const itemId of instancesOf(a, q)) {
        const cents = a.cents(q.id, itemId);
        if (!cents) continue;
        for (const x of activityExpenses.filter((e) => e.cents === cents)) {
          out.push({ questionIds: [answerKey(q.id, itemId), x.key], message: `${formatCents(cents)} is entered both as a work deduction ("${q.prompt}") and as an expense of ${x.label}. If it is the same payment, keep it in one place only; it has not been removed.` });
        }
      }
    }
    const seen = new Map<string, string>();
    for (const it of a.items(GROUPS.businessActivity)) {
      const n = normName(a.string(Q.bus.activityName, it.id));
      if (!n) continue;
      const prev = seen.get(n);
      if (prev) out.push({ questionIds: [answerKey(Q.bus.activityName, prev), answerKey(Q.bus.activityName, it.id)], message: `Two business activities are called "${a.string(Q.bus.activityName, it.id)}". If they are the same activity, combine them so its income, expenses and losses are counted once.` });
      else seen.set(n, it.id);
    }
    const abns = new Map<string, string>();
    for (const it of a.items(GROUPS.employer)) {
      const abn = (a.string(Q.emp.abn, it.id) ?? '').replace(/\D/g, '');
      if (abn.length !== 11) continue;
      const prev = abns.get(abn);
      if (prev) out.push({ questionIds: [answerKey(Q.emp.abn, prev), answerKey(Q.emp.abn, it.id)], message: `Two employers have the same ABN (${abn}). If it is one employer, keep one entry so the pay and tax withheld are not counted twice.` });
      else abns.set(abn, it.id);
    }
    const allowances = new Map<string, string>();
    for (const it of a.items(GROUPS.allowance)) {
      const k = [normName(a.string(Q.allow.job, it.id)), a.string(Q.allow.type, it.id), a.cents(Q.allow.amount, it.id)].join('|');
      if (!a.cents(Q.allow.amount, it.id)) continue;
      const prev = allowances.get(k);
      if (prev) out.push({ questionIds: [answerKey(Q.allow.amount, prev), answerKey(Q.allow.amount, it.id)], message: `The same allowance (${a.string(Q.allow.type, it.id)}, ${formatCents(a.cents(Q.allow.amount, it.id) ?? 0)}) is entered twice for the same employer. If it was paid once, remove one entry; if it was paid twice, leave both.` });
      else allowances.set(k, it.id);
    }
    return out;
  },
);

const PHI_ATO = 'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/private-health-insurance-rebate/claiming-the-private-health-insurance-rebate';

/**
 * Spouse PHI elections that do not fit together. Linked profiles (same account, same year, same
 * membership number) are checked directly; the same policy entered twice in one case is flagged.
 * A share must be claimed in exactly one return.
 */
export const PHI_ELECTION_CONFLICT: FlagRule = perInstance(
  { code: 'PHI_ELECTION_CONFLICT', kind: 'consistency', severity: 'warning', atoRef: PHI_ATO },
  (a, ctx): FlagInstance[] => {
    const out: FlagInstance[] = [];
    const norm = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : '');
    const seen = new Map<string, string>();
    for (const it of a.items(GROUPS.phiPolicy)) {
      const m = norm(a.string(Q.phi.policyMembership, it.id));
      if (!m) continue;
      const mine = a.string(Q.phi.policyElection, it.id);
      const prev = seen.get(m);
      if (prev) out.push({ questionIds: [answerKey(Q.phi.policyMembership, prev), answerKey(Q.phi.policyMembership, it.id)], message: `Policy ${m} is entered twice in this return. Enter each statement line once; your spouse\'s lines go in the same policy entry only when you claim both shares.` });
      else seen.set(m, it.id);
      for (const other of (ctx.linkedPhi ?? []).filter((o) => norm(o.membership) === m)) {
        const theirs = other.election;
        const conflict =
          (mine === 'both_shares' && (theirs === 'my_share' || theirs === 'both_shares')) ||
          (mine === 'my_share' && (theirs === 'both_shares' || theirs === 'spouse_claims_mine')) ||
          (mine === 'spouse_claims_mine' && theirs !== 'both_shares');
        if (conflict) {
          out.push({
            questionIds: [answerKey(Q.phi.policyElection, it.id)],
            message: `Private health policy ${m}: this return says "${mine?.replace(/_/g, ' ') ?? 'not chosen'}", but ${other.profileName}'s return says "${theirs?.replace(/_/g, ' ') ?? 'not chosen'}". The choices must match so each share is claimed exactly once.`,
          });
        }
      }
    }
    return out;
  },
);

export const CONSISTENCY_RULES: FlagRule[] = [POSSIBLE_DUPLICATE, PHI_ELECTION_CONFLICT, EXPENSE_REIMBURSED, CAR_HOME_TO_WORK, LICENCE_FIRST, RENTAL_INITIAL_REPAIRS, PRIOR_LOSS_CLASSIFICATION, DERIVATIVES_CLASSIFY, DERIVATIVES_BUSINESS_MISSING];
