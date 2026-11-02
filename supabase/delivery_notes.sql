-- ── DELIVERY NOTES ──────────────────────────────────────────
-- A delivery note is a form (type 'delivery_note') recording artworks taken
-- to a client. Each artwork line is marked sold (must already be on one of
-- the client's invoices), loan (moves the work to Reserved / on loan) or
-- other (a manually described item not in the library).

alter table public.forms drop constraint if exists forms_type_check;
alter table public.forms add constraint forms_type_check check (type = any (array[
  'purchase_confirmation','consignment_agreement','condition_report',
  'loan_agreement','collection_receipt','catalogue','delivery_note'
]));

alter table public.forms
  add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.form_artworks
  add column if not exists delivery_type text
    check (delivery_type is null or delivery_type in ('sold','loan','other')),
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists invoice_number text;

comment on column public.form_artworks.delivery_type is 'Delivery notes only: sold | loan | other';
comment on column public.form_artworks.invoice_number is 'Delivery notes only: snapshot of the client invoice a sold work appears on';
