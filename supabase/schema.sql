-- ============================================================
-- HG CAT — Hourglass Gallery Platform
-- Run this entire file in your new Supabase SQL Editor
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── PROFILES (extends Supabase Auth) ────────────────────────
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text not null,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin','staff')),
  approved    boolean not null default false,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Admins can read all profiles"
  on public.profiles for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Admins can update profiles"
  on public.profiles for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    case when new.email = 'info@hourglassgallery.com' then true else false end
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── ARTISTS ─────────────────────────────────────────────────
create table public.artists (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null,
  nationality  text,
  medium       text,
  bio          text,
  born         text,
  died         text,
  portrait_url text,
  link         text,
  sort_order   integer default 0,
  visible      boolean not null default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.artists enable row level security;
-- Public can read visible artists
create policy "Public read visible artists"
  on public.artists for select using (visible = true);
-- Staff can read all
create policy "Staff read all artists"
  on public.artists for select using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );
-- Staff can write
create policy "Staff write artists"
  on public.artists for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── ARTWORKS ────────────────────────────────────────────────
create table public.artworks (
  id             uuid default uuid_generate_v4() primary key,
  artist_id      uuid references public.artists(id) on delete set null,
  title          text not null default 'Untitled',
  year           text,
  medium         text,
  dimensions     text,
  series         text,
  availability   text default 'Available',
  writeup        text,
  image_url      text,
  image_position text default 'center',
  price          text,
  tags           text[] default '{}',
  location       text,
  visible        boolean not null default true,
  sort_order     integer default 0,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table public.artworks enable row level security;
create policy "Public read visible artworks"
  on public.artworks for select using (visible = true);
create policy "Staff read all artworks"
  on public.artworks for select using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );
create policy "Staff write artworks"
  on public.artworks for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── ARCHIVE ENTRIES ─────────────────────────────────────────
create table public.archive_entries (
  id          uuid default uuid_generate_v4() primary key,
  artist_id   uuid references public.artists(id) on delete cascade,
  artwork_id  uuid references public.artworks(id) on delete set null,
  type        text not null default 'note'
              check (type in ('photograph','press','biography','exhibition',
                              'auction','certificate','correspondence','essay',
                              'catalogue','artwork_image','note')),
  title       text not null,
  date        text,
  source      text,
  description text,
  tags        text[] default '{}',
  image_url   text,
  file_name   text,
  starred     boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.archive_entries enable row level security;
create policy "Staff manage archive"
  on public.archive_entries for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── PROVENANCE ENTRIES ──────────────────────────────────────
create table public.provenance_entries (
  id          uuid default uuid_generate_v4() primary key,
  artwork_id  uuid references public.artworks(id) on delete cascade not null,
  is_gap      boolean default false,
  date_from   text,
  date_to     text,
  owner       text,
  location    text,
  entry_type  text,
  description text,
  docs        text[] default '{}',
  verified    boolean default true,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);
alter table public.provenance_entries enable row level security;
create policy "Staff manage provenance"
  on public.provenance_entries for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── CLIENTS ─────────────────────────────────────────────────
create table public.clients (
  id           uuid default uuid_generate_v4() primary key,
  name         text not null,
  email        text,
  phone        text,
  address      text,
  city         text,
  country      text default 'Nigeria',
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table public.clients enable row level security;
create policy "Staff manage clients"
  on public.clients for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── INVOICES ────────────────────────────────────────────────
create table public.invoices (
  id              uuid default uuid_generate_v4() primary key,
  invoice_number  text not null unique,
  client_id       uuid references public.clients(id) on delete restrict,
  status          text not null default 'draft'
                  check (status in ('draft','sent','partial','paid','cancelled')),
  currency        text not null default 'NGN',
  exchange_rate   numeric(18,6) default 1,  -- rate to NGN at time of invoice
  base_currency   text default 'NGN',
  subtotal        numeric(18,2) default 0,
  discount_type   text default 'none' check (discount_type in ('none','percent','flat')),
  discount_value  numeric(18,2) default 0,
  vat_rate        numeric(5,2) default 0,   -- e.g. 7.5 for Nigerian VAT
  vat_amount      numeric(18,2) default 0,
  total           numeric(18,2) default 0,
  total_ngn       numeric(18,2) default 0,  -- total in NGN at invoice exchange rate
  amount_paid     numeric(18,2) default 0,
  balance_due     numeric(18,2) default 0,
  issue_date      date default current_date,
  due_date        date,
  notes           text,
  terms           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table public.invoices enable row level security;
create policy "Staff manage invoices"
  on public.invoices for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── INVOICE ITEMS ───────────────────────────────────────────
create table public.invoice_items (
  id           uuid default uuid_generate_v4() primary key,
  invoice_id   uuid references public.invoices(id) on delete cascade not null,
  artwork_id   uuid references public.artworks(id) on delete set null,
  title        text not null,   -- snapshot at time of invoice
  artist_name  text,
  year         text,
  medium       text,
  dimensions   text,
  unit_price   numeric(18,2) not null,
  quantity     integer default 1,
  discount     numeric(18,2) default 0,
  line_total   numeric(18,2) not null,
  sort_order   integer default 0
);
alter table public.invoice_items enable row level security;
create policy "Staff manage invoice items"
  on public.invoice_items for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── PAYMENTS ────────────────────────────────────────────────
create table public.payments (
  id              uuid default uuid_generate_v4() primary key,
  invoice_id      uuid references public.invoices(id) on delete cascade not null,
  amount          numeric(18,2) not null,
  currency        text not null default 'NGN',
  exchange_rate   numeric(18,6) default 1,  -- rate to NGN at time of payment
  amount_ngn      numeric(18,2) not null,   -- amount in NGN
  method          text default 'transfer'
                  check (method in ('cash','transfer','card','cheque','crypto','other')),
  paid_at         date default current_date,
  reference       text,   -- bank ref, transaction id etc.
  notes           text,
  recorded_by     uuid references auth.users(id),
  created_at      timestamptz default now()
);
alter table public.payments enable row level security;
create policy "Staff manage payments"
  on public.payments for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── CERTIFICATES OF AUTHENTICITY ────────────────────────────
create table public.certificates (
  id             uuid default uuid_generate_v4() primary key,
  cert_number    text not null unique,  -- HG-YY-NNNN
  artwork_id     uuid references public.artworks(id) on delete set null,
  artist_name    text not null,
  title          text not null,
  medium         text,
  dimensions     text,
  year           text,
  client_name    text,
  show_client    boolean default false,
  issued_date    date default current_date,
  issued_by      uuid references auth.users(id),
  notes          text,
  created_at     timestamptz default now()
);
alter table public.certificates enable row level security;
create policy "Staff manage certificates"
  on public.certificates for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── EXCHANGE RATE CACHE ─────────────────────────────────────
create table public.exchange_rates (
  id          uuid default uuid_generate_v4() primary key,
  base        text not null default 'NGN',
  currency    text not null,
  rate        numeric(18,6) not null,  -- 1 currency = rate NGN
  fetched_at  timestamptz default now(),
  unique(base, currency)
);
alter table public.exchange_rates enable row level security;
create policy "Anyone read rates"
  on public.exchange_rates for select using (true);
create policy "Staff write rates"
  on public.exchange_rates for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── CERT NUMBER SEQUENCE ────────────────────────────────────
create table public.cert_sequence (
  year    integer primary key,
  last_n  integer not null default 2129
);
insert into public.cert_sequence (year, last_n) values (2026, 2129);
alter table public.cert_sequence enable row level security;
create policy "Staff manage cert sequence"
  on public.cert_sequence for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── INVOICE NUMBER SEQUENCE ─────────────────────────────────
create table public.invoice_sequence (
  year    integer primary key,
  last_n  integer not null default 0
);
insert into public.invoice_sequence (year, last_n) values (2026, 0);
alter table public.invoice_sequence enable row level security;
create policy "Staff manage invoice sequence"
  on public.invoice_sequence for all using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── FUNCTIONS ───────────────────────────────────────────────

-- Next certificate number: HG-YY-NNNN
create or replace function public.next_cert_number()
returns text language plpgsql security definer as $$
declare
  yr  integer := extract(year from now());
  n   integer;
  yy  text;
begin
  insert into public.cert_sequence(year, last_n) values (yr, 0)
    on conflict(year) do update set last_n = cert_sequence.last_n + 1
    returning last_n into n;
  yy := right(yr::text, 2);
  return 'HG-' || yy || '-' || lpad(n::text, 4, '0');
end;
$$;

-- Next invoice number: HG-INV-YY-NNNN
create or replace function public.next_invoice_number()
returns text language plpgsql security definer as $$
declare
  yr  integer := extract(year from now());
  n   integer;
  yy  text;
begin
  insert into public.invoice_sequence(year, last_n) values (yr, 0)
    on conflict(year) do update set last_n = invoice_sequence.last_n + 1
    returning last_n into n;
  yy := right(yr::text, 2);
  return 'HG-INV-' || yy || '-' || lpad(n::text, 4, '0');
end;
$$;

-- Update invoice totals + balance when payment is added
create or replace function public.update_invoice_on_payment()
returns trigger language plpgsql security definer as $$
declare
  total_paid numeric(18,2);
  inv_total  numeric(18,2);
  new_status text;
begin
  select coalesce(sum(amount_ngn),0) into total_paid
    from public.payments where invoice_id = NEW.invoice_id;
  select total_ngn into inv_total
    from public.invoices where id = NEW.invoice_id;
  if total_paid >= inv_total then
    new_status := 'paid';
  elsif total_paid > 0 then
    new_status := 'partial';
  else
    new_status := 'sent';
  end if;
  update public.invoices set
    amount_paid = total_paid,
    balance_due = greatest(0, inv_total - total_paid),
    status = new_status,
    updated_at = now()
  where id = NEW.invoice_id;
  return NEW;
end;
$$;
create trigger after_payment_insert
  after insert or update or delete on public.payments
  for each row execute procedure public.update_invoice_on_payment();

-- Mark artwork sold when invoice paid
create or replace function public.update_artwork_availability()
returns trigger language plpgsql security definer as $$
begin
  if NEW.status = 'paid' and OLD.status != 'paid' then
    update public.artworks a
    set availability = 'Sold', updated_at = now()
    from public.invoice_items ii
    where ii.invoice_id = NEW.id and ii.artwork_id = a.id;
  elsif NEW.status in ('draft','cancelled') and OLD.status = 'paid' then
    update public.artworks a
    set availability = 'Available', updated_at = now()
    from public.invoice_items ii
    where ii.invoice_id = NEW.id and ii.artwork_id = a.id;
  elsif NEW.status = 'sent' or NEW.status = 'partial' then
    update public.artworks a
    set availability = 'Reserved', updated_at = now()
    from public.invoice_items ii
    where ii.invoice_id = NEW.id and ii.artwork_id = a.id;
  end if;
  return NEW;
end;
$$;
create trigger after_invoice_status_change
  after update of status on public.invoices
  for each row execute procedure public.update_artwork_availability();

-- ── STORAGE BUCKETS ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('artwork-images', 'artwork-images', true)
  on conflict do nothing;
insert into storage.buckets (id, name, public)
  values ('artist-portraits', 'artist-portraits', true)
  on conflict do nothing;
insert into storage.buckets (id, name, public)
  values ('archive-files', 'archive-files', true)
  on conflict do nothing;

create policy "Public read artwork images"
  on storage.objects for select using (bucket_id = 'artwork-images');
create policy "Staff upload artwork images"
  on storage.objects for insert with check (
    bucket_id = 'artwork-images' and
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );
create policy "Staff delete artwork images"
  on storage.objects for delete using (
    bucket_id = 'artwork-images' and
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );
create policy "Public read portraits"
  on storage.objects for select using (bucket_id = 'artist-portraits');
create policy "Staff upload portraits"
  on storage.objects for insert with check (
    bucket_id = 'artist-portraits' and
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );
create policy "Public read archive files"
  on storage.objects for select using (bucket_id = 'archive-files');
create policy "Staff upload archive files"
  on storage.objects for insert with check (
    bucket_id = 'archive-files' and
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
  );

-- ── INDEXES ─────────────────────────────────────────────────
create index idx_artworks_artist on public.artworks(artist_id);
create index idx_artworks_visible on public.artworks(visible);
create index idx_artworks_location on public.artworks(location);
create index idx_artworks_availability on public.artworks(availability);
create index idx_archive_artist on public.archive_entries(artist_id);
create index idx_archive_artwork on public.archive_entries(artwork_id);
create index idx_provenance_artwork on public.provenance_entries(artwork_id);
create index idx_invoices_client on public.invoices(client_id);
create index idx_invoices_status on public.invoices(status);
create index idx_invoice_items_invoice on public.invoice_items(invoice_id);
create index idx_payments_invoice on public.payments(invoice_id);
create index idx_certificates_artwork on public.certificates(artwork_id);

-- ── OWNERSHIP FIELDS (add to artworks) ──────────────────────
-- Run this as a separate migration if schema.sql already executed
alter table public.artworks
  add column if not exists ownership text not null default 'gallery'
    check (ownership in ('gallery','consignment')),
  add column if not exists consignment_price numeric(18,2),
  add column if not exists consignor_name text,
  add column if not exists consignor_contact text,
  add column if not exists commission_rate numeric(5,2) default 40;
  -- commission_rate: gallery's % cut on consignment sale (default 40%)

comment on column public.artworks.ownership is 'gallery = purchased by gallery; consignment = owner retains title';
comment on column public.artworks.consignment_price is 'Minimum price agreed with consignor (not shown publicly)';
comment on column public.artworks.consignor_name is 'Name of consigning owner';
comment on column public.artworks.consignor_contact is 'Contact details for consignor';
comment on column public.artworks.commission_rate is 'Gallery commission % on consignment sale';

-- ── OWNERSHIP ON INVOICE ITEMS ───────────────────────────────
alter table public.invoice_items
  add column if not exists ownership text default 'gallery',
  add column if not exists commission_rate numeric(5,2),
  add column if not exists consignor_name text;

comment on column public.invoice_items.ownership is 'Snapshot of artwork ownership at time of invoice';
comment on column public.invoice_items.commission_rate is 'Gallery commission % — null if gallery owned';
comment on column public.invoice_items.consignor_name is 'Consignor name — for payment reconciliation';
