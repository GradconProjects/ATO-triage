# Internal contracts between layers

Read this before touching `src/`. It fixes the interfaces the layers share so they can be
built independently. The instruction set (Sections 1-16) is the product spec; this file is
the engineering contract derived from it.

## Layers and their public API

| Layer | Path | Exports |
| --- | --- | --- |
| Engine types | `src/engine/types.ts` | `Question`, `Condition`, `AnswerRecord`, `RepeaterItem`, `CaseContext`, tags, modules |
| Answer view | `src/engine/answers.ts` | `AnswerView` (read-only latest-version map), `answerKey()` |
| Engine | `src/engine/index.ts` | see "Engine API" |
| Question bank | `src/questions/index.ts` | `QUESTION_BANK: Question[]`, `questionById(id)`, `questionsForModule(m)` |
| Question ids | `src/questions/ids.ts` | `Q`, `GROUPS`, `PAID_OPTIONS`, `EVIDENCE_OPTIONS`, `GOV_TYPES`, `FOREIGN_TYPES` |
| Occupations | `src/occupations/registry.ts` | `OCCUPATIONS`, `findOccupation`, `searchOccupations`, `tagsForOccupations` |
| Rules | `src/rules/index.ts` | `RULE_SETS: Record<FY, RuleSet>`, `getRuleSet(fy)`; each `fyYYYY-YY.ts` exports `default` RuleSet |
| Rules schema | `src/rules/schema.ts` | `ruleSetSchema`, `validateRuleSet`, `RuleSet` |
| Calc | `src/calc/index.ts` | `calculate(input: CalcInput): Estimate`, money helpers from `src/calc/money.ts` |
| Calc types | `src/calc/types.ts` | `Estimate`, `EstimateLine`, `CalcInput`, `EstimateTotals` |
| Intelligence | `src/intelligence/index.ts` | `runIntelligence(input, estimate): IntelligenceResult`, `FLAG_RULES` |

## Answer semantics (resolves an ambiguity in the spec)

- `state = 'answered'` (any source) is the ONLY state whose value feeds calculations and counts
  towards completeness. `imported` rows (from a document or a copied prior-year case) do NOT count
  until the user confirms them; confirmation appends a new version with `state='answered'` and
  `source='prefill_confirmed'`. Unconfirmed `imported` rows raise a `missing` flag `IMPORT_UNCONFIRMED`.
- `not_sure`: value is `'not_sure'` (single / yes_no_unsure) or `['not_sure']` (multi) AND state is
  `not_sure`. The renderer sets both. `AnswerView.value()` returns undefined for these; use
  `AnswerView.isNotSure()`.
- `skipped`: user pressed Next without answering a required visible question.
- `not_applicable_by_rule`: appended by the engine when a visibility change hides a question that
  has a value. The old row is kept (append-only). Never written by the UI directly.
- Answers are append-only; `version` increments per (case, question, item).

## Repeaters

- A `type: 'repeater'` question declares the group in `repeater: RepeaterSpec` (`groupId`). Child
  questions carry `repeaterGroup: groupId` and are asked once per `RepeaterItem` of that group.
- Answer keys for child questions are `questionId@itemId` (see `answerKey`).
- Conditions inside a group resolve `q` against the SAME item first, then the case-level answer.
- Totals are never typed as aggregates; the calc sums items.

## Occupation filtering

`activeTagSet(ctx, answers, questions)` =
  `tagsForOccupations(ctx.profileOccupations)`
  ∪ for each `employer` item: `tagsForOccupations([answers.string(Q.emp.occupation, item.id)])`
  ∪ for each answered question with `addsTags`: tags mapped from its value(s)
  ∪ for `Q.emp.otherTags` answered `['not_sure']` (state not_sure): every generic tag.
A question with no `occupationTags` is universal. Otherwise eligible if ANY tag intersects.
Deep-module questions carry `dsw` / `construction` / `chef_hospitality`.

## Engine API (`src/engine/*`)

```ts
// visibility.ts
export interface VisibleQuestion { question: Question; itemId: string | null; key: string }
export function evaluateCondition(c: Condition, answers: AnswerView, scope: { itemId: string | null; activeTags: Set<OccupationTag> }): boolean;
export function visibleQuestions(questions: Question[], answers: AnswerView, ctx: CaseContext, activeTags: Set<OccupationTag>): VisibleQuestion[];
/** Rows to append so hidden-but-valued answers become not_applicable_by_rule. */
export function hiddenAnswerUpdates(questions: Question[], answers: AnswerView, visible: VisibleQuestion[]): AnswerRecord[];
// occupation-filter.ts
export function activeTagSet(ctx: CaseContext, answers: AnswerView, questions: Question[]): Set<OccupationTag>;
export function isEligible(q: Question, tags: Set<OccupationTag>): boolean;
// validation.ts
export interface ValidationResult { errors: string[]; warnings: string[] }
export function validateAnswer(q: Question, value: unknown, ctx: CaseContext): ValidationResult;
export function parseMoneyToCents(text: string): number | null;   // "1,234.56" -> 123456
export function fyDateBounds(fy: FY): { from: string; to: string }; // '2025-26' -> 2025-07-01..2026-06-30
// repeaters.ts
export function repeaterSpecs(questions: Question[]): RepeaterSpec[];
export function childQuestions(questions: Question[], groupId: string): Question[];
// progress.ts
export interface ModuleProgress { module: ModuleId; required: number; answered: number; pct: number }
export interface Progress { overall: number; byModule: ModuleProgress[]; weightedPct: number; incomeModulesPct: number }
export function computeProgress(visible: VisibleQuestion[], answers: AnswerView): Progress;
// lint.ts
export function lintQuestionBank(questions: Question[]): string[]; // [] when clean
// tags.ts (optional helper) exposing GENERIC tag labels for the "Other" tick-box
```

Visibility rules:
- `years` filters by `ctx.fy`.
- Type `repeater` questions are visible like any other (they render the item list).
- Child questions are expanded once per existing item of the group; if the parent repeater
  question is not visible, none of its children are.
- `{ q, answered: true }` is true only for state `answered`.
- `{ q, eq }` / `in` / `includes` compare against usable values only (not_sure never equals anything).
- `{ q, gt }` compares numbers only.

## Calc API (`src/calc/*`)

`calculate(input: CalcInput): Estimate` runs the fixed pipeline of Section 8. Rules:
- Integer cents everywhere (`money.ts`: `dollarsToCents`, `mulRate(cents, rate)` rounding half-up to the cent,
  `floorToDollar(cents)`). Rates from rule tables are decimals (0.16).
- Taxable income is rounded DOWN to whole dollars before the scale. Gross tax uses cents
  (ATO rounds tax to the nearest cent).
- Data-driven income: every visible money question with `income` meta and a usable value contributes
  per its treatment (`I` add, `N` line with status excluded, `R` manual review line + `manualReview`).
- Data-driven deductions: every visible money question with `deduction` meta. Resolve treatment
  (direct or `byQuestion`), reimbursement via `${base}.paid` / `${base}.reimbursed_amount`, work %
  via `${base}.work_pct` (default 100 when the question does not exist in the bank; if it exists and is
  unanswered the amount goes to review), `capitalThreshold` sends amounts >= $300 to the decline-in-value
  module (diminishing value, effective life from `${base}.effective_life` else review; pro-rata from `${base}.date`).
- Credits: every visible money question with `credit` meta.
- Special modules use the ids in `Q` directly: car, wfh, laundry, dividends (gross-up), trust, rental,
  cgt, crypto, super contribution, study loan, lspia, medicare, mls, lito, sapto.
- Modules listed as "always manual review" produce a `manual_review` line and an entry in `manualReview`.
- Every line: `{ id, section, label, amountCents, ruleId, inputs, formula, status }`.
- `uncertainInputs`: keys (`questionId` or `questionId@itemId`) of amounts whose treatment resolved to `R`
  or whose evidence is `estimate_only`/`none`. The intelligence layer recomputes with
  `excludeInputs` to produce the range. When `excludeInputs` contains a key, the pipeline treats that
  answer as absent.

## Intelligence API

```ts
export interface Flag { code: string; kind: 'review'|'opportunity'|'consistency'|'missing'; severity: 'info'|'warning'|'blocker'; message: string; questionIds: string[]; atoRef?: string }
export interface IntelligenceResult { flags: Flag[]; completeness: { pct: number; incomeModulesPct: number; byModule: ModuleProgress[] }; confidence: Confidence; range?: Estimate['range']; canFinalise: boolean; finaliseBlockers: string[] }
export function runIntelligence(input: CalcInput, estimate: Estimate): IntelligenceResult;
```

## Money and display
- DB stores cents as JSON numbers. UI money input shows `$` prefix, accepts commas, stores cents.
- Percent stored 0-100 as number. Dates ISO `YYYY-MM-DD`. Timezone for report timestamps: `Australia/Melbourne`.

## Things that must never exist
- No `defaultValue` on any question. No pre-ticked options.
- No field id containing `tfn`, `bank_account`, `bsb`, `date_of_birth`, `dob` (CI grep test).
- No API that writes an answer from a rule.
