-- Additive only: existing rows keep working (both columns are nullable).
-- answers.source_ref: where a prefilled or imported value came from, e.g.
--   {"kind":"prior_year","fromCaseId":"...","fy":"2024-25","category":"opening_balance"}
--   {"kind":"document","documentId":"...","fileName":"income-statement.pdf"}
alter table public.answers add column if not exists source_ref jsonb;
-- documents.content_hash: sha-256 of the uploaded file, used to recognise a file uploaded twice.
alter table public.documents add column if not exists content_hash text;
create index if not exists documents_case_hash_idx on public.documents (case_id, content_hash);
