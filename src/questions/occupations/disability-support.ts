/**
 * Deep module 7.1: disability and community support workers. Every row of table 7.1 is a question;
 * amounts carry the row's treatment. Tagged 'dsw' so only support workers see it.
 *
 * Rows that route to a shared M14 field (laundry -> ded.laundry.*, phone -> ded.phone.*,
 * home office -> ded.wfh.*, sun -> ded.sun.*) are yes/no triggers; the shared questions show on
 * `any(generic screen = yes, this trigger = yes)` and the generic screen is hidden for dsw.
 */
import type { Question } from '../../engine/types';
import { Q } from '../ids';
import { ATO, all, deductionSet, flatten, includesAny, isIn, multi, noneOption, opt, otherText, single, yes, yesNoUnsure } from '../shared';

const M = 'deep_dsw' as const;
const TAGS: Question['occupationTags'] = ['dsw'];
const ref = (atoRef: string) => ({ occupationTags: TAGS, atoRef });

export const DSW_QUESTIONS: Question[] = flatten(
  // ---- Travel ----
  single(Q.dsw.clientToClient, M, 'Did you drive between clients\' homes during a shift?', [
    opt('yes_own_car', 'Yes, in my own car', 'Travel between clients during a shift is usually deductible when you paid the running costs. Enter the trips in the Car section with trip type "between clients".'),
    opt('yes_employer_car', 'Yes, in a car my employer supplied', 'Nothing to claim; your employer bore the cost.'),
    opt('no', 'No'),
  ], { ...ref(ATO.dsw), feeds: ['deductions'], help: 'Driving from one client to the next as part of the shift is work travel. Driving from home to the first client usually is not.' }),
  yesNoUnsure(Q.dsw.homeToFirst, M, 'Did you drive from home to your first client, or from your last client home?', {
    ...ref(ATO.dsw), feeds: ['deductions'],
    help: 'These trips are normally private, like any commute. There are two narrow exceptions we will ask about.',
  }),
  yesNoUnsure(Q.dsw.homeBase, M, 'Was your home a genuine base of work, where you started your paid duties before leaving?', {
    ...ref(ATO.dsw), showIf: yes(Q.dsw.homeToFirst), feeds: ['deductions'],
    help: 'Rare. It means your paid work began at home (for example rostered admin) and you then travelled as part of that work. Checking the roster on your phone does not count. Flagged for review if yes.',
  }),
  yesNoUnsure('dsw.travel.bulky_equipment', M, 'Did your employer require you to carry bulky equipment that could not be stored at the client\'s home?', {
    ...ref(ATO.dsw), showIf: yes(Q.dsw.homeToFirst), feeds: ['deductions'],
    help: 'For example a hoist or large mobility equipment. A bag with gloves and a notebook is not bulky. Flagged for review if yes.',
  }),
  yesNoUnsure(Q.dsw.betweenEmployers, M, 'Did you drive directly between two separate employers on the same day?', {
    ...ref(ATO.dsw), feeds: ['deductions'],
    help: 'Going straight from one job to a second job is deductible travel. Enter it in the Car section as travel between workplaces.',
  }),
  single(Q.dsw.clientTransport, M, 'Did you use your car to transport clients, or to run errands for them?', [
    opt('yes_not_reimbursed', 'Yes, and I was not paid back for the kilometres', 'These kilometres are work travel. Include them in the Car section.'),
    opt('yes_reimbursed', 'Yes, and my employer paid me per kilometre', 'A reimbursement means the trips cannot be claimed. Check whether the payment was an allowance in the Allowances section.'),
    opt('no', 'No'),
  ], { ...ref(ATO.dsw), feeds: ['deductions'] }),

  // ---- Sleepover shifts ----
  yesNoUnsure(Q.dsw.sleepover, M, 'Did you work sleepover shifts?', {
    ...ref(ATO.dsw), feeds: ['deductions'],
    help: 'Costs you incur during a sleepover, such as your own meals, toiletries or bedding, are private and cannot be claimed. We record them so nothing is claimed by mistake.',
  }),
  multi(Q.dsw.sleepoverCosts, M, 'Which of these did you pay for during sleepover shifts?', [
    opt('meals', 'My own meals or snacks'),
    opt('toiletries', 'Toiletries'),
    opt('bedding', 'Bedding or sleepwear'),
    opt('other', 'Something else'),
    noneOption('None of these'),
  ], { ...ref(ATO.dsw), showIf: yes(Q.dsw.sleepover), feeds: ['deductions'], help: 'These are private costs (treatment: not deductible). Ticking them helps the report explain why they are excluded.' }),
  otherText(Q.dsw.sleepoverCosts, M, { occupationTags: TAGS, atoRef: ATO.dsw, prompt: 'Describe the other sleepover cost' }),

  // ---- Client costs ----
  single(Q.dsw.clientCosts, M, 'Did you pay for client outings, meals or activities?', [
    opt('yes_reimbursed', 'Yes, and my employer or the client paid me back', 'Nothing to claim.'),
    opt('yes_not_reimbursed', 'Yes, and I was not paid back', 'Your own food is private. Costs that were only for the client are unusual and are flagged for review.'),
    opt('no', 'No'),
  ], { ...ref(ATO.dsw), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'dsw.client_costs', module: M, category: 'other_work', treatment: 'R', atoRef: ATO.dsw, occupationTags: TAGS,
    showIf: { q: Q.dsw.clientCosts, eq: 'yes_not_reimbursed' },
    prompt: 'How much did you pay for client-only costs that were not paid back?',
    help: 'Only the client\'s share, not your own meal or ticket. Listed for review, never added automatically.',
  }),

  // ---- Clothing ----
  multi(Q.dsw.clothing, M, 'What clothing did you buy for work this year?', [
    opt('compulsory_logo', 'A compulsory uniform with the employer\'s logo', 'Deductible when your employer strictly requires it.'),
    opt('registered', 'A non-compulsory uniform registered with AusIndustry', 'Deductible; ask your employer whether the design is registered.'),
    opt('protective', 'Protective items: non-slip shoes, gloves, aprons', 'Deductible when they protect you from injury or illness at work.'),
    opt('plain', 'Plain clothes worn at work', 'Not deductible, even if your employer asks for a colour.'),
    noneOption('I did not buy work clothing'),
  ], { ...ref(ATO.dsw), feeds: ['deductions'], help: 'Only uniforms and protective items count. Plain clothing is recorded but left out.' }),
  ...deductionSet({
    base: 'dsw.clothing', module: M, category: 'clothing', treatment: 'D', atoRef: ATO.dsw, occupationTags: TAGS, matchesAllowance: ['uniform_laundry'],
    showIf: includesAny(Q.dsw.clothing, ['compulsory_logo', 'registered', 'protective', 'plain']),
    prompt: 'How much did you spend on that work clothing?',
    help: 'The total for the uniform and protective items. Plain clothing is excluded by the calculation.',
    validation: [{ kind: 'min', value: 0 }, { kind: 'warnAbove', value: 200000, message: 'Clothing over $2,000 is unusual; check the amount.' }],
  }),
  yesNoUnsure(Q.dsw.laundry, M, 'Did you wash your uniform or protective clothing at home?', {
    ...ref(ATO.dsw), showIf: includesAny(Q.dsw.clothing, ['compulsory_logo', 'registered', 'protective']), feeds: ['deductions'],
    help: 'The ATO allows a set amount per load for eligible clothing. We ask about loads in the Deductions section.',
  }),

  // ---- First aid ----
  single(Q.dsw.firstAid, M, 'Which best describes any first aid or CPR course you paid for this year?', [
    opt('designated', 'I am the designated first-aid person at work', 'Deductible.'),
    opt('required', 'My employer required it, but I am not the designated first-aid person', 'Often deductible; flagged for review.'),
    opt('personal_choice', 'I chose to do it myself', 'Usually private; flagged for review.'),
    opt('employer_paid', 'My employer paid for it', 'Nothing to claim.'),
    opt('none', 'I did not do a first aid course'),
  ], { ...ref(ATO.firstAid), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'dsw.first_aid', module: M, category: 'first_aid', atoRef: ATO.firstAid, occupationTags: TAGS,
    treatment: { byQuestion: Q.dsw.firstAid, map: { designated: 'D', required: 'R', personal_choice: 'R', employer_paid: 'N' }, fallback: 'R' },
    showIf: isIn(Q.dsw.firstAid, ['designated', 'required', 'personal_choice']),
    prompt: 'How much did the first aid course cost?', matchesAllowance: ['first_aid'],
  }),

  // ---- Checks and screening ----
  multi(Q.dsw.checks, M, 'Did you pay for any of these checks this year?', [
    opt('wwcc', 'Working with Children Check'),
    opt('ndis_screening', 'NDIS Worker Screening Check'),
    opt('police', 'National police check'),
    noneOption('None of these'),
  ], { ...ref(ATO.checks), feeds: ['deductions'], help: 'The cost of a check to GET a job is not deductible. A renewal to keep your current job may be; we flag it for review.' }),
  single(Q.dsw.checksStage, M, 'Was the check to get the job, or to keep it?', [
    opt('first_check', 'My first check, needed to get the job', 'Not deductible: it was incurred before the income started.'),
    opt('renewal', 'A renewal for a job I already had', 'Flagged for review; renewals are often deductible.'),
    opt('employer_paid', 'My employer paid for it', 'Nothing to claim.'),
  ], { ...ref(ATO.checks), showIf: includesAny(Q.dsw.checks, ['wwcc', 'ndis_screening', 'police']), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'dsw.checks', module: M, category: 'licences', atoRef: ATO.checks, occupationTags: TAGS,
    treatment: { byQuestion: Q.dsw.checksStage, map: { first_check: 'N', renewal: 'R', employer_paid: 'N' }, fallback: 'R' },
    showIf: all(includesAny(Q.dsw.checks, ['wwcc', 'ndis_screening', 'police']), isIn(Q.dsw.checksStage, ['first_check', 'renewal'])),
    prompt: 'How much did the checks cost in total?',
  }),

  // ---- Training ----
  single(Q.dsw.training, M, 'Did you pay for training such as NDIS modules, manual handling, medication or behaviour support?', [
    opt('current_duties', 'Yes, related to my current duties', 'Deductible when you paid and were not reimbursed.'),
    opt('new_role', 'Yes, to move into a new role', 'Not deductible: training for a different job.'),
    opt('employer_paid', 'Yes, but my employer paid for it', 'Nothing to claim.'),
    opt('none', 'No'),
  ], { ...ref(ATO.seminars), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'dsw.training', module: M, category: 'self_education', atoRef: ATO.seminars, occupationTags: TAGS,
    treatment: { byQuestion: Q.dsw.training, map: { current_duties: 'D', new_role: 'N', employer_paid: 'N' }, fallback: 'R' },
    showIf: isIn(Q.dsw.training, ['current_duties', 'new_role']),
    prompt: 'How much did the training cost?',
  }),

  // ---- Conferences, seminars, union fees ----
  yesNoUnsure('dsw.conferences.any', M, 'Did you pay out of pocket for any work conferences, seminars, union fees?', {
    ...ref(ATO.union), feeds: ['deductions'],
    help: 'Conference or seminar fees related to your current job, plus union or professional association fees, are deductible when you paid them yourself.',
  }),
  ...deductionSet({
    base: 'dsw.conferences', module: M, category: 'union_professional', treatment: 'D', atoRef: ATO.union, occupationTags: TAGS, showIf: yes('dsw.conferences.any'),
    prompt: 'How much did you pay for conferences, seminars, union fees in total?',
  }),

  // ---- Routed to shared fields ----
  yesNoUnsure(Q.dsw.phone, M, 'Did you use your own phone or internet for rosters, case notes or client contact?', {
    ...ref(ATO.phone), feeds: ['deductions'],
    help: 'Only the work share counts. We ask for the work percentage and how you worked it out in the Deductions section; a guess without a record is flagged.',
  }),
  yesNoUnsure(Q.dsw.homeOffice, M, 'Did you write case notes or do admin at home?', {
    ...ref(ATO.wfh), feeds: ['deductions'],
    help: 'Working-from-home costs can be claimed at a fixed rate per hour if you kept a record of the hours. We ask the details in the Deductions section.',
  }),
  yesNoUnsure(Q.dsw.sun, M, 'Did you buy sunscreen, a hat or sunglasses for outdoor outings with clients?', {
    ...ref(ATO.sun), feeds: ['deductions'],
    help: 'Deductible when your work takes you outdoors. We ask the amount in the Deductions section.',
  }),

  // ---- Vaccinations ----
  yesNoUnsure(Q.dsw.vaccinations, M, 'Did you pay for vaccinations or health checks for work?', {
    ...ref(ATO.vaccinations), feeds: ['deductions'],
    help: 'Generally not deductible: they are private health costs even when an employer asks for them. We record the amount and note it for review.',
  }),
  ...deductionSet({
    base: 'dsw.vaccinations', module: M, category: 'other_work', treatment: 'N', atoRef: ATO.vaccinations, occupationTags: TAGS, showIf: yes(Q.dsw.vaccinations),
    prompt: 'How much did the vaccinations or health checks cost?',
    help: 'Recorded and shown as excluded, with a note for review.',
  }),
);
