-- Keep profiles.updated_at current
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Case status can only move forward to final once; cases already final are locked.
create or replace function lock_final_case() returns trigger language plpgsql as $$
begin
  if old.status = 'final' and new.status <> 'final' then
    raise exception 'A final case cannot be reopened; create an amendment case instead';
  end if;
  return new;
end $$;
create trigger fy_cases_lock_final before update on fy_cases
  for each row execute function lock_final_case();
