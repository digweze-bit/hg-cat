-- Second phone number and second address for clients, filled where a client
-- has more than one. Invoices keep using the primary address.
-- Applied 2026-10-21.

alter table public.clients
  add column if not exists phone_2   text,
  add column if not exists street_2  text,
  add column if not exists city_2    text,
  add column if not exists state_2   text,
  add column if not exists country_2 text;
