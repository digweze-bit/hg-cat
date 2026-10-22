-- ════════════════════════════════════════════════════════════════════
-- ONLINE SHOP — a separate sales channel beside HG Cat
--
-- Everything a buyer does (asking about a work, requesting to buy it,
-- paying by card, uploading a transfer receipt) lives in the shop_* tables
-- below. None of it touches artworks, clients, invoices or payments.
--
-- The one bridge into HG Cat is shop_post_to_hgcat(), which staff run by
-- hand once a payment is confirmed. It runs with the caller's own
-- privileges, so only an approved staff user can ever write HG Cat data.
--
-- Everything the public (or an edge function) can call runs as shop_owner:
-- a no-login role that owns the shop tables and can only *read* artworks,
-- artists, bank_accounts and profiles. A bug in a public-facing function
-- therefore cannot write to HG Cat — Postgres refuses it.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'shop_owner') then
    create role shop_owner nologin;
  end if;
end $$;
grant shop_owner to postgres;
grant usage, create on schema public to shop_owner;
grant select on public.artworks, public.artists, public.bank_accounts, public.profiles to shop_owner;
-- RLS on those tables keys off auth.uid(), which shop_owner isn't; give it
-- plain read access (read only — there is no write policy for it anywhere).
create policy "Shop reads artworks" on public.artworks for select to shop_owner using (true);
create policy "Shop reads artists" on public.artists for select to shop_owner using (true);
create policy "Shop reads bank accounts" on public.bank_accounts for select to shop_owner using (true);

create or replace function public.shop_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and approved = true)
$$;

-- ── TABLES ──────────────────────────────────────────────────────────

create table public.shop_settings (
  id                    boolean primary key default true check (id),
  bank_account_ngn      uuid references public.bank_accounts(id) on delete set null,
  bank_account_usd      uuid references public.bank_accounts(id) on delete set null,
  hold_hours            integer not null default 72 check (hold_hours > 0),
  transfer_instructions text,
  site_url              text not null default 'https://hgcat.vercel.app',
  updated_at            timestamptz not null default now()
);
insert into public.shop_settings (id, bank_account_ngn, bank_account_usd)
  values (true,
    (select id from public.bank_accounts where currency = 'NGN' order by is_default desc, created_at limit 1),
    (select id from public.bank_accounts where currency = 'USD' order by is_default desc, created_at limit 1));

create table public.shop_listings (
  id          uuid primary key default gen_random_uuid(),
  artwork_id  uuid not null references public.artworks(id) on delete restrict,
  status      text not null default 'live'
              check (status in ('live','on_hold','sold','withdrawn')),
  price_ngn   numeric(18,2) check (price_ngn > 0),
  price_usd   numeric(18,2) check (price_usd > 0),
  description text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (price_ngn is not null or price_usd is not null)
);
-- One open listing per artwork; withdrawn and sold listings are history.
create unique index shop_listings_one_open on public.shop_listings(artwork_id)
  where status in ('live','on_hold');

create table public.shop_order_sequence (
  year   integer primary key,
  last_n integer not null default 0
);

create table public.shop_orders (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,                 -- HG-ORD-2026-001
  access_token    uuid not null unique default gen_random_uuid(),  -- buyer's private link
  listing_id      uuid not null references public.shop_listings(id),
  artwork_id      uuid not null references public.artworks(id) on delete restrict,
  -- snapshot shown on the pro-forma, so later catalogue edits don't change it
  title           text not null,
  artist_name     text,
  year            text,
  medium          text,
  dimensions      text,
  image_url       text,
  currency        text not null check (currency in ('NGN','USD')),
  amount          numeric(18,2) not null check (amount > 0),
  buyer_name      text not null,
  buyer_email     text not null,
  buyer_phone     text,
  message         text,
  status          text not null default 'requested'
                  check (status in ('requested','approved','declined','expired','paid','posted')),
  decline_reason  text,
  approved_at     timestamptz,
  approved_by     uuid references auth.users(id),
  hold_expires_at timestamptz,
  payment_method  text check (payment_method in ('card','transfer')),
  paid_at         timestamptz,
  invoice_id      uuid references public.invoices(id) on delete set null,
  posted_at       timestamptz,
  posted_by       uuid references auth.users(id),
  client_ip       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index shop_orders_status on public.shop_orders(status);
create index shop_orders_listing on public.shop_orders(listing_id);
create index shop_orders_email on public.shop_orders(lower(buyer_email), created_at);

create table public.shop_payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.shop_orders(id) on delete cascade,
  method        text not null check (method in ('card','transfer')),
  status        text not null check (status in (
                  'initiated','success','failed',          -- card
                  'pending_review','confirmed','rejected'  -- transfer
                )),
  currency      text not null,
  amount        numeric(18,2),
  reference     text unique,          -- Paystack reference (card)
  receipt_path  text,                 -- shop-receipts bucket path (transfer)
  bank_name     text,
  transfer_date date,
  note          text,
  reject_reason text,
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  raw           jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index shop_payments_order on public.shop_payments(order_id);

create table public.shop_inquiries (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid references public.shop_listings(id) on delete set null,
  artwork_id  uuid references public.artworks(id) on delete set null,
  title       text,
  artist_name text,
  name        text not null,
  email       text,
  phone       text,
  message     text not null,
  status      text not null default 'new' check (status in ('new','answered','closed')),
  client_ip   text,
  created_at  timestamptz not null default now()
);
create index shop_inquiries_status on public.shop_inquiries(status);

alter table public.shop_settings       owner to shop_owner;
alter table public.shop_listings       owner to shop_owner;
alter table public.shop_order_sequence owner to shop_owner;
alter table public.shop_orders         owner to shop_owner;
alter table public.shop_payments       owner to shop_owner;
alter table public.shop_inquiries      owner to shop_owner;

-- ── RLS: staff only. The public never touches these tables directly;
-- it goes through the shop_* functions below. ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['shop_settings','shop_listings','shop_order_sequence',
                           'shop_orders','shop_payments','shop_inquiries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "Staff manage %s" on public.%I for all to authenticated
                    using (public.shop_is_staff()) with check (public.shop_is_staff())', t, t);
  end loop;
end $$;

-- ── INTERNAL HELPERS ────────────────────────────────────────────────

-- Posts an event to the shop-notify edge function (email + WhatsApp).
-- Owned by postgres (needs pg_net and the vault); only shop_owner may call it.
create or replace function public.shop_notify(p_event text, p_order_id uuid default null,
                                              p_inquiry_id uuid default null, p_payment_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  secret text;
  body   jsonb;
  s      public.shop_settings;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'shop_webhook_secret';
  if secret is null then return; end if;
  select * into s from public.shop_settings;
  body := jsonb_build_object(
    'event', p_event,
    'site_url', s.site_url,
    'order', (select to_jsonb(o) - 'client_ip' from public.shop_orders o where o.id = p_order_id),
    'inquiry', (select to_jsonb(i) - 'client_ip' from public.shop_inquiries i where i.id = p_inquiry_id),
    'payment', (select to_jsonb(p) - 'raw' from public.shop_payments p where p.id = p_payment_id)
  );
  perform net.http_post(
    url := 'https://gmukkxnxyvmywgrbkwnr.supabase.co/functions/v1/shop-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', secret),
    body := body,
    timeout_milliseconds := 8000
  );
exception when others then
  -- A notification failure must never undo a buyer's request or a payment.
  raise warning 'shop_notify(%) failed: %', p_event, sqlerrm;
end;
$$;
revoke all on function public.shop_notify(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.shop_notify(text, uuid, uuid, uuid) to shop_owner;

create or replace function public.shop_client_ip()
returns text language sql stable set search_path = public as $$
  select nullif(trim(split_part(coalesce(
    current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), '')
$$;

create or replace function public.shop_next_order_ref()
returns text language plpgsql security definer set search_path = public as $$
declare
  y integer := extract(year from now())::integer;
  n integer;
begin
  insert into public.shop_order_sequence (year, last_n) values (y, 1)
    on conflict (year) do update set last_n = shop_order_sequence.last_n + 1
    returning last_n into n;
  return 'HG-ORD-' || y || '-' || lpad(n::text, 3, '0');
end;
$$;

-- Releases approved orders whose hold has run out. Run lazily at the top of
-- every shop function, so no scheduler is needed. An order with a transfer
-- receipt waiting for review is not expired — the buyer has already paid.
create or replace function public.shop_expire_holds()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Both updates run in one statement, so the listing check can't see the
  -- orders just expired; exclude them by id instead.
  with expired as (
    update public.shop_orders o set status = 'expired', updated_at = now()
     where o.status = 'approved' and o.hold_expires_at < now()
       and not exists (select 1 from public.shop_payments p
                        where p.order_id = o.id and p.status in ('pending_review','success'))
    returning o.id, o.listing_id
  )
  update public.shop_listings l set status = 'live', updated_at = now()
   where l.status = 'on_hold' and l.id in (select listing_id from expired)
     and not exists (select 1 from public.shop_orders o
                      where o.listing_id = l.id and o.status in ('approved','paid')
                        and o.id not in (select id from expired));
end;
$$;

-- shop_owner can't use the auth schema, so staff functions that record who
-- acted read the caller's id through this postgres-owned wrapper.
create or replace function public.shop_uid()
returns uuid language sql stable security definer set search_path = public as $$
  select auth.uid()
$$;
revoke all on function public.shop_uid() from public, anon, authenticated;
grant execute on function public.shop_uid() to shop_owner;

create or replace function public.shop_require_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.shop_is_staff() then
    raise exception 'Only approved staff can do this' using errcode = '42501';
  end if;
end;
$$;

-- ── PUBLIC FUNCTIONS (anon) ─────────────────────────────────────────

create or replace function public.shop_get_listing(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform public.shop_expire_holds();
  select jsonb_build_object(
    'id', l.id, 'status', l.status, 'price_ngn', l.price_ngn, 'price_usd', l.price_usd,
    'description', coalesce(l.description, a.description, a.writeup),
    'artwork_id', a.id, 'title', a.title, 'year', a.year, 'medium', a.medium,
    'dimensions', a.dimensions, 'dimension_unit', a.dimension_unit,
    'image_url', coalesce(a.full_image_url, a.image_url, a.thumbnail_url),
    'thumbnail_url', coalesce(a.thumbnail_url, a.image_url),
    'image_position', a.image_position, 'artist_name', ar.name, 'artist_id', ar.id,
    'available', a.availability = 'Available'
  ) into r
  from public.shop_listings l
  join public.artworks a on a.id = l.artwork_id
  left join public.artists ar on ar.id = a.artist_id
  where l.id = p_id and l.status <> 'withdrawn';
  return r;
end;
$$;

-- For the regular artwork page: is there an open online listing for this work?
create or replace function public.shop_listing_for_artwork(p_artwork_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.shop_listings
   where artwork_id = p_artwork_id and status in ('live','on_hold') limit 1
$$;

create or replace function public.shop_request_purchase(
  p_listing_id uuid, p_currency text, p_name text, p_email text,
  p_phone text default null, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l   public.shop_listings;
  a   public.artworks;
  ip  text := public.shop_client_ip();
  amt numeric;
  o   public.shop_orders;
begin
  perform public.shop_expire_holds();
  p_email := lower(trim(p_email));
  p_name  := trim(p_name);
  if coalesce(p_name, '') = '' then raise exception 'Please enter your name'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address'; end if;
  if (select count(*) from public.shop_orders
       where lower(buyer_email) = p_email and created_at > now() - interval '1 hour') >= 5
     or (ip is not null and (select count(*) from public.shop_orders
       where client_ip = ip and created_at > now() - interval '1 hour') >= 20) then
    raise exception 'Too many requests — please try again later';
  end if;

  select * into l from public.shop_listings where id = p_listing_id for update;
  if l.id is null or l.status = 'withdrawn' then raise exception 'This listing is no longer online'; end if;
  if l.status = 'sold' then raise exception 'This work has been sold'; end if;
  if l.status = 'on_hold' then raise exception 'This work is on hold for another buyer'; end if;

  select * into a from public.artworks where id = l.artwork_id;
  if a.availability is distinct from 'Available' then
    raise exception 'This work is no longer available';
  end if;

  amt := case upper(p_currency) when 'NGN' then l.price_ngn when 'USD' then l.price_usd end;
  if amt is null then raise exception 'This work is not priced in %', p_currency; end if;

  -- The same buyer tapping twice gets their existing request back.
  select * into o from public.shop_orders
   where listing_id = l.id and lower(buyer_email) = p_email and status = 'requested'
   order by created_at desc limit 1;
  if o.id is not null then
    return jsonb_build_object('ref', o.ref, 'token', o.access_token, 'existing', true);
  end if;

  insert into public.shop_orders (ref, listing_id, artwork_id, title, artist_name, year, medium,
      dimensions, image_url, currency, amount, buyer_name, buyer_email, buyer_phone, message, client_ip)
  values (public.shop_next_order_ref(), l.id, a.id, a.title,
      (select name from public.artists where id = a.artist_id), a.year, a.medium,
      nullif(trim(concat_ws(' ', a.dimensions, a.dimension_unit)), ''),
      coalesce(a.thumbnail_url, a.image_url), upper(p_currency), amt,
      p_name, p_email, nullif(trim(p_phone), ''), nullif(trim(p_message), ''), ip)
  returning * into o;

  perform public.shop_notify('order_requested', o.id);
  return jsonb_build_object('ref', o.ref, 'token', o.access_token);
end;
$$;

create or replace function public.shop_ask_question(
  p_listing_id uuid, p_name text, p_email text, p_phone text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ip text := public.shop_client_ip();
  q  public.shop_inquiries;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_message), '') = '' then
    raise exception 'Please enter your name and a message';
  end if;
  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then
    raise exception 'Please leave an email or phone number so we can reply';
  end if;
  if ip is not null and (select count(*) from public.shop_inquiries
       where client_ip = ip and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many messages — please try again later';
  end if;
  insert into public.shop_inquiries (listing_id, artwork_id, title, artist_name, name, email, phone, message, client_ip)
  select l.id, a.id, a.title, ar.name, trim(p_name), nullif(lower(trim(p_email)), ''),
         nullif(trim(p_phone), ''), trim(p_message), ip
    from public.shop_listings l
    join public.artworks a on a.id = l.artwork_id
    left join public.artists ar on ar.id = a.artist_id
   where l.id = p_listing_id
  returning * into q;
  if q.id is null then raise exception 'Listing not found'; end if;
  perform public.shop_notify('inquiry_new', null, q.id);
end;
$$;

-- The buyer's private order page. The access token is the only key.
create or replace function public.shop_get_order(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o    public.shop_orders;
  s    public.shop_settings;
  bank jsonb;
begin
  perform public.shop_expire_holds();
  select * into o from public.shop_orders where access_token = p_token;
  if o.id is null then return null; end if;
  select * into s from public.shop_settings;
  if o.status in ('approved','paid','posted') then
    select jsonb_build_object('account_name', b.account_name, 'bank_name', b.bank_name,
             'account_number', b.account_number, 'sort_code', b.sort_code,
             'routing_number', b.routing_number, 'swift_bic', b.swift_bic,
             'bank_address', b.bank_address, 'currency', b.currency)
      into bank
      from public.bank_accounts b
     where b.id = case o.currency when 'NGN' then s.bank_account_ngn else s.bank_account_usd end;
  end if;
  return jsonb_build_object(
    'ref', o.ref, 'status', o.status, 'listing_id', o.listing_id,
    'title', o.title, 'artist_name', o.artist_name, 'year', o.year, 'medium', o.medium,
    'dimensions', o.dimensions, 'image_url', o.image_url,
    'currency', o.currency, 'amount', o.amount,
    'buyer_name', o.buyer_name, 'buyer_email', o.buyer_email, 'buyer_phone', o.buyer_phone,
    'decline_reason', o.decline_reason, 'hold_expires_at', o.hold_expires_at,
    'payment_method', o.payment_method, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'bank', bank, 'transfer_instructions', s.transfer_instructions,
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
        'method', p.method, 'status', p.status, 'amount', p.amount, 'currency', p.currency,
        'reject_reason', p.reject_reason, 'created_at', p.created_at) order by p.created_at)
      from public.shop_payments p where p.order_id = o.id and p.status <> 'initiated'), '[]'::jsonb)
  );
end;
$$;

-- Storage policy helper: may this token upload a receipt right now?
create or replace function public.shop_can_upload(p_token text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.shop_orders
                  where access_token = p_token::uuid and status = 'approved');
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.shop_submit_receipt(
  p_token uuid, p_path text, p_amount numeric default null,
  p_bank_name text default null, p_transfer_date date default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.shop_orders;
  p public.shop_payments;
begin
  perform public.shop_expire_holds();
  select * into o from public.shop_orders where access_token = p_token for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'approved' then raise exception 'This order is not awaiting payment'; end if;
  if p_path is null or p_path not like p_token::text || '/%' then raise exception 'Invalid receipt'; end if;
  insert into public.shop_payments (order_id, method, status, currency, amount, receipt_path,
                                    bank_name, transfer_date, note)
  values (o.id, 'transfer', 'pending_review', o.currency, p_amount, p_path,
          nullif(trim(p_bank_name), ''), p_transfer_date, nullif(trim(p_note), ''))
  returning * into p;
  update public.shop_orders set payment_method = 'transfer', updated_at = now() where id = o.id;
  perform public.shop_notify('receipt_uploaded', o.id, null, p.id);
end;
$$;

-- ── CARD PAYMENTS (called by edge functions with the service key) ────

create or replace function public.shop_card_prepare(p_token uuid, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.shop_orders;
begin
  perform public.shop_expire_holds();
  select * into o from public.shop_orders where access_token = p_token for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status <> 'approved' then raise exception 'This order is not awaiting payment'; end if;
  insert into public.shop_payments (order_id, method, status, currency, amount, reference)
  values (o.id, 'card', 'initiated', o.currency, o.amount, p_reference);
  return jsonb_build_object('email', o.buyer_email, 'amount', o.amount, 'currency', o.currency,
                            'ref', o.ref, 'name', o.buyer_name);
end;
$$;

-- Idempotent: Paystack retries webhooks, and the callback page verifies too.
create or replace function public.shop_card_result(
  p_reference text, p_success boolean, p_amount_subunits bigint, p_currency text, p_raw jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  p public.shop_payments;
  o public.shop_orders;
begin
  select * into p from public.shop_payments where reference = p_reference and method = 'card' for update;
  if p.id is null then return 'unknown_reference'; end if;
  if p.status = 'success' then return 'already_recorded'; end if;
  select * into o from public.shop_orders where id = p.order_id for update;

  if not p_success then
    update public.shop_payments set status = 'failed', raw = p_raw, updated_at = now() where id = p.id;
    return 'failed';
  end if;

  if upper(p_currency) <> o.currency or p_amount_subunits < round(o.amount * 100) then
    update public.shop_payments set status = 'failed', raw = p_raw, updated_at = now(),
      note = format('Paystack reported %s %s, expected %s %s',
                    upper(p_currency), p_amount_subunits / 100.0, o.currency, o.amount)
     where id = p.id;
    perform public.shop_notify('payment_mismatch', o.id, null, p.id);
    return 'amount_mismatch';
  end if;

  update public.shop_payments set status = 'success', amount = p_amount_subunits / 100.0,
         raw = p_raw, updated_at = now() where id = p.id;
  if o.status in ('approved','expired') then
    update public.shop_orders set status = 'paid', payment_method = 'card', paid_at = now(),
           updated_at = now() where id = o.id;
    -- A payment that lands just after the hold lapsed still wins the work back,
    -- unless another buyer has been approved in the meantime; staff see both.
    update public.shop_listings set status = 'on_hold', updated_at = now()
     where id = o.listing_id and status = 'live';
  end if;
  perform public.shop_notify('payment_card', o.id, null, p.id);
  return 'paid';
end;
$$;

-- ── STAFF FUNCTIONS ─────────────────────────────────────────────────

create or replace function public.shop_approve_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.shop_orders;
  l public.shop_listings;
begin
  perform public.shop_require_staff();
  perform public.shop_expire_holds();
  select * into o from public.shop_orders where id = p_order_id for update;
  if o.status is distinct from 'requested' then raise exception 'Only a new request can be approved'; end if;
  select * into l from public.shop_listings where id = o.listing_id for update;
  if l.status <> 'live' then raise exception 'This listing is %, so it cannot be held for this buyer', l.status; end if;
  if (select availability from public.artworks where id = o.artwork_id) is distinct from 'Available' then
    raise exception 'This work is no longer Available in HG Cat';
  end if;
  update public.shop_orders set status = 'approved', approved_at = now(), approved_by = public.shop_uid(),
         hold_expires_at = now() + make_interval(hours => (select hold_hours from public.shop_settings)),
         updated_at = now()
   where id = o.id;
  update public.shop_listings set status = 'on_hold', updated_at = now() where id = l.id;
  perform public.shop_notify('order_approved', o.id);
end;
$$;

create or replace function public.shop_decline_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.shop_orders;
begin
  perform public.shop_require_staff();
  select * into o from public.shop_orders where id = p_order_id for update;
  if o.status not in ('requested','approved','expired') then
    raise exception 'A % order cannot be declined', o.status;
  end if;
  update public.shop_orders set status = 'declined', decline_reason = nullif(trim(p_reason), ''),
         updated_at = now() where id = o.id;
  update public.shop_listings l set status = 'live', updated_at = now()
   where l.id = o.listing_id and l.status = 'on_hold'
     and not exists (select 1 from public.shop_orders x
                      where x.listing_id = l.id and x.status in ('approved','paid'));
  perform public.shop_notify('order_declined', o.id);
end;
$$;

create or replace function public.shop_extend_hold(p_order_id uuid, p_hours integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.shop_require_staff();
  update public.shop_orders
     set hold_expires_at = greatest(hold_expires_at, now()) + make_interval(hours => p_hours),
         updated_at = now()
   where id = p_order_id and status = 'approved';
  if not found then raise exception 'Only an approved order can have its hold extended'; end if;
end;
$$;

create or replace function public.shop_confirm_transfer(p_payment_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.shop_payments;
  o public.shop_orders;
begin
  perform public.shop_require_staff();
  select * into p from public.shop_payments where id = p_payment_id for update;
  if p.status is distinct from 'pending_review' then raise exception 'This receipt has already been reviewed'; end if;
  select * into o from public.shop_orders where id = p.order_id for update;
  update public.shop_payments set status = 'confirmed', amount = coalesce(p_amount, amount),
         reviewed_by = public.shop_uid(), reviewed_at = now(), updated_at = now()
   where id = p.id;
  if o.status in ('approved','expired') then
    update public.shop_orders set status = 'paid', payment_method = 'transfer', paid_at = now(),
           updated_at = now() where id = o.id;
    update public.shop_listings set status = 'on_hold', updated_at = now()
     where id = o.listing_id and status = 'live';
  end if;
  perform public.shop_notify('transfer_confirmed', o.id, null, p.id);
end;
$$;

create or replace function public.shop_reject_transfer(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.shop_payments;
begin
  perform public.shop_require_staff();
  update public.shop_payments set status = 'rejected', reject_reason = nullif(trim(p_reason), ''),
         reviewed_by = public.shop_uid(), reviewed_at = now(), updated_at = now()
   where id = p_payment_id and status = 'pending_review'
  returning * into p;
  if p.id is null then raise exception 'This receipt has already been reviewed'; end if;
  perform public.shop_notify('transfer_rejected', p.order_id, null, p.id);
end;
$$;

-- ── THE BRIDGE: post a paid order into HG Cat ───────────────────────
-- SECURITY INVOKER on purpose: it writes clients, invoices, invoice_items,
-- payments and audit_log with the staff member's own rights. The existing
-- triggers then total the invoice, mark it paid and mark the artwork Sold.
create or replace function public.shop_post_to_hgcat(p_order_id uuid, p_exchange_rate numeric default 1)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  o         public.shop_orders;
  a         public.artworks;
  client_id uuid;
  inv_id    uuid;
  inv_no    text;
  rate      numeric := case when p_exchange_rate is null or p_exchange_rate <= 0 then 1 else p_exchange_rate end;
  bank_id   uuid;
  paid      record;
begin
  if not public.shop_is_staff() then raise exception 'Only approved staff can post to HG Cat'; end if;
  select * into o from public.shop_orders where id = p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status = 'posted' then raise exception 'Already posted as an invoice'; end if;
  if o.status <> 'paid' then raise exception 'Only a paid order can be posted'; end if;
  if o.currency = 'NGN' then rate := 1; end if;

  select * into a from public.artworks where id = o.artwork_id for update;
  if a.availability is distinct from 'Available' then
    raise exception 'The artwork is "%" in HG Cat, not Available. Resolve that (it may need a refund) before posting.',
      a.availability;
  end if;

  select c.id into client_id from public.clients c
   where lower(c.email) = lower(o.buyer_email) order by c.created_at limit 1;
  if client_id is null then
    insert into public.clients (name, first_name, last_name, email, phone, phone_mobile, tags, notes)
    values (o.buyer_name, split_part(o.buyer_name, ' ', 1),
            nullif(trim(substr(o.buyer_name, length(split_part(o.buyer_name, ' ', 1)) + 1)), ''),
            o.buyer_email, o.buyer_phone, o.buyer_phone, array['online'],
            'Created from online order ' || o.ref)
    returning id into client_id;
  end if;

  select case o.currency when 'NGN' then bank_account_ngn else bank_account_usd end
    into bank_id from public.shop_settings;
  inv_no := public.next_invoice_number();
  insert into public.invoices (invoice_number, client_id, status, currency, exchange_rate, base_currency,
      subtotal, discount_type, discount_value, vat_rate, vat_amount, total, total_ngn,
      amount_paid, balance_due, issue_date, notes, bank_account_id, created_by)
  values (inv_no, client_id, 'draft', o.currency, rate, 'NGN',
      o.amount, 'none', 0, 0, 0, o.amount, o.amount * rate,
      0, o.amount, current_date, 'Online order ' || o.ref, bank_id, auth.uid())
  returning id into inv_id;

  insert into public.invoice_items (invoice_id, artwork_id, item_type, title, artist_name, year, medium,
      dimensions, dimension_unit, unit_price, quantity, discount, line_total, sort_order,
      ownership, commission_rate, consignor_name, image_url, thumbnail_url)
  values (inv_id, a.id, 'artwork', o.title, o.artist_name, a.year, a.medium,
      a.dimensions, a.dimension_unit, o.amount, 1, 0, o.amount, 0,
      coalesce(a.ownership, 'gallery'),
      case when a.ownership = 'consignment' then coalesce(a.commission_rate, 40) end,
      a.consignor_name, a.image_url, a.thumbnail_url);

  -- Payments last: the payment trigger marks the invoice paid, and the
  -- invoice trigger then marks the artwork Sold.
  for paid in
    select * from public.shop_payments
     where order_id = o.id and status in ('success','confirmed') order by created_at
  loop
    insert into public.payments (invoice_id, amount, currency, exchange_rate, amount_ngn, method,
                                 paid_at, reference, notes, recorded_by)
    values (inv_id, coalesce(paid.amount, o.amount), o.currency, rate,
            coalesce(paid.amount, o.amount) * rate,
            case paid.method when 'card' then 'card' else 'transfer' end,
            coalesce(paid.transfer_date, paid.created_at::date),
            coalesce(paid.reference, o.ref),
            case paid.method when 'card' then 'Paystack · online order ' else 'Bank transfer · online order ' end || o.ref,
            auth.uid());
  end loop;

  update public.shop_orders set status = 'posted', invoice_id = inv_id, posted_at = now(),
         posted_by = auth.uid(), updated_at = now() where id = o.id;
  update public.shop_listings set status = 'sold', updated_at = now() where id = o.listing_id;

  insert into public.audit_log (action, entity_type, entity_id, entity_label, user_id, user_email, metadata)
  values ('shop.order_posted', 'invoice', inv_id::text, inv_no, auth.uid(), auth.jwt()->>'email',
          jsonb_build_object('order_ref', o.ref, 'artwork', o.title, 'amount', o.amount, 'currency', o.currency));
  return inv_id;
end;
$$;

-- ── OWNERSHIP & GRANTS ──────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'shop_next_order_ref()', 'shop_expire_holds()', 'shop_require_staff()',
    'shop_get_listing(uuid)', 'shop_listing_for_artwork(uuid)',
    'shop_request_purchase(uuid,text,text,text,text,text)',
    'shop_ask_question(uuid,text,text,text,text)', 'shop_get_order(uuid)',
    'shop_can_upload(text)', 'shop_submit_receipt(uuid,text,numeric,text,date,text)',
    'shop_card_prepare(uuid,text)', 'shop_card_result(text,boolean,bigint,text,jsonb)',
    'shop_approve_order(uuid)', 'shop_decline_order(uuid,text)', 'shop_extend_hold(uuid,integer)',
    'shop_confirm_transfer(uuid,numeric)', 'shop_reject_transfer(uuid,text)'
  ] loop
    execute format('alter function public.%s owner to shop_owner', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
revoke execute on function public.shop_is_staff() from public, anon;
grant execute on function public.shop_is_staff() to shop_owner, authenticated;
grant execute on function public.shop_client_ip() to shop_owner;

-- Public (QR page, order page)
grant execute on function public.shop_get_listing(uuid), public.shop_listing_for_artwork(uuid),
  public.shop_request_purchase(uuid,text,text,text,text,text),
  public.shop_ask_question(uuid,text,text,text,text), public.shop_get_order(uuid),
  public.shop_can_upload(text), public.shop_submit_receipt(uuid,text,numeric,text,date,text)
  to anon, authenticated;
-- Edge functions only
grant execute on function public.shop_card_prepare(uuid,text),
  public.shop_card_result(text,boolean,bigint,text,jsonb) to service_role;
-- Staff (each checks shop_is_staff itself)
grant execute on function public.shop_approve_order(uuid), public.shop_decline_order(uuid,text),
  public.shop_extend_hold(uuid,integer), public.shop_confirm_transfer(uuid,numeric),
  public.shop_reject_transfer(uuid,text) to authenticated;
revoke all on function public.shop_post_to_hgcat(uuid, numeric) from public, anon;
grant execute on function public.shop_post_to_hgcat(uuid, numeric) to authenticated;

-- ── RECEIPT STORAGE ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-receipts', 'shop-receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

-- A buyer can upload into their own order's folder (named by the order's
-- private token) while it awaits payment. They can never list or read back.
create policy "Shop buyers upload receipts" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'shop-receipts' and public.shop_can_upload((storage.foldername(name))[1]));
create policy "Staff read shop receipts" on storage.objects for select to authenticated
  using (bucket_id = 'shop-receipts' and public.shop_is_staff());

-- The notify secret lives in the vault, not in this file. It reuses the
-- WEBHOOK_SECRET the inquiry-email function already checks; run once:
--   select vault.create_secret('<WEBHOOK_SECRET>', 'shop_webhook_secret');
