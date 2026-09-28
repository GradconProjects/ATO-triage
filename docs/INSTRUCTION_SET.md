# ATO Tax Intake Adviser — Full Build Instruction Set

Sep 28, 2026 · @Boma

## 1. How to use this instruction set

This document is the single source of truth for building the Australian Tax Intake Adviser: a multi-profile, occupation-aware interview app that estimates a refund or debt and produces a PDF advisory report. Hand it, section by section, to a developer or an AI coding agent (Section 16 has a ready prompt). Build in the phase order in Section 14 and do not start a phase until the previous phase passes its acceptance criteria.

### Product boundary

- It is an **intake, estimation and advisory-report tool**. It never lodges, never connects to ATO online services, and never uses ATO logos or wording that implies ATO endorsement.
- Every output is an **indicative estimate**. The ATO notice of assessment is the only final figure.
- Complex situations are **routed to manual review**, not approximated silently.

### Ten non-negotiable rules

1. **Never infer a tax fact.** A fact exists only if the user answered it or imported it from a document. Hidden questions may appear because of earlier answers; they are never pre-filled.
2. **"Not sure" is never "No".** Every unsure answer creates a review flag that appears in the report.
3. **Every categorical question is exhaustive.** Options cover every materially different tax outcome, plus *Other / not listed*, *Not sure* and *None of these* where they make sense.
4. **Numbers are fields, not choices.** Amounts, dates, kilometres, percentages and year allocations use typed, validated inputs.
5. **Occupation drives relevance.** Only deduction and allowance questions tagged to the selected occupation(s) appear; the general interview (income, residency, offsets) always runs.
6. **Rules live in data, not code.** Tax rates, thresholds and cents-per-km figures sit in versioned rule tables per financial year, each row with an ATO source URL.
7. **Every calculation is explainable.** Each line in the estimate stores the inputs, rule id and formula used, so the report can show its working.
8. **Reports are immutable snapshots.** A generated report never changes when rules or answers change later.
9. **No TFN collection.** No field anywhere accepts a tax file number.
10. **Every rule module has tests** before it is allowed to produce a number.

## 2. Tech stack and repository structure

Use a single Next.js monorepo deployed to Vercel, with Supabase for database, auth and file storage. All tax logic is pure TypeScript with no framework imports, so it can be unit-tested in isolation.

&#91;embedded content: system architecture · 8 components, one direction\]

The question engine and calculation engine never write to each other directly; both read answers and rule tables, and only the snapshot step writes a report.

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript `strict` | Server routes for PDF and snapshots; native on Vercel |
| UI | Tailwind CSS + shadcn/ui | Accessible form components, fast to build |
| Forms and validation | react-hook-form + Zod | One schema validates client and server |
| Client state | Zustand | Interview progress and unsaved answers |
| Database, auth, storage | Supabase (Postgres, Auth, RLS, private Storage bucket) | Row-level security per user |
| Money maths | Integer cents everywhere; `decimal.js` only for rates | No floating-point rounding errors |
| PDF | `@react-pdf/renderer` in a server route | Deterministic layout, no headless browser |
| Tests | Vitest (rules, engine), Playwright (interview paths) | Section 13 |
| CI | GitHub Actions: lint, typecheck, test, build | Blocks broken merges |
| Hosting | Vercel (Preview per pull request, Production on `main`) | Section 15 |

### Repository tree

```
tax-intake-adviser/
├─ app/
│  ├─ (auth)/login/page.tsx
│  ├─ dashboard/page.tsx                 # profile list + switcher
│  ├─ profiles/[profileId]/page.tsx      # profile detail + FY cases
│  ├─ cases/[caseId]/interview/[module]/page.tsx
│  ├─ cases/[caseId]/review/page.tsx     # flags + completeness gate
│  ├─ cases/[caseId]/estimate/page.tsx
│  └─ api/
│     ├─ cases/[caseId]/calculate/route.ts
│     ├─ cases/[caseId]/snapshot/route.ts
│     └─ reports/[reportId]/pdf/route.ts
├─ src/
│  ├─ engine/                            # question engine (pure TS)
│  │  ├─ types.ts  visibility.ts  occupation-filter.ts
│  │  ├─ validation.ts  repeaters.ts  progress.ts
│  ├─ questions/                         # question bank as data
│  │  ├─ core/  income/  investments/  deductions/
│  │  └─ occupations/ disability-support.ts construction.ts chef-hospitality.ts ...
│  ├─ occupations/registry.ts            # occupations + tags
│  ├─ calc/                              # calculation engine (pure TS)
│  │  ├─ pipeline.ts  money.ts  explain.ts
│  │  └─ modules/ income.ts deductions.ts tax-scale.ts medicare.ts mls.ts
│  │     lito.ts offsets.ts lspia.ts cgt.ts crypto.ts super.ts study-debt.ts withholding.ts
│  ├─ rules/                             # versioned rule tables
│  │  ├─ fy2023-24.ts  fy2024-25.ts  fy2025-26.ts  fy2026-27.ts
│  │  └─ schema.ts                       # Zod schema every FY file must pass
│  ├─ intelligence/ flags.ts opportunities.ts consistency.ts scoring.ts
│  ├─ report/ ReportDocument.tsx sections/
│  └─ lib/supabase/ client.ts server.ts
├─ supabase/migrations/                  # SQL, numbered
├─ tests/ unit/ golden/ e2e/
├─ .github/workflows/ci.yml
├─ .env.example
└─ README.md
```

## 3. Data model

Separate the person from the tax year: one **client profile** has many **financial-year cases**, and each case holds its own answers, estimates and reports. This lets one person carry 2023–24, 2024–25 and 2025–26 side by side, and lets you run amendments without overwriting history.

| Table | Holds | Key rules |
| --- | --- | --- |
| `profiles` | A person being assessed: display name, relationship to account owner (self, spouse, family, client), occupations list, date of birth year only | Owned by `owner_id`; no TFN column |
| `fy_cases` | One tax year for one profile: `financial_year`, purpose (pre-lodgment, review, amendment, planning), status (draft, in review, final) | Unique per profile + year + purpose |
| `answers` | One row per question per case (per repeater item): value as JSONB, answer state, version | Append-only; the latest version wins |
| `repeater_items` | Instances of repeatable groups: employers, rental properties, CGT events, Lump Sum E years, vehicles, deduction items | Linked to case and group id |
| `documents` | Uploaded payment summaries, receipts, statements (Storage path + metadata) | Private bucket; signed URLs only |
| `estimates` | Each calculation run: totals, line-by-line explanation, rule-set version | Recomputable, not immutable |
| `flags` | Review items and opportunities produced by the intelligence layer | Regenerated on each run |
| `reports` | Immutable snapshot: frozen answers, estimate, flags, rule version, PDF path | Never updated after insert |
| `audit_log` | Who changed what and when | Insert-only |

### Answer states

Every answer row carries a `state`: `answered`, `not_sure`, `skipped`, `not_applicable_by_rule` (hidden because an earlier answer made it irrelevant) or `imported`. Only `answered` and `imported` values feed calculations. `not_sure` and `skipped` on a visible question always create a flag.

### Migration 0001 (core schema)

```sql
create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  relationship text not null check (relationship in ('self','spouse','family','client','other')),
  birth_year int check (birth_year between 1900 and 2100),
  occupations text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fy_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  financial_year text not null check (financial_year ~ '^20[0-9]{2}-[0-9]{2}$'),
  purpose text not null check (purpose in ('pre_lodgment','assessment_review','amendment','planning')),
  status text not null default 'draft' check (status in ('draft','in_review','final')),
  rule_set_version text,
  created_at timestamptz not null default now(),
  unique (profile_id, financial_year, purpose)
);

create table repeater_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id text not null,          -- e.g. 'employer', 'rental_property', 'cgt_event', 'lump_sum_e_year'
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  repeater_item_id uuid references repeater_items(id) on delete cascade,
  value jsonb,
  state text not null check (state in ('answered','not_sure','skipped','not_applicable_by_rule','imported')),
  source text not null default 'user' check (source in ('user','document','prefill_confirmed')),
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index on answers (case_id, question_id, repeater_item_id, version desc);

create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  doc_type text not null,
  original_name text,
  created_at timestamptz not null default now()
);

create table estimates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  rule_set_version text not null,
  result jsonb not null,           -- totals + explained lines
  confidence text not null check (confidence in ('high','medium','low')),
  completeness_pct int not null,
  created_at timestamptz not null default now()
);

create table flags (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  estimate_id uuid references estimates(id) on delete cascade,
  kind text not null check (kind in ('review','opportunity','consistency','missing')),
  severity text not null check (severity in ('info','warning','blocker')),
  code text not null,
  message text not null,
  question_ids text[] not null default '{}'
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references fy_cases(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,         -- answers + estimate + flags + rule version, frozen
  pdf_path text,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  owner_id uuid not null,
  entity text not null,
  entity_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
```

### Migration 0002 (row-level security)

```sql
do $$
declare t text;
begin
  foreach t in array array['profiles','fy_cases','repeater_items','answers','documents','estimates','flags','reports','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner_select" on %I for select using (owner_id = auth.uid())', t);
    execute format('create policy "owner_insert" on %I for insert with check (owner_id = auth.uid())', t);
  end loop;
  foreach t in array array['profiles','fy_cases','repeater_items','documents']
  loop
    execute format('create policy "owner_update" on %I for update using (owner_id = auth.uid())', t);
    execute format('create policy "owner_delete" on %I for delete using (owner_id = auth.uid())', t);
  end loop;
end $$;
-- answers, reports, audit_log: no update/delete policies (append-only / immutable)
-- estimates, flags: delete allowed so runs can be regenerated
create policy "owner_delete" on estimates for delete using (owner_id = auth.uid());
create policy "owner_delete" on flags for delete using (owner_id = auth.uid());
```

Create a **private** Storage bucket `case-documents` with a policy that only allows access where the first path segment equals `auth.uid()` (path pattern `{uid}/{caseId}/{file}`).

## 4. Question engine specification

The question bank is **data, not components**: every question is a typed object, and one generic renderer draws any question. Adding a question never needs new UI code.

### Question schema

```ts
export type QuestionType =
  | 'single'        // one option
  | 'multi'         // several options; exclusive options clear the rest
  | 'yes_no_unsure' // Yes / No / Not sure (always all three)
  | 'money'         // integer cents, >= 0 unless allowNegative
  | 'number' | 'percent' | 'km' | 'date' | 'date_range' | 'text'
  | 'repeater';     // a group asked once per item (employers, properties...)

export interface Option {
  value: string;
  label: string;
  help?: string;            // plain-English explanation of when to pick it
  exclusive?: boolean;      // 'none', 'not_sure' clear other ticks in multi
  flag?: FlagCode;          // picking it raises this flag
}

export interface Question {
  id: string;               // stable forever, e.g. 'dsw.travel.client_to_client'
  module: ModuleId;         // e.g. 'residency', 'deductions.vehicle'
  type: QuestionType;
  prompt: string;           // one question only, no 'and/or'
  help?: string;            // why we ask, in plain English
  atoRef?: string;          // ATO page URL backing the question
  options?: Option[];       // required for single/multi
  required: boolean;
  showIf?: Condition;       // visibility; never sets a value
  occupationTags?: OccupationTag[]; // Section 5
  validation?: ValidationRule[];
  repeaterGroup?: string;   // belongs inside a repeater
  feeds?: string[];         // calc inputs this answer feeds, for the explain trail
  years?: { from?: FY; to?: FY }; // question exists only in these FYs
}

export type Condition =
  | { q: string; eq: string } | { q: string; in: string[] }
  | { q: string; includes: string }     // multi contains
  | { q: string; gt: number } | { q: string; answered: true }
  | { occupation: OccupationTag }
  | { all: Condition[] } | { any: Condition[] } | { not: Condition };
```

### Option-set rules (enforced by a lint test)

1. `yes_no_unsure` always renders **Yes / No / Not sure**; there is no two-button variant.
2. Every `single` and `multi` question must include `not_sure` unless the question id is on an explicit allow-list (for example the tax-year picker).
3. Every `multi` screening question must include `none` (exclusive) and `other` (with a follow-up `text` describing it).
4. Option labels describe **facts**, never outcomes: "I carried bulky tools the employer required and there was no secure storage at the site", not "I can claim car expenses".
5. One question asks one thing. If a prompt needs "and" or "or", split it.
6. A lint test in CI fails the build if any rule above is broken.

### Visibility and the never-infer rule

- `showIf` only decides **whether a question appears**. The engine has no API to write a value on the user's behalf.
- When an earlier answer changes and hides a question that already has a value, the engine keeps the old row but marks the latest version `not_applicable_by_rule`. The calculation ignores it; the report lists it under "answers no longer used" so nothing disappears silently.
- Defaults are forbidden. No `defaultValue` on any question, no pre-ticked box, no pre-selected radio.
- ATO pre-fill or document imports arrive with `source = 'document'` and state `imported`, and the UI asks the user to confirm each imported value before it counts (then `prefill_confirmed`).

### Repeaters

Use repeaters wherever the ATO treats items separately: employers/payers, allowances, WorkCover payments, Lump Sum E accrual years, rental properties, CGT events, crypto disposals, vehicles, self-education items, and each deduction item that needs its own evidence. Each repeater has `minItems`, an "Add another" button, and a summary card per item. Totals are always computed from items, never typed as aggregates.

### Validation

- Money: whole cents, non-negative unless the field is a loss; warn above plausible ceilings (for example a single uniform item over $2,000) rather than block.
- Dates must fall inside the case financial year unless the question says otherwise (Lump Sum E accrual years, prior-year losses).
- Percent fields 0–100; work-use percentages must be backed by a method answer (logbook, diary, estimate).
- Cross-field checks live in the intelligence layer (Section 9), not in field validation.

### Progress

Progress = answered visible required questions ÷ visible required questions, per module and overall. Because visibility changes with answers, recompute on every save; never show a fixed "question 12 of 300".

## 5. Occupation filtering logic

When the user enters an occupation, only work-expense and allowance questions tagged for that occupation appear; income, residency, family, investment, super and offset questions always run for everyone. This keeps a chef from seeing sleepover-shift questions while still catching a chef's rental property or crypto.

### Occupation registry

```ts
export type OccupationTag =
  | 'all_employees' | 'vehicle_travel' | 'tools_equipment' | 'uniform_ppe'
  | 'licences_cards' | 'home_office' | 'phone_internet' | 'overnight_travel'
  | 'sun_protection' | 'self_education' | 'union_fees'
  | 'dsw' | 'construction' | 'chef_hospitality' | 'fifo' | 'sole_trader';

export interface Occupation {
  id: string;              // 'disability_support_worker'
  label: string;           // 'Disability support worker'
  aliases: string[];       // 'NDIS support worker', 'carer', 'PCA', 'AIN'
  anzsco?: string;         // optional ANZSCO code for search
  tags: OccupationTag[];
  deepModule?: 'dsw' | 'construction' | 'chef_hospitality';
}
```

Seed at least these occupations; add others with generic tags so they still get a sensible interview:

| Occupation (examples of aliases) | Deep module | Tags |
| --- | --- | --- |
| Disability / community support worker (NDIS worker, carer, personal care assistant, AIN, support coordinator) | `dsw` | all\_employees, vehicle\_travel, uniform\_ppe, licences\_cards, phone\_internet, home\_office, sun\_protection, self\_education |
| Construction labourer, carpenter, concreter, formworker, steel fixer, electrician, plumber, bricklayer, plant operator, site supervisor, civil engineer (site-based) | `construction` | all\_employees, vehicle\_travel, tools\_equipment, uniform\_ppe, licences\_cards, overnight\_travel, sun\_protection, fifo, phone\_internet |
| Chef, cook, kitchenhand, catering staff, hospitality worker, barista, bartender | `chef_hospitality` | all\_employees, vehicle\_travel, tools\_equipment, uniform\_ppe, licences\_cards, self\_education |
| Office / professional (engineer in office, project manager, administrator) | none | all\_employees, vehicle\_travel, home\_office, phone\_internet, self\_education |
| Other / not listed (free text) | none | all\_employees plus tags chosen by the user in a follow-up tick-box |

### Filtering algorithm

1. Build the case's **active tag set** = union of tags of every occupation on the profile for that year, plus tags from answers (for example answering "I ran a business" adds `sole_trader`; "I worked FIFO" adds `fifo`).
2. A question with no `occupationTags` is **universal** and always eligible.
3. A question with `occupationTags` is eligible if **any** of its tags is in the active tag set.
4. Eligible questions then pass through `showIf`. Final visibility = eligible **and** `showIf` true.
5. Deep-module questions (Section 7) carry the deep-module tag, so they appear only for those occupations.

### Multiple occupations and employers

- Ask occupations as a repeater tied to each employer or payer, because deductions attach to the job that produced the income. A person who was both a support worker and a kitchenhand sees both deep modules, and each deduction item asks which job it relates to.
- If an occupation changes mid-year, ask date ranges per job; do not assume the whole year.

### Occupation "Other" never shrinks the interview

If the user picks *Other / not listed*, show a tick-box: "Which of these did your work involve?" listing the generic tags in plain words (driving between workplaces, tools, protective clothing, licences, working from home, phone use, overnight travel, outdoor work, study). Their ticks become the active tags. Picking *Not sure* here adds every generic tag and a review flag.

## 6. Interview module catalogue

The interview runs 16 modules in this fixed order; each module opens with a screening question and only drills down where the answer says it applies. Question ids use the pattern `module.topic.item`. Options shown in brackets are the minimum set; every list also carries *Not sure* and, for screening, *None* and *Other*.

### M1. Tax year and purpose

- `core.fy` — Financial year \[2023–24, 2024–25, 2025–26, 2026–27\]. Selects the rule table.
- `core.purpose` — Why are you doing this? \[Estimate before lodging, Check an assessment I received, Consider an amendment, Plan for next year\].
- `core.lodged` — Has a return for this year already been lodged? \[Yes, by me via myGov; Yes, by a tax agent; No; Not sure\]. "Yes" + purpose "amendment" asks for the assessed refund/debt figure so the report can show the difference.

### M2. Residency and return status

- `res.status` — For the whole year, which describes you? \[Australian resident all year; Became a resident during the year; Stopped being a resident during the year; Foreign resident all year; Temporary resident (visa holder); Working holiday maker (417/462 visa); Not sure\].
- Part-year answers ask arrival/departure **dates**. WHM asks WHM income separately (its own tax table). Temporary residents get a foreign-income and CGT review flag.
- `res.dual` — Were you also treated as a tax resident of another country? \[Yes / No / Not sure\] → treaty review flag.

### M3. Family, Medicare and private health

- `fam.spouse` — Did you have a spouse (married or de facto) at any time in the year? \[All year; Part of the year (dates); No; Not sure\]. Spouse → spouse taxable income, reportable fringe benefits, reportable super contributions (for MLS/offset tests).
- `fam.dependants` — Number of dependent children, and whether any were full-time students under 25.
- `med.exemption` — Were you entitled to Medicare the whole year? \[Yes; No, foreign resident; No, temporary visa without Medicare (have a Medicare Entitlement Statement); Part of the year; Not sure\].
- `phi.cover` — Private patient **hospital** cover? \[Whole year; Part year (days); Extras only; None; Not sure\]. "Extras only" is explained as not counting for MLS. Covered → insurer statement fields (premiums, rebate received, tier) as a repeater per policy.

### M4. Employment, payers and occupation

- Repeater `employer`: payer name, ABN (optional), occupation (Section 5), dates worked, gross payments, tax withheld, reportable fringe benefits, reportable employer super contributions, lump sums A/B/D/E shown on the income statement, whether income statement is "tax ready" \[Yes / No / Not sure\].
- `emp.other_pay` — Any of these outside your income statements? \[Cash wages; Tips; Gifts from clients; Director fees; Payments from a labour hire agency not shown; None; Other; Not sure\].

### M5. Allowances and reimbursements

- Repeater `allowance`: type \[Car/km; Travel/overnight; Meal/overtime meal; Tool; Uniform/laundry; Site/industry; Living-away-from-home; First aid; Phone; Other\], amount, whether shown on income statement, whether it was a **reimbursement of actual cost** instead of an allowance \[Allowance / Reimbursement / Not sure\].
- Rule: allowances are income; reimbursements are not income and the matching expense cannot be claimed. The engine links each allowance to its expense category so the intelligence layer can check both sides.

### M6. WorkCover, compensation and termination

- `comp.received` multi: \[Weekly/periodic WorkCover payments; Arrears of weekly payments; Medical/treatment/rehab reimbursements; Permanent impairment/non-economic loss lump sum; Economic loss/loss of earning capacity lump sum; Common-law settlement; Interest on a payment; Legal costs reimbursed; Income protection insurance; Sickness/accident insurance; None; Other; Not sure\].
- Each tick opens its own amount + date + payer fields. Periodic and income-protection amounts flow to income; impairment and common-law lump sums raise a **review** flag with a plain-English note (usually capital, not income, but depends on the settlement's terms).
- Arrears → **Lump Sum E** repeater: one item per earlier financial year the arrears relate to, with amount and whether the amount accrued more than 12 months before payment, plus that year's taxable income if known. Totals of $1,200 or more trigger the LSPIA check (Section 8).
- `etp.received` — Termination payment (ETP), unused leave (Lump Sum A/B/D), redundancy? Each asks the income-statement code; ETPs go to manual review for component treatment.

### M7. Government payments and pensions

- Screening multi: \[JobSeeker/Youth Allowance/Austudy; Age/Disability/Carer pension; Parenting payment; Paid parental leave (Services Australia); Dad and partner pay; Disaster payments; Veterans' payments; None; Other; Not sure\]. Each → amount + tax withheld; pensions raise an SAPTO/BOTO eligibility check.

### M8. Super income

- Super income stream or lump sum received? \[Yes / No / Not sure\] → age at payment, taxed/untaxed element, payment summary amounts → manual review flag unless a simple taxed-element-over-60 case.

### M9. Investments

- Interest: repeater per account (bank, amount, joint %). Pre-fill import supported.
- Dividends: repeater per holding (unfranked, franked, franking credits, TFN withheld, DRP yes/no).
- Managed funds/trust distributions: repeater per AMIT/annual tax statement (each label as a field, including capital gain components and foreign income).
- ESS: discount, deferral, start-up concession \[Yes / No / Not sure\] → review flag.

### M10. Rental property

- Repeater `rental_property`: ownership %, dates available for rent, days actually rented, days private use, rent received, each expense category as its own field (interest, council rates, water, insurance, agent fees, repairs, capital works, depreciation), whether repairs were **initial repairs** after purchase \[Yes / No / Not sure\] (capital, flagged), whether short-stay/holiday home \[Yes / No\].

### M11. Capital gains and crypto

- `cgt.events` multi: \[Sold shares/ETFs; Sold/disposed crypto; Sold property; Received capital gain distribution; Lost/destroyed asset with insurance; Other; None; Not sure\].
- Repeater `cgt_event`: asset, acquisition date and cost base items, disposal date and proceeds, ownership %, main residence \[Yes / No / Part\], prior-year net capital losses carried forward. Crypto: each disposal, including crypto-to-crypto swaps, is its own event; staking/airdrop income is income, not a gain.
- Engine applies the 12-month 50% discount only when both dates are answered and the holding is at least 12 months.

### M12. Foreign income

- Foreign employment, pensions, rent, investment income, foreign tax paid, assets over AUD 50,000 \[Yes / No / Not sure\]. Temporary residents answer whether income is foreign-sourced (generally exempt) → review.

### M13. Business, sole trader, partnerships and trusts

- Sole trader: ABN, business income, expenses by category, GST registered \[Yes / No\], PSI screen (80% from one client? results test? unrelated clients test?), non-commercial loss tests if a loss.
- Partnership/trust distributions: repeater per entity with each share amount and credits. Any business loss or PSI "not sure" → manual review.

### M14. Deductions (general)

Every deduction item asks the three factual tests, always in this order: (1) Did you pay it yourself and were you not reimbursed? \[Paid, not reimbursed; Paid, fully reimbursed; Paid, partly reimbursed (amount); Employer paid/supplied; Not sure\]. (2) What was it for? (work purpose options). (3) Private-use proportion and evidence \[Receipts; Bank statements; Logbook; Diary; Estimate only; None\].

Categories (each shown only if its occupation tag is active): car/vehicle (cents per km vs logbook, with trip-type questions), other work travel, overnight travel, clothing/uniform/laundry, tools and equipment (instant deduction under $300 vs depreciation), home office (fixed rate vs actual, with hours record), phone/internet (work %), self-education, union/professional fees, subscriptions, sun protection, cost of managing tax affairs, gifts/donations to DGRs (universal), income protection premiums (universal), personal super contribution deduction (M15), interest/dividend deductions (investments).

### M15. Super contributions

- Personal after-tax contributions you intend to claim, notice of intent lodged and acknowledged \[Yes / No / Not yet / Not sure\], total super balance at 30 June prior year (range buttons), carry-forward unused cap intent, spouse contributions paid. Missing acknowledgement → blocker flag on the deduction.

### M16. Offsets, debts, tax paid and completeness gate

- PAYG instalments paid; zone/overseas forces; invalid and carer; SAPTO screen; foreign income tax offset; private health adjustments (from M3).
- Study and training support loans \[HELP; VSL; SSL; ABSTUDY SSL; AASL (trade support loan); None; Not sure\] with balance → repayment estimate.
- **Completeness gate** (required before a report can be marked Final): confirm income statements checked, ATO pre-fill reviewed, bank/investment statements reviewed, deduction evidence held, prior-year losses entered, every *Not sure* reviewed. Unticked items keep the report in Draft with a watermark.

## 7. Occupation deep modules

Each deep module is a separate question file tagged with its occupation, and each row below becomes one question plus a treatment rule the calculation engine reads. The "Treatment" column states the usual ATO position; before release, check every row against the ATO's occupation and industry guides and store that page URL in the question's `atoRef`.

Treatment codes: **D** deductible (to the work-use %), **N** not deductible, **C** capital (depreciate), **R** manual review flag, **I** income.

### 7.1 Disability and community support workers (`dsw`)

| Question | Options (plus Not sure) | Treatment |
| --- | --- | --- |
| Did you drive between clients' homes during a shift? | Yes, own car / Yes, employer car / No | D (own car, not reimbursed); N if reimbursed per km (then allowance check) |
| Did you drive from home to your first client or from your last client to home? | Yes / No | N by default; R only if home is a genuine work base or bulky equipment was required |
| Did you drive directly between two separate employers on the same day? | Yes / No | D |
| Did you use your car to transport clients or run errands for them? | Yes, not reimbursed / Yes, reimbursed / No | D if not reimbursed; N if reimbursed |
| Did you work sleepover shifts? | Yes / No → costs incurred during them \[Meals, Toiletries, Bedding, Other\] | N (private) |
| Did you pay for client costs (outings, meals, activities)? | Yes, reimbursed / Yes, not reimbursed / No | N for your own food; client-only costs not reimbursed → R |
| Clothing worn at work | Compulsory uniform with logo / Registered non-compulsory uniform / Protective items (non-slip shoes, gloves, aprons) / Plain clothes / None | D for compulsory, registered or protective; N for plain clothes |
| Laundry of eligible work clothing | Loads per week at home, work-only or mixed | D (ATO laundry rate from rule table) |
| First aid / CPR course | Designated first-aid person at work / Required by employer / Personal choice | D if designated; otherwise R |
| Working with Children Check, NDIS Worker Screening, police check | First check to get the job / Renewal for current job / Paid by employer | N for first check; R for renewal; N if employer paid |
| Training (NDIS modules, manual handling, medication, behaviour support) | Related to current duties / For a new role / Employer paid | D if current duties and not reimbursed |
| Conferences, seminars, union fees | Amounts per item | D |
| Phone and internet for rosters, case notes, client contact | Work % and method (itemised bill, 4-week diary, estimate) | D at work %; estimate-only → R |
| Home office for case notes and admin | Hours record kept? | D via fixed rate or actual cost (Section 8) |
| Sunscreen, hat, sunglasses for outdoor outings | Yes / No | D |
| Vaccinations, health checks | Yes / No | N generally; R note |

### 7.2 Construction and trades (`construction`)

| Question | Options (plus Not sure) | Treatment |
| --- | --- | --- |
| How did you get to work? | Same site all year / Several sites in a day / Different site each day or week / FIFO or DIDO | Same site → home-to-work N; between sites in a day → D |
| Did you carry bulky tools the employer required? | Yes, and no secure storage at the site / Yes, but storage was available / No | D only if bulky, required and no secure storage |
| Is your job itinerant (shifting places of work as a normal part of the role)? | Yes / No | D for home-to-site if itinerant; R otherwise |
| Tools and equipment bought | Repeater: item, cost, date, work % | Under $300 → D immediate; $300+ → C (decline in value) |
| Tool repairs, insurance, hire, batteries | Amounts | D at work % |
| Protective clothing and PPE | Steel-capped boots, hi-vis, hard hat, gloves, eye/ear protection, sun-protective gear | D if not supplied or reimbursed |
| Everyday clothing (jeans, plain work shirts) | Yes / No | N |
| Licences, tickets, cards (White Card, high-risk work licence, EWP, forklift, trade licence) | First licence / Renewal / Employer paid | First → N; renewal → D; employer paid → N |
| Overnight travel for work | Nights, accommodation, meals, allowance received | D if not reimbursed; allowance → I, check reasonable amounts |
| FIFO / DIDO / living away from home | Employer-paid flights and camp / LAFHA received / You paid travel | Employer-paid → N; LAFHA → R |
| Allowances (site, tool, travel, overtime meal, dirt, height) | Repeater with amount | I; linked expense checks |
| Phone use for site coordination | Work % and method | D at work % |

### 7.3 Chefs, cooks and hospitality (`chef_hospitality`)

| Question | Options (plus Not sure) | Treatment |
| --- | --- | --- |
| Knives and kitchen tools | Repeater: item, cost, date | Under $300 → D; $300+ → C |
| Knife sharpening, repairs, knife insurance | Amounts | D |
| Chef's clothing | Checked pants / Chef's jacket / Apron / Non-slip safety shoes / Hat / Plain black clothing | D for occupation-specific and protective; N for plain black clothing |
| Laundry of eligible clothing | Loads per week, work-only or mixed | D (ATO laundry rate) |
| Travel between two jobs or to catering sites during a shift | Yes / No | D |
| Home to your normal workplace | Yes | N |
| Food safety supervisor, RSA, RSG, allergen courses | First certificate to get job / Renewal for current role / Employer paid | First → N; renewal → D; employer paid → N |
| Cooking courses or culinary training | Related to current job / For a new career | D if current job; N if new career |
| Meals eaten at work or staff meals | Yes | N (private) |
| Overtime meals | Received overtime meal allowance under an award? Yes / No | D only if an allowance was received; otherwise N |
| Tips and gratuities | Amount | I |

### 7.4 Every other occupation

No deep module; the general deduction categories in M14 appear according to the tags the user selected (Section 5). Add new deep modules later by creating a new question file and tag; no engine change is needed.

## 8. Calculation engine

The engine is a pure function `calculate(answers, ruleSet) → Estimate` that runs a fixed pipeline, works in integer cents, and records an explanation for every line. Any module whose inputs are incomplete or whose rule is not yet implemented returns `status: 'manual_review'` instead of a number, and the estimate carries a lower confidence.

### Pipeline (fixed order)

1. **Assessable income**: salary and wages, allowances, tips, taxable compensation, Lump Sum A/B/D (each treated per its income-statement code), government payments, interest (by ownership %), dividends plus franking credits (gross-up), trust and managed fund components, net rent, net capital gain, foreign income, business/PSI income, ESS discounts.
2. **Deductions**: every deduction item × work-use % minus reimbursed amounts, split into instant vs decline-in-value; apply car method, home office method and laundry rules from the rule table.
3. **Taxable income** = assessable income − deductions, rounded **down** to the whole dollar; losses carried forward if negative (with a flag).
4. **Gross tax** on taxable income from the year's resident, foreign-resident or WHM scale (part-year residents get the tax-free threshold pro-rated per the rule table).
5. **Non-refundable offsets**: LITO, SAPTO, spouse super, invalid/carer, zone, private health adjustment, foreign income tax offset, LSPIA. Cannot reduce tax below zero.
6. **Medicare levy** (with low-income reduction and exemption days) and **Medicare levy surcharge** (income for MLS purposes vs threshold tier, days without hospital cover, family thresholds).
7. **Study loan repayment** from repayment income and the year's repayment method.
8. **Refundable credits**: PAYG withheld, PAYG instalments, franking credits, TFN amounts withheld.
9. **Result** = credits − (tax after offsets + Medicare + MLS + study repayment). Positive = estimated refund; negative = estimated debt.

### Rule table schema (one file per financial year)

```ts
export interface RuleSet {
  fy: '2023-24' | '2024-25' | '2025-26' | '2026-27';
  version: string;                 // e.g. '2026-27.1', bump on any change
  verifiedOn: string;              // ISO date someone checked every source
  residentScale: Bracket[];        // [{ from: 0, to: 18200, rate: 0, base: 0 }, ...]
  foreignResidentScale: Bracket[];
  whmScale: Bracket[];
  lito: { max: number; taper1: {from: number; to: number; rate: number}; taper2: {...} };
  medicare: { rate: number; lowIncome: {single: Thresholds; family: Thresholds; sapto: Thresholds}; };
  mls: { tiers: MlsTier[]; familyChildIncrement: number };
  phiRebate: RebateTier[];
  carCentsPerKm: number; carMaxKm: 5000;
  wfhFixedRatePerHour: number;
  laundry: { perLoadWorkOnly: number; perLoadMixed: number; noEvidenceCap: number };
  instantDeductionThreshold: 300;
  studyLoan: { method: 'total_income_rate' | 'marginal'; bands: RepaymentBand[] };
  lspiaMinimum: 1200;
  sources: { key: string; url: string }[];  // ATO page per value
}
```

A Zod schema validates every rule file at build time; a missing `sources` entry for any value fails CI.

### Resident tax scales to load

| Taxable income | 2023–24 | 2024–25 | 2025–26 | 2026–27 |
| --- | --- | --- | --- | --- |
| $0 – $18,200 | Nil | Nil | Nil | Nil |
| $18,201 – $45,000 | 19% | 16% | 16% | 15% |
| $45,001 – $120,000 | 32.5% | 30% | 30% | 30% |
| $120,001 – $135,000 | 37% | 30% | 30% | 30% |
| $135,001 – $180,000 | 37% | 37% | 37% | 37% |
| $180,001 – $190,000 | 45% | 37% | 37% | 37% |
| $190,001 + | 45% | 45% | 45% | 45% |

Medicare levy is 2% in every year. LITO is up to $700, reducing by 5 cents per dollar between $37,500 and $45,000, then 1.5 cents per dollar between $45,000 and $66,667. Load the Medicare low-income thresholds, MLS tiers, private health rebate tiers, car cents-per-km rate, working-from-home fixed rate and study-loan bands for each year from the ATO pages, and record the source URL and check date; do not hard-code them from this document.

### Special modules

| Module | What it does | Ships as |
| --- | --- | --- |
| Car expenses | Cents per km (≤ 5,000 km) or logbook % × actual costs; home-to-work trips excluded unless an exception answer applies | Full calculation |
| Home office | Fixed rate × hours recorded, or actual-cost method with work % | Full calculation |
| Decline in value | Items $300+ by diminishing value or prime cost, pro-rated from date first used | Full calculation |
| LSPIA (Lump Sum E) | Compares tax on the arrears in the year received vs notional tax had each amount been received in its accrual year; offset = the excess, when Lump Sum E ≥ $1,200 and prior-year incomes are answered | Review until golden tests pass, then full |
| CGT | Per-event gain/loss, current and carried-forward losses applied before the 50% discount, discount only if held 12+ months and resident | Full for shares/crypto; property and main residence → review |
| Crypto | Each disposal and swap is a CGT event; staking and airdrops → income | Full, with cost-base method answered (not assumed) |
| Rental | Net rent per property × ownership %; initial repairs and capital works flagged | Full, capital items → review |
| Super contribution deduction | Only if notice of intent acknowledged; cap check against the year's concessional cap | Full with blocker flag |
| Study loans | Repayment on repayment income using the year's method | Full |
| ETP, super benefits, PSI, non-commercial losses, foreign residency days, family Medicare exemption | Not approximated | Always manual review |

### Explain trail

Every line in the estimate stores `{ label, amountCents, ruleId, inputs: questionId[], formula }`. The estimate screen and PDF both render this so the user can see exactly why each figure appears.

## 9. Intelligence layer

The intelligence layer turns answers into four kinds of flags (review, opportunity, consistency, missing) and two scores (completeness and confidence). It is rule-based and deterministic: each flag is a function over answers with a code, severity, message and the question ids that caused it, so the same answers always give the same advice.

### Flag rule format

```ts
export interface FlagRule {
  code: string;                         // 'DSW_HOME_TO_FIRST_CLIENT'
  kind: 'review' | 'opportunity' | 'consistency' | 'missing';
  severity: 'info' | 'warning' | 'blocker';
  when: (a: AnswerView, ctx: CaseContext) => boolean;
  message: (a: AnswerView) => string;   // plain English, no jargon
  questionIds: string[];
  atoRef?: string;
}
```

### Examples to implement first

| Code | Kind | Trigger | Message gist |
| --- | --- | --- | --- |
| `ANY_NOT_SURE` | review | Any visible answer is Not sure | Lists each unsure question with what to check |
| `ALLOWANCE_NO_EXPENSE` | opportunity | Tool/uniform/car allowance received but no matching expense entered | You received an allowance; if you spent money on this, you may have a deduction |
| `EXPENSE_REIMBURSED` | consistency | Expense entered and marked reimbursed | Reimbursed costs cannot be claimed; removed from deductions |
| `CAR_HOME_TO_WORK` | consistency | Car trips entered as home-to-work with no exception answer | Ordinary commuting is private; excluded |
| `DSW_CLIENT_TRAVEL_UNCLAIMED` | opportunity | DSW, drove between clients, no car expense entered | Travel between clients is usually deductible |
| `CONSTR_PPE_UNCLAIMED` | opportunity | Construction, bought PPE, amount zero | PPE you paid for is usually deductible |
| `CHEF_LAUNDRY_UNCLAIMED` | opportunity | Chef, eligible uniform, no laundry claim | Laundry of eligible clothing may be claimable |
| `LICENCE_FIRST` | consistency | Licence marked "first licence" with an amount | First-time licence costs are generally not deductible |
| `LUMP_SUM_E_LSPIA` | review | Lump Sum E ≥ $1,200 | Possible LSPIA offset; needs each accrual year's income |
| `WORKCOVER_CAPITAL_LUMP` | review | Impairment or common-law lump sum | Usually not income, but depends on settlement terms |
| `MLS_EXPOSURE` | opportunity | No hospital cover and MLS income near or above threshold | Surcharge applies; hospital cover may cost less |
| `SUPER_NOI_MISSING` | missing (blocker) | Personal super deduction without acknowledged notice | Deduction removed until notice is acknowledged |
| `WFH_NO_RECORD` | missing | WFH fixed rate claimed without an hours record | Fixed rate needs a record of actual hours |
| `DEDUCTION_RATIO_HIGH` | review | Work deductions above a set % of salary for the occupation | High claims attract ATO attention; check evidence |
| `NO_EVIDENCE` | review | Evidence answer "None" or "Estimate only" | Claim is at risk without records |
| `PRIOR_LOSSES_UNANSWERED` | missing | CGT event entered but prior-year losses question skipped | Carried-forward losses change the gain |

### Completeness score

Percentage of visible required questions with an `answered` or `imported` value, weighted by module (income modules weight 3, deductions 2, others 1). A case cannot be marked Final below 100% on income modules or with any open blocker.

### Confidence score

- **High**: completeness 100%, no review flags, no manual-review modules.
- **Medium**: completeness ≥ 90% and only info or warning review flags.
- **Low**: anything else. The report shows the confidence next to the refund/debt figure, never hidden in small print.

### Range estimate

Where a flag concerns a specific amount (for example an uncertain deduction), compute the estimate twice (with and without that amount) and show the result as a range, such as "refund between $820 and $1,140".

## 10. UI and UX specification

The app should feel like a guided interview, one short module per screen, with a live estimate that updates as answers change. Mobile-first: most users will answer on a phone.

| Screen | Contents | Behaviour |
| --- | --- | --- |
| Login | Email magic link or email + password (Supabase Auth) | Redirect to dashboard |
| Dashboard | Profile cards (name, relationship, occupations, latest FY case status, last estimate) + "Add profile" | Profile switcher also pinned in the header on every screen |
| Profile | Details, occupations, list of FY cases, "Start new year" (option to copy stable facts such as occupations and rental properties, each shown for re-confirmation, never silently carried) | Copied answers arrive as `imported`, requiring confirmation |
| Interview | Left rail (desktop) or top drop-down (mobile) listing modules with % complete; one module per page; question cards; "Why we ask" expanders; Not sure always visible | Autosave on every change (debounced 800 ms); Back/Next; resume exactly where left |
| Live estimate panel | Current refund/debt, confidence badge, count of open flags | Sticky footer on mobile, side panel on desktop |
| Review | All flags grouped by kind; each links back to the question | Completeness gate checklist at the bottom |
| Estimate | Full explain trail, range, comparison with lodged assessment (if entered) | "Generate report" button |
| Reports | List of snapshots with date, rule version, Draft/Final | Download PDF; reports are read-only |

### Interaction rules

- Radio buttons and checkboxes are large tap targets (minimum 44 px), with the option's help text visible under the label, not in a tooltip.
- Exclusive options (None, Not sure) visibly clear other ticks and say so.
- Money fields show a $ prefix, accept commas, store cents.
- Never auto-advance after a click; the user presses Next.
- Plain English at roughly Year 8 reading level; any tax term gets a one-line definition on first use.
- Accessibility: WCAG 2.2 AA, full keyboard navigation, labels bound to inputs, error messages announced to screen readers.
- Offline-tolerant: unsaved answers queue locally and sync when online, with a visible "Saved" / "Saving" / "Offline" indicator.

## 11. PDF report specification

The PDF is generated server-side from an immutable snapshot, so a report downloaded today reads the same in five years even if rules or answers change. It is branded as your practice, never as the ATO.

### Sections, in order

1. **Cover**: report title "Tax estimate and advisory report (indicative only)", profile name, financial year, purpose, generated date/time (Australia/Melbourne), rule-set version, Draft or Final, confidence badge.
2. **Summary box**: estimated refund or debt (or range), taxable income, total tax and levies, total credits, completeness %, number of open review items.
3. **Income captured**: table by category and payer, with source (entered/imported).
4. **Deductions captured**: table by category with work-use %, reimbursement status, evidence held, and method.
5. **Tax calculation**: the explain trail — gross tax by bracket, each offset, Medicare levy, MLS, study repayment, credits, result.
6. **Items needing review**: every review, missing and consistency flag with the plain-English message and what to check.
7. **Potential opportunities**: every opportunity flag, framed as "check whether", never "you can claim".
8. **Your answers**: every answered question grouped by module, including Not sure answers and answers no longer used.
9. **Assumptions and limitations**: ideally empty; list every simplification a module used and every module routed to manual review.
10. **Disclaimer** (every page footer plus full text at the end): "This report is an indicative estimate prepared from information you provided. It is not tax advice and is not a tax return. Final outcomes are determined by the ATO. Consider seeking advice from a registered tax agent."

### Technical rules

- Build with `@react-pdf/renderer` in `app/api/reports/[reportId]/pdf/route.ts`; store the PDF in the private bucket at `{uid}/{caseId}/reports/{reportId}.pdf`; serve via short-lived signed URL.
- Page numbers "Page x of y", profile name and FY in every header.
- Draft reports carry a diagonal "DRAFT" watermark.
- Tables break cleanly across pages with repeated headers.
- No TFN, no full date of birth, no bank account numbers anywhere in the PDF.

## 12. Security, privacy and compliance

The app holds sensitive financial and health-adjacent data (WorkCover), so every table is locked to its owner by row-level security and nothing sensitive leaves the server unencrypted.

### Security checklist

- [ ] Supabase Auth required for every route except login; middleware redirects unauthenticated users.
- [ ] RLS enabled on every table (Section 3); an automated test logs in as user B and confirms zero rows of user A are visible.
- [ ] The Supabase **service-role key** exists only in Vercel server environment variables, never in any `NEXT_PUBLIC_` variable or client bundle.
- [ ] Storage bucket private; files served only by signed URLs that expire within 5 minutes.
- [ ] No TFN, bank account or full date-of-birth fields anywhere (a CI grep test fails the build if a field id contains `tfn`).
- [ ] Security headers set in `next.config`: Content-Security-Policy, HSTS, X-Frame-Options DENY, Referrer-Policy.
- [ ] Rate-limit auth and calculation endpoints.
- [ ] Audit log records create, update, delete, report generation and PDF download.
- [ ] Data deletion: "Delete profile" removes the profile, cases, answers, documents and reports (cascade + Storage cleanup); "Export my data" gives a JSON download.
- [ ] Retention setting: default 7 years for Final reports (aligned with common record-keeping advice), user can delete earlier.
- [ ] Privacy notice explaining what is collected, why, where it is stored (Supabase region: choose Sydney), and how to delete it — aligned with the Australian Privacy Principles.

### Compliance boundary

- **Personal and family use** (your own profiles and household): an estimator is fine.
- **Offering it to clients for a fee**, or giving tax advice through it to others for reward, is a *tax agent service* under the Tax Agent Services Act 2009 and requires registration with the Tax Practitioners Board, or supervision by a registered agent. Until then, keep public wording to "estimate" and "educational", and route users to a registered tax agent.
- Never use the ATO logo, colours or the phrase "ATO approved"; refer to "information published by the ATO" with links.

## 13. Testing

No rule module may produce a number in the app until its unit tests and at least three golden cases pass in CI. Tests are the only protection against a silent tax error.

### Test layers

| Layer | Tool | What it covers | Minimum |
| --- | --- | --- | --- |
| Rule tables | Vitest + Zod | Every FY file parses; every value has a source URL; brackets are continuous with no gaps or overlaps | All FYs |
| Calc modules | Vitest | Each module at boundaries: $18,200, $18,201, $45,000, $45,001, $135,000, $190,000; LITO taper ends; Medicare low-income edge; MLS tier edges; $300 tool threshold; 12-month CGT boundary | 10 cases per module |
| Golden cases | Vitest | Full answer sets → expected estimate, hand-checked against the ATO simple tax calculator and income tax estimator | 3 per occupation per FY |
| Question bank lint | Vitest | Option-set rules (Section 4); no default values; unique ids; every `showIf` points at an existing question | Whole bank |
| Visibility | Vitest | Chef profile never sees `dsw.*` questions; construction sees `construction.*`; Other with no tags sees no deep module; hidden answers become `not_applicable_by_rule` | Per occupation |
| RLS | Vitest against a local Supabase | User B cannot read, update or delete user A's rows or files | All tables |
| End-to-end | Playwright | Create profile → answer a DSW interview → see estimate → generate PDF → download; the same on mobile viewport | 3 journeys |

### Golden cases to write first

1. Disability support worker, $62,000 salary, $1,800 client-to-client car travel by cents per km, compulsory uniform, first NDIS screening check (must be excluded), no private health, 2025–26.
2. Construction labourer, $88,000 salary, $450 tool allowance, $1,250 in tools (one item above $300), steel caps and hi-vis, White Card renewal, carried bulky tools with no site storage, 2025–26.
3. Chef, $54,000 salary plus $2,000 tips, knives $380 and $120, chef jacket and checked pants, laundry 3 work-only loads a week, first food-safety certificate (must be excluded), 2025–26.
4. WorkCover recipient: $30,000 weekly payments, $14,000 arrears as Lump Sum E across two earlier years, impairment lump sum (must be excluded and flagged), 2024–25.
5. Mixed: employee plus one rental property and one crypto disposal held 14 months, 2026–27 scale.

## 14. Build phases and acceptance criteria

Build in eight phases, each ending with a green CI run and a working Vercel preview; do not start a phase until the previous one meets every acceptance criterion.

1. **Foundation**
   - Next.js + TypeScript strict + Tailwind + shadcn/ui; Supabase project; migrations 0001–0002; auth; CI workflow.
   - *Done when:* login works on a Vercel preview; RLS test passes; `npm run build` and CI are green.
2. **Profiles and FY cases**
   - Dashboard, profile CRUD, occupation picker from the registry, FY case creation, header profile switcher.
   - *Done when:* two profiles with three FY cases each can be created, switched and deleted; data isolated between users.
3. **Question engine**
   - Types, renderer for every question type, visibility, occupation filter, repeaters, autosave, answer versioning, progress.
   - *Done when:* bank lint passes; visibility tests pass; hiding a question marks its answer `not_applicable_by_rule`; no default values anywhere.
4. **Question bank**
   - Modules M1–M16 and deep modules 7.1–7.3 written as data with `atoRef` on every deduction question.
   - *Done when:* every module renders on mobile; a chef profile shows zero DSW or construction questions; every Not sure creates a flag.
5. **Calculation engine**
   - Rule files for 2023–24 to 2026–27 with sources; pipeline; all full modules in Section 8; explain trail; manual-review routing.
   - *Done when:* all module unit tests and the five golden cases pass; golden results match the ATO calculators to the dollar.
6. **Intelligence layer**
   - Flag rules, completeness and confidence scores, range estimates, live estimate panel.
   - *Done when:* each flag in Section 9 has a triggering and a non-triggering test; the Final gate blocks correctly.
7. **Reports**
   - Snapshot route, PDF document, Storage upload, signed download, reports list.
   - *Done when:* PDF contains all ten sections; editing answers after generation does not change the stored PDF; Draft watermark shows.
8. **Hardening and launch**
   - Security headers, rate limits, audit log, export/delete, privacy notice, accessibility audit, Playwright journeys, production deploy.
   - *Done when:* security checklist fully ticked; Lighthouse accessibility ≥ 95; three e2e journeys pass on production URL.

### Definition of done for every pull request

- Lint, typecheck, unit tests and build pass in CI.
- New questions have ids, options per the rules, and `atoRef` where they touch a deduction.
- New rule values have a source URL and a `verifiedOn` date.
- A Vercel preview link is checked on a phone-sized screen.

## 15. GitHub, Supabase and Vercel deployment

Deployment is push-to-deploy: GitHub holds the code, Supabase holds the data, and Vercel builds a preview for every pull request and production from `main`.

### Step 1 — Local setup (skip the clone line if the code is already on your computer)

```bash
node -v                      # use the current Node LTS
git clone https://github.com/<your-username>/tax-intake-adviser.git
cd tax-intake-adviser
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

### Step 2 — GitHub repository

```bash
git init
git add .
git commit -m "Initial commit: tax intake adviser"
git branch -M main
git remote add origin https://github.com/<your-username>/tax-intake-adviser.git
git push -u origin main
```

In GitHub → Settings → Branches, protect `main`: require pull requests and a passing CI check before merging. Keep the repository **private**.

### Step 3 — Supabase

1. Create a project at supabase.com; choose the **Sydney** region; save the database password in a password manager.
2. Install the CLI and link the project:

```bash
npm install -D supabase
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push         # applies supabase/migrations/*
```

3. Authentication → URL Configuration: set Site URL to your Vercel production URL and add `https://*-<your-vercel-team>.vercel.app/**` and `http://localhost:3000/**` as redirect URLs.
4. Storage: confirm the `case-documents` bucket exists and is **private**.
5. Project Settings → API: copy the project URL, the publishable (anon) key and the service-role key.

### Step 4 — Environment variables

| Variable | Where | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all envs) + `.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (all envs) + `.env.local` | Publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) + `.env.local` | Service-role key — never prefix with `NEXT_PUBLIC_` |
| `APP_BASE_URL` | Vercel | Production URL |
| `REPORT_TIMEZONE` | Vercel | `Australia/Melbourne` |

Commit `.env.example` with empty values; `.env.local` stays in `.gitignore`.

### Step 5 — Vercel

1. vercel.com → Add New → Project → Import the GitHub repository.
2. Framework preset: Next.js; build command `npm run build`; output default.
3. Add the environment variables above; deploy.
4. Every pull request now gets a Preview URL; merging to `main` deploys Production.
5. Optional: add a custom domain under Project → Settings → Domains.

### Step 6 — CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [pull_request, push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 'lts/*', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder
```

### Step 7 — Annual rule update (every July, and after each federal Budget)

1. Copy the latest `src/rules/fyYYYY-YY.ts` to the new year.
2. Update every value from the ATO pages; update each `sources` URL and `verifiedOn`.
3. Add the new year to `core.fy` options; add or retire questions using `years`.
4. Add golden cases for the new year; merge only when CI passes.
5. Old reports are unaffected because they store their own snapshot and rule version.

## 16. Master prompt for an AI coding agent

Paste the prompt below into Claude Code (or a similar agent) at the root of an empty repository, with this whole document attached or pasted underneath. Run one phase per session and review the preview before moving on.

```markdown
You are building the "Australian Tax Intake Adviser", a Next.js + TypeScript + Supabase web app
deployed on Vercel. The attached instruction set is the single source of truth. Follow it exactly.

NON-NEGOTIABLE RULES
1. Never infer or default a tax fact. No defaultValue, no pre-ticked options, no auto-filled answers.
2. "Not sure" is never treated as "No"; every Not sure creates a review flag.
3. Every single/multi question includes Not sure; screening questions include None (exclusive) and Other (+ text).
4. Only questions tagged for the case's active occupation tags appear; universal questions always appear.
5. All tax rates and thresholds live in src/rules/fyYYYY-YY.ts with a source URL per value. Never hard-code rates in logic.
6. Money is integer cents. Taxable income is rounded down to whole dollars.
7. Every estimate line records ruleId, input question ids and formula (explain trail).
8. Reports are immutable snapshots. Never update a reports row.
9. No TFN, bank account or full date-of-birth fields anywhere.
10. Any module not fully implemented returns status 'manual_review'; never approximate silently.

WORKING METHOD
- Build Phase <N> from Section 14 only. List the files you will create, then build them.
- Write tests alongside code (Section 13). A calc module is not done until its tests pass.
- After the phase, run: npm run lint && npm run typecheck && npm test -- --run && npm run build.
  Fix every failure before reporting.
- Where the instruction set says "verify" or asks for an ATO value, fetch the current ATO page,
  record the URL and today's date in the rule file, and tell me which values you set.
- If anything in the instruction set is ambiguous or contradicts itself, stop and ask me; do not guess.

END OF PHASE REPORT
- What was built (files), test results, anything routed to manual review, open questions for me,
  and the exact commands I run to see it locally and deploy the preview.

Start with Phase <N>.
```

Replace `<N>` with the phase number each session (1 to 8). After Phase 8, use the same prompt with "Annual rule update for FY YYYY–YY" to roll the rules forward each July.
