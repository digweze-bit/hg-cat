-- Client country stays blank unless someone enters it (was defaulting to 'Nigeria').
-- Run once in the Supabase SQL editor for project hg-cat.

alter table public.clients alter column country drop default;

-- Clear the defaulted 'Nigeria' from clients that have no other address details.
-- Applied 2026-10-13 (413 rows). The backup table was dropped afterwards.
create table public.clients_country_backup_20261013 as
  select id, country from public.clients
  where country = 'Nigeria'
    and coalesce(nullif(trim(street),''), nullif(trim(address),''), nullif(trim(suburb),''),
                 nullif(trim(city),''), nullif(trim(state),''), nullif(trim(postcode),'')) is null;
alter table public.clients_country_backup_20261013 enable row level security;

update public.clients c set country = null
  from public.clients_country_backup_20261013 b
  where c.id = b.id;
