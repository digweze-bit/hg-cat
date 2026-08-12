import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,120)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Update buildInvoiceHTML signature to accept bankAccount
mustReplace(
  'async function buildInvoiceHTML(inv, client, items, payments, logoB64) {',
  'async function buildInvoiceHTML(inv, client, items, payments, logoB64, bankAccount) {',
  '1. Add bankAccount param to buildInvoiceHTML'
)

// 2. Fix the bank reference inside the function to use the parameter
mustReplace(
  "const bank = bankAccounts.find(b => b.id === selectedBankId) || bankAccounts.find(b => b.is_default) || bankAccounts[0]",
  "const bank = bankAccount || null",
  '2. Use bankAccount param instead of outer scope'
)

// 3. Pass selectedBank from printInvoice call
mustReplace(
  "    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)\n    w.document.open()",
  "    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64, selectedBank)\n    w.document.open()",
  '3. Pass selectedBank in printInvoice'
)

// 4. Pass selectedBank from downloadInvoicePDF call
mustReplace(
  "    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)\n    // Render into hidden iframe",
  "    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64, selectedBank)\n    // Render into hidden iframe",
  '4. Pass selectedBank in downloadInvoicePDF'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
