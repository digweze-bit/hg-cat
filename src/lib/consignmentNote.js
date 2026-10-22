// Consignment note — a printable record of works a consignor has left with
// the gallery: their details, each work with a thumbnail and the date it was
// consigned, and the terms of consignment with signature lines.

export const DEFAULT_CONSIGNMENT_TERMS = [
  'The consignor confirms they are the legal owner of the works listed, or are authorised by the owner to consign them, and that the works are free of any claim or lien.',
  'Title to the works remains with the consignor until a sale is completed. The gallery holds the works for sale on the consignor’s behalf.',
  'The gallery will not sell any work below the agreed consignment price without the consignor’s written approval.',
  'On sale, the gallery deducts its commission (or retains any amount above the agreed fixed net figure) and pays the balance to the consignor within 30 days of receiving full payment from the buyer.',
  'The works will be handled, stored and displayed with reasonable care while in the gallery’s custody.',
  'Either party may end this consignment with 30 days’ written notice. Unsold works will then be made available for collection by the consignor.',
  'Any change to these terms, prices or commission must be agreed in writing by both parties.',
]

const SYM = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' }
const SALE_TYPE = { primary: 'Primary sale', secondary: 'Secondary sale', both: 'Primary & secondary sale' }

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d)
  if (isNaN(dt)) return '—'
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// The date a work was consigned: the recorded date, else when it was added.
export function consignedOn(w) {
  return w.consignment_date || (w.created_at ? String(w.created_at).slice(0, 10) : null)
}

function workTerms(w, consignor) {
  const rate = w.commission_rate ?? consignor?.commission_rate
  if (Number(rate) === 0 || (rate == null && consignor?.term_type === 'fixed')) return 'Fixed net to consignor'
  return `${rate ?? 40}% gallery commission`
}

function termsSummary(consignor, works) {
  const lines = []
  if (consignor?.sale_type) lines.push(SALE_TYPE[consignor.sale_type] || consignor.sale_type)
  if (consignor?.term_type === 'fixed') {
    lines.push(consignor.fixed_amount
      ? `Fixed net amount to consignor: ₦${Number(consignor.fixed_amount).toLocaleString()}`
      : 'Fixed net amount to consignor, per work as listed above')
  } else {
    const rates = [...new Set(works.map(w => w.commission_rate ?? consignor?.commission_rate ?? 40).filter(r => Number(r) > 0))]
    if (rates.length === 1) lines.push(`Gallery commission ${rates[0]}% · consignor receives ${100 - Number(rates[0])}% of the sale price`)
    else if (rates.length > 1) lines.push('Gallery commission per work as listed above')
  }
  return lines
}

/**
 * Open a print window with a consignment note.
 * @param {object} p
 * @param {object} p.consignor  { name, type, email, phone, address, sale_type, term_type, commission_rate, fixed_amount }
 * @param {object[]} p.works    artworks (title, year, medium, dimensions, dimension_unit, image_url, thumbnail_url,
 *                              hg_code, consignment_price, consignment_currency, commission_rate, consignment_date, created_at, artist_name)
 * @param {string[]} [p.terms]  numbered terms; defaults to DEFAULT_CONSIGNMENT_TERMS
 * @param {Window} [p.win]      a window already opened by the caller (when it awaits before calling)
 */
export async function printConsignmentNote({ consignor, works, terms = DEFAULT_CONSIGNMENT_TERMS, win }) {
  // Open the window inside the click so popup blockers allow it
  const w = win || window.open('', '_blank', 'width=900,height=750')
  if (!w) { alert('Please allow popups to print the consignment note'); return }

  let logo = ''
  try { const a = await import('./assets'); logo = a.LOGO_SMALL_B64 || a.LOGO_B64 || '' } catch { /* text header below */ }

  const today = new Date()
  const issued = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const ref = 'CN-' + today.toISOString().slice(0, 10).replace(/-/g, '') + '-' +
    (consignor?.name || 'X').split(/\s+/).map(s => s[0]).join('').toUpperCase().slice(0, 4)

  const rows = works.map((a, i) => {
    const img = a.thumbnail_url || a.image_url
    const dims = a.dimensions ? `${a.dimensions} ${a.dimension_unit === 'cm' ? 'cm' : 'in'}` : ''
    const price = a.consignment_price
      ? `${SYM[a.consignment_currency || 'NGN'] || '₦'}${Number(a.consignment_price).toLocaleString()}`
      : '—'
    return `<tr>
      <td class="n">${i + 1}</td>
      <td class="t">${img ? `<img src="${esc(img)}" alt="">` : '<div class="ph"></div>'}</td>
      <td><strong><em>${esc(a.title || 'Untitled')}</em></strong>${a.year ? `, ${esc(a.year)}` : ''}
        ${a.artist_name ? `<div class="sub">${esc(a.artist_name)}</div>` : ''}
        ${[a.medium, dims].filter(Boolean).length ? `<div class="sub">${esc([a.medium, dims].filter(Boolean).join(' · '))}</div>` : ''}
        ${a.hg_code ? `<div class="sub muted">${esc(a.hg_code)}</div>` : ''}</td>
      <td>${fmtDate(consignedOn(a))}</td>
      <td class="r">${price}</td>
      <td>${esc(workTerms(a, consignor))}</td>
    </tr>`
  }).join('')

  const contact = [consignor?.address, consignor?.email, consignor?.phone].filter(Boolean)
  const summary = termsSummary(consignor, works)

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Consignment Note — ${esc(consignor?.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:36px 44px;max-width:780px;margin:0 auto;font-size:12px;line-height:1.45;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #1a1714;margin-bottom:22px;}
.doc{font-family:Georgia,serif;font-size:22px;font-weight:400;}
.lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:4px;}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px;}
.parties .name{font-weight:600;font-size:14px;}
.parties div div{color:#6b6760;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
th{padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:2px solid #1a1714;background:#f0ece4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
td{padding:8px;border-bottom:1px solid #ece8e1;vertical-align:middle;}
tr{page-break-inside:avoid;}
td.n{width:22px;color:#999;} td.r,th.r{text-align:right;white-space:nowrap;}
td.t{width:66px;} td.t img,td.t .ph{width:56px;height:56px;object-fit:cover;border-radius:2px;display:block;background:#f0ece4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.sub{font-size:11px;color:#6b6760;} .muted{color:#aaa;}
h3{font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 8px;}
.summary{background:#f9f8f6;padding:10px 12px;border-radius:3px;margin-bottom:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
ol{padding-left:18px;color:#3a3732;} ol li{margin-bottom:5px;}
.terms{page-break-inside:avoid;}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;page-break-inside:avoid;}
.sig{border-top:1px solid #1a1714;padding-top:6px;font-size:11px;}
.sig .s{color:#999;font-size:10px;margin-top:14px;}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e8e3db;font-size:9px;color:#999;text-align:center;}
@media print{@page{margin:14mm;size:A4 portrait;}body{padding:0;max-width:100%;}}
</style></head><body>
<div class="header">
  <div>${logo ? `<img src="${logo}" style="height:30px;object-fit:contain;display:block">` : '<div style="font-size:16px;letter-spacing:.04em">HOURGLASS GALLERY</div>'}</div>
  <div style="text-align:right">
    <div class="doc">Consignment Note</div>
    <div class="sub">Ref ${esc(ref)} · Issued ${issued}</div>
  </div>
</div>

<div class="parties">
  <div>
    <div class="lbl">Consignor</div>
    <div class="name">${esc(consignor?.name || '—')}</div>
    ${consignor?.type ? `<div>${esc(consignor.type)}</div>` : ''}
    ${contact.map(c => `<div>${esc(c)}</div>`).join('')}
  </div>
  <div>
    <div class="lbl">Consignee</div>
    <div class="name">Hourglass Gallery</div>
    <div>298C Akin Olugbade Street, Victoria Island, Lagos</div>
    <div>info@hourglassgallery.com</div>
  </div>
</div>

<div class="lbl">Works on consignment (${works.length})</div>
<table>
  <thead><tr><th>#</th><th></th><th>Work</th><th>Date consigned</th><th class="r">Agreed price</th><th>Terms</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="terms">
  <h3>Terms of consignment</h3>
  ${summary.length ? `<div class="summary">${summary.map(esc).join('<br>')}</div>` : ''}
  <ol>${terms.filter(t => t && t.trim()).map(t => `<li>${esc(t.trim())}</li>`).join('')}</ol>
</div>

<div class="sigs">
  <div class="sig">Consignor: ${esc(consignor?.name || '')}<div class="s">Signature &amp; date</div></div>
  <div class="sig">For Hourglass Gallery<div class="s">Signature &amp; date</div></div>
</div>

<div class="footer">Hourglass Gallery · 298C Akin Olugbade Street, Victoria Island, Lagos · info@hourglassgallery.com</div>
</body></html>`

  w.document.open(); w.document.write(html); w.document.close()

  // Hold the print dialog until thumbnails load, so they aren't blank boxes
  const deadline = Date.now() + 8000
  const ready = () => Array.from(w.document.images || []).every(i => i.complete) || Date.now() > deadline
  const waitThenPrint = () => ready() ? (w.focus(), w.print()) : setTimeout(waitThenPrint, 200)
  setTimeout(waitThenPrint, 300)
}
