# Tax Intake Adviser

A multi-profile, occupation-aware interview app that estimates an Australian income tax refund or
debt and produces an indicative PDF advisory report. It never lodges, never connects to ATO online
services, and never uses ATO branding. Every output is an indicative estimate; the ATO notice of
assessment is the only final figure.

Built from `docs/INSTRUCTION_SET.md` (the product spec). `docs/CONTRACT.md` fixes the interfaces
between layers.

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · react-hook-form + Zod · Zustand ·
Supabase (Postgres, Auth, RLS, private Storage) · `@react-pdf/renderer` · Vitest · Playwright ·
GitHub Actions · Vercel.

## Layout

```
app/                      routes (login, dashboard, profiles, cases/{interview,review,estimate,reports}, api)
components/               UI primitives, layout, interview renderer
src/engine/               question engine (pure TS): types, visibility, occupation filter, validation, progress, lint
src/questions/            question bank as data (M1–M16 + deep modules), ids contract
src/occupations/          occupation registry + tags
src/rules/                versioned rule tables per FY (Zod-validated, ATO source URL per value)
src/calc/                 calculation engine (integer cents, explain trail)
src/intelligence/         flags, completeness, confidence, range, finalise gate
src/report/               immutable snapshot + PDF document
src/lib/                  Supabase clients, DB repo, case-state loader, calc runner
supabase/migrations/      SQL, numbered
tests/                    unit, golden, e2e
```

## Local setup

```bash
node -v                       # Node 22 LTS
npm install
cp .env.example .env.local    # fill in Supabase URL, anon key, service-role key
npm run dev                   # http://localhost:3000
```

Checks a contributor runs before pushing:

```bash
npm run lint && npm run typecheck && npm test -- --run && npm run build
```

## Supabase

1. Create a project in the **Sydney** region.
2. `npm install -D supabase && npx supabase login && npx supabase link --project-ref <ref>`
3. `npx supabase db push` applies `supabase/migrations/*` (schema, RLS, private `case-documents` bucket, triggers).
4. Authentication → URL configuration: set the Site URL to the Vercel production URL and add
   `https://*-<team>.vercel.app/**` and `http://localhost:3000/**` as redirect URLs.
5. Project Settings → API: copy the URL, anon key and service-role key into the environment variables below.

## Environment variables

| Variable | Where | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all envs) + `.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (all envs) + `.env.local` | Publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) + `.env.local` | Service-role key. Never prefix with `NEXT_PUBLIC_` |
| `APP_BASE_URL` | Vercel | Production URL |
| `REPORT_TIMEZONE` | Vercel | `Australia/Melbourne` |
| `TEAM_SEED_USERS` | Vercel (server only) + `.env.local` | Team sign-ins, see below |
| `APP_PIN_PEPPER` | Vercel (server only) + `.env.local` | Long random string |
| `ADMIN_EMAILS` | Vercel | Extra admin emails, comma separated (optional) |

The RLS test (`tests/unit/security/rls.test.ts`) runs only when `SUPABASE_TEST_URL`,
`SUPABASE_TEST_ANON_KEY` and `SUPABASE_TEST_SERVICE_ROLE_KEY` point at a local or dev project.

## Team access and admin

- The admin is any account whose email is in `ADMIN_EMAILS` (ipaliboboma@gmail.com is always an admin). Admins have no
  restriction, manage users at `/admin`, and can list and download every user's reports at `/admin/reports`.
- Team members sign in on the login page with a **username and code**. They are created either by the admin at
  `/admin` or from `TEAM_SEED_USERS` (created automatically on first sign-in). Under the hood each team member is a
  Supabase Auth user, so row-level security keeps their data separate.
- `TEAM_SEED_USERS` format, comma separated: `username:code:Display Name:restriction_level`. Codes are never stored in
  the repository. Set `APP_PIN_PEPPER` to a long random string; it is mixed into codes before they are used as auth
  passwords.
- Restriction levels: `full` (everything on own data), `standard` (no delete profile, no Final reports), `restricted`
  (answer interviews on existing profiles only), `view_only` (read only). Levels are enforced server-side in actions
  and API routes and hide the matching controls in the UI.

## Vercel

Import the GitHub repository, framework preset Next.js, add the variables above. Every pull request
gets a preview; `main` deploys production. Protect `main` (require PR + passing CI).

## Annual rule update (every July and after each Budget)

1. Copy the latest `src/rules/fyYYYY-YY.ts` to the new year and bump `version`.
2. Update every value from the ATO pages; update each `sources` URL, `checkedOn` and `verifiedOn`.
3. Add the new year to `FINANCIAL_YEARS` in `src/engine/types.ts` and the `core.fy` options; add or retire questions with `years`.
4. Add golden cases for the new year; merge only when CI passes.
5. Old reports are unaffected: each stores its own snapshot and rule version.

## Verification status of rule values

Each rule file carries `verifiedOn`, per-source `checkedOn` dates and a `verificationNotes` string
listing values that were carried forward or could not be confirmed against an ATO page at build
time. Read those notes before relying on a year's figures.

## Compliance boundary

Personal and household use is an estimator. Offering the tool to clients for a fee is a tax agent
service under the Tax Agent Services Act 2009 and needs Tax Practitioners Board registration or
supervision by a registered agent. Public wording stays "estimate" and "educational".
