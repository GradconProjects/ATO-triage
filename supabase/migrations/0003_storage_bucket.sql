-- Private bucket for uploaded documents and generated PDFs.
-- Path pattern: {uid}/{caseId}/{file}; the first segment must equal auth.uid().
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

create policy "case_documents_select" on storage.objects for select
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case_documents_insert" on storage.objects for insert
  with check (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case_documents_update" on storage.objects for update
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case_documents_delete" on storage.objects for delete
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth.uid()::text);
