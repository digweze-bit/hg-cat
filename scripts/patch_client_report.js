/**
 * Adds client account report to Sales.jsx
 * Run: node scripts/patch_client_report.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let src = fs.readFileSync(file, 'utf8')

// 1. Add generateClientReport function before the ClientList component
const INJECT_BEFORE = 'function ClientList('

const REPORT_FN = `async function generateClientReport(client, invoices, logoB64, opts = {}) {
  const { dateFrom, dateTo, showOutstanding, showAll } = opts
  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  function fmt(n, cur) { return (cur && cur !== 'NGN' ? cur + ' ' : '\u20A6') + Number(n||0).toLocaleString('en-NG', {maximumFractionDigits:2}) }

  // Filter invoices
  let filtered = invoices.filter(i => i.client_id === client.id)
  if (dateFrom) filtered = filtered.filter(i => i.issue_date >= dateFrom)
  if (dateTo) filtered = filtered.filter(i => i.issue_date <= dateTo)
  if (showOutstanding && !showAll) filtered = filtered.filter(i => Number(i.balance_due) > 0)

  const totalInvoiced = filtered.reduce((s,i) => s + Number(i.total_ngn||i.total||0), 0)
  const totalPaid = filtered.reduce((s,i) => s + Number(i.amount_paid||0), 0)
  const totalOutstanding = filtered.reduce((s,i) => s + Number(i.balance_due||0), 0)

  const logoHtml = logoB64
    ? \`<img src='\${logoB64}' style='height:28px;object-fit:contain;display:block;'>\`
    : \`<div style='font-size:16px;font-weight:300;letter-spacing:.04em;'>HOURGLASS GALLERY</div>\`

  const periodLine = dateFrom || dateTo
    ? \`\${dateFrom || ''} to \${dateTo || new Date().toISOString().slice(0,10)}\`
    : 'All periods'

  const rows = filtered.map(inv => \`
    <tr>
      <td>\${e(inv.invoice_number)}</td>
      <td>\${e(inv.issue_date||'')}</td>
      <td>\${e(inv.status)}</td>
      <td style='text-align:right'>\${fmt(inv.total_ngn||inv.total, inv.currency)}</td>
      <td style='text-align:right;color:#2d6a4f'>\${fmt(inv.amount_paid, inv.currency)}</td>
      <td style='text-align:right;\${Number(inv.balance_due)>0?'color:#92600a;font-weight:600;':'color:#aaa;'}'>\${Number(inv.balance_due)>0 ? fmt(inv.balance_due, inv.currency) : 'NIL'}</td>
    </tr>\`).join('')

  const html = \`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Account Statement</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:36px 44px;max-width:640px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a1714;margin-bottom:24px;}
.summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e8e3db;border:1px solid #e8e3db;border-radius:4px;overflow:hidden;margin-bottom:28px;}
.stat{background:#fff;padding:14px 16px;}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:5px;}
.stat-value{font-size:18px;font-family:Georgia,serif;color:#1a1714;}
.stat-value.outstanding{color:#92600a;}
table{width:100%;border-collapse:collapse;}
th{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#999;padding:7px 8px;border-bottom:2px solid #1a1714;text-align:left;}
td{padding:9px 8px;border-bottom:1px solid #f0ece7;font-size:12px;vertical-align:top;}
.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e8e3db;font-size:10px;color:#999;line-height:1.8;}
@media print{@page{margin:10mm 12mm;size:A4 portrait;}body{padding:0;max-width:100%;}}
</style></head><body>
<div class="header">
  <div>\${logoHtml}</div>
  <div style='text-align:right'>
    <div style='font-size:11px;color:#999;margin-bottom:3px'>Account Statement</div>
    <div style='font-size:9px;color:#bbb'>\${e(periodLine)}</div>
  </div>
</div>

<div style='margin-bottom:20px'>
  <div style='font-weight:600;font-size:15px'>\${e(client.name)}</div>
  \${client.company ? \`<div style='font-size:12px;color:#666'>\${e(client.company)}</div>\` : ''}
  \${client.email ? \`<div style='font-size:12px;color:#999'>\${e(client.email)}</div>\` : ''}
</div>

<div class="summary">
  <div class="stat"><div class="stat-label">Total invoiced</div><div class="stat-value">\u20A6\${totalInvoiced.toLocaleString('en-NG',{maximumFractionDigits:0})}</div></div>
  <div class="stat"><div class="stat-label">Total paid</div><div class="stat-value">\u20A6\${totalPaid.toLocaleString('en-NG',{maximumFractionDigits:0})}</div></div>
  <div class="stat"><div class="stat-label">Outstanding</div><div class="stat-value outstanding">\u20A6\${totalOutstanding.toLocaleString('en-NG',{maximumFractionDigits:0})}</div></div>
</div>

<table>
  <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th style='text-align:right'>Amount</th><th style='text-align:right'>Paid</th><th style='text-align:right'>Balance</th></tr></thead>
  <tbody>\${rows}</tbody>
  <tfoot>
    <tr style='font-weight:600;border-top:2px solid #1a1714'>
      <td colspan='3'>Total</td>
      <td style='text-align:right'>\u20A6\${totalInvoiced.toLocaleString('en-NG',{maximumFractionDigits:0})}</td>
      <td style='text-align:right;color:#2d6a4f'>\u20A6\${totalPaid.toLocaleString('en-NG',{maximumFractionDigits:0})}</td>
      <td style='text-align:right;color:#92600a'>\u20A6\${totalOutstanding.toLocaleString('en-NG',{maximumFractionDigits:0})}</td>
    </tr>
  </tfoot>
</table>

<div class="footer">
  <div>Hourglass Gallery &middot; 298A Akin Olugbade Street, Victoria Island, Lagos</div>
  <div>info@hourglassgallery.com</div>
</div>
</body></html>\`

  const w = window.open('', '_blank', 'width=800,height=700')
  if (!w) { alert('Please allow popups'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 800)
}

`

src = src.replace(INJECT_BEFORE, REPORT_FN + INJECT_BEFORE)

// 2. Add Report button and period controls to client detail panel
// Find the Edit button line and add after it
src = src.replace(
  `              <button className="btn btn-outline btn-sm" onClick={() => openEdit(selected)}>Edit</button>`,
  `              <button className="btn btn-outline btn-sm" onClick={() => openEdit(selected)}>Edit</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowReport(r => !r)}>Account report</button>`
)

// 3. Add showReport state near selected state
src = src.replace(
  "  const [selected, setSelected] = useState(null)  // client being viewed/edited",
  "  const [selected, setSelected] = useState(null)  // client being viewed/edited\n  const [showReport, setShowReport] = useState(false)\n  const [reportOpts, setReportOpts] = useState({ dateFrom:'', dateTo:'', showAll:true })"
)

// 4. Add report panel after contact info card (before invoice history)
src = src.replace(
  "          {/* Invoice history */}",
  `          {/* Account Report */}
          {showReport && (
            <div className="card" style={{ padding:'16px 18px', marginBottom:14 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12 }}>Account Report</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', display:'block', marginBottom:3 }}>From</label>
                  <input type="date" className="form-input" style={{ width:150 }} value={reportOpts.dateFrom} onChange={e => setReportOpts(o=>({...o,dateFrom:e.target.value}))} />
                </div>
                <div>
                  <label style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', display:'block', marginBottom:3 }}>To</label>
                  <input type="date" className="form-input" style={{ width:150 }} value={reportOpts.dateTo} onChange={e => setReportOpts(o=>({...o,dateTo:e.target.value}))} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <input type="radio" checked={reportOpts.showAll} onChange={() => setReportOpts(o=>({...o,showAll:true}))} /> All invoices
                  </label>
                  <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <input type="radio" checked={!reportOpts.showAll} onChange={() => setReportOpts(o=>({...o,showAll:false}))} /> Outstanding only
                  </label>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  let logoB64 = null
                  try { const a = await import('../lib/assets'); logoB64 = a.LOGO_SMALL_B64 || a.LOGO_B64 } catch(_) {}
                  generateClientReport(selected, clientInvoices, logoB64, reportOpts)
                }}>Generate & Print</button>
                <button className="btn btn-outline btn-sm" onClick={async () => {
                  const url = \`https://wa.me/\${(selected.phone_mobile||selected.phone||'').replace(/\\D/g,'')}\`
                  window.open(url, '_blank')
                }}>WhatsApp</button>
              </div>
            </div>
          )}

          {/* Invoice history */}`
)

fs.writeFileSync(file, src, 'utf8')
console.log('Done')
console.log('generateClientReport found:', src.includes('generateClientReport'))
console.log('showReport found:', src.includes('showReport'))
