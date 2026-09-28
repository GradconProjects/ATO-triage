/**
 * Deep module 7.3: chefs, cooks and hospitality. Every row of table 7.3 is a question; amounts
 * carry the row's treatment. Tagged 'chef_hospitality'.
 *
 * Routing: chef.knives.any -> ded.tool repeater; chef.laundry -> ded.laundry.*. The generic screens
 * for those are hidden for chef_hospitality.
 */
import type { Question } from '../../engine/types';
import { Q } from '../ids';
import { ATO, all, deductionSet, flatten, includes, includesAny, isIn, money, multi, noneOption, not, opt, screening, single, yes, yesNoUnsure } from '../shared';

const M = 'deep_chef' as const;
const TAGS: Question['occupationTags'] = ['chef_hospitality'];
const ref = (atoRef: string) => ({ occupationTags: TAGS, atoRef });
const CLOTHING_ITEMS = ['checked_pants', 'jacket', 'apron', 'non_slip_shoes', 'hat', 'plain_black'];
const CERT_ITEMS = ['food_safety', 'rsa', 'rsg', 'allergen', 'other'];

export const CHEF_QUESTIONS: Question[] = flatten(
  // ---- Knives and tools ----
  yesNoUnsure(Q.chef.knivesAny, M, 'Did you buy knives or kitchen tools for work this year?', {
    ...ref(ATO.chef), feeds: ['deductions'],
    help: 'Knives, tool rolls, thermometers, mandolines. Items under $300 are claimed at once; $300 or more over their life. We ask for each item in the Deductions section.',
  }),
  yesNoUnsure('chef.sharpening.any', M, 'Did you pay for knife sharpening, repairs or knife insurance?', {
    ...ref(ATO.chef), feeds: ['deductions'],
  }),
  ...deductionSet({
    base: 'chef.sharpening', module: M, category: 'tools', treatment: 'D', atoRef: ATO.chef, occupationTags: TAGS, showIf: yes('chef.sharpening.any'), matchesAllowance: ['tool'],
    prompt: 'How much did you spend on sharpening, repairs, knife insurance in total?',
  }),

  // ---- Clothing ----
  multi(Q.chef.clothing, M, 'Which work clothing did you buy this year?', [
    opt('checked_pants', 'Chef\'s checked pants', 'Occupation-specific: deductible.'),
    opt('jacket', 'Chef\'s jacket', 'Occupation-specific: deductible.'),
    opt('apron', 'Apron', 'Protective: deductible.'),
    opt('non_slip_shoes', 'Non-slip safety shoes', 'Protective: deductible.'),
    opt('hat', 'Chef\'s hat or hair covering', 'Occupation-specific: deductible.'),
    opt('plain_black', 'Plain black clothing', 'Not deductible, even when the venue requires black.'),
    noneOption('None of these'),
  ], { ...ref(ATO.chef), feeds: ['deductions'], help: 'Chef whites and protective items count. Plain black clothing does not, and is recorded as excluded.' }),
  ...deductionSet({
    base: 'chef.clothing', module: M, category: 'clothing', treatment: 'D', atoRef: ATO.chef, occupationTags: TAGS, showIf: includesAny(Q.chef.clothing, CLOTHING_ITEMS), matchesAllowance: ['uniform_laundry'],
    prompt: 'How much did you spend on that work clothing in total?',
    help: 'Enter the total; the calculation leaves out plain black clothing if that is all you ticked.',
  }),
  yesNoUnsure(Q.chef.laundry, M, 'Did you wash your chef\'s clothing or protective items at home?', {
    ...ref(ATO.laundry), showIf: includesAny(Q.chef.clothing, ['checked_pants', 'jacket', 'apron', 'non_slip_shoes', 'hat']), feeds: ['deductions'],
    help: 'The ATO allows a set amount per load for eligible clothing. We ask about loads in the Deductions section.',
  }),

  // ---- Travel ----
  yesNoUnsure(Q.chef.travelBetweenJobs, M, 'Did you travel between two jobs, or to catering sites, during a shift?', {
    ...ref(ATO.chef), feeds: ['deductions'],
    help: 'Travel from one workplace to another, or to an off-site catering job during the day, is work travel. Enter the trips in the Car section.',
  }),
  yesNoUnsure(Q.chef.homeToWork, M, 'Did you drive from home to your normal workplace?', {
    ...ref(ATO.travel), feeds: ['deductions'],
    help: 'Ordinary commuting is private, even for late-night shifts when public transport is not running. Recorded so it is not claimed.',
  }),

  // ---- Certificates ----
  ...screening(Q.chef.certificates, M, 'Which certificates did you pay for this year?', [
    opt('food_safety', 'Food safety supervisor certificate'),
    opt('rsa', 'Responsible Service of Alcohol (RSA)'),
    opt('rsg', 'Responsible Service of Gaming (RSG)'),
    opt('allergen', 'Allergen awareness training'),
  ], { ...ref(ATO.licences), feeds: ['deductions'], help: 'A certificate needed to get the job is not deductible. Renewing one for your current role is.' }),
  single(Q.chef.certStage, M, 'Was it a first certificate, or a renewal?', [
    opt('first', 'My first certificate of this kind, needed to get the job', 'Not deductible.'),
    opt('renewal', 'A renewal for a role I already had', 'Deductible when you paid it yourself.'),
    opt('employer_paid', 'My employer paid for it', 'Nothing to claim.'),
  ], { ...ref(ATO.licences), showIf: includesAny(Q.chef.certificates, CERT_ITEMS), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'chef.certificates', module: M, category: 'licences', atoRef: ATO.licences, occupationTags: TAGS,
    treatment: { byQuestion: Q.chef.certStage, map: { first: 'N', renewal: 'D', employer_paid: 'N' }, fallback: 'R' },
    showIf: all(includesAny(Q.chef.certificates, CERT_ITEMS), isIn(Q.chef.certStage, ['first', 'renewal'])),
    prompt: 'How much did the certificates cost in total?',
  }),

  // ---- Courses ----
  single(Q.chef.courses, M, 'Did you pay for cooking courses or culinary training this year?', [
    opt('current_job', 'Yes, related to my current job', 'Deductible when it maintains or improves the skills you use now.'),
    opt('new_career', 'Yes, to move into a new career', 'Not deductible.'),
    opt('none', 'No'),
  ], { ...ref(ATO.selfEd), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'chef.courses', module: M, category: 'self_education', atoRef: ATO.selfEd, occupationTags: TAGS,
    treatment: { byQuestion: Q.chef.courses, map: { current_job: 'D', new_career: 'N' }, fallback: 'R' },
    showIf: isIn(Q.chef.courses, ['current_job', 'new_career']),
    prompt: 'How much did the courses cost?',
  }),

  // ---- Meals ----
  yesNoUnsure(Q.chef.mealsAtWork, M, 'Did you pay for meals eaten at work, or staff meals?', {
    ...ref(ATO.meals), feeds: ['deductions'],
    help: 'Food you eat during a normal shift is private, even in a kitchen. Recorded so it is not claimed.',
  }),
  yesNoUnsure(Q.chef.overtimeMealAllowance, M, 'Did you receive an overtime meal allowance under an award or agreement?', {
    ...ref(ATO.meals), feeds: ['deductions'],
    help: 'Overtime meals are only deductible when you were paid an overtime meal allowance under an award. It should show on your income statement; enter it in the Allowances section too.',
  }),
  ...deductionSet({
    base: 'chef.overtime_meal', module: M, category: 'other_work', atoRef: ATO.meals, occupationTags: TAGS, matchesAllowance: ['meal'],
    treatment: { byQuestion: Q.chef.overtimeMealAllowance, map: { yes: 'D', no: 'N' }, fallback: 'R' },
    showIf: yes(Q.chef.overtimeMealAllowance),
    prompt: 'How much did you spend on meals while working overtime?',
    help: 'Only meals bought on shifts where the allowance was paid.',
  }),

  // ---- Tips ----
  yesNoUnsure('chef.tips.any', M, 'Did you receive tips or gratuities that you have not already entered?', {
    ...ref(ATO.chef), showIf: not(includes(Q.emp.otherPay, 'tips')), feeds: ['income'],
    help: 'Cash and card tips are income even when your employer did not record them. If you ticked tips in the Employment section, they are already counted.',
  }),
  money(Q.chef.tipsAmount, M, 'How much did you receive in tips for the year?', {
    ...ref(ATO.chef), showIf: all(not(includes(Q.emp.otherPay, 'tips')), yes('chef.tips.any')), income: { category: 'other_employment', treatment: 'I' }, feeds: ['income'], validation: [{ kind: 'min', value: 0 }],
    help: 'Your best total for the year; keep a note of how you worked it out.',
  }),
);
