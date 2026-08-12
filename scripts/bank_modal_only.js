import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Print exact lines around InvoiceModal for debugging
const lines = src.split('\n')
const sigLine = lines.findIndex(l => l.includes('function InvoiceModal'))
console.log('InvoiceModal at line', sigLine + 1)
for (let i = sigLine; i < sigLine + 20; i++) console.log(`  ${i+1}: ${lines[i]}`)

// Find Notes textarea inside InvoiceModal
const notesLine = lines.findIndex((l, i) => i > sigLine && l.includes('form.notes') && l.includes('textarea'))
console.log('\nNotes textarea at line', notesLine + 1)
for (let i = notesLine - 2; i < notesLine + 3; i++) console.log(`  ${i+1}: ${lines[i]}`)

// Find create payload
const createLine = lines.findIndex((l, i) => i > sigLine && l.includes("status: 'draft'"))
console.log('\nCreate payload at line', createLine + 1)
for (let i = createLine - 3; i < createLine + 2; i++) console.log(`  ${i+1}: ${lines[i]}`)

// Find update payload  
const updateLine = lines.findIndex((l, i) => i > sigLine && l.includes("notes: form.notes, terms: form.terms,"))
console.log('\nUpdate payload at line', updateLine + 1)
for (let i = updateLine - 1; i < updateLine + 3; i++) console.log(`  ${i+1}: ${lines[i]}`)

// Now apply patches
console.log('\n--- Applying patches ---')

// 1. Signature
const oldSig = lines[sigLine]
if (oldSig.includes('bankAccounts')) {
  console.log('1. Signature already has bankAccounts')
} else {
  lines[sigLine] = oldSig.replace(
    'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, onClose, onSave, editInvoice=null }) {',
    'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, bankAccounts = [], onClose, onSave, editInvoice=null }) {'
  )
  console.log('OK: 1. Signature')
}

// 2a. Edit form init - find "terms:          editInvoice.terms"
const editTermsLine = lines.findIndex((l, i) => i > sigLine && l.includes("terms:") && l.includes("editInvoice.terms"))
if (editTermsLine >= 0 && !lines[editTermsLine + 1].includes('bank_account_id')) {
  lines.splice(editTermsLine + 1, 0, "    bank_account_id: editInvoice.bank_account_id || (bankAccounts.find(b=>b.is_default)?.id) || '',")
  console.log('OK: 2a. Edit form bank_account_id')
} else {
  console.log('SKIP: 2a. already there or not found')
}

// 2b. New form init - find the line with "notes:'', terms:''"
const newFormLine = lines.findIndex((l, i) => i > sigLine && l.includes("notes:'', terms:''"))
if (newFormLine >= 0 && !lines[newFormLine].includes('bank_account_id')) {
  lines[newFormLine] = lines[newFormLine].replace(
    "notes:'', terms:'',",
    "notes:'', terms:'', bank_account_id: (bankAccounts.find(b=>b.is_default)?.id) || '',"
  )
  console.log('OK: 2b. New form bank_account_id')
} else {
  console.log('SKIP: 2b. already there or not found')
}

// 3. Bank selector UI - insert before Notes textarea
const notesIdx = lines.findIndex((l, i) => i > sigLine && l.includes('form.notes') && l.includes('textarea'))
const notesDivIdx = notesIdx - 1 // the <div className="form-group"> before it
if (notesIdx >= 0 && !lines[notesIdx - 3]?.includes('Payment account')) {
  const bankUI = [
    '            <div className="form-group">',
    '              <label className="form-label">Payment account</label>',
    '              <select className="form-select" value={form.bank_account_id||\'\'} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>',
    '                <option value="">No bank details</option>',
    '                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}',
    '              </select>',
    '            </div>',
  ]
  lines.splice(notesDivIdx, 0, ...bankUI)
  console.log('OK: 3. Bank selector UI inserted')
} else {
  console.log('SKIP: 3. already there or not found')
}

// 4. Create payload - find status:'draft' and add bank_account_id before it
const createIdx = lines.findIndex((l, i) => i > sigLine && l.includes("status: 'draft'"))
if (createIdx >= 0 && !lines[createIdx - 1].includes('bank_account_id')) {
  lines.splice(createIdx, 0, "        bank_account_id: form.bank_account_id || null,")
  console.log('OK: 4. Create payload')
} else {
  console.log('SKIP: 4. already there or not found')
}

// 5. Update payload - find "notes: form.notes, terms: form.terms,"
const updateIdx = lines.findIndex((l, i) => i > sigLine && l.includes("notes: form.notes, terms: form.terms,"))
if (updateIdx >= 0) {
  const nextLine = lines[updateIdx + 1]
  if (!nextLine.includes('bank_account_id')) {
    lines.splice(updateIdx + 1, 0, "          bank_account_id: form.bank_account_id || null,")
    console.log('OK: 5. Update payload')
  } else {
    console.log('SKIP: 5. already there')
  }
} else {
  console.log('SKIP: 5. not found')
}

src = lines.join('\n')
const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('\nALL DONE')
