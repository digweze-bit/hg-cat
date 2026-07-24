import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Find buildInvoiceHTML function start
const fnStart = src.indexOf('async function buildInvoiceHTML(')
if (fnStart < 0) { console.error('buildInvoiceHTML not found'); process.exit(1) }
console.log('Found buildInvoiceHTML at index', fnStart)

// Find where it ends (next top-level async function or export)
const fnEnd = src.indexOf('\nasync function ', fnStart + 10)
if (fnEnd < 0) { console.error('End of buildInvoiceHTML not found'); process.exit(1) }
console.log('Ends at index', fnEnd)

const newFn = `async function buildInvoiceHTML(inv, client, items, payments, logoB64) {
  const bal = Number(inv.balance_due||0)
  function e(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const itemsWithImages = await Promise.all(items.map(async it => {
    if (!it.image_url) return it
    try {
      const resp = await fetch(it.thumbnail_url || it.image_url)
      const blob = await resp.blob()
      const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
      return { ...it, _imgData: dataUrl }
    } catch(_) { return it }
  }))
  const logoHtml = logoB64
    ? \`<img src='\${logoB64}' alt='Hourglass Gallery' style='height:28px;object-fit:contain;object-position:left center;display:block;'>\`
    : \`<div style="font-size:16px;font-weight:300;letter-spacing:.04em;">HOURGLASS GALLERY</div>\`
  return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>\${e(inv.invoice_number)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:32px 36px;max-width:600px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a1714;margin-bottom:24px;}
.inv-no{font-size:12px;color:#6b6760;font-family:Georgia,serif;}
.status-badge{margin-top:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
table{width:100%;border-collapse:collapse;}
td{padding:10px 8px;border-bottom:1px solid #ece8e1;vertical-align:middle;}
.td-img{width:54px;padding:8px 8px 8px 0;}
.td-title{padding:10px 12px;}
.td-amt{text-align:right;white-space:nowrap;padding:10px 0;}
.art-img{width:46px;height:46px;object-fit:cover;border-radius:2px;display:block;}
.art-placeholder{width:46px;height:46px;background:#f0ece7;border-radius:2px;}
.total-row td{font-weight:600;font-size:14px;border-top:2px solid #1a1714;border-bottom:none;padding-top:12px;}
.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e8e3db;font-size:10px;color:#999;line-height:1.8;}
@media print{@page{margin:10mm 12mm;size:A4 portrait;}body{padding:0;max-width:100%;}}
</style></head><body>
<div class="header">
  <div>\${logoHtml}</div>
  <div style="text-align:right">
    <div class="inv-no">\${e(inv.invoice_number)}</div>
    \${inv.issue_date?'<div style="font-size:10px;color:#aaa;margin-top:3px">'+e(inv.issue_date)+'</div>':''}
    \${inv.status==='paid'?'<div class="status-badge" style="color:#27ae60">Paid</div>':''}
    \${inv.status==='partial'?'<div class="status-badge" style="color:#b8862a">Partial payment</div>':''}
  </div>
</div>
\${client?\`<div style="margin-bottom:24px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#aaa;margin-bottom:5px">Invoice to</div><div style="font-weight:600;font-size:13px">\${e(client.name)}</div>\${client.company?\`<div style="font-size:12px;color:#6b6760">\${e(client.company)}</div>\`:''}\${client.email?\`<div style="font-size:12px;color:#6b6760">\${e(client.email)}</div>\`:''}\${client.phone||client.phone_mobile?\`<div style="font-size:12px;color:#6b6760">\${e(client.phone||client.phone_mobile)}</div>\`:''}</div>\`:''}
<table>
  <tbody>
    \${itemsWithImages.map(it=>\`<tr>
      <td class="td-img">\${it._imgData?\`<img src="\${it._imgData}" class="art-img" alt="">\`:'<div class="art-placeholder"></div>'}</td>
      <td class="td-title">
        <em style="font-style:italic;font-size:13px;color:#1a1714">\${e(it.title)}</em>
        <br><span style="font-size:11px;color:#6b6760">\${e(it.artist_name||'')}\${it.year?', '+e(it.year):''}</span>
        \${it.medium?\`<br><span style="font-size:11px;color:#aaa">\${e(it.medium)}\${it.dimensions?' &middot; '+e(it.dimensions):''}</span>\`:''}
      </td>
      <td class="td-amt">\${formatAmount(it.line_total,inv.currency)}</td>
    </tr>\`).join('')}
    \${Number(inv.vat_amount)>0?\`<tr><td></td><td style="text-align:right;color:#6b6760;font-size:12px">VAT (\${inv.vat_rate}%)</td><td class="td-amt">\${formatAmount(inv.vat_amount,inv.currency)}</td></tr>\`:''}
    <tr class="total-row"><td></td><td style="text-align:right">Total</td><td class="td-amt">\${formatAmount(inv.total,inv.currency)}</td></tr>
    \${payments.length>0?\`<tr><td></td><td style="text-align:right;color:#2d6a4f;font-size:12px">Amount paid</td><td class="td-amt" style="color:#2d6a4f">\${formatAmount(inv.amount_paid,inv.currency)}</td></tr>\`:''}
    \${bal>0?\`<tr><td></td><td style="text-align:right;font-weight:600">Balance due</td><td class="td-amt" style="font-weight:600;color:#92600a">\${formatAmount(bal,inv.currency)}</td></tr>\`:''}
  </tbody>
</table>
\${inv.notes?\`<div style="margin-top:18px;font-size:12px;color:#6b6760;padding:10px 12px;background:#f8f7f5;border-radius:3px;">\${e(inv.notes)}</div>\`:''}
\${payments.length>0?\`<div style="margin-top:24px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#aaa;margin-bottom:8px">Payment history</div>\${payments.map(p=>\`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ece8e1;font-size:12px"><span style="color:#6b6760">\${e(p.method)}\${p.reference?' &middot; '+e(p.reference):''}</span><span style="white-space:nowrap;">\${formatAmount(p.amount,p.currency)}</span></div>\`).join('')}</div>\`:''}
<div class="footer">
  <div>Hourglass Gallery</div>
  <div>298A Akin Olugbade Street, Victoria Island, Lagos</div>
  <div>info@hourglassgallery.com</div>
</div>
</body></html>\`
}

`

src = src.slice(0, fnStart) + newFn + src.slice(fnEnd + 1)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('buildInvoiceHTML replaced successfully')
