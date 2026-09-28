import type { FY } from '../engine/types';
import type { RuleSet } from './schema';
import fy2023_24 from './fy2023-24';
import fy2024_25 from './fy2024-25';
import fy2025_26 from './fy2025-26';
import fy2026_27 from './fy2026-27';

export type { RuleSet } from './schema';

/** Every supported financial year's rule table. Each file validates itself at import time. */
export const RULE_SETS: Record<FY, RuleSet> = {
  '2023-24': fy2023_24,
  '2024-25': fy2024_25,
  '2025-26': fy2025_26,
  '2026-27': fy2026_27,
};

/** The most recent financial year with a rule table. */
export const LATEST_FY: FY = '2026-27';

/** Returns the rule table for a financial year; throws on an unknown year. */
export function getRuleSet(fy: FY): RuleSet {
  const ruleSet = (RULE_SETS as Record<string, RuleSet | undefined>)[fy];
  if (!ruleSet) throw new Error(`No rule set for financial year "${String(fy)}"`);
  return ruleSet;
}
