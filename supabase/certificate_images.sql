-- ── CERTIFICATE IMAGES ──────────────────────────────────────
-- A certificate can use an image uploaded from the computer instead of the
-- linked artwork's image. The file lives in artwork-images/certificates/ and
-- its public URL is kept here so reprints show the same image.

alter table public.certificates
  add column if not exists image_url text;
