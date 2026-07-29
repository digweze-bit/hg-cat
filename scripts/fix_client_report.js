import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// ── 1. Replace generateClientReport function ──
const fnStart = src.indexOf('\nasync function generateClientReport(')
if (fnStart < 0) { console.error('generateClientReport not found'); process.exit(1) }

// Find end of function — next top-level function or export
let fnEnd = src.indexOf('\nfunction ', fnStart + 20)
const nextAsync = src.indexOf('\nasync function ', fnStart + 20)
const nextExport = src.indexOf('\nexport ', fnStart + 20)
const cands = [fnEnd, nextAsync, nextExport].filter(x => x > 0)
fnEnd = Math.min(...cands)

const newFn = `
async function generateClientReport(client, invoices, logoB64, opts = {}, invoiceItems = []) {
  const { dateFrom, dateTo, showAll, attachInvoices } = opts
  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  function fmt(n, cur) { return (cur && cur !== 'NGN' ? cur + ' ' : '\\u20A6') + Number(n||0).toLocaleString('en-NG', {maximumFractionDigits:2}) }

  // Filter invoices for this client
  let filtered = invoices.filter(i => i.client_id === client.id)
  if (dateFrom) filtered = filtered.filter(i => i.issue_date >= dateFrom)
  if (dateTo) filtered = filtered.filter(i => i.issue_date <= dateTo)
  if (!showAll) filtered = filtered.filter(i => Number(i.balance_due) > 0)

  // Group by currency
  const byCurrency = {}
  filtered.forEach(inv => {
    const cur = inv.currency || 'NGN'
    if (!byCurrency[cur]) byCurrency[cur] = []
    byCurrency[cur].push(inv)
  })

  const logoHtml = logoB64
    ? \`<img src='\${logoB64}' style='height:28px;object-fit:contain;display:block;'>\`
    : \`<div style='font-size:16px;font-weight:300;letter-spacing:.04em;'>HOURGLASS GALLERY</div>\`

  const periodLine = dateFrom || dateTo
    ? \`\${dateFrom || ''} to \${dateTo || new Date().toISOString().slice(0,10)}\`
    : 'All periods'

  const currencyBlocks = Object.entries(byCurrency).map(([cur, invs]) => {
    const total = invs.reduce((s,i) => s + Number(i.total||0), 0)
    const paid = invs.reduce((s,i) => s + Number(i.amount_paid||0), 0)
    const outstanding = invs.reduce((s,i) => s + Number(i.balance_due||0), 0)
    const rows = invs.map(inv => \`
      <tr>
        <td>\${e(inv.invoice_number)}</td>
        <td>\${e(inv.issue_date||'')}</td>
        <td>\${e(inv.status)}</td>
        <td style='text-align:right'>\${fmt(inv.total, cur)}</td>
        <td style='text-align:right;color:#2d6a4f'>\${fmt(inv.amount_paid, cur)}</td>
        <td style='text-align:right;\${Number(inv.balance_due)>0?'color:#92600a;font-weight:600;':'color:#aaa;'}'>\${Number(inv.balance_due)>0 ? fmt(inv.balance_due, cur) : 'NIL'}</td>
      </tr>\`).join('')

    return \`
      <div style='margin-bottom:32px'>
        <div style='font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:8px'>\${cur} Account</div>
        <div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e8e3db;border:1px solid #e8e3db;border-radius:4px;overflow:hidden;margin-bottom:16px'>
          <div style='background:#fff;padding:12px 14px'><div style='font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:4px'>Total invoiced</div><div style='font-size:16px;font-family:Georgia,serif'>\${fmt(total,cur)}</div></div>
          <div style='background:#fff;padding:12px 14px'><div style='font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:4px'>Amount paid</div><div style='font-size:16px;font-family:Georgia,serif;color:#2d6a4f'>\${fmt(paid,cur)}</div></div>
          <div style='background:#fff;padding:12px 14px'><div style='font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:4px'>Outstanding</div><div style='font-size:16px;font-family:Georgia,serif;color:#92600a'>\${fmt(outstanding,cur)}</div></div>
        </div>
        <table style='width:100%;border-collapse:collapse;font-size:12px'>
          <thead><tr style='border-bottom:2px solid #1a1714'>
            <th style='text-align:left;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em'>Invoice</th>
            <th style='text-align:left;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em'>Date</th>
            <th style='text-align:left;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em'>Status</th>
            <th style='text-align:right;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em'>Total</th>
            <th style='text-align:right;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em'>Paid</th>
            <th style='text-align:right;padding:8px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em'>Balance</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>\`
  }).join('')

  // Invoice copies if requested
  let invoiceCopies = ''
  if (attachInvoices && filtered.length > 0) {
    invoiceCopies = filtered.map(inv => {
      const items = invoiceItems.filter(it => it.invoice_id === inv.id)
      const itemRows = items.map(it => \`
        <tr>
          <td style='padding:8px 6px'><strong>\${e(it.title)}</strong>\${it.artist_name ? '<br><span style="color:#6b6760;font-size:11px">'+e(it.artist_name)+'</span>' : ''}</td>
          <td style='text-align:right;padding:8px 6px'>\${fmt(it.line_total, inv.currency)}</td>
        </tr>\`).join('')
      return \`
        <div style='page-break-before:always;padding-top:36px'>
          <div style='font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:4px'>Invoice copy</div>
          <div style='display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #1a1714;margin-bottom:18px'>
            <div style='font-weight:600;font-size:14px'>\${e(inv.invoice_number)}</div>
            <div style='text-align:right;font-size:11px;color:#6b6760'>\${e(inv.issue_date||'')} &bull; \${e(inv.status)}</div>
          </div>
          <table style='width:100%;border-collapse:collapse;font-size:12px'>
            <thead><tr style='border-bottom:1px solid #e8e3db'>
              <th style='text-align:left;padding:6px'>Item</th>
              <th style='text-align:right;padding:6px'>Amount</th>
            </tr></thead>
            <tbody>\${itemRows}</tbody>
            <tfoot>
              <tr><td colspan='2' style='border-top:2px solid #1a1714;padding-top:8px'></td></tr>
              <tr><td style='padding:4px 6px;font-weight:600'>Total</td><td style='text-align:right;padding:4px 6px;font-weight:600'>\${fmt(inv.total, inv.currency)}</td></tr>
              <tr><td style='padding:4px 6px;color:#2d6a4f'>Paid</td><td style='text-align:right;padding:4px 6px;color:#2d6a4f'>\${fmt(inv.amount_paid, inv.currency)}</td></tr>
              \${Number(inv.balance_due)>0?'<tr><td style="padding:4px 6px;color:#92600a;font-weight:600">Balance due</td><td style="text-align:right;padding:4px 6px;color:#92600a;font-weight:600">'+fmt(inv.balance_due, inv.currency)+'</td></tr>':''}
            </tfoot>
          </table>
        </div>\`
    }).join('')
  }

  const html = \`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Account Statement — \${e(client.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:36px 44px;max-width:640px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a1714;margin-bottom:24px;}
@media print{@page{margin:15mm;size:A4 portrait;}body{padding:0;max-width:100%}}
</style></head><body>
<div class='header'>
  <div>\${logoHtml}</div>
  <div style='text-align:right'>
    <div style='font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:3px'>Account Statement</div>
    <div style='font-size:11px;color:#6b6760'>\${periodLine}</div>
    \${!showAll?'<div style="font-size:10px;color:#92600a;margin-top:3px;font-weight:600">Outstanding balances only</div>':''}
  </div>
</div>
<div style='margin-bottom:24px'>
  <div style='font-weight:600;font-size:15px'>\${e(client.name)}</div>
  \${client.company?'<div style="font-size:12px;color:#6b6760">'+e(client.company)+'</div>':''}
  \${client.email?'<div style="font-size:12px;color:#6b6760">'+e(client.email)+'</div>':''}
</div>
\${filtered.length === 0
  ? '<div style="padding:32px;text-align:center;color:#999;border:1px dashed #ddd;border-radius:4px">No invoices found for the selected period and filters.</div>'
  : currencyBlocks}
\${invoiceCopies}
<div style='margin-top:36px;padding-top:14px;border-top:1px solid #e8e3db;font-size:9px;color:#999;line-height:1.8'>
  <div>Hourglass Gallery</div>
  <div>298A Akin Olugbade Street, Victoria Island, Lagos</div>
  <div>info@hourglassgallery.com</div>
  <div style='margin-top:4px'>Generated: \${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
</div>
</body></html>\`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) { alert('Allow popups to generate reports'); return }
  w.document.open(); w.document.write(html); w.document.close()
  w.focus(); setTimeout(() => w.print(), 600)
}

`

src = src.slice(0, fnStart) + newFn + src.slice(fnEnd)

// ── 2. Update the Generate button to pass attachInvoices and invoiceItems ──
src = src.replace(
  "                  generateClientReport(selected, clientInvoices, logoB64, reportOpts)",
  "                  generateClientReport(selected, clientInvoices, logoB64, reportOpts, await supabase.from('invoice_items').select('*').in('invoice_id', clientInvoices.filter(i=>i.client_id===selected.id).map(i=>i.id)).then(r=>r.data||[]))"
)

// ── 3. Add attachInvoices toggle to report options UI ──
src = src.replace(
  "                  <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>\n                     <input type=\"radio\" checked={!reportOpts.showAll} onChange={() => setReportOpts(o=>({...o,showAll:false}))} /> Outstanding only\n                   </label>",
  "                  <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>\n                     <input type=\"radio\" checked={!reportOpts.showAll} onChange={() => setReportOpts(o=>({...o,showAll:false}))} /> Outstanding only\n                   </label>"
)

// Add attachInvoices checkbox after the radio buttons div
src = src.replace(
  "              <div style={{ display:'flex', gap:8 }}>\n                <button className=\"btn btn-primary btn-sm\" onClick={async () => {",
  `              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                  <input type="checkbox" checked={reportOpts.attachInvoices||false} onChange={e=>setReportOpts(o=>({...o,attachInvoices:e.target.checked}))} />
                  Attach copies of invoices to report
                </label>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {`
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Client report rewritten: per-currency grouping, attach invoices option')
