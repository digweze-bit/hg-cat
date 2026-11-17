-- ── LOCK DOWN NUMBER-BURNING RPCs ───────────────────────────
-- next_invoice_number, next_cert_number, next_hg_code and next_form_ref are
-- SECURITY DEFINER and were executable by anon through /rest/v1/rpc, so anyone
-- on the internet could advance the invoice / certificate / HG code / form
-- sequences. They are only used from staff pages (and inside
-- shop_post_to_hgcat, which staff run), so:
--   * revoke EXECUTE from public and anon
--   * require an approved staff login inside each function, which also stops
--     unapproved self-signups from calling them
--   * pin search_path

create or replace function public.hg_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved);
$$;

create or replace function public.next_invoice_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  yr  integer := extract(year from now());
  n   integer;
  yy  text;
begin
  if not public.hg_is_staff() then raise exception 'Not allowed'; end if;
  insert into public.invoice_sequence(year, last_n) values (yr, 0)
    on conflict(year) do update set last_n = invoice_sequence.last_n + 1
    returning last_n into n;
  yy := right(yr::text, 2);
  return 'HG-INV-' || yy || '-' || lpad(n::text, 4, '0');
end;
$$;

create or replace function public.next_cert_number()
returns text language plpgsql security definer set search_path = public as $$
declare
  yr  integer := extract(year from now());
  n   integer;
  yy  text;
begin
  if not public.hg_is_staff() then raise exception 'Not allowed'; end if;
  insert into public.cert_sequence(year, last_n) values (yr, 0)
    on conflict(year) do update set last_n = cert_sequence.last_n + 1
    returning last_n into n;
  yy := right(yr::text, 2);
  return 'HG-' || yy || '-' || lpad(n::text, 4, '0');
end;
$$;

create or replace function public.next_form_ref()
returns text language plpgsql security definer set search_path = public as $$
declare
  y integer := date_part('year', now())::integer;
  n integer;
begin
  if not public.hg_is_staff() then raise exception 'Not allowed'; end if;
  insert into public.form_sequence (year, last_n) values (y, 1)
    on conflict (year) do update set last_n = form_sequence.last_n + 1
    returning last_n into n;
  return 'HG-FORM-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

create or replace function public.next_hg_code()
returns text language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.hg_is_staff() then raise exception 'Not allowed'; end if;
  update public.artwork_sequence set last_n = last_n + 1 where id = 1 returning last_n into n;
  return 'HG/' || lpad(n::text, 4, '0');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['hg_is_staff','next_invoice_number','next_cert_number','next_form_ref','next_hg_code'] loop
    execute format('revoke all on function public.%I() from public, anon', f);
    execute format('grant execute on function public.%I() to authenticated, service_role', f);
  end loop;
end $$;
