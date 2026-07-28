import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

const oldBlock = `    body = \`
      <div class="stat-row">
        <div class="stat"><div class="stat-n">\${receivableData.length}</div><div class="stat-l">Open invoices</div></div>
        <div class="stat"><div class="stat-n">{'\\u20A6'}\${totalReceivable.toLocaleString('en-NG',{maximumFractionDigits:0})}</div><div class="stat-l">Total outstanding</div></div>
        <div class="stat"><div class="stat-n">\${receivableData.filter(i=>i.status==='partial').length}</div><div class="stat-l">Partial payments</div></div>
      </div>
      <table>
        <thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance due</th><th>Currency</th><th>Status</th><th>Due date</th></tr></thead>
        <tbody>\${receivableData.map(inv=>{
          const overdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]
          return \`<tr><td>\${e(inv.invoice_number)}</td><td>\${e(inv.clients?.name||'\\u2014')}</td><td>\${formatAmount(inv.total,inv.currency)}</td><td style="color:#2d6a4f">\${formatAmount(inv.amount_paid||0,inv.currency)}</td><td style="color:\${overdue?'#8b1a1a':'#92600a'};font-weight:600">\${formatAmount(inv.balance_due,inv.currency)}\${overdue?' \\u26A0 OVERDUE':''}</td><td>\${e(inv.currency)}</td><td>\${e(inv.status)}</td><td style="color:\${overdue?'#8b1a1a':'inherit'}">\${e(inv.due_date||'\\u2014')}</td></tr>\`
        }).join('')}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right">Total outstanding</td><td style="color:#92600a">{'\\u20A6'}\${totalReceivable.toLocaleString('en-NG',{maximumFractionDigits:0})}</td><td colspan="3"></td></tr></tfoot>
      </table>\``

if (!src.includes(oldBlock)) { console.error('Receivable print block not found'); process.exit(1) }

const newBlock = `    body = (() => {
      const today = new Date().toISOString().split('T')[0]
      const groups = {}
      receivableData.forEach(inv => {
        const cur = inv.currency || 'NGN'
        if (!groups[cur]) groups[cur] = { currency: cur, total: 0, invoices: [] }
        groups[cur].total += Number(inv.balance_due || 0)
        groups[cur].invoices.push(inv)
      })
      const groupList = Object.values(groups).sort((a,b) => b.total - a.total)
      return \`
      <div class="stat-row">
        <div class="stat"><div class="stat-n">\${receivableData.length}</div><div class="stat-l">Open invoices</div></div>
        <div class="stat"><div class="stat-n">\${receivableData.filter(i=>i.status==='partial').length}</div><div class="stat-l">Partial payments</div></div>
      </div>
      \${groupList.map(g => \`
        <h3 style="margin:18px 0 8px;font-size:13px;font-weight:600;border-bottom:1px solid #ddd;padding-bottom:4px">\${e(g.currency)} \u2014 \${formatAmount(g.total, g.currency)} outstanding</h3>
        <table>
          <thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance due</th><th>Status</th><th>Due date</th></tr></thead>
          <tbody>\${g.invoices.map(inv => {
            const overdue = inv.due_date && inv.due_date < today
            return \`<tr><td>\${e(inv.invoice_number)}</td><td>\${e(inv.clients?.name||'\u2014')}</td><td>\${formatAmount(inv.total,inv.currency)}</td><td style="color:#2d6a4f">\${formatAmount(inv.amount_paid||0,inv.currency)}</td><td style="color:\${overdue?'#8b1a1a':'#92600a'};font-weight:600">\${formatAmount(inv.balance_due,inv.currency)}\${overdue?' \u26A0 OVERDUE':''}</td><td>\${e(inv.status)}</td><td style="color:\${overdue?'#8b1a1a':'inherit'}">\${e(inv.due_date||'\u2014')}</td></tr>\`
          }).join('')}</tbody>
          <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600">Subtotal</td><td style="color:#92600a;font-weight:600">\${formatAmount(g.total,g.currency)}</td><td colspan="2"></td></tr></tfoot>
        </table>
      \`).join('')}\`
    })()`

src = src.replace(oldBlock, newBlock)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Receivable print block updated with per-currency grouping')
