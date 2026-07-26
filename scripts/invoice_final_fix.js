import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// ── 1. Add detailKey state in Sales component (after modal state) ──
const stateAnchor = "  const [modal, setModal] = useState(null)"
if (!src.includes(stateAnchor)) { console.error('modal state anchor not found'); process.exit(1) }
src = src.replace(stateAnchor, stateAnchor + "\n  const [detailKey, setDetailKey] = useState(0)")

// ── 2. Fix onSave to increment detailKey (forces InvoiceDetail remount/re-fetch) ──
const oldOnSave = "onSave={load}"
// Find the InvoiceDetail one specifically — it appears right after userId={user?.id}
const detailIdx = src.indexOf('<InvoiceDetail')
if (detailIdx < 0) { console.error('InvoiceDetail not found'); process.exit(1) }
const detailSection = src.indexOf(oldOnSave, detailIdx)
if (detailSection < 0) { console.error('InvoiceDetail onSave not found'); process.exit(1) }
src = src.slice(0, detailSection) +
  'onSave={async () => { await load(); setDetailKey(k => k + 1) }}' +
  src.slice(detailSection + oldOnSave.length)

// ── 3. Add key={detailKey} to InvoiceDetail ──
src = src.replace('<InvoiceDetail\n', '<InvoiceDetail\n          key={detailKey}\n')

// ── 4. Fix printInvoice: open window FIRST, then do async work ──
const oldPrint = `  async function printInvoice() {
    let logoB64 = null
    try { const assets = await import('../lib/assets'); logoB64 = assets.LOGO_SMALL_B64 || assets.LOGO_B64 } catch(_) {}
    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Please allow popups for this site to print invoices'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 800)
  }`

if (!src.includes(oldPrint)) { console.error('printInvoice anchor not found'); process.exit(1) }

const newPrint = `  async function printInvoice() {
    if (!itemsLoaded) { alert('Invoice is still loading — please wait a moment and try again'); return }
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Please allow popups for this site to print invoices'); return }
    w.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#888">Preparing invoice\u2026</body></html>')
    w.document.close()
    let logoB64 = null
    try { const assets = await import('../lib/assets'); logoB64 = assets.LOGO_SMALL_B64 || assets.LOGO_B64 } catch(_) {}
    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 600)
  }`

src = src.replace(oldPrint, newPrint)

// ── 5. Add itemsLoaded state ──
const itemsStateAnchor = "  const [items, setItems] = useState([])"
if (!src.includes(itemsStateAnchor)) { console.error('items state anchor not found'); process.exit(1) }
src = src.replace(itemsStateAnchor, itemsStateAnchor + "\n  const [itemsLoaded, setItemsLoaded] = useState(false)")

// ── 6. Set itemsLoaded after fetch ──
const setItemsAnchor = "      setItems((it || []).map(item => ({ ...item, image_url: item.image_url || item.artworks?.image_url || null })))"
if (!src.includes(setItemsAnchor)) { console.error('setItems anchor not found'); process.exit(1) }
src = src.replace(setItemsAnchor, setItemsAnchor + "\n      setItemsLoaded(true)")

// ── 7. buildInvoiceHTML: reduce font sizes by 1pt and improve layout ──
const fnStart = src.indexOf('\nasync function buildInvoiceHTML(')
if (fnStart < 0) { console.error('buildInvoiceHTML not found'); process.exit(1) }
let fnEnd = src.length
const nextFn = src.indexOf('\nfunction ', fnStart + 20)
const nextAsync = src.indexOf('\nasync function ', fnStart + 20)
const cands = [nextFn, nextAsync].filter(x => x > 0)
if (cands.length) fnEnd = Math.min(...cands)

const before = src.slice(0, fnStart)
const after = fnEnd < src.length ? src.slice(fnEnd) : ''

const newFn = `
async function buildInvoiceHTML(inv, client, items, payments, logoB64) {
  const bal = Number(inv.balance_due||0)
  function e(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  // Fetch images as data URLs — required for html2canvas (Download PDF/WhatsApp path)
  // Use cache:no-store + timestamp to bypass any stale opaque service worker cache entries
  const itemsWithImages = await Promise.all(items.map(async it => {
    const imgSrc = it.thumbnail_url || it.image_url || it.cover_url
    if (!imgSrc) return it
    try {
      const url = imgSrc + (imgSrc.includes('?') ? '&' : '?') + '_t=' + Date.now()
      const resp = await fetch(url, { cache: 'no-store', mode: 'cors' })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const blob = await resp.blob()
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob) })
      return { ...it, _imgData: dataUrl }
    } catch(err) {
      console.warn('Could not embed image for', it.title, ':', err.message)
      return it
    }
  }))
  const logoHtml = logoB64
    ? \`<img src='\${logoB64}' style='height:28px;object-fit:contain;display:block;'>\`
    : \`<div style="font-size:15px;font-weight:300;letter-spacing:.04em">HOURGLASS GALLERY</div>\`
  return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>\${e(inv.invoice_number)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:32px 36px;max-width:600px;margin:0 auto;font-size:12px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a1714;margin-bottom:24px}
.inv-no{font-size:11px;color:#6b6760;font-family:Georgia,serif}
.status-badge{margin-top:5px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse}
td{padding:13px 8px;border-bottom:1px solid #ece8e1;vertical-align:middle}
.td-img{width:52px;padding:8px 8px 8px 0;vertical-align:middle}
.td-title{padding:9px 11px;vertical-align:middle}
.td-amt{text-align:right;white-space:nowrap;padding:9px 0;vertical-align:middle;font-size:12px}
.art-img{width:44px;height:44px;object-fit:cover;border-radius:2px;display:block}
.art-placeholder{width:44px;height:44px;background:#f0ece7;border-radius:2px}
.total-row td{font-weight:600;font-size:13px;border-top:2px solid #1a1714;border-bottom:none;padding-top:11px}
.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e8e3db;font-size:9px;color:#999;line-height:1.8}
@media print{@page{margin:0;size:A4 portrait}body{padding:20px 24px;max-width:100%}}
</style></head><body>
<div class="header">
  <div>\${logoHtml}</div>
  <div style="text-align:right">
    <div class="inv-no">\${e(inv.invoice_number)}</div>
    \${inv.issue_date?'<div style="font-size:9px;color:#aaa;margin-top:3px">Issued: '+e(inv.issue_date)+'</div>':''}
    \${inv.status==='paid'?'<div class="status-badge" style="color:#27ae60">Paid</div>':''}
    \${inv.status==='partial'?'<div class="status-badge" style="color:#b8862a">Partial payment</div>':''}
  </div>
</div>
\${client?\`<div style="margin-bottom:24px"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:#aaa;margin-bottom:5px">Invoice to</div><div style="font-weight:600;font-size:12px">\${e(client.name)}</div>\${client.company?\`<div style="font-size:11px;color:#6b6760">\${e(client.company)}</div>\`:''}\${client.email?\`<div style="font-size:11px;color:#6b6760">\${e(client.email)}</div>\`:''}\${client.phone||client.phone_mobile?\`<div style="font-size:11px;color:#6b6760">\${e(client.phone||client.phone_mobile)}</div>\`:''}</div>\`:''}
<table><tbody>
\${itemsWithImages.map(it=>\`<tr>
  <td class="td-img">\${it._imgData?\`<img src="\${it._imgData}" class="art-img" alt="">\`:'<div class="art-placeholder"></div>'}</td>
  <td class="td-title">
    <span style="font-weight:600;font-size:10px;color:#1a1714">\${e(it.title)}</span>
    \${it.artist_name?'<br><span style="font-size:11px;color:#1a1714">'+e(it.artist_name)+'</span>':''}
    \${it.year?'<br><span style="font-size:11px;color:#1a1714">'+e(it.year)+'</span>':''}
    \${it.medium?'<br><span style="font-size:11px;color:#1a1714">'+e(it.medium)+'</span>':''}
    \${it.dimensions?'<br><span style="font-size:11px;color:#1a1714">'+e(it.dimensions)+' '+(it.dimension_unit==='cm'?'cm':'in')+'</span>':''}
  </td>
  <td class="td-amt">\${formatAmount(it.line_total,inv.currency)}</td>
</tr>\`).join('')}
\${Number(inv.vat_amount)>0?\`<tr><td></td><td style="text-align:right;color:#6b6760;font-size:11px">VAT (\${inv.vat_rate}%)</td><td class="td-amt">\${formatAmount(inv.vat_amount,inv.currency)}</td></tr>\`:''}
<tr class="total-row"><td></td><td style="text-align:right">Total</td><td class="td-amt">\${formatAmount(inv.total,inv.currency)}</td></tr>
\${payments.length>0?\`<tr><td></td><td style="text-align:right;color:#2d6a4f;font-size:11px">Amount paid</td><td class="td-amt" style="color:#2d6a4f">\${formatAmount(inv.amount_paid,inv.currency)}</td></tr>\`:''}
\${bal>0?\`<tr><td></td><td style="text-align:right;font-weight:600">Balance due</td><td class="td-amt" style="font-weight:600;color:#92600a">\${formatAmount(bal,inv.currency)}</td></tr>\`:''}
</tbody></table>
\${inv.notes?\`<div style="margin-top:18px;font-size:11px;color:#6b6760;padding:10px 12px;background:#f8f7f5;border-radius:3px;">\${e(inv.notes)}</div>\`:''}
\${payments.length>0?\`<div style="margin-top:24px"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:#aaa;margin-bottom:8px">Payment history</div>\${payments.map(p=>\`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ece8e1;font-size:11px"><span style="color:#6b6760">\${e(p.method)}\${p.reference?' &middot; '+e(p.reference):''}</span><span>\${formatAmount(p.amount,p.currency)}</span></div>\`).join('')}</div>\`:''}
<div class="footer"><div>Hourglass Gallery</div><div>298A Akin Olugbade Street, Victoria Island, Lagos</div><div>info@hourglassgallery.com</div></div>
</body></html>\`
}
`

src = before + newFn + after
const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('All fixes applied cleanly on fresh base')
