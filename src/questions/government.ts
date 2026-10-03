/** M7 government payments and pensions; M8 super income. Universal. */
import type { Question } from '../engine/types';
import { GOV_TYPES, Q } from './ids';
import { flatten, includes, money, num, opt, screening, single, yes, yesNoUnsure } from './shared';

const GOV_LABELS: Record<(typeof GOV_TYPES)[number], { option: string; amount: string; help?: string }> = {
  jobseeker: { option: 'JobSeeker, Youth Allowance or Austudy', amount: 'How much JobSeeker, Youth Allowance or Austudy did you receive?', help: 'Taxable. Services Australia sends a payment summary; it is also in ATO pre-fill.' },
  pension: { option: 'Age Pension, Disability Support Pension or Carer Payment', amount: 'How much pension did you receive?', help: 'Age Pension and Carer Payment are taxable. Disability Support Pension is usually tax-free under pension age but still enter it; we check eligibility for the seniors and pensioners offset.' },
  parenting: { option: 'Parenting Payment', amount: 'How much Parenting Payment did you receive?', help: 'Taxable.' },
  ppl: { option: 'Paid Parental Leave from Services Australia', amount: 'How much Paid Parental Leave did you receive from Services Australia?', help: 'Taxable. Employer-paid parental leave is on your income statement instead.' },
  dad_partner: { option: 'Dad and Partner Pay', amount: 'How much Dad & Partner Pay did you receive?', help: 'Taxable.' },
  disaster: { option: 'Disaster recovery payments or allowances', amount: 'How much did you receive in disaster payments?', help: 'Disaster Recovery Allowance is taxable; some one-off disaster payments are tax-free. We flag these for a check.' },
  veterans: { option: 'Veterans\' payments (DVA)', amount: 'How much did you receive in veterans\' payments?', help: 'Some DVA payments are taxable and some are exempt. The DVA payment summary shows which.' },
  other: { option: 'Other government payment', amount: 'How much was the other government payment?' },
};

function govQuestions(type: (typeof GOV_TYPES)[number]): Question[] {
  const t = GOV_LABELS[type];
  const treatment = type === 'disaster' || type === 'veterans' || type === 'other' ? 'R' : 'I';
  return [
    money(Q.gov.amount(type), 'government', t.amount, {
      showIf: includes(Q.gov.received, type),
      help: t.help ?? 'Use the payment summary from Services Australia or the ATO pre-fill figure.',
      income: { category: 'government', treatment },
      feeds: ['income'],
      validation: [{ kind: 'min', value: 0 }],
    }),
    money(Q.gov.withheld(type), 'government', 'How much tax was withheld from that payment?', {
      showIf: includes(Q.gov.received, type),
      help: 'Shown on the payment summary. Enter 0 if no tax was taken out.',
      credit: 'payg_withheld',
      feeds: ['credits'],
      validation: [{ kind: 'min', value: 0 }],
    }),
  ];
}

export const GOVERNMENT_QUESTIONS: Question[] = flatten(
  ...screening(Q.gov.received, 'government', 'Did you receive any of these government payments this year?', GOV_TYPES.filter((t) => t !== 'other').map((t) => opt(t, GOV_LABELS[t].option)), {
    help: 'Most Centrelink and DVA payments are taxable income, and some qualify you for the seniors and pensioners tax offset or the beneficiary tax offset.',
  }),
  single(Q.gov.pensionKind, 'government', 'Which pension was it?', [
    opt('age_pension', 'Age Pension', 'Taxable.'),
    opt('dsp_under_age', 'Disability Support Pension, and I was under Age Pension age', 'Tax-free.'),
    opt('dsp_at_age', 'Disability Support Pension, and I had reached Age Pension age', 'Taxable.'),
    opt('carer', 'Carer Payment', 'Usually taxable; tax-free in some cases (for example when you and the person you care for are both under Age Pension age). Checked separately.'),
  ], { showIf: includes(Q.gov.received, 'pension'), feeds: ['income'], help: 'The type decides whether the pension is taxable.' }),
  ...GOV_TYPES.flatMap(govQuestions),

  // ---- M8 super income ----
  yesNoUnsure(Q.sup.received, 'super_income', 'Did you receive a super income stream or a super lump sum this year?', {
    help: 'Regular pension payments from a super fund, or a lump sum withdrawal. Super benefits have their own tax rules based on your age and the fund type.',
    feeds: ['super_income'],
  }),
  num(Q.sup.age, 'super_income', 'How old were you when the super payment was made?', {
    showIf: yes(Q.sup.received),
    help: 'Most super benefits are tax-free from age 60. Below 60 some or all may be taxed.',
    validation: [{ kind: 'min', value: 15 }, { kind: 'max', value: 120 }],
    feeds: ['super_income'],
  }),
  single(Q.sup.element, 'super_income', 'Which element does the payment summary show?', [
    opt('taxed', 'Taxed element only', 'Most industry and retail super funds. Tax-free from age 60.'),
    opt('untaxed', 'Untaxed element', 'Some government and defined benefit schemes. Taxable even after 60, with an offset.'),
    opt('mixed', 'Both taxed and untaxed elements'),
  ], {
    showIf: yes(Q.sup.received),
    help: 'The super fund\'s payment summary shows "taxed element" or "untaxed element". Untaxed elements are routed to manual review.',
    feeds: ['super_income'],
  }),
  money(Q.sup.amount, 'super_income', 'What was the total taxable amount on the super payment summary?', {
    showIf: yes(Q.sup.received),
    help: 'The "taxable component" figure. We only calculate the simple case (taxed element, age 60 or over); everything else is listed for manual review.',
    income: { category: 'super_income', treatment: 'R' },
    calc: { special: 'super_income' },
    feeds: ['super_income'],
    validation: [{ kind: 'min', value: 0 }],
  }),
  money(Q.sup.withheld, 'super_income', 'How much tax did the super fund withhold?', {
    showIf: yes(Q.sup.received),
    credit: 'payg_withheld',
    feeds: ['credits'],
    validation: [{ kind: 'min', value: 0 }],
    help: 'Shown on the payment summary. Enter 0 if none.',
  }),
);
