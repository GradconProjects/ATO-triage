/**
 * Canonical question ids shared by the question bank, the calculation engine and the
 * intelligence layer. The bank MUST use these ids for these questions; other questions
 * may use any stable id following the `module.topic.item` pattern.
 *
 * Value shapes: single -> string option value; multi -> string[]; yes_no_unsure -> 'yes'|'no'|'not_sure';
 * money -> integer cents; number/percent/km -> number; date -> 'YYYY-MM-DD'; date_range -> {from,to}.
 */
export const Q = {
  // M1 core
  core: {
    fy: 'core.fy',                      // single: '2023-24' | ... (no not_sure; allow-listed)
    purpose: 'core.purpose',            // single: pre_lodgment | assessment_review | amendment | planning
    lodged: 'core.lodged',              // single: yes_mygov | yes_agent | no | not_sure
    assessedResult: 'core.assessed_result', // money, allowNegative: refund (+) / debt (-) on the notice of assessment
  },
  // M2 residency
  res: {
    status: 'res.status',               // single: resident_full | became_resident | ceased_resident | foreign_full | temporary | whm | not_sure
    arrivalDate: 'res.arrival_date',    // date
    departureDate: 'res.departure_date',// date
    whmIncome: 'res.whm_income',        // money: income earned while WHM
    dual: 'res.dual',                   // yes_no_unsure
  },
  // M3 family, medicare, PHI
  fam: {
    spouse: 'fam.spouse',               // single: all_year | part_year | no | not_sure
    spouseDates: 'fam.spouse_dates',    // date_range
    spouseTaxableIncome: 'fam.spouse_taxable_income', // money
    spouseRfb: 'fam.spouse_rfb',        // money
    spouseRsc: 'fam.spouse_rsc',        // money (reportable super contributions)
    dependantsCount: 'fam.dependants_count', // number
    dependantsStudents: 'fam.dependants_students', // yes_no_unsure
  },
  med: {
    exemption: 'med.exemption',         // single: entitled_full | foreign_resident | temp_visa_mes | part_year | not_sure
    exemptDays: 'med.exempt_days',      // number: days NOT entitled to Medicare
  },
  phi: {
    cover: 'phi.cover',                 // single: whole_year | part_year | extras_only | none | not_sure
    daysCovered: 'phi.days_covered',    // number
    policyRepeater: 'phi.policy',       // repeater group 'phi_policy'
    policyPremiums: 'phi.policy.premiums', // money (in group)
    policyRebate: 'phi.policy.rebate_received', // money (in group)
    policyTier: 'phi.policy.tier',      // single: base | tier1 | tier2 | tier3 | not_sure (insurer's tier; informational)
    // Statement-based entry (per policy): two statement lines, before and from 1 April.
    policyMembership: 'phi.policy.membership', // text: membership number (identifies the policy across spouses)
    policySource: 'phi.policy.source',         // single: statement | own_figures | not_sure
    policyJ1: 'phi.policy.j1',                 // money: premiums eligible (label J), 1 Jul - 31 Mar line
    policyK1: 'phi.policy.k1',                 // money: rebate received (label K), 1 Jul - 31 Mar line
    policyL1: 'phi.policy.l1',                 // single: benefit code 30 | 35 | 40
    policyJ2: 'phi.policy.j2',                 // money: premiums eligible, 1 Apr - 30 Jun line
    policyK2: 'phi.policy.k2',                 // money: rebate received, 1 Apr - 30 Jun line
    policyL2: 'phi.policy.l2',                 // single: benefit code 31 | 36 | 41
    policyCoveredAs: 'phi.policy.covered_as',  // single: adult | dependant | not_sure (dependant -> no rebate, code F)
    policyElection: 'phi.policy.election',     // single: my_share | both_shares | spouse_claims_mine | not_sure
    policySpouseShare: 'phi.policy.spouse_share', // yes_no_unsure: the ATO conditions for claiming the spouse's share are all met
    policySpouseConfirmed: 'phi.policy.spouse_confirmed', // yes_no_unsure: the spouse has confirmed their matching election
    // The spouse's own statement lines (only when claiming both shares): never assumed equal to yours.
    policySpouseJ1: 'phi.policy.spouse_j1', policySpouseK1: 'phi.policy.spouse_k1', policySpouseL1: 'phi.policy.spouse_l1',
    policySpouseJ2: 'phi.policy.spouse_j2', policySpouseK2: 'phi.policy.spouse_k2', policySpouseL2: 'phi.policy.spouse_l2',
    policyAmountBasis: 'phi.policy.amount_basis', // single: full_policy | my_share | not_sure (own figures only)
    // Own-figures entry (no statement): converted to the taxpayer's share.
    policyAdults: 'phi.policy.adults',         // number: adults covered by the policy
    policyLhc: 'phi.policy.lhc',               // money: lifetime health cover loading included in the premiums
    policyAge: 'phi.policy.age',               // single: under65 | 65_69 | 70plus | not_sure (oldest person covered)
    policyRebateConfirmed: 'phi.policy.rebate_confirmed', // yes_no_unsure: rebate received really was $0 (paid full price)
  },
  // M4 employment (group 'employer')
  emp: {
    repeater: 'emp.employer',           // repeater, group 'employer'
    name: 'emp.employer.name',          // text
    abn: 'emp.employer.abn',            // text optional
    occupation: 'emp.employer.occupation', // single: registry occupation id | other | not_sure
    occupationOther: 'emp.employer.occupation_other', // text
    otherTags: 'emp.employer.other_tags', // multi: generic OccupationTag values + not_sure
    dates: 'emp.employer.dates',        // date_range
    gross: 'emp.employer.gross',        // money, income salary
    withheld: 'emp.employer.withheld',  // money, credit payg_withheld
    rfb: 'emp.employer.rfb',            // money reportable fringe benefits
    resc: 'emp.employer.resc',          // money reportable employer super
    lumpA: 'emp.employer.lump_a',       // money
    lumpAType: 'emp.employer.lump_a_type', // single: R | T | not_sure
    lumpB: 'emp.employer.lump_b',       // money
    lumpD: 'emp.employer.lump_d',       // money
    lumpE: 'emp.employer.lump_e',       // money
    taxReady: 'emp.employer.tax_ready', // yes_no_unsure
    otherPay: 'emp.other_pay',          // multi screening: cash | tips | gifts | director_fees | labour_hire | none | other | not_sure
    otherPayCash: 'emp.other_pay.cash', // money
    otherPayTips: 'emp.other_pay.tips', // money
    otherPayGifts: 'emp.other_pay.gifts', // money (treatment R)
    otherPayDirector: 'emp.other_pay.director_fees', // money
    otherPayLabourHire: 'emp.other_pay.labour_hire', // money
    otherPayOtherText: 'emp.other_pay.other_text',   // text
    otherPayOtherAmount: 'emp.other_pay.other_amount', // money (R)
  },
  // M5 allowances (group 'allowance')
  allow: {
    repeater: 'allow.item',             // repeater, group 'allowance'
    any: 'allow.any',                   // yes_no_unsure screening
    type: 'allow.item.type',            // single: car_km | travel | meal | tool | uniform_laundry | site_industry | lafha | first_aid | phone | other | not_sure
    amount: 'allow.item.amount',        // money, income allowance (treatment by nature)
    onStatement: 'allow.item.on_statement', // yes_no_unsure
    nature: 'allow.item.nature',        // single: allowance | reimbursement | not_sure
    job: 'allow.item.job',              // text: which employer
  },
  // M6 compensation
  comp: {
    received: 'comp.received',          // multi screening: weekly | arrears | medical | impairment | economic_loss | common_law | interest | legal | income_protection | sickness | none | other | not_sure
    weeklyAmount: 'comp.weekly.amount', // money I
    weeklyWithheld: 'comp.weekly.withheld', // money credit
    weeklyIncludesArrears: 'comp.weekly.includes_arrears', // single: yes | no | not_sure: does the gross include the arrears?
    arrearsAmount: 'comp.arrears.amount', // money I (lump sum E)
    medicalAmount: 'comp.medical.amount', // money N
    impairmentAmount: 'comp.impairment.amount', // money R
    economicLossAmount: 'comp.economic_loss.amount', // money R
    commonLawAmount: 'comp.common_law.amount', // money R
    interestAmount: 'comp.interest.amount', // money I (interest)
    legalAmount: 'comp.legal.amount',   // money N
    incomeProtectionAmount: 'comp.income_protection.amount', // money I
    sicknessAmount: 'comp.sickness.amount', // money I
    otherText: 'comp.other.text',
    otherAmount: 'comp.other.amount',   // money R
    lseRepeater: 'comp.lse',            // repeater group 'lump_sum_e_year'
    lseFy: 'comp.lse.fy',               // single: earlier financial year e.g. '2021-22'
    lseAmount: 'comp.lse.amount',       // money
    lseOver12m: 'comp.lse.over_12m',    // yes_no_unsure
    lseTaxableIncome: 'comp.lse.taxable_income', // money that year's taxable income
    etpReceived: 'etp.received',        // multi screening: etp | unused_leave | redundancy | none | other | not_sure
    etpAmount: 'etp.amount',            // money R
    etpCode: 'etp.code',                // single
  },
  // M7 government
  gov: {
    received: 'gov.received',           // multi screening: jobseeker | pension | parenting | ppl | dad_partner | disaster | veterans | none | other | not_sure
    // per type: gov.<type>.amount (money I), gov.<type>.withheld (money credit)
    amount: (type: string) => `gov.${type}.amount`,
    withheld: (type: string) => `gov.${type}.withheld`,
  },
  // M8 super income
  sup: {
    received: 'sup.received',           // yes_no_unsure
    age: 'sup.age',                     // number age at payment
    element: 'sup.element',             // single: taxed | untaxed | mixed | not_sure
    amount: 'sup.amount',               // money (treatment by element/age -> R unless taxed & age>=60)
    withheld: 'sup.withheld',           // money credit
  },
  // M9 investments
  inv: {
    interestAny: 'inv.interest.any',    // yes_no_unsure
    interestRepeater: 'inv.interest',   // group 'interest_account'
    interestBank: 'inv.interest.bank',  // text
    interestAmount: 'inv.interest.amount', // money (whole account amount)
    interestSharePct: 'inv.interest.share_pct', // percent ownership
    interestTfnWithheld: 'inv.interest.tfn_withheld', // money credit
    divAny: 'inv.div.any',
    divRepeater: 'inv.div',             // group 'dividend'
    divHolding: 'inv.div.holding',
    divUnfranked: 'inv.div.unfranked',  // money
    divFranked: 'inv.div.franked',      // money
    divFrankingCredit: 'inv.div.franking_credit', // money
    divTfnWithheld: 'inv.div.tfn_withheld', // money credit
    divDrp: 'inv.div.drp',              // yes_no_unsure
    trustAny: 'inv.trust.any',
    trustRepeater: 'inv.trust',         // group 'trust_dist'
    trustName: 'inv.trust.name',
    trustIncome: 'inv.trust.income',    // money (non-primary production income)
    trustFrankingCredit: 'inv.trust.franking_credit', // money
    trustCgDiscounted: 'inv.trust.cg_discounted',     // money: discounted capital gain component (grossed amount)
    trustCgOther: 'inv.trust.cg_other', // money
    trustForeignIncome: 'inv.trust.foreign_income',   // money
    trustForeignTax: 'inv.trust.foreign_tax',         // money credit foreign_tax_paid
    trustTfnWithheld: 'inv.trust.tfn_withheld',
    ess: 'inv.ess',                     // yes_no_unsure
    essDiscount: 'inv.ess.discount',    // money R
  },
  // M10 rental (group 'rental_property')
  rent: {
    any: 'rent.any',                    // yes_no_unsure
    repeater: 'rent.property',          // group 'rental_property'
    address: 'rent.property.address',
    ownershipPct: 'rent.property.ownership_pct', // percent
    available: 'rent.property.available',        // date_range
    daysRented: 'rent.property.days_rented',     // number
    daysPrivate: 'rent.property.days_private',   // number
    income: 'rent.property.income',              // money (100% of property)
    expInterest: 'rent.property.exp.interest',
    expCouncil: 'rent.property.exp.council',
    expWater: 'rent.property.exp.water',
    expInsurance: 'rent.property.exp.insurance',
    expAgent: 'rent.property.exp.agent',
    expRepairs: 'rent.property.exp.repairs',
    expCapitalWorks: 'rent.property.exp.capital_works',
    expDepreciation: 'rent.property.exp.depreciation',
    expOther: 'rent.property.exp.other',
    initialRepairs: 'rent.property.initial_repairs', // yes_no_unsure
    shortStay: 'rent.property.short_stay',           // yes_no_unsure
  },
  // M11 CGT (group 'cgt_event')
  cgt: {
    events: 'cgt.events',               // multi screening: shares | crypto | property | distribution | insurance | none | other | not_sure
    repeater: 'cgt.event',              // group 'cgt_event'
    assetType: 'cgt.event.asset_type',  // single: shares | crypto | property | other | not_sure
    description: 'cgt.event.description',
    acquiredDate: 'cgt.event.acquired_date',
    costBase: 'cgt.event.cost_base',    // money (incl. incidental costs)
    disposedDate: 'cgt.event.disposed_date',
    proceeds: 'cgt.event.proceeds',     // money
    ownershipPct: 'cgt.event.ownership_pct',
    mainResidence: 'cgt.event.main_residence', // single: yes | no | part | not_sure
    priorLosses: 'cgt.prior_losses',    // money: net capital losses carried forward from earlier years
    cryptoMethod: 'cgt.crypto_method',  // single: specific_id | fifo | other | not_sure
    cryptoIncome: 'cgt.crypto_income',  // money I (staking/airdrops)
    priorLossesAny: 'cgt.prior_losses.any',           // yes_no_unsure (asked when there is no CGT event this year)
    priorLossesOrigin: 'cgt.prior_losses.origin',     // multi: spot_sales | derivatives | property | other | not_sure
    priorLossesCorrection: 'cgt.prior_losses.correction', // text: reviewed reclassification and its evidence
    derivativesAny: 'cgt.derivatives.any',            // yes_no_unsure
    derivativesNature: 'cgt.derivatives.nature',      // single: investment | business | not_sure
    derivativesNet: 'cgt.derivatives.net',            // money (may be negative): net result, investment only
    platforms: 'cgt.platforms',                       // text: exchanges or platforms used (reusable detail)
  },
  // M12 foreign
  fgn: {
    received: 'fgn.received',           // multi screening: employment | pension | rent | investment | none | other | not_sure
    amount: (type: string) => `fgn.${type}.amount`, // money I (temporary resident -> R)
    taxPaid: 'fgn.tax_paid',            // money credit foreign_tax_paid (via FITO)
    assetsOver50k: 'fgn.assets_over_50k', // yes_no_unsure
    tempForeignSourced: 'fgn.temp_foreign_sourced', // yes_no_unsure
  },
  // M13 business
  bus: {
    soleTrader: 'bus.sole_trader',      // yes_no_unsure (adds tag sole_trader)
    abn: 'bus.abn',
    income: 'bus.income',               // money
    expenses: 'bus.expenses',           // money
    gst: 'bus.gst',                     // yes_no_unsure
    psi80: 'bus.psi_80',                // yes_no_unsure
    psiResults: 'bus.psi_results',      // yes_no_unsure
    psiUnrelated: 'bus.psi_unrelated',  // yes_no_unsure
    ptAny: 'bus.pt.any',                // yes_no_unsure
    ptRepeater: 'bus.pt',               // group 'partnership_trust'
    ptName: 'bus.pt.name',
    ptShare: 'bus.pt.share',            // money (may be negative loss -> R)
    ptCredits: 'bus.pt.credits',        // money credit franking
    name: 'bus.name',                   // text: what the main business does (reusable detail)
    lossTests: 'bus.loss.tests',        // multi: income_20k | profit_3_of_5 | property_500k | assets_100k | none | not_sure
    priorDeferred: 'bus.prior_deferred', // money: main business deferred non-commercial losses from earlier years (opening balance)
    // Separate business activities (group 'business_activity'); the main business stays on the fields above.
    activityAny: 'bus.activity.any',    // yes_no_unsure
    activityRepeater: 'bus.activity',   // repeater, group 'business_activity'
    activityName: 'bus.activity.name',  // text
    activityKind: 'bus.activity.kind',  // single: crypto_trading | derivatives_trading | trading_signals | other | not_sure
    activityAbn: 'bus.activity.abn',    // text optional
    activityIncome: 'bus.activity.income', // money
    activityExpSubscriptions: 'bus.activity.exp_subscriptions', // money: signal, data and research subscriptions
    activityExpPlatform: 'bus.activity.exp_platform',           // money: exchange, platform and brokerage fees
    activityExpOther: 'bus.activity.exp_other',                 // money: all other expenses of this activity
    activityLossTests: 'bus.activity.loss_tests',               // multi, as bus.loss.tests
    activityPriorDeferred: 'bus.activity.prior_deferred',       // money: opening deferred loss for this activity
  },
  // M14 deductions
  ded: {
    // Car (special module)
    carAny: 'ded.car.any',              // yes_no_unsure
    carMethod: 'ded.car.method',        // single: cents_per_km | logbook | not_sure
    carKm: 'ded.car.km',                // km (first car)
    carCount: 'ded.car.count',          // single: one | two (cents per km: cars used for work)
    carKm2: 'ded.car.km2',              // km (second car, cents per km)
    carTripTypes: 'ded.car.trip_types', // multi: between_workplaces | client_to_client | home_to_work | bulky_tools | itinerant | other | not_sure
    carException: 'ded.car.exception',  // multi (legacy saved answers may be a single string): bulky_no_storage | itinerant | home_base | none | not_sure
    carLogbookPct: 'ded.car.logbook_pct', // percent
    carTotalCosts: 'ded.car.total_costs', // money
    carPaid: 'ded.car.paid',
    carEvidence: 'ded.car.evidence',
    // Other work travel
    travelAmount: 'ded.travel.amount',
    overnightAmount: 'ded.overnight.amount',
    overnightNights: 'ded.overnight.nights',
    // Clothing
    clothingType: 'ded.clothing.type',  // multi: compulsory_uniform | registered_uniform | protective | occupation_specific | plain | none | not_sure
    clothingAmount: 'ded.clothing.amount', // money D (treatment via clothingType handled in calc: excluded if only 'plain')
    // Laundry (special module)
    laundryAny: 'ded.laundry.any',      // yes_no_unsure
    laundryLoadsWorkOnly: 'ded.laundry.loads_work_only', // number per week
    laundryLoadsMixed: 'ded.laundry.loads_mixed',        // number per week
    laundryWeeks: 'ded.laundry.weeks',  // number of weeks
    laundryEvidence: 'ded.laundry.evidence',
    // Tools (group 'tool_item')
    toolAny: 'ded.tool.any',
    toolRepeater: 'ded.tool',           // group 'tool_item'
    toolItem: 'ded.tool.item',          // text
    toolCost: 'ded.tool.cost',          // money, deduction tools, capitalThreshold
    toolDate: 'ded.tool.date',          // date
    toolWorkPct: 'ded.tool.work_pct',
    toolPaid: 'ded.tool.paid',
    toolEvidence: 'ded.tool.evidence',
    toolEffectiveLife: 'ded.tool.effective_life', // number years (for $300+)
    toolOpeningValue: 'ded.tool.opening_value', // money: opening adjustable value for an item first used before this year
    // Home office (special module)
    wfhAny: 'ded.wfh.any',
    wfhMethod: 'ded.wfh.method',        // single: fixed_rate | actual | not_sure
    wfhHours: 'ded.wfh.hours',          // number hours in year
    wfhHoursRecord: 'ded.wfh.hours_record', // single: full_record | representative_4_weeks | estimate | none | not_sure
    wfhActualCosts: 'ded.wfh.actual_costs', // money
    wfhWorkPct: 'ded.wfh.work_pct',
    wfhActivities: 'ded.wfh.activities',   // multi: employment | business | study | not_sure (separate home-activity records)
    wfhBusinessHours: 'ded.wfh.business_hours', // number: hours of business work at home (claimed under the business)
    wfhStudyHours: 'ded.wfh.study_hours',  // number: hours of eligible self-education study at home
    wfhHoursOverlap: 'ded.wfh.hours_overlap', // yes_no_unsure: are any hours counted in more than one activity?
    // Phone/internet
    phoneAmount: 'ded.phone.amount',
    phoneWorkPct: 'ded.phone.work_pct',
    phoneWorkPctMethod: 'ded.phone.work_pct_method',
    // Self-education
    selfEdRelated: 'ded.selfed.related', // single: current_duties | new_role | not_sure
    selfEdAmount: 'ded.selfed.amount',
    selfEdSameCourse: 'ded.selfed.same_course', // single: same | different | not_sure
    // Union, subscriptions, sun, tax affairs, gifts, income protection
    unionAmount: 'ded.union.amount',
    subscriptionsAmount: 'ded.subscriptions.amount',
    sunAmount: 'ded.sun.amount',
    taxAffairsAmount: 'ded.tax_affairs.amount',
    giftsAmount: 'ded.gifts.amount',
    giftsDgr: 'ded.gifts.dgr',          // yes_no_unsure
    incomeProtectionAmount: 'ded.income_protection.amount',
    investmentAmount: 'ded.investment.amount',
    // Job linkage for deduction items
    jobFor: (base: string) => `${base}.job`,
  },
  // M15 super contributions
  supc: {
    personalAny: 'supc.personal.any',   // yes_no_unsure
    personalAmount: 'supc.personal.amount', // money deduction personal_super
    noi: 'supc.personal.noi',           // single: acknowledged | lodged_not_acknowledged | not_yet | not_sure
    tsbRange: 'supc.tsb_range',         // single: under_500k | over_500k | not_sure
    carryForward: 'supc.carry_forward', // yes_no_unsure
    spouseAmount: 'supc.spouse.amount', // money (spouse contribution offset -> computed if spouse income known)
  },
  // M16 offsets, debts, gate
  off: {
    paygInstalments: 'off.payg_instalments', // money credit payg_instalment
    zone: 'off.zone',                   // single: none | zone_a | zone_b | special | overseas_forces | not_sure  (-> R)
    invalidCarer: 'off.invalid_carer',  // yes_no_unsure (-> R)
    saptoEligible: 'off.sapto_eligible',// yes_no_unsure
    saptoStatus: 'off.sapto_status',    // single: single | couple | couple_separated_illness | not_sure
    fitoPaid: 'off.fito_paid',          // money
  },
  loan: {
    types: 'loan.types',                // multi: help | vsl | ssl | abstudy_ssl | aasl | none | not_sure
    balance: 'loan.balance',            // money
  },
  gate: {
    checks: 'gate.checks',              // multi: income_statements | prefill | statements | evidence | prior_losses | not_sure_reviewed | none
  },
  // Deep modules: 7.1 DSW
  dsw: {
    clientToClient: 'dsw.travel.client_to_client',   // single: yes_own_car | yes_employer_car | no | not_sure
    homeToFirst: 'dsw.travel.home_to_first',         // single: yes | no | not_sure
    homeBase: 'dsw.travel.home_base',                // single: yes | no | not_sure (home is a genuine work base)
    betweenEmployers: 'dsw.travel.between_employers',// yes | no | not_sure
    clientTransport: 'dsw.travel.client_transport',  // yes_not_reimbursed | yes_reimbursed | no | not_sure
    sleepover: 'dsw.sleepover',                      // yes | no | not_sure
    sleepoverCosts: 'dsw.sleepover.costs',           // multi: meals | toiletries | bedding | other | none | not_sure
    clientCosts: 'dsw.client_costs',                 // yes_reimbursed | yes_not_reimbursed | no | not_sure
    clientCostsAmount: 'dsw.client_costs.amount',    // money R
    clothing: 'dsw.clothing',                        // multi: compulsory_logo | registered | protective | plain | none | not_sure
    clothingAmount: 'dsw.clothing.amount',           // money D (base dsw.clothing)
    laundry: 'dsw.laundry',                          // yes | no | not_sure -> uses ded.laundry.* fields
    firstAid: 'dsw.first_aid',                       // designated | required | personal_choice | employer_paid | not_sure
    firstAidAmount: 'dsw.first_aid.amount',          // money, treatment by firstAid
    checks: 'dsw.checks',                            // multi: wwcc | ndis_screening | police | none | not_sure
    checksStage: 'dsw.checks.stage',                 // first_check | renewal | employer_paid | not_sure
    checksAmount: 'dsw.checks.amount',               // money treatment by stage: first N, renewal R, employer_paid N
    training: 'dsw.training',                        // current_duties | new_role | employer_paid | none | not_sure
    trainingAmount: 'dsw.training.amount',           // money by training: current D, new_role N, employer_paid N
    conferencesAmount: 'dsw.conferences.amount',     // money D
    phone: 'dsw.phone',                              // yes | no | not_sure -> ded.phone.*
    homeOffice: 'dsw.home_office',                   // yes | no | not_sure -> ded.wfh.*
    sun: 'dsw.sun',                                  // yes | no | not_sure -> ded.sun.amount
    vaccinations: 'dsw.vaccinations',                // yes | no | not_sure
    vaccinationsAmount: 'dsw.vaccinations.amount',   // money N (note R)
  },
  // 7.2 construction
  con: {
    commute: 'con.commute',                          // same_site | several_sites_day | different_site_each | fifo_dido | not_sure
    bulkyTools: 'con.bulky_tools',                   // yes_no_storage | yes_storage_available | no | not_sure
    itinerant: 'con.itinerant',                      // yes | no | not_sure
    toolsAny: 'con.tools.any',                       // yes | no | not_sure -> ded.tool repeater
    toolRepairsAmount: 'con.tool_repairs.amount',    // money D
    ppe: 'con.ppe',                                  // multi: boots | hi_vis | hard_hat | gloves | eye_ear | sun_gear | none | not_sure
    ppeAmount: 'con.ppe.amount',                     // money D
    everydayClothing: 'con.everyday_clothing',       // yes | no | not_sure
    everydayClothingAmount: 'con.everyday_clothing.amount', // money N
    licences: 'con.licences',                        // multi: white_card | high_risk | ewp | forklift | trade_licence | none | other | not_sure
    licenceStage: 'con.licences.stage',              // first | renewal | employer_paid | not_sure
    licenceAmount: 'con.licences.amount',            // money by stage: first N, renewal D, employer_paid N
    overnight: 'con.overnight',                      // yes | no | not_sure -> ded.overnight.*
    fifo: 'con.fifo',                                // employer_paid | lafha | self_paid | none | not_sure
    fifoAmount: 'con.fifo.amount',                   // money by fifo: employer_paid N, lafha R, self_paid R
    phone: 'con.phone',                              // yes | no | not_sure -> ded.phone.*
  },
  // 7.3 chef
  chef: {
    knivesAny: 'chef.knives.any',                    // yes | no | not_sure -> ded.tool repeater
    sharpeningAmount: 'chef.sharpening.amount',      // money D
    clothing: 'chef.clothing',                       // multi: checked_pants | jacket | apron | non_slip_shoes | hat | plain_black | none | not_sure
    clothingAmount: 'chef.clothing.amount',          // money D (plain_black only -> N)
    laundry: 'chef.laundry',                         // yes | no | not_sure -> ded.laundry.*
    travelBetweenJobs: 'chef.travel.between_jobs',   // yes | no | not_sure
    homeToWork: 'chef.travel.home_to_work',          // yes | no | not_sure (N)
    certificates: 'chef.certificates',               // multi: food_safety | rsa | rsg | allergen | none | other | not_sure
    certStage: 'chef.certificates.stage',            // first | renewal | employer_paid | not_sure
    certAmount: 'chef.certificates.amount',          // money by stage: first N, renewal D, employer_paid N
    courses: 'chef.courses',                         // current_job | new_career | none | not_sure
    coursesAmount: 'chef.courses.amount',            // money by courses: current_job D, new_career N
    mealsAtWork: 'chef.meals_at_work',               // yes | no | not_sure
    overtimeMealAllowance: 'chef.overtime_meal.allowance', // yes | no | not_sure
    overtimeMealAmount: 'chef.overtime_meal.amount', // money by allowance: yes D, no N
    tipsAmount: 'chef.tips.amount',                  // money I
  },
} as const;

/** Repeater group ids. */
export const GROUPS = {
  employer: 'employer',
  allowance: 'allowance',
  lumpSumEYear: 'lump_sum_e_year',
  phiPolicy: 'phi_policy',
  interestAccount: 'interest_account',
  dividend: 'dividend',
  trustDist: 'trust_dist',
  rentalProperty: 'rental_property',
  cgtEvent: 'cgt_event',
  partnershipTrust: 'partnership_trust',
  businessActivity: 'business_activity',
  toolItem: 'tool_item',
} as const;

/** Option values for the shared "paid / reimbursed" question. */
export const PAID_OPTIONS = {
  paidNotReimbursed: 'paid_not_reimbursed',
  paidFullyReimbursed: 'paid_fully_reimbursed',
  paidPartlyReimbursed: 'paid_partly_reimbursed',
  employerPaid: 'employer_paid',
  notSure: 'not_sure',
} as const;

export const EVIDENCE_OPTIONS = {
  receipts: 'receipts',
  bankStatements: 'bank_statements',
  logbook: 'logbook',
  diary: 'diary',
  estimateOnly: 'estimate_only',
  none: 'none',
} as const;

/** Government payment types (used to build gov.<type>.amount ids). */
export const GOV_TYPES = ['jobseeker', 'pension', 'parenting', 'ppl', 'dad_partner', 'disaster', 'veterans', 'other'] as const;
export const FOREIGN_TYPES = ['employment', 'pension', 'rent', 'investment', 'other'] as const;
