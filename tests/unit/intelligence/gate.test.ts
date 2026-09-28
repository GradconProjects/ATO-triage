import { describe, expect, it } from 'vitest';
import { AnswerView } from '@/src/engine/answers';
import { finaliseCheck, GATE_CHECKS } from '@/src/intelligence/gate';
import type { Flag } from '@/src/intelligence/types';
import { Q } from '@/src/questions/ids';
import { q, rec } from './fixtures';

const allChecks = GATE_CHECKS.map((c) => c.value);
const ok = () => ({ answers: new AnswerView([rec(Q.gate.checks, allChecks)]), questions: [], flags: [] as Flag[], incomeModulesPct: 100 });

describe('finaliseCheck', () => {
  it('passes when income modules are complete, every check is ticked and nothing blocks', () => {
    expect(finaliseCheck(ok())).toEqual({ canFinalise: true, blockers: [] });
  });
  it('blocks when income modules are below 100%', () => {
    const r = finaliseCheck({ ...ok(), incomeModulesPct: 99 });
    expect(r.canFinalise).toBe(false);
    expect(r.blockers).toEqual(['Income modules are 99% complete; every income question must be answered.']);
  });
  it('blocks on a blocker flag, quoting its code and message', () => {
    const r = finaliseCheck({ ...ok(), flags: [{ code: 'SUPER_NOI_MISSING', kind: 'missing', severity: 'blocker', message: 'No notice.', questionIds: [] }, { code: 'W', kind: 'review', severity: 'warning', message: 'w', questionIds: [] }] });
    expect(r.blockers).toEqual(['SUPER_NOI_MISSING: No notice.']);
  });
  it('blocks on each unticked gate check by name', () => {
    const r = finaliseCheck({ ...ok(), answers: new AnswerView([rec(Q.gate.checks, ['income_statements', 'prefill', 'statements', 'evidence'])]) });
    expect(r.blockers).toEqual(['Completeness check not ticked: prior-year losses entered.', 'Completeness check not ticked: every Not sure answer reviewed.']);
    expect(finaliseCheck({ ...ok(), answers: new AnswerView([]) }).blockers).toHaveLength(GATE_CHECKS.length);
  });
  it('blocks on skipped required answers but not skipped optional ones', () => {
    const questions = [q({ id: Q.emp.abn, type: 'text', required: false }), q({ id: Q.res.status, type: 'single', required: true })];
    const answers = new AnswerView([rec(Q.gate.checks, allChecks), rec(Q.emp.abn, null, { state: 'skipped' }), rec(Q.res.status, null, { state: 'skipped' })]);
    expect(finaliseCheck({ ...ok(), answers, questions }).blockers).toEqual(['1 required question was skipped.']);
  });
  it('blocks on unconfirmed imports', () => {
    const answers = new AnswerView([rec(Q.gate.checks, allChecks), rec(Q.emp.gross, 1, { state: 'imported', source: 'document' }), rec(Q.emp.withheld, 1, { state: 'imported', source: 'document' })]);
    expect(finaliseCheck({ ...ok(), answers }).blockers).toEqual(['2 imported answers have not been confirmed.']);
  });
  it('lists every blocker at once', () => {
    const answers = new AnswerView([rec(Q.emp.gross, 1, { state: 'imported', source: 'document' })]);
    const r = finaliseCheck({ answers, questions: [], flags: [{ code: 'B', kind: 'missing', severity: 'blocker', message: 'b', questionIds: [] }], incomeModulesPct: 50 });
    expect(r.canFinalise).toBe(false);
    expect(r.blockers).toHaveLength(1 + 1 + GATE_CHECKS.length + 1);
  });
});
