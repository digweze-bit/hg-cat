import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const salesFile = path.join(__dirname, '../src/pages/Sales.jsx')

let src = fs.readFileSync(salesFile, 'utf8')
const usesCRLF = src.includes('\r\n')
src = src.replace(/\r\n/g, '\n')

if (src.includes('selectedBankId')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add bank account state inside InvoiceDetail — find the component body start
mustReplace(
  'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit, bankAccounts = [] }) {',
  `function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit, bankAccounts = [] }) {
  const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]
  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || '')
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank`,
  '1. Bank state in InvoiceDetail'
)

// 2. Save bank_account_id when changed
mustReplace(
  'const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]\n  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || \'\')\n  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank',
  `const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]
  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || '')
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank

  async function changeBankAccount(id) {
    setSelectedBankId(id)
    await supabase.from('invoices').update({ bank_account_id: id }).eq('id', inv.id)
  }`,
  '2. changeBankAccount function'
)

// 3. Add bank account display in the invoice detail view — before the Notes section
mustReplace(
  '            {/* Editable notes */}',
  `            {/* Payment account */}
            {selectedBank && (
              <div style={{ background:'var(--parchment)', padding:'12px 14px', borderRadius:3, marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)' }}>Payment account</div>
                  <select className="form-select" style={{ width:'auto', fontSize:11, padding:'2px 8px' }}
                    value={selectedBankId} onChange={e => changeBankAccount(e.target.value)}>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.currency})</option>)}
                  </select>
                </div>
                <div style={{ fontSize:13, fontWeight:500 }}>{selectedBank.account_name}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{selectedBank.bank_name}</div>
                <div style={{ fontSize:12, marginTop:2 }}>Account: {selectedBank.account_number}</div>
                {selectedBank.sort_code && <div style={{ fontSize:12 }}>Sort code: {selectedBank.sort_code}</div>}
                {selectedBank.routing_number && <div style={{ fontSize:12 }}>Routing: {selectedBank.routing_number}</div>}
                {selectedBank.swift_bic && <div style={{ fontSize:12 }}>SWIFT/BIC: {selectedBank.swift_bic}</div>}
              </div>
            )}

            {/* Editable notes */}`,
  '3. Bank account display in invoice detail'
)

// 4. Add bank account to the printed invoice HTML — find the footer in buildInvoiceHTML
// Look for the invoice footer in the print HTML
const footerAnchor = "Hourglass Gallery</div>"
const footerIdx = src.lastIndexOf(footerAnchor)
if (footerIdx < 0) { console.error('NOT FOUND: Invoice print footer'); process.exit(1) }

// Find the template literal context — we need to insert before the footer
const beforeFooter = src.lastIndexOf('<div', footerIdx - 200)
// Instead, let's add bank details to buildInvoiceHTML by finding where it's called and passing bank data

// Actually, let's add it inline in the print function
// Find where the print HTML is built
mustReplace(
  `<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e8e3db;text-align:center;font-size:10px;color:#999">`,
  `\${(() => {
  const bank = bankAccounts.find(b => b.id === (inv.bank_account_id || '')) || bankAccounts.find(b => b.is_default) || bankAccounts[0]
  if (!bank) return ''
  return '<div style="margin-top:20px;padding:14px 16px;background:#faf8f5;border:1px solid #e8e3db;border-radius:3px"><div style=\\'font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#999;margin-bottom:6px\\'>Payment account</div><div style=\\'font-weight:600;font-size:12px\\'>' + bank.account_name + '</div><div style=\\'font-size:11px;color:#666\\'>' + bank.bank_name + '</div><div style=\\'font-size:11px\\'>Account: ' + bank.account_number + '</div>' + (bank.sort_code ? '<div style=\\'font-size:11px\\'>Sort code: ' + bank.sort_code + '</div>' : '') + (bank.routing_number ? '<div style=\\'font-size:11px\\'>Routing: ' + bank.routing_number + '</div>' : '') + (bank.swift_bic ? '<div style=\\'font-size:11px\\'>SWIFT/BIC: ' + bank.swift_bic + '</div>' : '') + '</div>'
})()}
<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e8e3db;text-align:center;font-size:10px;color:#999">`,
  '4. Bank account in printed invoice'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(salesFile, final, 'utf8')
console.log('ALL DONE')
