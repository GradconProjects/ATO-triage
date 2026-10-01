import { describe, expect, it } from 'vitest';
import { Q, GROUPS } from '@/src/questions/ids';
import { codes, flagsFor, item, notSure, only, q, rec } from './fixtures';

describe('SUPER_NOI_MISSING', () => {
  it('is a blocker when a personal super amount has no acknowledged notice', () => {
    for (const noi of ['lodged_not_acknowledged', 'not_yet', undefined]) {
      const records = [rec(Q.supc.personalAmount, 500_000), ...(noi ? [rec(Q.supc.noi, noi)] : [])];
      const f = only(flagsFor({ records }), 'SUPER_NOI_MISSING');
      expect(f).toHaveLength(1);
      expect(f[0]!.severity).toBe('blocker');
      expect(f[0]!.kind).toBe('missing');
    }
  });
  it('does not fire when acknowledged or no amount', () => {
    expect(codes(flagsFor({ records: [rec(Q.supc.personalAmount, 500_000), rec(Q.supc.noi, 'acknowledged')] }))).not.toContain('SUPER_NOI_MISSING');
    expect(codes(flagsFor({ records: [rec(Q.supc.personalAmount, 0), rec(Q.supc.noi, 'not_yet')] }))).not.toContain('SUPER_NOI_MISSING');
  });
});

describe('WFH_NO_RECORD', () => {
  it('fires for fixed rate with an estimate, no record or no answer', () => {
    expect(codes(flagsFor({ records: [rec(Q.ded.wfhMethod, 'fixed_rate'), rec(Q.ded.wfhHoursRecord, 'estimate')] }))).toContain('WFH_NO_RECORD');
    expect(codes(flagsFor({ records: [rec(Q.ded.wfhMethod, 'fixed_rate'), rec(Q.ded.wfhHoursRecord, 'none')] }))).toContain('WFH_NO_RECORD');
    expect(codes(flagsFor({ records: [rec(Q.ded.wfhMethod, 'fixed_rate')] }))).toContain('WFH_NO_RECORD');
  });
  it('does not fire with a full record or the actual-cost method', () => {
    expect(codes(flagsFor({ records: [rec(Q.ded.wfhMethod, 'fixed_rate'), rec(Q.ded.wfhHoursRecord, 'full_record')] }))).not.toContain('WFH_NO_RECORD');
    expect(codes(flagsFor({ records: [rec(Q.ded.wfhMethod, 'actual')] }))).not.toContain('WFH_NO_RECORD');
  });
});

describe('PRIOR_LOSSES_UNANSWERED', () => {
  const events = [item('c1', GROUPS.cgtEvent)];
  it('fires when a CGT event exists and prior losses were not answered (unanswered, skipped or not sure)', () => {
    expect(codes(flagsFor({ items: events }))).toContain('PRIOR_LOSSES_UNANSWERED');
    expect(codes(flagsFor({ items: events, records: [rec(Q.cgt.priorLosses, null, { state: 'skipped' })] }))).toContain('PRIOR_LOSSES_UNANSWERED');
    expect(codes(flagsFor({ items: events, records: [notSure(Q.cgt.priorLosses)] }))).toContain('PRIOR_LOSSES_UNANSWERED');
  });
  it('does not fire when answered or when there is no event', () => {
    expect(codes(flagsFor({ items: events, records: [rec(Q.cgt.priorLosses, 0)] }))).not.toContain('PRIOR_LOSSES_UNANSWERED');
    expect(codes(flagsFor())).not.toContain('PRIOR_LOSSES_UNANSWERED');
  });
});

describe('CRYPTO_METHOD_MISSING', () => {
  it('fires for crypto events with no or not-sure method', () => {
    expect(codes(flagsFor({ records: [rec(Q.cgt.events, ['crypto'])] }))).toContain('CRYPTO_METHOD_MISSING');
    expect(codes(flagsFor({ items: [item('c1', GROUPS.cgtEvent)], records: [rec(Q.cgt.assetType, 'crypto', { item: 'c1' }), notSure(Q.cgt.cryptoMethod)] }))).toContain('CRYPTO_METHOD_MISSING');
  });
  it('does not fire with a method or without crypto', () => {
    expect(codes(flagsFor({ records: [rec(Q.cgt.events, ['crypto']), rec(Q.cgt.cryptoMethod, 'fifo')] }))).not.toContain('CRYPTO_METHOD_MISSING');
    expect(codes(flagsFor({ records: [rec(Q.cgt.events, ['shares'])] }))).not.toContain('CRYPTO_METHOD_MISSING');
  });
});

describe('WHM_INCOME_MISSING', () => {
  it('fires for a working holiday maker with no WHM income entered', () => {
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'whm')] }))).toContain('WHM_INCOME_MISSING');
  });
  it('does not fire when entered or not a WHM', () => {
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'whm'), rec(Q.res.whmIncome, 3_000_000)] }))).not.toContain('WHM_INCOME_MISSING');
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'resident_full')] }))).not.toContain('WHM_INCOME_MISSING');
  });
});

describe('MEDICARE_EXEMPTION_DAYS_MISSING', () => {
  it('fires for a part-year exemption without days', () => {
    expect(codes(flagsFor({ records: [rec(Q.med.exemption, 'part_year')] }))).toContain('MEDICARE_EXEMPTION_DAYS_MISSING');
  });
  it('does not fire when days are entered or the exemption is full year', () => {
    expect(codes(flagsFor({ records: [rec(Q.med.exemption, 'part_year'), rec(Q.med.exemptDays, 90)] }))).not.toContain('MEDICARE_EXEMPTION_DAYS_MISSING');
    expect(codes(flagsFor({ records: [rec(Q.med.exemption, 'entitled_full')] }))).not.toContain('MEDICARE_EXEMPTION_DAYS_MISSING');
  });
});

describe('UNRESOLVED_AMOUNT', () => {
  it('fires when a visible list has no entries (e.g. "yes" to interest with no accounts)', () => {
    const bank = [q({ id: 'inv.interest.any', module: 'investments', type: 'yes_no_unsure' }), q({ id: 'inv.interest', module: 'investments', type: 'repeater', repeater: { groupId: 'interest_account', itemLabel: 'Account', addLabel: 'Add', minItems: 1 } })];
    const f = flagsFor({ questions: bank, visible: new Set(['inv.interest.any', 'inv.interest']), records: [rec('inv.interest.any', 'yes')] });
    expect(codes(f)).toContain('UNRESOLVED_AMOUNT');
  });
});

describe('IMPORT_UNCONFIRMED', () => {
  it('fires per imported record on a visible question', () => {
    const questions = [q({ id: Q.emp.gross, repeaterGroup: GROUPS.employer, prompt: 'Gross pay?' })];
    const f = only(
      flagsFor({ questions, items: [item('e1', GROUPS.employer)], records: [rec(Q.emp.gross, 5_000_000, { item: 'e1', state: 'imported', source: 'document' }), rec(Q.emp.withheld, 100, { item: 'e1', state: 'imported', source: 'document' })] }),
      'IMPORT_UNCONFIRMED',
    );
    expect(f).toHaveLength(2);
    expect(f[0]!.questionIds).toEqual([`${Q.emp.gross}@e1`]);
    expect(f[0]!.message).toContain('"Gross pay?"');
  });
  it('does not fire once confirmed (newer answered version) or when hidden', () => {
    const confirmed = [rec(Q.emp.gross, 1, { state: 'imported', source: 'document', version: 1 }), rec(Q.emp.gross, 1, { state: 'answered', source: 'prefill_confirmed', version: 2 })];
    expect(codes(flagsFor({ records: confirmed }))).not.toContain('IMPORT_UNCONFIRMED');
    expect(codes(flagsFor({ records: [rec(Q.emp.gross, 1, { state: 'imported', source: 'document' })], visible: new Set(['other']) }))).not.toContain('IMPORT_UNCONFIRMED');
  });
});

describe('SKIPPED_REQUIRED', () => {
  it('fires per skipped required visible question', () => {
    const questions = [q({ id: Q.res.status, type: 'single', module: 'residency', required: true, prompt: 'Residency?' })];
    const f = only(flagsFor({ questions, records: [rec(Q.res.status, null, { state: 'skipped' })] }), 'SKIPPED_REQUIRED');
    expect(f).toHaveLength(1);
    expect(f[0]!.questionIds).toEqual([Q.res.status]);
  });
  it('does not fire for an optional question or an answered one', () => {
    const optional = [q({ id: Q.emp.abn, type: 'text', required: false })];
    expect(codes(flagsFor({ questions: optional, records: [rec(Q.emp.abn, null, { state: 'skipped' })] }))).not.toContain('SKIPPED_REQUIRED');
    expect(codes(flagsFor({ records: [rec(Q.res.status, 'resident_full')] }))).not.toContain('SKIPPED_REQUIRED');
  });
});
