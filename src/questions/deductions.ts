/**
 * M14 general deductions. Each category is tagged to an occupation tag (Section 6 M14); gifts,
 * income protection, cost of managing tax affairs and investment deductions are universal.
 *
 * Deep-module routing pattern (Section 7): where a deep module has its own screening for a
 * category (e.g. dsw.laundry, con.phone, chef.knives.any), the GENERIC screening question is
 * hidden for that occupation with `not(any(occ(...)))`, and the shared detail questions show on
 * `any(generic screening = yes, deep trigger = yes)`. Everyone therefore answers the screen once.
 *
 * Every deduction amount is emitted through `deductionSet`, which fixes the order of the three
 * factual tests: (1) paid / reimbursed, (2) purpose, (3) work % and evidence.
 */
import type { Question } from '../engine/types';
import { GROUPS, Q } from './ids';
import {
  ATO, all, any, deductionSet, eq, evidenceQuestion, flatten, gt, includes, jobQuestion, km, money, multi, noneOption, not, num, occ, opt, otherText,
  paidQuestion, percent, repeater, screening, single, text, yes, yesNoUnsure,
} from './shared';

const D = 'deductions' as const;
const TOOL = GROUPS.toolItem;

// ---- Shared visibility conditions (generic screen OR deep-module trigger) ----
const CAR_ON = yes(Q.ded.carAny);
const TRAVEL_ON = yes('ded.travel.any');
const OVERNIGHT_ON = any(yes('ded.overnight.any'), yes(Q.con.overnight));
const CLOTHING_ON = yes('ded.clothing.any');
const LAUNDRY_ON = any(yes(Q.ded.laundryAny), yes(Q.dsw.laundry), yes(Q.chef.laundry));
const TOOL_ON = any(yes(Q.ded.toolAny), yes(Q.con.toolsAny), yes(Q.chef.knivesAny));
const WFH_ON = any(yes(Q.ded.wfhAny), yes(Q.dsw.homeOffice));
const PHONE_ON = any(yes('ded.phone.any'), yes(Q.dsw.phone), yes(Q.con.phone));
const SELFED_ON = yes('ded.selfed.any');
const UNION_ON = yes('ded.union.any');
const SUBS_ON = yes('ded.subscriptions.any');
const SUN_ON = any(yes('ded.sun.any'), yes(Q.dsw.sun));
const TAX_ON = yes('ded.tax_affairs.any');
const GIFTS_ON = yes('ded.gifts.any');
const IP_ON = yes('ded.income_protection.any');
const INV_ON = yes('ded.investment.any');

export const DEDUCTION_QUESTIONS: Question[] = flatten(
  // =========================================================================
  // Car / vehicle (special module: cents per km or logbook)
  // =========================================================================
  yesNoUnsure(Q.ded.carAny, D, 'Did you use your own car for work trips this year?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, feeds: ['deductions'],
    help: 'Work trips are driving between two workplaces, to clients, or to pick up supplies. The normal drive from home to work is private, with a few exceptions we will ask about. Does not include a car your employer supplied.',
  }),
  paidQuestion('ded.car', D, {
    prompt: 'Did you pay the running costs of the car yourself?', occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: CAR_ON,
    help: 'Fuel, registration, insurance, servicing. If your employer paid these, or paid you back per kilometre as a reimbursement, the trips usually cannot be claimed.',
  }),
  money('ded.car.reimbursed_amount', D, 'How much of the car costs did you get paid back?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: all(CAR_ON, eq('ded.car.paid', 'paid_partly_reimbursed')), feeds: ['deductions'], validation: [{ kind: 'min', value: 0 }],
  }),
  ...screening(Q.ded.carTripTypes, D, 'What kinds of trips did you make in your own car?', [
    opt('between_workplaces', 'Between two different workplaces for the same employer', 'For example from one site or store to another during the day.'),
    opt('client_to_client', 'Between clients\' homes or sites during a shift', 'Driving from one client to the next, not the trip from home.'),
    opt('home_to_work', 'From home to my normal workplace, or back', 'Ordinary commuting. Usually private; we will ask whether an exception applied.'),
    opt('bulky_tools', 'Carrying bulky tools or equipment the employer required', 'Heavy or awkward items you had to bring because there was no safe place to leave them at work.'),
    opt('itinerant', 'To many different sites, with no fixed workplace', 'Itinerant work: the job itself involves travelling between changing sites.'),
  ], { occupationTags: ['vehicle_travel'], atoRef: ATO.travel, showIf: CAR_ON, help: 'The type of trip decides whether the kilometres count. Tick every kind you made.' }),
  single(Q.ded.carException, D, 'Which of these applied to your home-to-work trips?', [
    opt('bulky_no_storage', 'I carried bulky tools the employer required, and there was no secure storage at the work site', 'All three parts must be true: bulky, required by the employer, and no safe storage at work.'),
    opt('itinerant', 'My job was itinerant: I travelled to different sites as a normal part of the work'),
    opt('home_base', 'My home was a genuine base of work: I started work at home before travelling', 'Rare. Doing a few emails at home does not make it a work base.'),
    opt('none', 'None of these', 'Then the home-to-work trips are private and are left out.'),
  ], {
    occupationTags: ['vehicle_travel'], atoRef: ATO.travel, showIf: all(CAR_ON, includes(Q.ded.carTripTypes, 'home_to_work')), feeds: ['deductions'],
    help: 'Home-to-work travel is private unless one of these narrow exceptions applies. We only count it if you pick one.',
  }),
  single(Q.ded.carMethod, D, 'Which method do you want to use for car expenses?', [
    opt('cents_per_km', 'Cents per kilometre (up to 5,000 work km, no receipts needed)', 'A set rate per work kilometre covers all running costs. You need a reasonable basis for the kilometres, such as a diary of trips.'),
    opt('logbook', 'Logbook (work percentage of actual costs)', 'Needs a 12-week logbook plus records of all car costs. Usually better for high work use.'),
  ], { occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: CAR_ON, feeds: ['deductions'], calc: { special: 'car' }, help: 'You can use only one method per car per year.' }),
  single(Q.ded.carCount, D, 'How many of your own cars did you use for work trips?', [
    opt('one', 'One car'),
    opt('two', 'Two cars', 'Each car gets its own 5,000 km limit under the cents-per-kilometre method.'),
  ], { occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: all(CAR_ON, eq(Q.ded.carMethod, 'cents_per_km')), feeds: ['deductions'], calc: { special: 'car' } }),
  km(Q.ded.carKm, D, 'How many work kilometres did you drive this year (first car, if you used two)?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: all(CAR_ON, eq(Q.ded.carMethod, 'cents_per_km')), feeds: ['deductions'], calc: { special: 'car' },
    validation: [{ kind: 'min', value: 0 }, { kind: 'warnAbove', value: 5000, message: 'The cents-per-kilometre method is capped at 5,000 km per car.' }],
    help: 'Only the work trips ticked above. Do not include private trips or ordinary commuting.',
  }),
  km(Q.ded.carKm2, D, 'How many work kilometres did you drive in the second car?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: all(CAR_ON, eq(Q.ded.carMethod, 'cents_per_km'), eq(Q.ded.carCount, 'two')), feeds: ['deductions'], calc: { special: 'car' },
    validation: [{ kind: 'min', value: 0 }, { kind: 'warnAbove', value: 5000, message: 'The cents-per-kilometre method is capped at 5,000 km per car.' }],
    help: 'Only work trips in the second car. The 5,000 km limit applies to each car separately.',
  }),
  percent(Q.ded.carLogbookPct, D, 'What work-use percentage does your logbook show?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: all(CAR_ON, eq(Q.ded.carMethod, 'logbook')), feeds: ['deductions'], calc: { special: 'car' },
    help: 'Work kilometres divided by total kilometres over the 12-week logbook period.',
  }),
  money(Q.ded.carTotalCosts, D, 'What were the total running costs of the car for the year?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: all(CAR_ON, eq(Q.ded.carMethod, 'logbook')), feeds: ['deductions'], calc: { special: 'car' },
    deduction: { category: 'car', base: 'ded.car', treatment: 'D', matchesAllowance: ['car_km'] }, validation: [{ kind: 'min', value: 0 }],
    help: 'Fuel, registration, insurance, servicing, interest on a car loan, and decline in value. Before applying the work percentage.',
  }),
  evidenceQuestion('ded.car', D, {
    occupationTags: ['vehicle_travel'], atoRef: ATO.car, showIf: CAR_ON, prompt: 'What records do you have for the car trips?',
  }),
  jobQuestion('ded.car', D, { occupationTags: ['vehicle_travel'], showIf: CAR_ON }),

  // =========================================================================
  // Other work travel (public transport, taxis, parking, tolls)
  // =========================================================================
  yesNoUnsure('ded.travel.any', D, 'Did you pay for public transport, taxis, parking or tolls on work trips?', {
    occupationTags: ['vehicle_travel'], atoRef: ATO.travel, feeds: ['deductions'],
    help: 'Trips between workplaces or to clients, not the normal trip from home to work.',
  }),
  ...deductionSet({
    base: 'ded.travel', module: D, category: 'work_travel', treatment: 'D', atoRef: ATO.travel, occupationTags: ['vehicle_travel'], showIf: TRAVEL_ON,
    prompt: 'How much did you spend on these work trips?', matchesAllowance: ['travel'],
    purpose: [
      multi('ded.travel.kind', D, 'What were these costs for?', [
        opt('public_transport', 'Public transport between workplaces or to clients'),
        opt('taxi_rideshare', 'Taxis or rideshare for work trips'),
        opt('parking_tolls', 'Parking or tolls on work trips', 'Not parking at your normal workplace.'),
        noneOption('None of these'),
      ], { feeds: ['deductions'], help: 'Only trips that were part of the work itself count.' }),
    ],
  }),

  // =========================================================================
  // Overnight travel (generic screen hidden for construction: con.overnight routes here)
  // =========================================================================
  yesNoUnsure('ded.overnight.any', D, 'Did you sleep away from home for work this year?', {
    occupationTags: ['overnight_travel'], atoRef: ATO.overnight, feeds: ['deductions'], showIf: not(occ('construction')),
    help: 'Work trips that needed a night away: accommodation, meals and small costs can count if you paid them yourself.',
  }),
  num(Q.ded.overnightNights, D, 'How many nights did you spend away from home for work?', {
    occupationTags: ['overnight_travel'], atoRef: ATO.overnight, showIf: OVERNIGHT_ON, feeds: ['deductions'], validation: [{ kind: 'min', value: 1 }, { kind: 'max', value: 366 }],
  }),
  ...deductionSet({
    base: 'ded.overnight', module: D, category: 'overnight_travel', treatment: 'D', atoRef: ATO.overnight, occupationTags: ['overnight_travel'], showIf: OVERNIGHT_ON,
    prompt: 'How much did you spend on accommodation, meals, incidentals on those trips?', matchesAllowance: ['travel', 'lafha'],
    help: 'Total you paid yourself. If you received a travel allowance, enter it in the Allowances section; we check both sides.',
    purpose: [
      single('ded.overnight.purpose', D, 'Why did you travel overnight?', [
        opt('employer_required', 'My employer required me to work away from my usual workplace'),
        opt('training', 'To attend work-related training or a conference'),
        opt('relocation', 'I relocated or lived away from home for a long period', 'Living away from home is different from travelling; we flag it for review.'),
        opt('other', 'Another work reason'),
      ], { feeds: ['deductions'] }),
      otherText('ded.overnight.purpose', D, { prompt: 'Describe the other work reason' }),
    ],
  }),

  // =========================================================================
  // Clothing (generic screen hidden where a deep module asks its own clothing questions)
  // =========================================================================
  yesNoUnsure('ded.clothing.any', D, 'Did you buy work clothing this year?', {
    occupationTags: ['uniform_ppe'], atoRef: ATO.clothing, feeds: ['deductions'], showIf: not(any(occ('dsw'), occ('construction'), occ('chef_hospitality'))),
    help: 'Only some work clothing counts: a compulsory uniform with a logo, a registered uniform, protective items, or clothing specific to your occupation. Plain clothes do not, even if you only wear them at work.',
  }),
  ...deductionSet({
    base: 'ded.clothing', module: D, category: 'clothing', treatment: 'D', atoRef: ATO.clothing, occupationTags: ['uniform_ppe'], showIf: CLOTHING_ON,
    prompt: 'How much did you spend on the eligible work clothing?', matchesAllowance: ['uniform_laundry'],
    help: 'Only the types ticked above other than plain clothes. Plain clothing is recorded but left out.',
    validation: [{ kind: 'min', value: 0 }, { kind: 'warnAbove', value: 200000, message: 'Clothing over $2,000 is unusual; check the amount.' }],
    purpose: [
      multi(Q.ded.clothingType, D, 'What kind of work clothing was it?', [
        opt('compulsory_uniform', 'A compulsory uniform with the employer\'s logo', 'Your employer strictly requires it and it identifies the employer.'),
        opt('registered_uniform', 'A non-compulsory uniform registered with AusIndustry', 'Your employer can tell you whether the design is registered.'),
        opt('protective', 'Protective clothing or footwear', 'Steel-capped boots, hi-vis, gloves, aprons, non-slip shoes, sun-protective gear.'),
        opt('occupation_specific', 'Clothing specific to my occupation', 'Clothes that identify your job, such as a chef\'s checked pants.'),
        opt('plain', 'Plain clothing, such as black pants or a white shirt', 'Not deductible even if your employer requires the colour.'),
        noneOption('None of these'),
      ], { feeds: ['deductions'], help: 'The type decides whether the cost counts.' }),
    ],
  }),

  // =========================================================================
  // Laundry (special module: loads per week x ATO rate)
  // =========================================================================
  yesNoUnsure(Q.ded.laundryAny, D, 'Did you wash eligible work clothing at home this year?', {
    occupationTags: ['uniform_ppe'], atoRef: ATO.laundry, feeds: ['deductions'], showIf: not(any(occ('dsw'), occ('chef_hospitality'))),
    help: 'Eligible clothing is a compulsory or registered uniform, protective clothing, or occupation-specific clothing. The ATO allows a set amount per load.',
  }),
  paidQuestion('ded.laundry', D, {
    prompt: 'Did you pay for the laundry yourself?', occupationTags: ['uniform_ppe'], atoRef: ATO.laundry, showIf: LAUNDRY_ON,
    help: 'If your employer washes the uniform, or pays a laundry reimbursement, there is nothing to claim.',
  }),
  num(Q.ded.laundryLoadsWorkOnly, D, 'How many loads a week contained only work clothing?', {
    occupationTags: ['uniform_ppe'], atoRef: ATO.laundry, showIf: LAUNDRY_ON, feeds: ['deductions'], calc: { special: 'laundry' }, validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 14 }],
    help: 'A load with nothing but work clothing gets the higher rate. Enter 0 if none.',
  }),
  num(Q.ded.laundryLoadsMixed, D, 'How many loads a week mixed work clothing with other washing?', {
    occupationTags: ['uniform_ppe'], atoRef: ATO.laundry, showIf: LAUNDRY_ON, feeds: ['deductions'], calc: { special: 'laundry' }, validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 14 }],
    help: 'Mixed loads get the lower rate. Enter 0 if none.',
  }),
  num(Q.ded.laundryWeeks, D, 'For how many weeks of the year did you do this washing?', {
    occupationTags: ['uniform_ppe'], atoRef: ATO.laundry, showIf: LAUNDRY_ON, feeds: ['deductions'], calc: { special: 'laundry' }, validation: [{ kind: 'min', value: 1 }, { kind: 'max', value: 52 }],
    help: 'Weeks you actually worked, not including leave.',
  }),
  evidenceQuestion('ded.laundry', D, {
    occupationTags: ['uniform_ppe'], atoRef: ATO.laundry, showIf: LAUNDRY_ON, prompt: 'What records do you have of the laundry?',
    help: 'Laundry claims over $150 need written evidence of how you worked out the loads. Under $150 a reasonable basis is enough.',
  }),

  // =========================================================================
  // Tools and equipment (repeater; construction and chef deep modules route here)
  // =========================================================================
  yesNoUnsure(Q.ded.toolAny, D, 'Did you buy tools or equipment for work this year?', {
    occupationTags: ['tools_equipment'], atoRef: ATO.tools, feeds: ['deductions'], showIf: not(any(occ('construction'), occ('chef_hospitality'))),
    help: 'Hand tools, power tools, computers, tablets, bags for carrying work items. Items under $300 are claimed at once; $300 or more are claimed over their life.',
  }),
  repeater(Q.ded.toolRepeater, D, 'Tools or equipment you bought', {
    groupId: TOOL, itemLabel: 'Tool or equipment item', addLabel: 'Add another item', minItems: 1, labelFrom: Q.ded.toolItem,
  }, { occupationTags: ['tools_equipment'], atoRef: ATO.tools, showIf: TOOL_ON, help: 'One entry per item, or per set bought together. Each needs its own receipt.' }),
  text(Q.ded.toolItem, D, 'What was the item?', { repeaterGroup: TOOL, occupationTags: ['tools_equipment'], atoRef: ATO.tools, showIf: TOOL_ON, required: true, validation: [{ kind: 'maxLength', value: 120 }] }),
  ...deductionSet({
    base: 'ded.tool', module: D, amountId: Q.ded.toolCost, category: 'tools', treatment: 'D', capitalThreshold: true, atoRef: ATO.tools,
    occupationTags: ['tools_equipment'], repeaterGroup: TOOL, showIf: TOOL_ON, matchesAllowance: ['tool'],
    prompt: 'How much did the item cost?', help: 'The full price you paid. Items $300 or more are spread over several years.',
    askDate: true, workPct: true, workPctPrompt: 'What percentage of the time is this item used for work?', askJob: true,
  }),
  num(Q.ded.toolEffectiveLife, D, 'How many years do you expect this item to last?', {
    repeaterGroup: TOOL, occupationTags: ['tools_equipment'], atoRef: ATO.tools, showIf: all(TOOL_ON, gt(Q.ded.toolCost, 29999)), feeds: ['deductions'],
    validation: [{ kind: 'min', value: 1 }, { kind: 'max', value: 40 }],
    help: 'Items costing $300 or more are claimed over their effective life. The ATO publishes typical lives; for example power tools are often 3 to 5 years.',
  }),
  money(Q.ded.toolOpeningValue, D, 'If first used before this year: what was its value at the start of this year? (optional)', {
    repeaterGroup: TOOL, occupationTags: ['tools_equipment'], atoRef: ATO.tools, showIf: all(TOOL_ON, gt(Q.ded.toolCost, 29999)), required: false, feeds: ['deductions'],
    validation: [{ kind: 'min', value: 0 }],
    help: 'The opening adjustable value: cost less the decline in value worked out in earlier years (last year\'s closing value). Only for an item first used before this year; the cost is not written off again from the start.',
  }),

  // =========================================================================
  // Home office (special module: fixed rate x hours, or actual costs; dsw.home_office routes here)
  // =========================================================================
  // Available to every occupation (support workers answer dsw.home_office instead).
  yesNoUnsure(Q.ded.wfhAny, D, 'Did you do any of your paid work from home this year?', {
    atoRef: ATO.wfh, feeds: ['deductions'], showIf: not(occ('dsw')),
    help: 'Substantive work duties done at home: reports, case notes, client calls, planning. Checking a roster or payslip, or the odd email, does not count, and working at home does not make the trip to your workplace deductible.',
  }),
  multi(Q.ded.wfhActivities, D, 'Which of these did you do at home?', [
    opt('employment', 'Duties for my job as an employee'),
    opt('business', 'Work for my own business'),
    opt('study', 'Study for a course related to my current work'),
  ], {
    atoRef: ATO.wfh, showIf: WFH_ON, required: false, feeds: ['deductions'],
    help: 'Each activity keeps its own hours. An hour is counted once, under one activity. Hours are evidence for a permitted method, not a deduction on their own.',
  }),
  single(Q.ded.wfhMethod, D, 'Which method do you want to use for working-from-home costs?', [
    opt('fixed_rate', 'Fixed rate per hour worked at home', 'A set rate per hour covers electricity, internet, phone, stationery. You need a record of the hours.'),
    opt('actual', 'Actual costs with a work-use percentage', 'You add up the real costs and apply a work percentage. Needs receipts and a record of use.'),
  ], { atoRef: ATO.wfh, showIf: WFH_ON, feeds: ['deductions'], calc: { special: 'wfh' } }),
  num(Q.ded.wfhHours, D, 'How many hours did you do your job duties at home during the year?', {
    atoRef: ATO.wfh, showIf: all(WFH_ON, eq(Q.ded.wfhMethod, 'fixed_rate')), feeds: ['deductions'], calc: { special: 'wfh' },
    validation: [{ kind: 'min', value: 1 }, { kind: 'max', value: 4000 }],
    help: 'Total for the year from your record, for example a diary, timesheet or roster.',
  }),
  single(Q.ded.wfhHoursRecord, D, 'What record do you have of the hours worked at home?', [
    opt('full_record', 'A record of every hour for the whole year', 'A diary, timesheet, roster or app log covering all hours.'),
    opt('representative_4_weeks', 'A representative 4-week record', 'Only accepted for earlier years; from 2023-24 the ATO requires a record of the actual hours for the full year.'),
    opt('estimate', 'An estimate only', 'The fixed-rate method is not available without a record; we flag this.'),
    opt('none', 'No record'),
  ], { atoRef: ATO.wfh, showIf: all(WFH_ON, eq(Q.ded.wfhMethod, 'fixed_rate')), feeds: ['deductions'], help: 'The fixed-rate method needs a record of actual hours.' }),
  num(Q.ded.wfhBusinessHours, D, 'How many hours of work for your business did you do at home?', {
    atoRef: ATO.wfh, showIf: all(WFH_ON, includes(Q.ded.wfhActivities, 'business')), feeds: ['deductions'], validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 4000 }],
    help: 'Recorded here as evidence. The running costs belong in that business\'s expenses, so they are not claimed twice.',
  }),
  num(Q.ded.wfhStudyHours, D, 'How many hours did you study at home for that course?', {
    atoRef: ATO.selfEd, showIf: all(WFH_ON, includes(Q.ded.wfhActivities, 'study')), feeds: ['deductions'], validation: [{ kind: 'min', value: 0 }, { kind: 'max', value: 4000 }],
    help: 'From a diary or log. Study hours are not automatically claimed at the working-from-home rate; the method is checked for your course and year.',
  }),
  yesNoUnsure(Q.ded.wfhHoursOverlap, D, 'Are any of those hours also counted in another activity?', {
    atoRef: ATO.wfh, showIf: all(WFH_ON, any(includes(Q.ded.wfhActivities, 'business'), includes(Q.ded.wfhActivities, 'study'))), required: false, feeds: ['deductions'],
    help: 'For example an evening counted as both job hours and study hours. Each hour can only be used once.',
  }),
  ...deductionSet({
    base: 'ded.wfh', module: D, amountId: Q.ded.wfhActualCosts, category: 'home_office', treatment: 'D', atoRef: ATO.wfh,
    showIf: all(WFH_ON, eq(Q.ded.wfhMethod, 'actual')), prompt: 'What were the total home running costs for the year?',
    help: 'Electricity, gas, internet, phone, stationery, and decline in value of a desk or computer. Before applying the work percentage.',
    workPct: true, workPctPrompt: 'What percentage of those costs relate to work?',
  }),

  // =========================================================================
  // Phone and internet (dsw.phone and con.phone route here)
  // =========================================================================
  yesNoUnsure('ded.phone.any', D, 'Did you use your own phone or internet for work this year?', {
    occupationTags: ['phone_internet'], atoRef: ATO.phone, feeds: ['deductions'], showIf: not(any(occ('dsw'), occ('construction'))),
    help: 'Work calls, rosters, apps, emails on a phone or internet plan you pay for. Only the work share counts.',
  }),
  ...deductionSet({
    base: 'ded.phone', module: D, category: 'phone_internet', treatment: 'D', atoRef: ATO.phone, occupationTags: ['phone_internet'], showIf: PHONE_ON,
    prompt: 'What did your phone plus internet cost for the year?', matchesAllowance: ['phone'],
    help: 'The full bills for the year, before the work percentage. If you claimed working-from-home fixed rate, phone is already included there for the home hours.',
    purpose: [
      multi('ded.phone.use', D, 'What did you use your phone or internet for at work?', [
        opt('client_contact', 'Calls or messages with clients, patients or customers'),
        opt('rosters_apps', 'Rosters, shift apps or work systems'),
        opt('employer_contact', 'Calls or messages with my employer or colleagues'),
        opt('on_call', 'Being on call'),
        opt('other', 'Other work use'),
        noneOption('None of these'),
      ], { feeds: ['deductions'], help: 'Helps the reviewer see that the work percentage is reasonable.' }),
      otherText('ded.phone.use', D, { prompt: 'Describe the other work use' }),
    ],
    workPct: true, workPctPrompt: 'What percentage of your phone plus internet use was for work?',
  }),

  // =========================================================================
  // Self-education
  // =========================================================================
  // Available to every occupation (no occupation tag), and can be changed at any time.
  yesNoUnsure('ded.selfed.any', D, 'Did you pay for study, a course or training this year?', {
    atoRef: ATO.selfEd, feeds: ['deductions'],
    help: 'Courses, seminars, textbooks, student fees. Only study that relates to your current job counts; study for a new career does not.',
  }),
  ...deductionSet({
    base: 'ded.selfed', module: D, category: 'self_education', atoRef: ATO.selfEd, showIf: SELFED_ON,
    treatment: { byQuestion: Q.ded.selfEdRelated, map: { current_duties: 'D', new_role: 'N' }, fallback: 'R' },
    prompt: 'How much did you spend on the study or training?',
    help: 'Course fees, textbooks, stationery, travel to classes. Not HELP loan repayments.',
    purpose: [
      single(Q.ded.selfEdSameCourse, D, 'Is this the same course you already entered under your job questions?', [
        opt('same', 'Yes, it is the same course', 'It is counted once, under the job questions.'),
        opt('different', 'No, it is a different course'),
      ], { showIf: any(gt(Q.chef.coursesAmount, 0), gt(Q.dsw.trainingAmount, 0)), feeds: ['deductions'], help: 'Each course should have one record. Tuition is separate from HELP loan repayments, which are never deductible.' }),
      single(Q.ded.selfEdRelated, D, 'How does the study relate to your work?', [
        opt('current_duties', 'It maintains or improves skills I use in my current job', 'Or it is likely to increase your income from that job.'),
        opt('new_role', 'It is to get a new job, or a different career', 'Not deductible, even if related to your field.'),
      ], { feeds: ['deductions'], help: 'This one answer decides whether the cost counts.' }),
    ],
    workPct: true, workPctPrompt: 'What percentage of the study costs relate to work (for items also used privately)?',
  }),

  // =========================================================================
  // Union and professional fees
  // =========================================================================
  yesNoUnsure('ded.union.any', D, 'Did you pay union fees or professional association fees this year?', {
    occupationTags: ['union_fees'], atoRef: ATO.union, feeds: ['deductions'],
    help: 'Membership of a union or a professional body for your job. Usually shown on your payslip if taken from wages.',
  }),
  ...deductionSet({
    base: 'ded.union', module: D, category: 'union_professional', treatment: 'D', atoRef: ATO.union, occupationTags: ['union_fees'], showIf: UNION_ON,
    prompt: 'How much did you pay in union or professional fees?',
    help: 'The total for the year. Joining fees for a new profession are not included.',
  }),

  // =========================================================================
  // Subscriptions and publications
  // =========================================================================
  yesNoUnsure('ded.subscriptions.any', D, 'Did you pay for work-related subscriptions or publications this year?', {
    occupationTags: ['self_education', 'union_fees'], atoRef: ATO.subscriptions, feeds: ['deductions'],
    help: 'Trade journals, professional software, or online resources you need for your current job.',
  }),
  ...deductionSet({
    base: 'ded.subscriptions', module: D, category: 'subscriptions', treatment: 'D', atoRef: ATO.subscriptions, occupationTags: ['self_education', 'union_fees'], showIf: SUBS_ON,
    prompt: 'How much did you spend on those subscriptions?',
    purpose: [
      single('ded.subscriptions.kind', D, 'What kind of subscription was it?', [
        opt('journals', 'Trade or professional journals and magazines'),
        opt('software', 'Software or online tools used for work'),
        opt('other', 'Another work-related subscription'),
      ], { feeds: ['deductions'] }),
    ],
    workPct: true, workPctPrompt: 'What percentage of the subscription use was for work?',
  }),

  // =========================================================================
  // Sun protection (dsw.sun routes here)
  // =========================================================================
  yesNoUnsure('ded.sun.any', D, 'Did you buy sun protection for outdoor work this year?', {
    occupationTags: ['sun_protection'], atoRef: ATO.sun, feeds: ['deductions'], showIf: not(occ('dsw')),
    help: 'Sunscreen, a hat or sunglasses bought because your work is outdoors.',
  }),
  ...deductionSet({
    base: 'ded.sun', module: D, category: 'sun_protection', treatment: 'D', atoRef: ATO.sun, occupationTags: ['sun_protection'], showIf: SUN_ON,
    prompt: 'How much did you spend on sun protection?',
    purpose: [
      multi('ded.sun.items', D, 'What sun protection did you buy?', [
        opt('sunscreen', 'Sunscreen'),
        opt('hat', 'A hat'),
        opt('sunglasses', 'Sunglasses'),
        opt('sun_clothing', 'Sun-protective clothing'),
        noneOption('None of these'),
      ], { feeds: ['deductions'] }),
    ],
  }),

  // =========================================================================
  // Cost of managing tax affairs (universal)
  // =========================================================================
  yesNoUnsure('ded.tax_affairs.any', D, 'Did you pay a tax agent or for tax advice last year?', {
    atoRef: ATO.taxAffairs, feeds: ['deductions'],
    help: 'Fees paid during this financial year for preparing last year\'s return, tax advice, or tax software. Claimed in the year you paid them.',
  }),
  ...deductionSet({
    base: 'ded.tax_affairs', module: D, category: 'tax_affairs', treatment: 'D', atoRef: ATO.taxAffairs, showIf: TAX_ON,
    prompt: 'How much did you pay for managing your tax affairs?',
    help: 'Including travel to see the agent. Not general accounting for a business (that goes in the business section).',
  }),

  // =========================================================================
  // Gifts and donations (universal)
  // =========================================================================
  yesNoUnsure('ded.gifts.any', D, 'Did you donate $2 or more to a charity this year?', {
    atoRef: ATO.gifts, feeds: ['deductions'],
    help: 'Only gifts to organisations registered as deductible gift recipients (DGRs) count, and only where you got nothing in return (raffle tickets and fundraising dinners do not count).',
  }),
  ...deductionSet({
    base: 'ded.gifts', module: D, category: 'gifts_donations', atoRef: ATO.gifts, showIf: GIFTS_ON,
    treatment: { byQuestion: Q.ded.giftsDgr, map: { yes: 'D', no: 'N' }, fallback: 'R' },
    paidPrompt: 'Did you make the donation from your own money?',
    prompt: 'What was the total of those donations?',
    help: 'Add up the receipts. Workplace giving from your pay is usually on your income statement.',
    purpose: [
      yesNoUnsure(Q.ded.giftsDgr, D, 'Were the recipients registered as deductible gift recipients (DGRs)?', {
        feeds: ['deductions'],
        help: 'The receipt usually says "tax deductible". You can check any charity on the ABN Lookup website.',
      }),
    ],
  }),

  // =========================================================================
  // Income protection insurance (universal)
  // =========================================================================
  yesNoUnsure('ded.income_protection.any', D, 'Did you pay income protection insurance premiums this year?', {
    atoRef: ATO.incomeProtection, feeds: ['deductions'],
    help: 'Insurance that pays you an income if you cannot work. Premiums paid outside super are deductible; premiums paid by your super fund are not. Life, trauma and TPD cover are not deductible.',
  }),
  ...deductionSet({
    base: 'ded.income_protection', module: D, category: 'income_protection', atoRef: ATO.incomeProtection, showIf: IP_ON,
    treatment: { byQuestion: 'ded.income_protection.via', map: { outside_super: 'D', inside_super: 'N' }, fallback: 'R' },
    prompt: 'How much were the income protection premiums for the year?',
    help: 'Only the income protection part. If the policy bundles life cover, the insurer\'s statement shows the split.',
    purpose: [
      single('ded.income_protection.via', D, 'How were the premiums paid?', [
        opt('outside_super', 'From my own money, to the insurer directly', 'Deductible.'),
        opt('inside_super', 'From my super account', 'Not deductible to you; the fund claims it.'),
      ], { feeds: ['deductions'] }),
    ],
  }),

  // =========================================================================
  // Investment deductions (universal)
  // =========================================================================
  yesNoUnsure('ded.investment.any', D, 'Did you pay any costs to earn interest, dividends or fund income this year?', {
    atoRef: ATO.investment, feeds: ['deductions'],
    help: 'Interest on money borrowed to buy shares, account-keeping fees on investment accounts, ongoing advice fees for existing investments. Not brokerage (that goes in the cost base) or advice on new investments.',
  }),
  ...deductionSet({
    base: 'ded.investment', module: D, category: 'investment', treatment: 'D', atoRef: ATO.investment, showIf: INV_ON,
    prompt: 'How much did you pay in investment costs?',
    purpose: [
      multi('ded.investment.kind', D, 'What were those costs for?', [
        opt('loan_interest', 'Interest on a loan used to buy shares or other investments'),
        opt('account_fees', 'Account-keeping or management fees on investment accounts'),
        opt('advice', 'Ongoing advice fees for investments I already held'),
        opt('other', 'Other investment costs'),
        noneOption('None of these'),
      ], { feeds: ['deductions'] }),
      otherText('ded.investment.kind', D, { prompt: 'Describe the other investment costs' }),
    ],
  }),
);
