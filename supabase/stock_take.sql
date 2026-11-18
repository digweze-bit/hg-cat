-- ── STOCK TAKE ──────────────────────────────────────────────
-- A stock take is a physical check of works HG Cat says are in stock.
-- Starting one snapshots every expected work (by artist, location or the
-- whole gallery) into stock_count_items. Staff then mark each one Seen,
-- Seen elsewhere, Off site or Not found, can photograph it, and can add works
-- they find that aren't in the list ("unrecorded"). Differences are resolved
-- one by one and the count is closed. Counts are cancelled rather than
-- deleted, so every past count stays on record.
--
-- Expected = availability Available, Reserved (out on loan) or NFS.

-- When a QR stock tag was last printed for a work (Tags tab).
alter table public.artworks add column if not exists tag_printed_at timestamptz;

create table if not exists public.stock_counts (
  id          uuid default gen_random_uuid() primary key,
  number      bigint generated always as identity,
  title       text not null,
  scope       text not null check (scope in ('artist','location','all')),
  artist_id   uuid references public.artists(id) on delete set null,
  location    text,
  status      text not null default 'counting'
                check (status in ('counting','review','closed','cancelled')),
  notes       text,
  started_by  uuid references auth.users(id) default auth.uid(),
  started_at  timestamptz default now(),
  finished_at timestamptz,          -- counting stopped, moved to review
  closed_at   timestamptz,
  closed_by   uuid references auth.users(id)
);
create index if not exists stock_counts_status_idx on public.stock_counts(status);

create table if not exists public.stock_count_items (
  id                    uuid default gen_random_uuid() primary key,
  count_id              uuid not null references public.stock_counts(id) on delete cascade,
  artwork_id            uuid references public.artworks(id) on delete set null,
  expected              boolean not null default true,   -- false = found but not on the list
  expected_location     text,
  expected_availability text,
  result                text not null default 'pending'
                          check (result in ('pending','seen','elsewhere','off_site','not_found','unrecorded')),
  found_location        text,       -- where it actually is (elsewhere / unrecorded)
  off_site_reason       text,       -- framer, client, on loan, exhibition…
  photo_url             text,
  note                  text,       -- e.g. description of an unrecorded work
  found_artist_id       uuid references public.artists(id) on delete set null, -- unrecorded work's artist
  checked_by            uuid references auth.users(id),
  checked_at            timestamptz,
  resolution            text check (resolution in ('updated','accepted','created','no_change')),
  resolution_note       text,
  resolved_by           uuid references auth.users(id),
  resolved_at           timestamptz,
  created_at            timestamptz default now()
);
create index if not exists stock_items_count_idx on public.stock_count_items(count_id);
create index if not exists stock_items_artwork_idx on public.stock_count_items(artwork_id);
create unique index if not exists stock_items_one_per_work
  on public.stock_count_items(count_id, artwork_id) where artwork_id is not null;

-- Start a count and snapshot the expected works in one step.
create or replace function public.stock_count_start(
  p_scope text, p_artist uuid default null, p_location text default null, p_notes text default null)
returns public.stock_counts language plpgsql security definer set search_path = public as $$
declare c public.stock_counts; t text;
begin
  if not public.hg_is_staff() then raise exception 'Not allowed'; end if;
  if p_scope = 'artist' and p_artist is null then raise exception 'Choose an artist'; end if;
  if p_scope = 'location' and nullif(trim(coalesce(p_location,'')),'') is null then raise exception 'Choose a location'; end if;

  t := case p_scope
         when 'artist' then (select name from public.artists where id = p_artist)
         when 'location' then trim(p_location)
         else 'Whole gallery' end;

  insert into public.stock_counts(title, scope, artist_id, location, notes)
  values (coalesce(t, 'Stock take'), p_scope,
          case when p_scope = 'artist' then p_artist end,
          case when p_scope = 'location' then trim(p_location) end,
          nullif(trim(coalesce(p_notes,'')),''))
  returning * into c;

  insert into public.stock_count_items(count_id, artwork_id, expected, expected_location, expected_availability)
  select c.id, w.id, true, w.location, w.availability
    from public.artworks w
   where w.availability in ('Available','Reserved','NFS')
     and (p_scope <> 'artist'   or w.artist_id = p_artist)
     and (p_scope <> 'location' or lower(trim(coalesce(w.location,''))) = lower(trim(p_location)));
  return c;
end $$;

-- ── RLS: approved staff only ────────────────────────────────
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;

drop policy if exists "Staff manage stock counts" on public.stock_counts;
create policy "Staff manage stock counts" on public.stock_counts for all to authenticated
  using (public.hg_is_staff()) with check (public.hg_is_staff());

drop policy if exists "Staff manage stock items" on public.stock_count_items;
create policy "Staff manage stock items" on public.stock_count_items for all to authenticated
  using (public.hg_is_staff()) with check (public.hg_is_staff());

revoke all on function public.stock_count_start(text, uuid, text, text) from public, anon;
grant execute on function public.stock_count_start(text, uuid, text, text) to authenticated;
