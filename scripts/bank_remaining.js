import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('changeBankAccount')) { console.log('Already fully patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 4. Update InvoiceDetail signature
mustReplace(
  'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit }) {',
  'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit, bankAccounts = [] }) {',
  '4. InvoiceDetail signature'
)

// 5. Add bank state after payForm
mustReplace(
  "  const [payForm, setPayForm] = useState({ amount:'', currency: inv.currency, method:'transfer', paid_at: new Date().toISOString().split('T')[0], reference:'', notes:'' })",
  `  const [payForm, setPayForm] = useState({ amount:'', currency: inv.currency, method:'transfer', paid_at: new Date().toISOString().split('T')[0], reference:'', notes:'' })
  const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]
  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || '')
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank
  async function changeBankAccount(id) {
    setSelectedBankId(id)
    await supabase.from('invoices').update({ bank_account_id: id || null }).eq('id', inv.id)
  }`,
  '5. Bank state'
)

// 6. Bank account UI before notes
mustReplace(
  '            {/* Editable notes */}',
  `            {/* Payment account */}
            <div style={{ background:'var(--parchment)', padding:'12px 14px', borderRadius:3, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)' }}>Payment account</div>
                <select className="form-select" style={{ width:'auto', fontSize:11, padding:'2px 8px' }}
                  value={selectedBankId} onChange={e => changeBankAccount(e.target.value)}>
                  <option value="">No bank details</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.currency})</option>)}
                </select>
              </div>
              {selectedBank ? (
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{selectedBank.account_name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{selectedBank.bank_name}</div>
                  <div style={{ fontSize:12, marginTop:2 }}>Account: {selectedBank.account_number}</div>
                  {selectedBank.sort_code && <div style={{ fontSize:12 }}>Sort code: {selectedBank.sort_code}</div>}
                  {selectedBank.routing_number && <div style={{ fontSize:12 }}>Routing: {selectedBank.routing_number}</div>}
                  {selectedBank.swift_bic && <div style={{ fontSize:12 }}>SWIFT/BIC: {selectedBank.swift_bic}</div>}
                </div>
              ) : (
                <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>No bank details on this invoice</div>
              )}
            </div>

            {/* Editable notes */}`,
  '6. Bank UI'
)

// 7. buildInvoiceHTML signature
mustReplace(
  'async function buildInvoiceHTML(inv, client, items, payments, logoB64) {',
  'async function buildInvoiceHTML(inv, client, items, payments, logoB64, bankAccount) {',
  '7. buildInvoiceHTML signature'
)

// 8a. printInvoice call
mustReplace(
  '    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)\n    w.document.open()',
  '    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64, selectedBank)\n    w.document.open()',
  '8a. printInvoice call'
)

// 8b. downloadInvoicePDF call
mustReplace(
  '    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)\n    // Render into hidden iframe',
  '    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64, selectedBank)\n    // Render into hidden iframe',
  '8b. downloadInvoicePDF call'
)

// 9. Fix print footer bank ref
const oldBroken = `const bank = bankAccounts.find(b => b.id === selectedBankId) || bankAccounts.find(b => b.is_default) || bankAccounts[0]`
if (src.includes(oldBroken)) {
  src = src.replace(oldBroken, `const bank = bankAccount || null`)
  console.log('OK: 9. Fixed broken bank ref')
} else {
  // Add bank before footer
  mustReplace(
    '<div class="footer"><div>Hourglass Gallery</div>',
    `\${bankAccount ? '<div style="margin-top:24px;padding:14px 16px;background:#faf8f5;border:1px solid #e8e3db;border-radius:3px"><div style="font-size:8px;text-transform:uppercase;letter-spacing:.07em;color:#999;margin-bottom:6px">Payment Account</div><div style="font-weight:600;font-size:12px">' + bankAccount.account_name + '</div><div style="font-size:11px;color:#666">' + bankAccount.bank_name + '</div><div style="font-size:11px">Account: ' + bankAccount.account_number + '</div>' + (bankAccount.sort_code ? '<div style="font-size:11px">Sort code: ' + bankAccount.sort_code + '</div>' : '') + (bankAccount.routing_number ? '<div style="font-size:11px">Routing: ' + bankAccount.routing_number + '</div>' : '') + (bankAccount.swift_bic ? '<div style="font-size:11px">SWIFT/BIC: ' + bankAccount.swift_bic + '</div>' : '') + '</div>' : ''}
<div class="footer"><div>Hourglass Gallery</div>`,
    '9. Bank in print footer'
  )
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
