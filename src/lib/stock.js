import QRCode from 'qrcode'
import { supabase } from './supabase'

// Shared by Artworks and Stock take so a work's location is picked from one
// list rather than typed. Plain "Storage" is legacy: works still carrying it
// need sorting into Storage 1 or Storage 2.
export const LOCATIONS = ['Main Gallery', 'Miniature Room', 'Storage 1', 'Storage 2', 'Safecourt']
// Still offered when choosing what to count or tag, so the unsorted works can be found.
export const LEGACY_LOCATIONS = ['Storage']

// Why a work is not on the premises.
export const OFF_SITE_REASONS = ['On loan', 'Framer', 'With client (approval)', 'Exhibition / art fair', 'Artist studio', 'Consignor collected', 'Other']

export const RESULT = {
  pending:    { label: 'Not checked',  badge: 'badge-gray' },
  seen:       { label: 'Seen',         badge: 'badge-green' },
  elsewhere:  { label: 'Seen elsewhere', badge: 'badge-amber' },
  off_site:   { label: 'Off site',     badge: 'badge-blue' },
  not_found:  { label: 'Not found',    badge: 'badge-red' },
  unrecorded: { label: 'Found, not on list', badge: 'badge-amber' },
}

export const COUNT_STATUS = {
  counting:  { label: 'Counting',  badge: 'badge-blue' },
  review:    { label: 'Resolving differences', badge: 'badge-amber' },
  closed:    { label: 'Closed',    badge: 'badge-green' },
  cancelled: { label: 'Cancelled', badge: 'badge-gray' },
}

// A checked item that needs someone to look at it before the count closes.
// Off site is only a problem when HG Cat doesn't already show the work as out
// on loan (Reserved).
export function isProblem(item) {
  if (['elsewhere', 'not_found', 'unrecorded'].includes(item.result)) return true
  if (item.result === 'off_site') return !(item.expected_availability === 'Reserved' && item.off_site_reason === 'On loan')
  return false
}

export const ARTWORK_FIELDS = 'id,title,hg_code,artist_id,year,medium,dimensions,dimension_unit,image_url,thumbnail_url,location,availability,loaned_to,tag_printed_at'

// Supabase caps a select at 1000 rows; a whole-gallery count is ~2,400.
export async function selectAll(build) {
  const PAGE = 1000
  let all = [], from = 0
  for (;;) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) return all
    from += PAGE
  }
}

export function sizeText(w) {
  if (!w?.dimensions) return ''
  return `${w.dimensions} ${w.dimension_unit === 'cm' ? 'cm' : 'in'}`
}

function resize(file, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not read photo')), 'image/jpeg', 0.85)
    }
    img.onerror = () => reject(new Error('Could not read photo'))
    img.src = URL.createObjectURL(file)
  })
}

// Uploads a stock-take photo at display size plus a thumbnail and full size,
// so it can later become the artwork's catalogue image unchanged.
export async function uploadStockPhoto(file, countId) {
  const base = `stock-take/${countId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const [display, thumb, full] = await Promise.all([resize(file, 600), resize(file, 150), resize(file, 1600)])
  const bucket = supabase.storage.from('artwork-images')
  const res = await Promise.all([
    bucket.upload(`${base}_display.jpg`, display, { contentType: 'image/jpeg' }),
    bucket.upload(`${base}_thumb.jpg`, thumb, { contentType: 'image/jpeg' }),
    bucket.upload(`${base}_full.jpg`, full, { contentType: 'image/jpeg' }),
  ])
  const failed = res.find(r => r.error)
  if (failed) throw failed.error
  return bucket.getPublicUrl(`${base}_display.jpg`).data.publicUrl
}

export const photoVariants = url => ({
  image_url: url,
  thumbnail_url: url.replace(/_display\.jpg$/, '_thumb.jpg'),
  full_image_url: url.replace(/_display\.jpg$/, '_full.jpg'),
})

// The URL a stock tag's QR code opens. Short, so the code stays small and
// easy to scan; /t/:id forwards to the scan page.
export const tagUrl = id => `${window.location.origin}/t/${id}`

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A4 sheet of 24 tags (3 × 8, 63.5 × 33.9 mm — Avery L7159 / J8159 layout),
// meant for the back of each work. `skip` leaves that many labels blank at the
// start so a part-used sheet can go back through the printer. `win` must be
// opened synchronously in the click handler, or pop-up blockers stop it.
export function openPrintWindow() {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (win) win.document.write('<p style="font-family:sans-serif;padding:24px">Preparing tags…</p>')
  return win
}

export async function printTags(win, works, artistName, { skip = 0 } = {}) {
  const tags = await Promise.all(works.map(async w => ({
    w, qr: await QRCode.toDataURL(tagUrl(w.id), { margin: 0, width: 240, errorCorrectionLevel: 'M' }),
  })))
  const cells = [...Array(skip).fill('<div class="tag"></div>'), ...tags.map(({ w, qr }) => `
    <div class="tag">
      <img class="qr" src="${qr}" alt="">
      <div class="txt">
        <div class="brand">Hourglass Gallery</div>
        <div class="code">${esc(w.hg_code || '—')}</div>
        <div class="artist">${esc(artistName(w.artist_id))}</div>
        <div class="title">${esc(w.title)}</div>
        <div class="meta">${esc([w.year, sizeText(w)].filter(Boolean).join(' · '))}</div>
      </div>
    </div>`)]
  const pages = []
  for (let i = 0; i < cells.length; i += 24) pages.push(`<div class="sheet">${cells.slice(i, i + 24).join('')}</div>`)

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock tags (${works.length})</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;color:#1a1714}
.sheet{width:210mm;height:297mm;padding:13.1mm 7.2mm 0;display:grid;grid-template-columns:repeat(3,63.5mm);grid-auto-rows:33.9mm;column-gap:2.5mm;page-break-after:always}
.sheet:last-child{page-break-after:auto}
.tag{display:flex;align-items:center;gap:2.5mm;padding:2.5mm 3mm;overflow:hidden}
.qr{width:26mm;height:26mm;flex-shrink:0}
.txt{min-width:0;line-height:1.2}
.brand{font-size:5.5pt;letter-spacing:.12em;text-transform:uppercase;color:#6b6760}
.code{font-size:11pt;font-weight:700;margin:.6mm 0}
.artist{font-size:7pt;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.title{font-size:7pt;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{font-size:6pt;color:#6b6760;margin-top:.5mm}
@media screen{body{background:#e9e6e0}.sheet{background:#fff;margin:12px auto;box-shadow:0 2px 10px rgba(0,0,0,.15)}.tag{outline:1px dashed #ddd}}
</style></head><body>${pages.join('')}</body></html>`

  if (!win || win.closed) throw new Error('Allow pop-ups to print tags')
  win.document.open()
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 600)
}
