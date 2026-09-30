import { describe, expect, it } from 'vitest';
import { AnswerView } from '@/src/engine/answers';
import { Q } from '@/src/questions/ids';
import { PRIOR_LOSS_CLASSIFICATION } from '@/src/intelligence/consistency';
import type { IntelligenceContext } from '@/src/intelligence/types';
import { a, c, lineById, mkInput, run } from './fixture';

describe('futures and derivatives', () => {
  it('an investment derivatives loss is sent to review and never deducted', () => {
    const est = run([a(Q.cgt.derivativesAny, 'yes'), a(Q.cgt.derivativesNature, 'investment'), a(Q.cgt.derivativesNet, -c(11000))]);
    expect(lineById(est, 'income.derivatives').status).toBe('manual_review');
    expect(est.totals.assessableIncomeCents).toBe(0);
    expect(est.totals.capitalLossCarriedForwardCents).toBe(0);
  });
});

describe('earlier $11,000 futures losses held as capital losses', () => {
  const answers = [a(Q.cgt.events, ['crypto']), a(Q.cgt.priorLosses, c(11000)), a(Q.cgt.priorLossesOrigin, ['derivatives'])];
  it('are kept as capital losses, not silently converted', () => {
    const est = run(answers);
    expect(est.totals.capitalLossCarriedForwardCents).toBe(c(11000));
    expect(est.deferredLosses ?? []).toEqual([]);
  });
  it('raise a suspected-classification flag until a reviewed correction is recorded', () => {
    const input = mkInput(answers);
    const ctx = { answers: input.answers, visible: input.visible } as unknown as IntelligenceContext;
    expect(PRIOR_LOSS_CLASSIFICATION.when(input.answers, ctx)).toBe(true);
    const corrected = mkInput([...answers, a(Q.cgt.priorLossesCorrection, 'Agent reviewed 2024-25: kept as capital (letter on file)')]);
    expect(PRIOR_LOSS_CLASSIFICATION.when(corrected.answers as AnswerView, { ...ctx, visible: corrected.visible })).toBe(false);
  });
});
