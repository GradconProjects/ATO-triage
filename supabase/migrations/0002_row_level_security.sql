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
