/** M4 employment, payers and occupation; M5 allowances and reimbursements. Universal. */
import type { Option, Question } from '../engine/types';
import { GENERIC_OCCUPATION_TAGS } from '../engine/types';
import type { OccupationTag } from '../engine/types';
import { OCCUPATIONS } from '../occupations/registry';
import { GROUPS, Q } from './ids';
import { any, eq, flatten, gt, includes, money, noneOption, not, occ, opt, repeater, screening, single, text, yes, yesNoUnsure, dateRange, multi } from './shared';

const E = GROUPS.employer;
const A = GROUPS.allowance;

/** Plain-word labels for the generic tags a user can tick when their occupation is "Other". */
type GenericTag = (typeof GENERIC_OCCUPATION_TAGS)[number];
export const GENERIC_TAG_LABELS: Record<GenericTag, { label: string; help: string }> = {
  vehicle_travel: { label: 'Driving between workplaces or clients', help: 'Using your own car for work trips other than the normal drive from home to work.' },
  tools_equipment: { label: 'Buying tools or equipment for work', help: 'Hand tools, power tools, computers, or other equipment you paid for.' },
  uniform_ppe: { label: 'Wearing a uniform or protective clothing', help: 'A compulsory uniform with a logo, or protective items like safety boots, hi-vis or gloves.' },
  licences_cards: { label: 'Holding licences, tickets or registrations for the job', help: 'Renewing a licence, ticket, card or registration you need to keep working.' },
  home_office: { label: 'Working from home', help: 'Doing some of your paid work at home, such as admin, calls or reports.' },
  phone_internet: { label: 'Using my own phone or internet for work', help: 'Work calls, rosters, apps or emails on a phone or internet plan you pay for.' },
  overnight_travel: { label: 'Travelling overnight for work', help: 'Sleeping away from home for work, whether or not your employer paid an allowance.' },
  sun_protection: { label: 'Working outdoors in the sun', help: 'Buying sunscreen, a hat or sunglasses because your job is outside.' },
  self_education: { label: 'Studying or training related to my job', help: 'Courses, seminars or study that relate to the work you do now.' },
  union_fees: { label: 'Paying union or professional membership fees', help: 'Union dues or fees to a professional association for your job.' },
};

const OCCUPATION_OPTIONS: Option[] = OCCUPATIONS.filter((o) => o.id !== 'other').map((o) =>
  opt(o.id, o.label, o.aliases.length ? `Also called: ${o.aliases.slice(0, 4).join(', ')}.` : undefined),
);
OCCUPATION_OPTIONS.push(opt('other', 'Other / not listed', 'Pick this if none of the listed jobs fit. We will ask what your work involved so nothing is missed.'));

const TAG_OPTIONS: Option[] = [
  ...GENERIC_OCCUPATION_TAGS.map((t) => ({ value: t, label: GENERIC_TAG_LABELS[t].label, help: GENERIC_TAG_LABELS[t].help })),
  noneOption('None of these'),
];
const ADDS_TAGS: Record<string, OccupationTag[]> = Object.fromEntries(GENERIC_OCCUPATION_TAGS.map((t) => [t, [t]]));

const IS_OTHER = eq(Q.emp.occupation, 'other');

export const EMPLOYMENT_QUESTIONS: Question[] = flatten(
  // ---- Employer repeater (always visible; user may have no employer) ----
  repeater(Q.emp.repeater, 'employment', 'Your employers and other payers this year', {
    groupId: E,
    itemLabel: 'Employer or payer',
    addLabel: 'Add another employer or payer',
    minItems: 0,
    labelFrom: Q.emp.name,
  }, {
    help: 'Add one entry for each income statement or payment summary. Include jobs you left during the year. If you had no employer, leave this empty.',
    required: false,
  }),
  text(Q.emp.name, 'employment', 'Who was the employer or payer?', {
    repeaterGroup: E,
    required: true,
    help: 'The name shown on the income statement in myGov or on the payment summary.',
    validation: [{ kind: 'maxLength', value: 120 }],
  }),
  text(Q.emp.abn, 'employment', 'What is their ABN? (optional)', {
    repeaterGroup: E,
    help: 'The 11-digit Australian Business Number on the income statement. Optional; it only helps match documents.',
    validation: [{ kind: 'pattern', value: '^\\s*\\d{2}\\s?\\d{3}\\s?\\d{3}\\s?\\d{3}\\s*$', message: 'An ABN is 11 digits.' }],
  }),
  single(Q.emp.occupation, 'employment', 'What was your job with this employer?', OCCUPATION_OPTIONS, {
    repeaterGroup: E,
    help: 'Your job decides which work-expense questions you see. Income, residency, family and investment questions are asked of everyone.',
  }),
  text(Q.emp.occupationOther, 'employment', 'What was the job title?', {
    repeaterGroup: E,
    showIf: IS_OTHER,
    help: 'Type the job as it would appear on a payslip, for example "Retail assistant".',
    validation: [{ kind: 'maxLength', value: 120 }],
  }),
  multi(Q.emp.otherTags, 'employment', 'Which of these did your work involve?', TAG_OPTIONS, {
    repeaterGroup: E,
    showIf: IS_OTHER,
    required: true,
    help: 'Tick everything that applied. Each tick opens the matching expense questions later. "Not sure" opens all of them and adds a review note.',
    addsTags: ADDS_TAGS,
  }),
  dateRange(Q.emp.dates, 'employment', 'Between which dates did you work for this employer this year?', {
    repeaterGroup: E,
    help: 'If you worked the whole year, enter 1 July to 30 June. Dates matter when a job or occupation changed part-way through the year.',
    validation: [{ kind: 'inFinancialYear' }],
  }),
  money(Q.emp.gross, 'employment', 'What were the gross payments from this employer?', {
    repeaterGroup: E,
    help: 'The "gross payments" or "salary and wages" figure on the income statement, before tax was taken out.',
    income: { category: 'salary', treatment: 'I' },
    feeds: ['income'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.withheld, 'employment', 'How much tax was withheld by this employer?', {
    repeaterGroup: E,
    help: 'The "tax withheld" or "PAYG withholding" figure on the income statement. This is credited against your tax.',
    credit: 'payg_withheld',
    feeds: ['credits'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.rfb, 'employment', 'What was the reportable fringe benefits amount, if any?', {
    repeaterGroup: E,
    required: false,
    help: 'Shown on the income statement if your employer gave you benefits such as a salary-packaged car. It is not taxed as income but affects Medicare levy surcharge, study loan repayments and some offsets. Leave blank if none.',
    feeds: ['mls', 'study_loan'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.resc, 'employment', 'What were the reportable employer super contributions, if any?', {
    repeaterGroup: E,
    required: false,
    help: 'Salary-sacrificed super shown on the income statement. Not the normal employer super guarantee. Leave blank if none.',
    feeds: ['mls', 'study_loan'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.lumpA, 'employment', 'Was there a Lump Sum A amount on the income statement?', {
    repeaterGroup: E,
    required: false,
    help: 'Lump Sum A is unused annual or long service leave paid out when you left, or on redundancy. Leave blank if none.',
    income: { category: 'lump_sum_a', treatment: 'I' },
    feeds: ['income', 'offsets'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  single(Q.emp.lumpAType, 'employment', 'Which type code is shown next to Lump Sum A?', [
    opt('R', 'Type R', 'Paid because of redundancy, invalidity or an early retirement scheme. Taxed at a capped rate.'),
    opt('T', 'Type T', 'Any other reason, such as resigning.'),
  ], {
    repeaterGroup: E,
    showIf: gt(Q.emp.lumpA, 0),
    help: 'The letter R or T next to the Lump Sum A amount decides how it is taxed.',
    feeds: ['income', 'offsets'],
  }),
  money(Q.emp.lumpB, 'employment', 'Was there a Lump Sum B amount on the income statement?', {
    repeaterGroup: E,
    required: false,
    help: 'Lump Sum B is long service leave that built up before 16 August 1978. Only 5% is taxable. Leave blank if none.',
    income: { category: 'lump_sum_b', treatment: 'I' },
    feeds: ['income'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.lumpD, 'employment', 'Was there a Lump Sum D amount on the income statement?', {
    repeaterGroup: E,
    required: false,
    help: 'Lump Sum D is the tax-free part of a genuine redundancy or early retirement payment. It is not taxed but we record it. Leave blank if none.',
    income: { category: 'lump_sum_d', treatment: 'N' },
    feeds: ['income'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.lumpE, 'employment', 'Was there a Lump Sum E amount on the income statement?', {
    repeaterGroup: E,
    required: false,
    help: 'Lump Sum E is back pay for earlier years (for example an underpayment settlement). It is income now, but you may get an offset if it is $1,200 or more. Leave blank if none.',
    income: { category: 'lump_sum_e', treatment: 'I' },
    feeds: ['income', 'lspia'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  yesNoUnsure(Q.emp.taxReady, 'employment', 'Is this income statement marked "Tax ready" in myGov?', {
    repeaterGroup: E,
    help: 'Employers finalise income statements by 14 July. Until it says "Tax ready" the figures can change.',
  }),

  // ---- Income outside income statements ----
  ...screening(Q.emp.otherPay, 'employment', 'Did you receive any of these outside your income statements?', [
    opt('cash', 'Cash wages not shown on an income statement', 'Cash in hand is still taxable income.'),
    opt('tips', 'Tips or gratuities', 'Cash or card tips from customers are income, even if the employer did not record them.'),
    opt('gifts', 'Gifts from clients or customers', 'Genuine personal gifts are usually not income, but regular gifts tied to your work can be. We flag these for review.'),
    opt('director_fees', 'Director fees'),
    opt('labour_hire', 'Payments from a labour hire agency not shown on an income statement'),
  ], {
    help: 'The ATO matches many payments. Money you were paid for work is income even when it is not on an income statement.',
  }),
  money(Q.emp.otherPayCash, 'employment', 'How much cash wages did you receive?', {
    showIf: includes(Q.emp.otherPay, 'cash'), income: { category: 'other_employment', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.otherPayTips, 'employment', 'How much did you receive in tips?', {
    showIf: includes(Q.emp.otherPay, 'tips'), income: { category: 'other_employment', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'Your best total for the year. Keep a record of how you worked it out.',
  }),
  money(Q.emp.otherPayGifts, 'employment', 'What was the total value of gifts from clients?', {
    showIf: includes(Q.emp.otherPay, 'gifts'), income: { category: 'other_employment', treatment: 'R' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'We show this for review rather than adding it: whether a gift is income depends on why it was given.',
  }),
  money(Q.emp.otherPayDirector, 'employment', 'How much did you receive in director fees?', {
    showIf: includes(Q.emp.otherPay, 'director_fees'), income: { category: 'other_employment', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.otherPayLabourHire, 'employment', 'How much did the labour hire agency pay you?', {
    showIf: includes(Q.emp.otherPay, 'labour_hire'), income: { category: 'other_employment', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.emp.otherPayOtherAmount, 'employment', 'How much was the other payment?', {
    showIf: includes(Q.emp.otherPay, 'other'), income: { category: 'other_employment', treatment: 'R' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'We list this for review so the right treatment can be checked.',
  }),

  // ---- M5 allowances ----
  // Generic screening is hidden for construction workers, whose deep module asks its own allowance screen (con.allowances).
  yesNoUnsure(Q.allow.any, 'allowances', 'Did any employer pay you an allowance this year?', {
    help: 'Allowances are extra amounts for things like using your car, meals, tools, uniforms, site conditions or living away from home. They are usually shown on the income statement. Allowances are income; a reimbursement of an exact cost is not.',
    showIf: not(occ('construction')),
    feeds: ['income'],
  }),
  repeater(Q.allow.repeater, 'allowances', 'Your allowances', {
    groupId: A,
    itemLabel: 'Allowance',
    addLabel: 'Add another allowance',
    minItems: 1,
    labelFrom: Q.allow.type,
  }, {
    help: 'Add one entry per allowance type per employer. We match each allowance to the expense it is meant to cover.',
    showIf: any(yes(Q.allow.any), yes('con.allowances')),
  }),
  single(Q.allow.type, 'allowances', 'What kind of allowance was it?', [
    opt('car_km', 'Car or cents-per-kilometre allowance', 'Paid for using your own car for work trips.'),
    opt('travel', 'Travel or overnight allowance', 'For meals, accommodation or incidentals while travelling away from home for work.'),
    opt('meal', 'Meal or overtime meal allowance', 'Paid under an award when you worked overtime.'),
    opt('tool', 'Tool allowance'),
    opt('uniform_laundry', 'Uniform or laundry allowance'),
    opt('site_industry', 'Site, industry, dirt, height or similar allowance', 'Paid because of the conditions of the job. Fully taxable.'),
    opt('lafha', 'Living-away-from-home allowance (LAFHA)', 'Paid because you had to live away from your usual home for work. Often a fringe benefit rather than income; we flag it.'),
    opt('first_aid', 'First aid allowance'),
    opt('phone', 'Phone allowance'),
    otherOptionLocal(),
  ], { repeaterGroup: A, showIf: any(yes(Q.allow.any), yes('con.allowances')) }),
  text('allow.item.other_text', 'allowances', 'What was the other allowance for?', {
    repeaterGroup: A, showIf: eq(Q.allow.type, 'other'), validation: [{ kind: 'maxLength', value: 200 }],
  }),
  money(Q.allow.amount, 'allowances', 'How much was the allowance for the year?', {
    repeaterGroup: A,
    showIf: any(yes(Q.allow.any), yes('con.allowances')),
    help: 'The total shown on the income statement, or the total you received if it was not shown.',
    income: { category: 'allowance', treatment: { byQuestion: Q.allow.nature, map: { allowance: 'I', reimbursement: 'N' }, fallback: 'R' } },
    feeds: ['income'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  yesNoUnsure(Q.allow.onStatement, 'allowances', 'Is this allowance shown on the income statement?', {
    repeaterGroup: A,
    showIf: any(yes(Q.allow.any), yes('con.allowances')),
    help: 'Most allowances appear as a separate line. Some, such as travel allowances within ATO limits, may not be shown.',
  }),
  single(Q.allow.nature, 'allowances', 'Was this an allowance, or a reimbursement of an exact cost?', [
    opt('allowance', 'An allowance: a set amount paid whether or not I spent it', 'For example $20 a shift for your car, or a weekly tool allowance. Allowances are income, and you can claim the related expense.'),
    opt('reimbursement', 'A reimbursement: my employer paid back exactly what I spent', 'You showed a receipt and got that amount back. Reimbursements are not income, and the cost cannot be claimed.'),
  ], {
    repeaterGroup: A,
    showIf: any(yes(Q.allow.any), yes('con.allowances')),
    help: 'This single answer decides whether the amount is income. "Not sure" sends it to review rather than guessing.',
  }),
  text(Q.allow.job, 'allowances', 'Which employer paid it?', {
    repeaterGroup: A,
    showIf: any(yes(Q.allow.any), yes('con.allowances')),
    help: 'Type the employer name as you entered it earlier.',
    validation: [{ kind: 'maxLength', value: 120 }],
  }),
);

function otherOptionLocal(): Option {
  return opt('other', 'Other allowance', 'An allowance not in the list. Describe it in the next box.');
}
