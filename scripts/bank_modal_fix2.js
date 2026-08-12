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

// 2. Add bank_account_id to edit form init
mustReplace(
  "    terms:          editInvoice.terms || '',\n    keep_currency:  editInvoice.keep_currency",
  "    terms:          editInvoice.terms || '',\n    bank_account_id: editInvoice.bank_account_id || (bankAccounts.find(b=>b.is_default)?.id) || '',\n    keep_currency:  editInvoice.keep_currency",
  '2a. bank_account_id in edit form'
)

// 2b. Add to new form init
mustReplace(
  "    due_date:'', notes:'', terms:'', keep_currency:false, fixed_rate:null,\n  })",
  "    due_date:'', notes:'', terms:'', bank_account_id: (bankAccounts.find(b=>b.is_default)?.id) || '', keep_currency:false, fixed_rate:null,\n  })",
  '2b. bank_account_id in new form'
)

// 3. Bank selector UI before Notes
mustReplace(
  "            <div className=\"form-group\">\n              <label className=\"form-label\">Notes</label>\n              <textarea className=\"form-textarea\" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />\n            </div>\n\n            {/* Totals */}",
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

// 4. bank_account_id in create payload
mustReplace(
  "        notes: form.notes, terms: form.terms,\n        status: 'draft',",
  "        notes: form.notes, terms: form.terms,\n        bank_account_id: form.bank_account_id || null,\n        status: 'draft',",
  '4. Create payload'
)

// 5. bank_account_id in update payload
mustReplace(
  "          notes: form.notes, terms: form.terms,\n        }).eq('id', editInvoice.id)",
  "          notes: form.notes, terms: form.terms,\n          bank_account_id: form.bank_account_id || null,\n        }).eq('id', editInvoice.id)",
  '5. Update payload'
)

// 6. Pass bankAccounts to InvoiceModal instances
mustReplace(
  '          userId={user?.id}\n          onClose={() => setModal(null)}',
  '          userId={user?.id}\n          bankAccounts={bankAccounts}\n          onClose={() => setModal(null)}',
  '6a. Pass bankAccounts (new)'
)

mustReplace(
  '          userId={user?.id}\n          editInvoice={editingInvoice}',
  '          userId={user?.id}\n          bankAccounts={bankAccounts}\n          editInvoice={editingInvoice}',
  '6b. Pass bankAccounts (edit)'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
