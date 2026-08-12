import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('bank_account_id: editInvoice')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Signature
mustReplace(
  'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, onClose, onSave, editInvoice=null }) {',
  'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, bankAccounts = [], onClose, onSave, editInvoice=null }) {',
  '1. Signature'
)

// 2a. Edit form init — after terms
mustReplace(
  "    terms:          editInvoice.terms || '',\n    keep_currency:",
  "    terms:          editInvoice.terms || '',\n    bank_account_id: editInvoice.bank_account_id || (bankAccounts.find(b=>b.is_default)?.id) || '',\n    keep_currency:",
  '2a. Edit form init'
)

// 2b. New form init
mustReplace(
  "    due_date:'', notes:'', terms:'', keep_currency:false, fixed_rate:null,",
  "    due_date:'', notes:'', terms:'', bank_account_id: (bankAccounts.find(b=>b.is_default)?.id) || '', keep_currency:false, fixed_rate:null,",
  '2b. New form init'
)

// 3. Create payload — after terms, before status
mustReplace(
  "        terms: form.terms,\n        status: 'draft',",
  "        terms: form.terms,\n        bank_account_id: form.bank_account_id || null,\n        status: 'draft',",
  '3. Create payload'
)

// 4. Update payload — after terms, before .eq
mustReplace(
  "          notes: form.notes, terms: form.terms,\n        }).eq('id', editInvoice.id)",
  "          notes: form.notes, terms: form.terms,\n          bank_account_id: form.bank_account_id || null,\n        }).eq('id', editInvoice.id)",
  '4. Update payload'
)

// 5. Bank selector UI — find Notes textarea in InvoiceModal
// Notes is in the right column (invoice settings), search for form.notes textarea near VAT
const notesAnchor = "            <div className=\"form-group\">\n              <label className=\"form-label\">Notes</label>\n              <textarea className=\"form-textarea\" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />\n            </div>"

if (!src.includes(notesAnchor)) {
  // Try single-line version
  const altNotes = '<div className="form-group">\n              <label className="form-label">Notes</label>\n              <textarea className="form-textarea" rows={2} value={form.notes}'
  const idx = src.indexOf(altNotes, src.indexOf('function InvoiceModal'))
  if (idx < 0) { console.error('NOT FOUND: Notes textarea in InvoiceModal'); process.exit(1) }
  src = src.slice(0, idx) + `<div className="form-group">
              <label className="form-label">Payment account</label>
              <select className="form-select" value={form.bank_account_id||''} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>
                <option value="">No bank details</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}
              </select>
            </div>
            ` + src.slice(idx)
  console.log('OK: 5. Bank selector UI (alt)')
} else {
  src = src.replace(notesAnchor, `<div className="form-group">
              <label className="form-label">Payment account</label>
              <select className="form-select" value={form.bank_account_id||''} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>
                <option value="">No bank details</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}
              </select>
            </div>
` + notesAnchor)
  console.log('OK: 5. Bank selector UI')
}

// 6a. Pass bankAccounts — new invoice modal
mustReplace(
  '          userId={user?.id}\n          onClose={() => setModal(null)}',
  '          userId={user?.id}\n          bankAccounts={bankAccounts}\n          onClose={() => setModal(null)}',
  '6a. Pass to new invoice'
)

// 6b. Pass bankAccounts — edit invoice modal
mustReplace(
  '          userId={user?.id}\n          editInvoice={editingInvoice}',
  '          userId={user?.id}\n          bankAccounts={bankAccounts}\n          editInvoice={editingInvoice}',
  '6b. Pass to edit invoice'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
