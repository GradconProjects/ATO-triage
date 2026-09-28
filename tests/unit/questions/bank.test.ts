import { describe, expect, it } from 'vitest';
import { lintQuestionBank } from '@/src/engine/lint';
import type { Condition, Question } from '@/src/engine/types';
import { MODULE_ORDER } from '@/src/engine/types';
import { QUESTION_BANK, QUESTIONS_BY_ID, questionById, questionsForModule } from '@/src/questions';
import { Q } from '@/src/questions/ids';

const BANK = [...QUESTION_BANK] as Question[];

/** Every string id in the Q const (function values such as Q.gov.amount are skipped). */
function flattenIds(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === 'string') out.push(obj);
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((v) => flattenIds(v, out));
  return out;
}

function refs(c: Condition): string[] {
  if ('all' in c) return c.all.flatMap(refs);
  if ('any' in c) return c.any.flatMap(refs);
  if ('not' in c) return refs(c.not);
  if ('occupation' in c) return [];
  return [c.q];
}

describe('question bank', () => {
  it('passes the engine lint', () => {
    expect(lintQuestionBank(BANK)).toEqual([]);
  });

  it('has a sensible size', () => {
    expect(BANK.length).toBeGreaterThanOrEqual(250);
  });

  it('contains every id declared in Q', () => {
    const missing = flattenIds(Q).filter((id) => !QUESTIONS_BY_ID.has(id));
    expect(missing).toEqual([]);
  });

  it('has unique ids and a working lookup', () => {
    const ids = BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(questionById(Q.res.status)?.type).toBe('single');
    expect(questionById('does.not.exist')).toBeUndefined();
    for (const m of MODULE_ORDER) expect(questionsForModule(m).length).toBeGreaterThan(0);
  });

  it('is ordered by MODULE_ORDER', () => {
    const order = new Map(MODULE_ORDER.map((m, i) => [m, i]));
    for (let i = 1; i < BANK.length; i++) {
      expect(order.get(BANK[i]!.module)!).toBeGreaterThanOrEqual(order.get(BANK[i - 1]!.module)!);
    }
  });

  it('never carries a default value', () => {
    for (const q of BANK) {
      expect('defaultValue' in q).toBe(false);
      expect('default' in q).toBe(false);
    }
  });

  it('never uses a forbidden id fragment', () => {
    const bad = BANK.filter((q) => /(^|[._])(tfn|bank_account|bsb|date_of_birth|dob)([._]|$)/.test(q.id) && !q.id.includes('tfn_withheld'));
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  it('gives every deduction question an atoRef and its sibling paid/evidence questions', () => {
    const ded = BANK.filter((q) => q.deduction);
    expect(ded.length).toBeGreaterThan(20);
    for (const q of ded) {
      expect(q.atoRef, q.id).toMatch(/^https:\/\/www\.ato\.gov\.au\//);
      expect(q.type).toBe('money');
      const base = q.deduction!.base;
      expect(QUESTIONS_BY_ID.has(`${base}.paid`), `${base}.paid`).toBe(true);
      expect(QUESTIONS_BY_ID.has(`${base}.evidence`), `${base}.evidence`).toBe(true);
      expect(QUESTIONS_BY_ID.has(`${base}.reimbursed_amount`), `${base}.reimbursed_amount`).toBe(true);
    }
  });

  it('gives every deep-module question an atoRef and its occupation tag', () => {
    const tagFor = { deep_dsw: 'dsw', deep_construction: 'construction', deep_chef: 'chef_hospitality' } as const;
    for (const q of BANK) {
      if (!(q.module in tagFor)) continue;
      expect(q.atoRef, q.id).toMatch(/^https:\/\/www\.ato\.gov\.au\//);
      expect(q.occupationTags, q.id).toContain(tagFor[q.module as keyof typeof tagFor]);
    }
  });

  it('only references existing ids in showIf', () => {
    for (const q of BANK) {
      if (!q.showIf) continue;
      for (const r of refs(q.showIf)) expect(QUESTIONS_BY_ID.has(r), `${q.id} -> ${r}`).toBe(true);
    }
  });

  it('keeps yes_no_unsure questions free of options', () => {
    for (const q of BANK) if (q.type === 'yes_no_unsure') expect(q.options, q.id).toBeUndefined();
  });

  it('includes not_sure on every single/multi except the allow-list', () => {
    const allow = new Set([Q.core.fy, Q.core.purpose, Q.comp.lseFy, Q.gate.checks]);
    for (const q of BANK) {
      if (q.type !== 'single' && q.type !== 'multi') continue;
      if (allow.has(q.id)) continue;
      const ns = q.options?.find((o) => o.value === 'not_sure');
      expect(ns, q.id).toBeDefined();
      if (q.type === 'multi') expect(ns?.exclusive, q.id).toBe(true);
    }
  });

  it('keeps prompts to one question (no " and/or ", " and " or " or ")', () => {
    const bad = BANK.filter((q) => / and\/or | and | or /.test(q.prompt));
    expect(bad.map((q) => `${q.id}: ${q.prompt}`)).toEqual([]);
  });

  it('marks screening questions required with none/other/other_text', () => {
    for (const q of BANK) {
      if (!q.screening) continue;
      expect(q.required, q.id).toBe(true);
      expect(q.options?.some((o) => o.value === 'none' && o.exclusive), q.id).toBe(true);
      expect(q.options?.some((o) => o.value === 'other'), q.id).toBe(true);
      expect(QUESTIONS_BY_ID.get(`${q.id}.other_text`)?.type, q.id).toBe('text');
    }
  });

  it('wires the three factual tests in order: paid, purpose, then work % and evidence', () => {
    const index = new Map(BANK.map((q, i) => [q.id, i]));
    for (const q of BANK) {
      if (!q.deduction) continue;
      const base = q.deduction.base;
      const paid = index.get(`${base}.paid`)!;
      const amount = index.get(q.id)!;
      const evidence = index.get(`${base}.evidence`)!;
      expect(paid, `${base}.paid before amount`).toBeLessThan(amount);
      expect(amount, `${q.id} before evidence`).toBeLessThan(evidence);
      const wp = index.get(`${base}.work_pct`);
      if (wp !== undefined) {
        expect(wp).toBeGreaterThan(amount);
        expect(index.get(`${base}.work_pct_method`)!).toBeGreaterThan(wp);
      }
    }
  });

  it('carries the income/credit meta named in ids.ts', () => {
    expect(questionById(Q.emp.gross)?.income).toEqual({ category: 'salary', treatment: 'I' });
    expect(questionById(Q.emp.withheld)?.credit).toBe('payg_withheld');
    expect(questionById(Q.allow.amount)?.income).toEqual({
      category: 'allowance',
      treatment: { byQuestion: Q.allow.nature, map: { allowance: 'I', reimbursement: 'N' }, fallback: 'R' },
    });
    expect(questionById(Q.comp.impairmentAmount)?.income).toEqual({ category: 'compensation', treatment: 'R' });
    expect(questionById(Q.chef.tipsAmount)?.income?.category).toBe('other_employment');
    expect(questionById(Q.ded.toolCost)?.deduction).toMatchObject({ category: 'tools', base: 'ded.tool', capitalThreshold: true });
    expect(questionById(Q.dsw.firstAidAmount)?.deduction?.base).toBe('dsw.first_aid');
    expect(questionById(Q.bus.soleTrader)?.addsTags).toEqual({ yes: ['sole_trader'] });
    expect(questionById(Q.con.commute)?.addsTags).toEqual({ fifo_dido: ['fifo'] });
    expect(questionById(Q.fgn.amount('rent'))?.income?.treatment).toMatchObject({ byQuestion: Q.res.status, fallback: 'R' });
  });

  it('declares every repeater group used by children', () => {
    const groups = new Set(BANK.filter((q) => q.type === 'repeater').map((q) => q.repeater!.groupId));
    for (const q of BANK) if (q.repeaterGroup) expect(groups.has(q.repeaterGroup), q.id).toBe(true);
    expect(questionById(Q.emp.repeater)?.repeater?.minItems).toBe(0);
    expect(questionById(Q.emp.repeater)?.showIf).toBeUndefined();
  });
});
