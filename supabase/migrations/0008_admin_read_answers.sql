-- Admins can read every user's answers and related rows (for the live admin view).
create policy "admin_select" on answers for select using (public.is_app_admin());
create policy "admin_select" on repeater_items for select using (public.is_app_admin());
create policy "admin_select" on estimates for select using (public.is_app_admin());
create policy "admin_select" on flags for select using (public.is_app_admin());
create policy "admin_select" on documents for select using (public.is_app_admin());
