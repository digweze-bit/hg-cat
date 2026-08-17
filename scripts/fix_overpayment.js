import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('Credit')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Remove Math.max(0, ...) — allow negative balance_due on edit
mustReplace(
  "          balance_due: Math.max(0, total - Number(editInvoice.amount_paid||0)),",
  "          balance_due: total - Number(editInvoice.amount_paid||0),",
  '1. Allow negative balance on edit'
)

// 2. Invoice list — show negative balance as credit instead of "—"
mustReplace(
  "                  <td style={{ color: inv.balance_due > 0 ? 'var(--amber)' : 'var(--muted)', fontVariantNumeric:'tabular-nums' }}>\n                    {inv.balance_due > 0 ? formatAmount(inv.balance_due, inv.currency) : '\\u2014'}",
  "                  <td style={{ color: Number(inv.balance_due) > 0 ? 'var(--amber)' : Number(inv.balance_due) < 0 ? 'var(--green)' : 'var(--muted)', fontVariantNumeric:'tabular-nums' }}>\n                    {Number(inv.balance_due) > 0 ? formatAmount(inv.balance_due, inv.currency) : Number(inv.balance_due) < 0 ? `(${formatAmount(Math.abs(inv.balance_due), inv.currency)}) Credit` : '\\u2014'}",
  '2. Show credits in invoice list'
)

// 3. AR filter — include credits (negative balance) alongside outstanding
mustReplace(
  "  if (!showAll) filtered = filtered.filter(i => Number(i.balance_due) > 0)",
  "  if (!showAll) filtered = filtered.filter(i => Number(i.balance_due) !== 0)",
  '3. AR filter includes credits'
)

// 4. Invoice detail header — show credit for negative balance
mustReplace(
  "                <span style={{ color: Number(inv.balance_due) > 0 ? 'var(--amber)' : 'var(--green)' }}>\n                  {formatAmount(inv.balance_due, inv.currency)}",
  "                <span style={{ color: Number(inv.balance_due) > 0 ? 'var(--amber)' : 'var(--green)' }}>\n                  {Number(inv.balance_due) < 0 ? `(${formatAmount(Math.abs(inv.balance_due), inv.currency)}) Credit` : formatAmount(inv.balance_due, inv.currency)}",
  '4. Invoice detail credit display'
)

// 5. Print report — show credits for negative balance
mustReplace(
  "        <td style='text-align:right;${Number(inv.balance_due)>0?'color:#92600a;font-weight:600;':'color:#999",
  "        <td style='text-align:right;${Number(inv.balance_due)>0?'color:#92600a;font-weight:600;':Number(inv.balance_due)<0?'color:#2d6a4f;font-weight:600;':'color:#999",
  '5. Print report credit styling'
)

// 6. Print report balance text
mustReplace(
  "${Number(inv.balance_due)>0?'<tr><td style=\"padding:4px 6px;color:#92600a;font-weight:600\">",
  "${Number(inv.balance_due)!==0?'<tr><td style=\"padding:4px 6px;'+(Number(inv.balance_due)>0?'color:#92600a':'color:#2d6a4f')+';font-weight:600\">",
  '6. Print balance row visibility'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
