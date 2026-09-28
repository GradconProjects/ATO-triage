/**
 * Deep module 7.2: construction and trades. Every row of table 7.2 is a question; amounts carry
 * the row's treatment. Tagged 'construction'.
 *
 * Routing: con.tools.any -> ded.tool repeater; con.overnight -> ded.overnight.*; con.phone -> ded.phone.*;
 * con.allowances -> allow.item repeater. The generic screens for those are hidden for construction.
 */
import type { Question } from '../../engine/types';
import { Q } from '../ids';
import { ATO, all, deductionSet, flatten, includesAny, isIn, multi, noneOption, opt, screening, single, yes, yesNoUnsure } from '../shared';

const M = 'deep_construction' as const;
const TAGS: Question['occupationTags'] = ['construction'];
const ref = (atoRef: string) => ({ occupationTags: TAGS, atoRef });
const PPE_ITEMS = ['boots', 'hi_vis', 'hard_hat', 'gloves', 'eye_ear', 'sun_gear'];
const LICENCE_ITEMS = ['white_card', 'high_risk', 'ewp', 'forklift', 'trade_licence', 'other'];

export const CONSTRUCTION_QUESTIONS: Question[] = flatten(
  // ---- Getting to work ----
  single(Q.con.commute, M, 'How did you usually get to work this year?', [
    opt('same_site', 'To the same site every day', 'Ordinary commuting: home-to-site trips are private.'),
    opt('several_sites_day', 'To several sites in the same day', 'Trips between sites during the day are work travel. The first trip from home is still private.'),
    opt('different_site_each', 'To a different site each day or week', 'Usually still commuting, unless the job is itinerant. We ask about that next.'),
    opt('fifo_dido', 'Fly-in fly-out or drive-in drive-out', 'Travel to the departure point is private. Employer-paid flights are not income to you.'),
  ], { ...ref(ATO.construction), feeds: ['deductions'], addsTags: { fifo_dido: ['fifo'] }, help: 'How you travel decides which trips can count. Enter the kilometres in the Car section.' }),
  single(Q.con.bulkyTools, M, 'Did you carry bulky tools or equipment that your employer required you to bring?', [
    opt('yes_no_storage', 'Yes, and there was no secure storage at the site', 'All three parts must be true: bulky, required, no safe storage. Then home-to-site trips can count.'),
    opt('yes_storage_available', 'Yes, but secure storage was available at the site', 'Choosing to bring tools home does not make the trip deductible.'),
    opt('no', 'No'),
  ], { ...ref(ATO.construction), feeds: ['deductions'], help: 'Bulky means heavy or awkward, such as a full tool chest or ladder; a small tool bag is not.' }),
  yesNoUnsure(Q.con.itinerant, M, 'Was shifting between places of work a normal part of your job (itinerant work)?', {
    ...ref(ATO.construction), feeds: ['deductions'],
    help: 'Itinerant means travel is a fundamental part of the work, you regularly work at more than one site a day, and you have no fixed workplace. Most tradies on one project at a time are not itinerant. Flagged for review.',
  }),

  // ---- Tools ----
  yesNoUnsure(Q.con.toolsAny, M, 'Did you buy tools or equipment for work this year?', {
    ...ref(ATO.tools), feeds: ['deductions'],
    help: 'Items under $300 are claimed at once; items $300 or more are claimed over their life. We ask for each item in the Deductions section.',
  }),
  yesNoUnsure('con.tool_repairs.any', M, 'Did you pay for tool repairs, tool insurance, tool hire or batteries?', {
    ...ref(ATO.tools), feeds: ['deductions'],
  }),
  ...deductionSet({
    base: 'con.tool_repairs', module: M, category: 'tools', treatment: 'D', atoRef: ATO.tools, occupationTags: TAGS, showIf: yes('con.tool_repairs.any'), matchesAllowance: ['tool'],
    prompt: 'How much did you spend on tool repairs, insurance, hire, batteries in total?',
    purpose: [
      multi('con.tool_repairs.items', M, 'Which of these did you pay for?', [
        opt('repairs', 'Tool repairs or servicing'),
        opt('insurance', 'Tool insurance'),
        opt('hire', 'Tool or equipment hire'),
        opt('batteries', 'Batteries or consumables for tools'),
        noneOption('None of these'),
      ], { feeds: ['deductions'] }),
    ],
    workPct: true, workPctPrompt: 'What percentage of the use of those tools was for work?',
  }),

  // ---- PPE ----
  multi(Q.con.ppe, M, 'Which protective clothing or PPE did you buy this year?', [
    opt('boots', 'Steel-capped or safety boots'),
    opt('hi_vis', 'Hi-vis clothing'),
    opt('hard_hat', 'Hard hat'),
    opt('gloves', 'Work gloves'),
    opt('eye_ear', 'Eye or ear protection'),
    opt('sun_gear', 'Sun-protective gear: hat, sunscreen, sunglasses'),
    noneOption('None of these'),
  ], { ...ref(ATO.construction), feeds: ['deductions'], help: 'Protective items you paid for, and were not reimbursed for, are deductible.' }),
  ...deductionSet({
    base: 'con.ppe', module: M, category: 'clothing', treatment: 'D', atoRef: ATO.construction, occupationTags: TAGS, showIf: includesAny(Q.con.ppe, PPE_ITEMS), matchesAllowance: ['uniform_laundry'],
    prompt: 'How much did you spend on that protective gear in total?',
  }),
  yesNoUnsure(Q.con.everydayClothing, M, 'Did you buy everyday clothing for work, such as jeans or plain work shirts?', {
    ...ref(ATO.clothing), feeds: ['deductions'],
    help: 'Plain clothing is not deductible even if you only wear it on site. We record the amount and show it as excluded.',
  }),
  ...deductionSet({
    base: 'con.everyday_clothing', module: M, category: 'clothing', treatment: 'N', atoRef: ATO.clothing, occupationTags: TAGS, showIf: yes(Q.con.everydayClothing),
    prompt: 'How much did you spend on everyday work clothing?',
    help: 'Recorded and shown as excluded so it is not claimed by mistake.',
  }),

  // ---- Licences, tickets, cards ----
  ...screening(Q.con.licences, M, 'Which licences, tickets or cards did you pay for this year?', [
    opt('white_card', 'White Card (general construction induction)'),
    opt('high_risk', 'High-risk work licence'),
    opt('ewp', 'EWP (elevated work platform) ticket'),
    opt('forklift', 'Forklift licence'),
    opt('trade_licence', 'Trade licence or registration (electrical, plumbing, builder)'),
  ], { ...ref(ATO.licences), feeds: ['deductions'], help: 'Getting your first licence is not deductible. Renewing a licence you need for your current job is.' }),
  single(Q.con.licenceStage, M, 'Was it a first licence, or a renewal?', [
    opt('first', 'My first licence or ticket of this kind', 'Not deductible: it lets you start the work.'),
    opt('renewal', 'A renewal of a licence I already held', 'Deductible when you paid it yourself.'),
    opt('employer_paid', 'My employer paid for it', 'Nothing to claim.'),
  ], { ...ref(ATO.licences), showIf: includesAny(Q.con.licences, LICENCE_ITEMS), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'con.licences', module: M, category: 'licences', atoRef: ATO.licences, occupationTags: TAGS,
    treatment: { byQuestion: Q.con.licenceStage, map: { first: 'N', renewal: 'D', employer_paid: 'N' }, fallback: 'R' },
    showIf: all(includesAny(Q.con.licences, LICENCE_ITEMS), isIn(Q.con.licenceStage, ['first', 'renewal'])),
    prompt: 'How much did the licences, tickets or cards cost in total?',
  }),

  // ---- Overnight, FIFO, allowances, phone (routed) ----
  yesNoUnsure(Q.con.overnight, M, 'Did you travel overnight for work this year?', {
    ...ref(ATO.overnight), feeds: ['deductions'],
    help: 'Accommodation, meals and incidentals you paid yourself can count. A travel allowance is income; we ask for nights and amounts in the Deductions section.',
  }),
  single(Q.con.fifo, M, 'Which of these applied to FIFO, DIDO or living away from home?', [
    opt('employer_paid', 'My employer paid for flights and camp accommodation', 'Nothing to claim; not income to you.'),
    opt('lafha', 'I received a living-away-from-home allowance (LAFHA)', 'LAFHA is usually a fringe benefit, not income; flagged for review.'),
    opt('self_paid', 'I paid my own travel to the departure point or camp', 'Travel to the departure point is normally private; flagged for review.'),
    opt('none', 'None of these'),
  ], { ...ref(ATO.fifo), feeds: ['deductions'] }),
  ...deductionSet({
    base: 'con.fifo', module: M, category: 'overnight_travel', atoRef: ATO.fifo, occupationTags: TAGS,
    treatment: { byQuestion: Q.con.fifo, map: { employer_paid: 'N', lafha: 'R', self_paid: 'R' }, fallback: 'R' },
    showIf: isIn(Q.con.fifo, ['lafha', 'self_paid']),
    prompt: 'How much did you receive as LAFHA, or pay for your own FIFO travel?',
    help: 'Listed for review: the treatment depends on the arrangement.',
  }),
  yesNoUnsure('con.allowances', M, 'Did you receive any site, tool, travel, overtime meal, dirt or height allowances?', {
    ...ref(ATO.construction), feeds: ['income'],
    help: 'Allowances are income and appear on your income statement. Each one is entered in the Allowances section, where we match it to the related expense.',
  }),
  yesNoUnsure(Q.con.phone, M, 'Did you use your own phone for site coordination?', {
    ...ref(ATO.phone), feeds: ['deductions'],
    help: 'Calls, messages and apps for the job. Only the work share counts; we ask the percentage in the Deductions section.',
  }),
);
