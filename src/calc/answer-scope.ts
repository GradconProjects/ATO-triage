import { AnswerView, answerKey } from '../engine/answers';
import type { AnswerRecord } from '../engine/types';

export interface AnswerScopeOptions {
  /** Keys (`questionId` or `questionId@itemId`) the engine decided are visible. When given, any other key reads as unanswered. */
  visible?: Set<string>;
  /** Keys to treat as unanswered (range estimates). */
  exclude?: Set<string>;
}

/**
 * An AnswerView that hides answers the calculation must not see: keys in `excludeInputs`
 * (range estimates) and keys that are not visible. Every typed accessor in AnswerView goes
 * through `get`, so overriding it is enough. Repeater items are untouched.
 */
export class ScopedAnswerView extends AnswerView {
  private readonly visibleKeys: Set<string> | undefined;
  private readonly excludedKeys: Set<string>;

  constructor(base: AnswerView, options: AnswerScopeOptions = {}) {
    super(base.records(), base.allItems());
    this.visibleKeys = options.visible;
    this.excludedKeys = options.exclude ?? new Set<string>();
  }

  /** True when the key is hidden by visibility or exclusion. */
  isHidden(questionId: string, repeaterItemId?: string | null): boolean {
    const key = answerKey(questionId, repeaterItemId);
    if (this.excludedKeys.has(key)) return true;
    if (this.visibleKeys && !this.visibleKeys.has(key)) return true;
    return false;
  }

  override get(questionId: string, repeaterItemId?: string | null): AnswerRecord | undefined {
    if (this.isHidden(questionId, repeaterItemId)) return undefined;
    return super.get(questionId, repeaterItemId);
  }

  override records(): AnswerRecord[] {
    return super.records().filter((r) => !this.isHidden(r.questionId, r.repeaterItemId));
  }
}
