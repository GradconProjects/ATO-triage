import { describe, expect, it } from 'vitest';
import { Q, GROUPS } from '@/src/questions/ids';
import { codes, dedLine, estimate, flagsFor, item, notSure, only, q, rec, salaryLine } from './fixtures';

const emp = [item('e1', GROUPS.employer)];

describe('ANY_NOT_SURE', () => {
  it('fires once per not-sure answer on a visible question using the help text as the hint', () => {
    const questions = [q({ id: Q.ded.carAny, type: 'yes_no_unsure', prompt: 'Did you use your car for work?', help: 'Look at your logbook' })];
    const flags = only(flagsFor({ records: [notSure(Q.ded.carAny), notSure(Q.ded.wfhAny)], questions }), 'ANY_NOT_SURE');
    expect(flags).toHaveLength(2);
    const car = flags.find((f) => f.questionIds[0] === Q.ded.carAny)!;
    expect(car.message).toBe('You answered Not sure to: Did you use your car for work?. Check Look at your logbook.');
    expect(car.kind).toBe('review');
    expect(flags.every((f) => f.questionIds.length === 1)).toBe(true);
  });
  it('does not fire for answered questions or not-sure answers on hidden questions', () => {
    expect(codes(flagsFor({ records: [rec(Q.ded.carAny, 'yes')] }))).not.toContain('ANY_NOT_SURE');
    expect(codes(flagsFor({ records: [notSure(Q.ded.carAny)], visible: new Set([Q.ded.wfhAny]) }))).not.toContain('ANY_NOT_SURE');
  });
});

describe('DEDUCTION_RATIO_HIGH', () => {
  const est = (ded: number) => estimate({ lines: [salaryLine(6_000_000), dedLine('car', ded)] });
  it('fires above the default 10% of salary and names the figures', () => {
    const f = only(flagsFor({ estimate: est(700_000) }), 'DEDUCTION_RATIO_HIGH');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('$7,000.00');
    expect(f[0]!.message).toContain('12%');
    expect(f[0]!.message).toContain('10%');
  });
  it('does not fire at or below the ratio, or with no salary', () => {
    expect(codes(flagsFor({ estimate: est(600_000) }))).not.toContain('DEDUCTION_RATIO_HIGH');
    expect(codes(flagsFor({ estimate: estimate({ lines: [dedLine('car', 700_000)] }) }))).not.toContain('DEDUCTION_RATIO_HIGH');
  });
  it('uses the occupation table: dsw 8%, construction 15%, office 6%', () => {
    expect(codes(flagsFor({ estimate: est(500_000), tags: ['dsw'] }))).toContain('DEDUCTION_RATIO_HIGH');
    expect(codes(flagsFor({ estimate: est(500_000) }))).not.toContain('DEDUCTION_RATIO_HIGH');
    expect(codes(flagsFor({ estimate: est(800_000), tags: ['construction'] }))).not.toContain('DEDUCTION_RATIO_HIGH');
    expect(codes(flagsFor({ estimate: est(400_000), ctx: { profileOccupations: ['office_professional'] } }))).toContain('DEDUCTION_RATIO_HIGH');
    expect(codes(flagsFor({ estimate: est(400_000), records: [rec(Q.emp.occupation, 'office_professional', { item: 'e1' })], items: emp }))).toContain('DEDUCTION_RATIO_HIGH');
  });
  it('prefers totals.workRelatedDeductionsCents over the lines and ignores non-work categories', () => {
    const e = estimate({ lines: [salaryLine(6_000_000), dedLine('car', 900_000)], totals: { workRelatedDeductionsCents: 100 } });
    expect(codes(flagsFor({ estimate: e }))).not.toContain('DEDUCTION_RATIO_HIGH');
    const gifts = estimate({ lines: [salaryLine(6_000_000), dedLine('gifts_donations', 900_000)] });
    expect(codes(flagsFor({ estimate: gifts }))).not.toContain('DEDUCTION_RATIO_HIGH');
  });
});

describe('NO_EVIDENCE', () => {
  const questions = [
    q({ id: Q.ded.toolCost, repeaterGroup: GROUPS.toolItem, prompt: 'Cost of the tool?', deduction: { category: 'tools', base: 'ded.tool', treatment: 'D' } }),
    q({ id: Q.ded.toolEvidence, type: 'single', repeaterGroup: GROUPS.toolItem }),
    q({ id: Q.ded.phoneAmount, prompt: 'Phone costs?', deduction: { category: 'phone_internet', base: 'ded.phone', treatment: 'D' } }),
  ];
  it('fires once per base with the amount question id, for none and estimate_only (single or multi)', () => {
    const tools = [item('t1', GROUPS.toolItem), item('t2', GROUPS.toolItem)];
    const flags = only(
      flagsFor({
        questions,
        items: tools,
        records: [
          rec(Q.ded.toolEvidence, 'none', { item: 't1' }),
          rec(Q.ded.toolEvidence, ['receipts', 'estimate_only'], { item: 't2' }),
          rec('ded.phone.evidence', 'estimate_only'),
          rec(Q.ded.carEvidence, 'receipts'),
        ],
      }),
      'NO_EVIDENCE',
    );
    expect(flags.map((f) => f.questionIds)).toEqual([[Q.ded.phoneAmount], [`${Q.ded.toolCost}@t1`], [`${Q.ded.toolCost}@t2`]]);
    expect(flags[1]!.message).toContain("no records");
    expect(flags[0]!.message).toContain("only an estimate");
    expect(flags[0]!.atoRef).toBeDefined();
  });
  it('does not fire for receipts, bank statements or logbook', () => {
    expect(codes(flagsFor({ questions, records: [rec('ded.phone.evidence', ['receipts', 'bank_statements'])] }))).not.toContain('NO_EVIDENCE');
  });
});

describe('LUMP_SUM_E_LSPIA', () => {
  it('fires when lump sum E across employers plus arrears reaches $1,200', () => {
    const flags = only(flagsFor({ items: [...emp, item('e2', GROUPS.employer)], records: [rec(Q.emp.lumpE, 50_000, { item: 'e1' }), rec(Q.emp.lumpE, 40_000, { item: 'e2' }), rec(Q.comp.arrearsAmount, 30_000)] }), 'LUMP_SUM_E_LSPIA');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.message).toContain('$1,200.00');
  });
  it('does not fire below $1,200', () => {
    expect(codes(flagsFor({ items: emp, records: [rec(Q.emp.lumpE, 119_999, { item: 'e1' })] }))).not.toContain('LUMP_SUM_E_LSPIA');
  });
});

describe('WORKCOVER_CAPITAL_LUMP', () => {
  it('fires for impairment, economic loss or common law lump sums', () => {
    for (const v of ['impairment', 'economic_loss', 'common_law']) {
      expect(codes(flagsFor({ records: [rec(Q.comp.received, ['weekly', v])] }))).toContain('WORKCOVER_CAPITAL_LUMP');
    }
  });
  it('does not fire for weekly payments only', () => {
    expect(codes(flagsFor({ records: [rec(Q.comp.received, ['weekly', 'medical'])] }))).not.toContain('WORKCOVER_CAPITAL_LUMP');
  });
});

describe('MANUAL_REVIEW_MODULE', () => {
  it('fires once per manual review item with its reason and question ids', () => {
    const est = estimate({ manualReview: [{ module: 'etp', reason: 'Termination payment needs the payment code', questionIds: [Q.comp.etpAmount], amountCents: 500_000 }, { module: 'zone', reason: 'Zone offset', questionIds: [] }] });
    const flags = only(flagsFor({ estimate: est }), 'MANUAL_REVIEW_MODULE');
    expect(flags).toHaveLength(2);
    expect(flags[0]!.message).toContain('Termination payment needs the payment code.');
    expect(flags[0]!.message).toContain('$5,000.00');
    expect(flags[0]!.questionIds).toEqual([Q.comp.etpAmount]);
    expect(flags[1]!.questionIds).toEqual(['zone']);
  });
  it('does not fire when nothing is routed to review', () => {
    expect(codes(flagsFor())).not.toContain('MANUAL_REVIEW_MODULE');
  });
});

describe('NOT_SURE_OCCUPATION_TAGS', () => {
  it('fires per employer whose other-tags answer is not sure', () => {
    const f = only(flagsFor({ items: emp, records: [notSure(Q.emp.otherTags, 'e1', true)] }), 'NOT_SURE_OCCUPATION_TAGS');
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('info');
    expect(f[0]!.questionIds).toEqual([`${Q.emp.otherTags}@e1`]);
  });
  it('does not fire when tags were chosen', () => {
    expect(codes(flagsFor({ items: emp, records: [rec(Q.emp.otherTags, ['home_office'], { item: 'e1' })] }))).not.toContain('NOT_SURE_OCCUPATION_TAGS');
  });
});

describe('residency flags', () => {
  it('TEMP_RESIDENT_FOREIGN_CGT fires only for temporary residents', () => {
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'temporary')] }))).toContain('TEMP_RESIDENT_FOREIGN_CGT');
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'resident_full')] }))).not.toContain('TEMP_RESIDENT_FOREIGN_CGT');
  });
  it('DUAL_RESIDENT_TREATY fires for yes or not sure, not for no', () => {
    expect(codes(flagsFor({ records: [rec(Q.res.dual, 'yes')] }))).toContain('DUAL_RESIDENT_TREATY');
    expect(codes(flagsFor({ records: [notSure(Q.res.dual)] }))).toContain('DUAL_RESIDENT_TREATY');
    expect(codes(flagsFor({ records: [rec(Q.res.dual, 'no')] }))).not.toContain('DUAL_RESIDENT_TREATY');
  });
  it('PART_YEAR_RESIDENT fires for became/ceased resident only', () => {
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'became_resident')] }))).toContain('PART_YEAR_RESIDENT');
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'ceased_resident')] }))).toContain('PART_YEAR_RESIDENT');
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'foreign_full')] }))).not.toContain('PART_YEAR_RESIDENT');
  });
});

describe('CGT_MAIN_RESIDENCE_PART', () => {
  const events = [item('c1', GROUPS.cgtEvent)];
  it('fires per event marked part main residence', () => {
    const f = only(flagsFor({ items: events, records: [rec(Q.cgt.mainResidence, 'part', { item: 'c1' }), rec(Q.cgt.priorLosses, 0)] }), 'CGT_MAIN_RESIDENCE_PART');
    expect(f).toHaveLength(1);
    expect(f[0]!.questionIds).toEqual([`${Q.cgt.mainResidence}@c1`]);
  });
  it('does not fire for yes or no', () => {
    expect(codes(flagsFor({ items: events, records: [rec(Q.cgt.mainResidence, 'no', { item: 'c1' })] }))).not.toContain('CGT_MAIN_RESIDENCE_PART');
  });
});

describe('ETP_REVIEW', () => {
  it('fires when a termination payment type is ticked or an amount entered', () => {
    expect(codes(flagsFor({ records: [rec(Q.comp.etpReceived, ['redundancy'])] }))).toContain('ETP_REVIEW');
    expect(codes(flagsFor({ records: [rec(Q.comp.etpAmount, 10_000)] }))).toContain('ETP_REVIEW');
  });
  it('does not fire for none', () => {
    expect(codes(flagsFor({ records: [rec(Q.comp.etpReceived, ['none'])] }))).not.toContain('ETP_REVIEW');
  });
});

describe('SUPER_INCOME_REVIEW', () => {
  it('fires for super income unless taxed element and 60 or over', () => {
    expect(codes(flagsFor({ records: [rec(Q.sup.received, 'yes'), rec(Q.sup.element, 'untaxed'), rec(Q.sup.age, 65)] }))).toContain('SUPER_INCOME_REVIEW');
    expect(codes(flagsFor({ records: [rec(Q.sup.received, 'yes'), rec(Q.sup.element, 'taxed'), rec(Q.sup.age, 58)] }))).toContain('SUPER_INCOME_REVIEW');
    expect(codes(flagsFor({ records: [rec(Q.sup.received, 'yes')] }))).toContain('SUPER_INCOME_REVIEW');
  });
  it('does not fire for taxed element at 60+, or no super income', () => {
    expect(codes(flagsFor({ records: [rec(Q.sup.received, 'yes'), rec(Q.sup.element, 'taxed'), rec(Q.sup.age, 60)] }))).not.toContain('SUPER_INCOME_REVIEW');
    expect(codes(flagsFor({ records: [rec(Q.sup.received, 'no')] }))).not.toContain('SUPER_INCOME_REVIEW');
  });
});

describe('PSI_REVIEW', () => {
  it('fires when the results test or 80% rule is yes or not sure', () => {
    expect(codes(flagsFor({ records: [rec(Q.bus.psiResults, 'yes')] }))).toContain('PSI_REVIEW');
    expect(codes(flagsFor({ records: [notSure(Q.bus.psi80)] }))).toContain('PSI_REVIEW');
  });
  it('does not fire when both are no', () => {
    expect(codes(flagsFor({ records: [rec(Q.bus.psiResults, 'no'), rec(Q.bus.psi80, 'no')] }))).not.toContain('PSI_REVIEW');
  });
});

describe('BUSINESS_LOSS_REVIEW', () => {
  it('fires when expenses exceed income or a partnership share is negative', () => {
    expect(codes(flagsFor({ records: [rec(Q.bus.income, 100_000), rec(Q.bus.expenses, 150_000)] }))).toContain('BUSINESS_LOSS_REVIEW');
    expect(codes(flagsFor({ items: [item('p1', GROUPS.partnershipTrust)], records: [rec(Q.bus.ptShare, -5_000, { item: 'p1' })] }))).toContain('BUSINESS_LOSS_REVIEW');
  });
  it('does not fire for a profit', () => {
    expect(codes(flagsFor({ records: [rec(Q.bus.income, 100_000), rec(Q.bus.expenses, 50_000)] }))).not.toContain('BUSINESS_LOSS_REVIEW');
  });
});

describe('LOSS_CARRIED_FORWARD', () => {
  it('fires when a loss is carried forward or taxable income is floored at zero', () => {
    const f = only(flagsFor({ estimate: estimate({ totals: { carriedForwardLossCents: 250_000 } }) }), 'LOSS_CARRIED_FORWARD');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('$2,500.00');
    expect(f[0]!.severity).toBe('info');
    const floored = estimate({ totals: { taxableIncomeCents: 0, assessableIncomeCents: 100_000, deductionsCents: 120_000 } });
    expect(codes(flagsFor({ estimate: floored }))).toContain('LOSS_CARRIED_FORWARD');
  });
  it('does not fire with positive taxable income', () => {
    expect(codes(flagsFor({ estimate: estimate({ totals: { taxableIncomeCents: 5_000_000, assessableIncomeCents: 6_000_000, deductionsCents: 1_000_000 } }) }))).not.toContain('LOSS_CARRIED_FORWARD');
  });
});

describe('AMENDMENT_DIFFERENCE', () => {
  it('fires when an assessed result is entered and states the difference', () => {
    const f = only(flagsFor({ records: [rec(Q.core.assessedResult, 80_000)], estimate: estimate({ totals: { resultCents: 120_000 } }) }), 'AMENDMENT_DIFFERENCE');
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('a refund of $800.00');
    expect(f[0]!.message).toContain('a refund of $1,200.00');
    expect(f[0]!.message).toContain('$400.00 better for you');
    const debt = only(flagsFor({ records: [rec(Q.core.assessedResult, -50_000)], estimate: estimate({ totals: { resultCents: -50_000 } }) }), 'AMENDMENT_DIFFERENCE');
    expect(debt[0]!.message).toContain('a tax debt of $500.00');
    expect(debt[0]!.message).toContain('no different');
  });
  it('does not fire without an assessed result', () => {
    expect(codes(flagsFor({ records: [rec(Q.core.purpose, 'amendment')] }))).not.toContain('AMENDMENT_DIFFERENCE');
  });
});

describe('INCOME_STATEMENT_NOT_TAX_READY', () => {
  it('fires per employer answered no or not sure', () => {
    const items = [item('e1', GROUPS.employer), item('e2', GROUPS.employer), item('e3', GROUPS.employer)];
    const f = only(
      flagsFor({ items, records: [rec(Q.emp.taxReady, 'no', { item: 'e1' }), notSure(Q.emp.taxReady, 'e2'), rec(Q.emp.taxReady, 'yes', { item: 'e3' }), rec(Q.emp.name, 'Acme', { item: 'e1' })] }),
      'INCOME_STATEMENT_NOT_TAX_READY',
    );
    expect(f.map((x) => x.questionIds[0])).toEqual([`${Q.emp.taxReady}@e1`, `${Q.emp.taxReady}@e2`]);
    expect(f[0]!.message).toContain('"Acme"');
  });
  it('does not fire when every statement is tax ready', () => {
    expect(codes(flagsFor({ items: emp, records: [rec(Q.emp.taxReady, 'yes', { item: 'e1' })] }))).not.toContain('INCOME_STATEMENT_NOT_TAX_READY');
  });
});
