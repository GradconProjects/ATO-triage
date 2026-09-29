-- Admins can create and edit data on any user's profiles (rows keep the profile owner's owner_id).
do $$
declare t text;
begin
  foreach t in array array['profiles','fy_cases','repeater_items','answers','documents','estimates','flags','reports','audit_log']
  loop
    execute format('create policy "admin_insert" on %I for insert with check (public.is_app_admin())', t);
  end loop;
  foreach t in array array['profiles','fy_cases','repeater_items','documents']
  loop
    execute format('create policy "admin_update" on %I for update using (public.is_app_admin())', t);
    execute format('create policy "admin_delete" on %I for delete using (public.is_app_admin())', t);
  end loop;
end $$;
create policy "admin_delete" on estimates for delete using (public.is_app_admin());
create policy "admin_delete" on flags for delete using (public.is_app_admin());
create policy "case_documents_admin_insert" on storage.objects for insert with check (bucket_id = 'case-documents' and public.is_app_admin());
