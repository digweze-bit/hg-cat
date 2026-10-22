-- ── CRM NOTICES ─────────────────────────────────────────────
-- An event notice (invite, opening, viewing) and the list of clients and
-- prospects it goes to. Each recipient row tracks whether the notice was
-- sent and whether they replied.

create table if not exists public.crm_notices (
  id          uuid default uuid_generate_v4() primary key,
  title       text not null,
  event_date  date,
  message     text not null default '',
  notes       text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.crm_notice_recipients (
  id           uuid default uuid_generate_v4() primary key,
  notice_id    uuid not null references public.crm_notices(id) on delete cascade,
  client_id    uuid references public.clients(id) on delete cascade,
  prospect_id  uuid references public.prospects(id) on delete cascade,
  name         text not null,
  phone        text,
  wa_opened_at timestamptz,
  sent         boolean not null default false,
  sent_at      timestamptz,
  replied      boolean not null default false,
  replied_at   timestamptz,
  note         text,
  created_at   timestamptz default now(),
  check (client_id is not null or prospect_id is not null)
);

create unique index if not exists crm_notice_recipients_client_uq
  on public.crm_notice_recipients(notice_id, client_id) where client_id is not null;
create unique index if not exists crm_notice_recipients_prospect_uq
  on public.crm_notice_recipients(notice_id, prospect_id) where prospect_id is not null;
create index if not exists crm_notice_recipients_notice_idx
  on public.crm_notice_recipients(notice_id);

alter table public.crm_notices enable row level security;
alter table public.crm_notice_recipients enable row level security;

create policy "Staff manage crm_notices"
  on public.crm_notices for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and approved = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and approved = true));

create policy "Staff manage crm_notice_recipients"
  on public.crm_notice_recipients for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and approved = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and approved = true));
