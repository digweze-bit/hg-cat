import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Update InvoiceModal signature to accept bankAccounts
mustReplace(
  'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, onClose, onSave, editInvoice=null }) {',
  'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, bankAccounts = [], onClose, onSave, editInvoice=null }) {',
  '1. InvoiceModal signature'
)

// 2. Add bank_account_id to form init — find notes/terms in the edit form init
mustReplace(
  "    notes:           editInvoice?.notes || '',\n    terms:           editInvoice?.terms || '',",
  "    notes:           editInvoice?.notes || '',\n    terms:           editInvoice?.terms || '',\n    bank_account_id: editInvoice?.bank_account_id || (bankAccounts.find(b=>b.is_default)?.id) || '',",
  '2. bank_account_id in form init'
)

// 3. Add bank selector before Notes in the form UI
mustReplace(
  '            <div className="form-group">\n              <label className="form-label">Notes</label>\n              <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />\n            </div>\n\n            {/* Totals */}',
  `            <div className="form-group">
              <label className="form-label">Payment account</label>
              <select className="form-select" value={form.bank_account_id||''} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>
                <option value="">No bank details</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
            </div>

            {/* Totals */}`,
  '3. Bank selector UI'
)

// 4. Add bank_account_id to create payload
mustReplace(
  "        notes: form.notes, terms: form.terms,\n        status: 'draft',",
  "        notes: form.notes, terms: form.terms,\n        bank_account_id: form.bank_account_id || null,\n        status: 'draft',",
  '4. bank_account_id in create'
)

// 5. Add bank_account_id to update payload
mustReplace(
  '          notes: form.notes, terms: form.terms,\n        }).eq(\'id\', editInvoice.id)',
  "          notes: form.notes, terms: form.terms,\n          bank_account_id: form.bank_account_id || null,\n        }).eq('id', editInvoice.id)",
  '5. bank_account_id in update'
)

// 6. Pass bankAccounts to both InvoiceModal instances from parent
// New invoice modal
mustReplace(
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          onClose={() => setModal(null)}',
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          bankAccounts={bankAccounts}\n          onClose={() => setModal(null)}',
  '6a. Pass bankAccounts (new invoice)'
)

// Edit invoice modal - find by editInvoice={editingInvoice}
mustReplace(
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          editInvoice={editingInvoice}',
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          bankAccounts={bankAccounts}\n          editInvoice={editingInvoice}',
  '6b. Pass bankAccounts (edit invoice)'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
