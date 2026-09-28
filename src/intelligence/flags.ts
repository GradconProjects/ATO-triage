/**
 * Flag registry and evaluator. Every rule is pure: same context in, same flags out.
 */
import type { AnswerView } from '../engine/answers';
import { CONSISTENCY_RULES } from './consistency';
import { MISSING_RULES } from './missing';
import { OPPORTUNITY_RULES } from './opportunities';
import { REVIEW_RULES } from './review';
import type { Flag, FlagKind, FlagRule, FlagSeverity, IntelligenceContext } from './types';

export const FLAG_RULES: FlagRule[] = [...REVIEW_RULES, ...MISSING_RULES, ...CONSISTENCY_RULES, ...OPPORTUNITY_RULES];

const SEVERITY_ORDER: Record<FlagSeverity, number> = { blocker: 0, warning: 1, info: 2 };
const KIND_ORDER: Record<FlagKind, number> = { review: 0, missing: 1, consistency: 2, opportunity: 3 };

export function compareFlags(x: Flag, y: Flag): number {
  const s = SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity];
  if (s !== 0) return s;
  const k = KIND_ORDER[x.kind] - KIND_ORDER[y.kind];
  if (k !== 0) return k;
  const c = x.code.localeCompare(y.code);
  if (c !== 0) return c;
  return x.questionIds.join('|').localeCompare(y.questionIds.join('|'));
}

/** Drop flags that share code + questionIds (first one wins), then sort. */
export function dedupeAndSort(flags: Flag[]): Flag[] {
  const seen = new Set<string>();
  const out: Flag[] = [];
  for (const f of flags) {
    const key = `${f.code}::${f.questionIds.join('|')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out.sort(compareFlags);
}

function build(rule: FlagRule, message: string, questionIds: string[]): Flag {
  const flag: Flag = { code: rule.code, kind: rule.kind, severity: rule.severity, message, questionIds: [...questionIds] };
  if (rule.atoRef) flag.atoRef = rule.atoRef;
  return flag;
}

/** Run one rule; `answers` must already be the visible-only view. */
export function evaluateRule(rule: FlagRule, answers: AnswerView, ctx: IntelligenceContext): Flag[] {
  if (rule.instances) {
    return rule.instances(answers, ctx).map((i) => build(rule, i.message, i.questionIds.length ? i.questionIds : rule.questionIds));
  }
  if (!rule.when(answers, ctx)) return [];
  return [build(rule, rule.message(answers, ctx), rule.questionIds)];
}

export function evaluateFlags(ctx: IntelligenceContext, rules: FlagRule[] = FLAG_RULES): Flag[] {
  const flags: Flag[] = [];
  for (const rule of rules) flags.push(...evaluateRule(rule, ctx.answers, ctx));
  return dedupeAndSort(flags);
}
