import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('bankAccounts={bankAccounts}\n          onClose={onClose}\n          onSave')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Pass bankAccounts to both InvoiceModal instances
// First instance (new invoice)
mustReplace(
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          onClose',
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          bankAccounts={bankAccounts}\n          onClose',
  '1a. Pass bankAccounts to InvoiceModal (new)'
)

// Second instance (edit invoice) - find by editInvoice prop
mustReplace(
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          editInvoice',
  '        <InvoiceModal\n          clients={clients}\n          artworks={artworks}\n          artistMap={artistMap}\n          books={books}\n          rates={rates}\n          userId={user?.id}\n          bankAccounts={bankAccounts}\n          editInvoice',
  '1b. Pass bankAccounts to InvoiceModal (edit)'
)

// 2. Update InvoiceModal signature
mustReplace(
  'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, onClose, onSave, editInvoice=',
  'function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, bankAccounts = [], onClose, onSave, editInvoice=',
  '2. InvoiceModal signature'
)

// 3. Add bank_account_id to form state - find the form initialization
mustReplace(
  "  const [form, setForm] = useState({\n    client_id: editInvoice?.client_id || '',",
  "  const defaultBankId = (editInvoice?.bank_account_id) || (bankAccounts.find(b => b.is_default)?.id) || ''\n  const [form, setForm] = useState({\n    client_id: editInvoice?.client_id || '',",
  '3. Default bank ID'
)

// Find where notes/terms are in the form init
mustReplace(
  "    notes: editInvoice?.notes || '',\n    terms: editInvoice?.terms || '',",
  "    notes: editInvoice?.notes || '',\n    terms: editInvoice?.terms || '',\n    bank_account_id: defaultBankId,",
  '3b. bank_account_id in form'
)

// 4. Save bank_account_id in create payload
mustReplace(
  "        notes: form.notes, terms: form.terms,\n        status: 'draft',",
  "        notes: form.notes, terms: form.terms,\n        bank_account_id: form.bank_account_id || null,\n        status: 'draft',",
  '4. bank_account_id in create payload'
)

// 5. Save bank_account_id in update payload
mustReplace(
  "          notes: form.notes, terms: form.terms,\n        }).eq('id', editInvoice.id)",
  "          notes: form.notes, terms: form.terms,\n          bank_account_id: form.bank_account_id || null,\n        }).eq('id', editInvoice.id)",
  '5. bank_account_id in update payload'
)

// 6. Add bank selector UI in the invoice modal form - after VAT field
mustReplace(
  "            <div className=\"form-group\">\n              <label className=\"form-label\">Notes</label>\n              <textarea className=\"form-textarea\" rows={2} value={form.notes}",
  `            <div className="form-group">
              <label className="form-label">Payment account</label>
              <select className="form-select" value={form.bank_account_id} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>
                <option value="">No bank details</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" rows={2} value={form.notes}`,
  '6. Bank selector in modal form'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
