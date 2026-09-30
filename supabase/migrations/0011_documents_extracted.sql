-- Additive: the figures read from an uploaded document, kept so a re-upload of the same file
-- (same content_hash) is recognised and never read or applied twice.
alter table public.documents add column if not exists extracted jsonb;
