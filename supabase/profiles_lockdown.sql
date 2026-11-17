-- ── PROFILES LOCKDOWN ───────────────────────────────────────
-- Before this, the only policy was "Users manage own profile" (FOR ALL), so
-- any signed-in user could set their own role to 'admin' or approve
-- themselves, and the signup trigger took role from client-supplied metadata.
--
-- Now: users read and edit their own row, but only an approved admin can
-- change role or approved. Admins can read every profile (Staff users page).
-- New signups are always 'staff' and unapproved (except the owner account).

create or replace function public.profiles_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and approved);
$$;
revoke all on function public.profiles_is_admin() from public, anon;
grant execute on function public.profiles_is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when new.email = 'info@hourglassgallery.com' then 'admin' else 'staff' end,
    new.email = 'info@hourglassgallery.com'
  );
  return new;
end;
$$;

create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role / SQL editor: allow.
  if auth.uid() is null or public.profiles_is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.approved is distinct from old.approved
     or new.email is distinct from old.email
     or new.id is distinct from old.id then
    raise exception 'Only an admin can change role, approval or email';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Admins read all profiles" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Admins update profiles" on public.profiles;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "Admins read all profiles" on public.profiles
  for select to authenticated using (public.profiles_is_admin());
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Admins update profiles" on public.profiles
  for update to authenticated using (public.profiles_is_admin()) with check (public.profiles_is_admin());
-- No insert/delete policies: rows are created by handle_new_user (security
-- definer) and removed by the auth.users cascade.
