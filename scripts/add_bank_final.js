import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('bankAccounts')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,120)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add bankAccounts state
mustReplace(
  '  const [pendingInvoiceId, setPendingInvoiceId] = useState(null)',
  '  const [pendingInvoiceId, setPendingInvoiceId] = useState(null)\n  const [bankAccounts, setBankAccounts] = useState([])',
  '1. bankAccounts state'
)

// 2. Load bank accounts — find the line right before setLoading(false) in the main load()
mustReplace(
  '    setLoading(false)\n  }',
  '    supabase.from(\'bank_accounts\').select(\'*\').order(\'is_default\',{ascending:false}).order(\'account_name\').then(({data})=>setBankAccounts(data||[]))\n    setLoading(false)\n  }',
  '2. Load bank accounts'
)

// 3. Pass bankAccounts to InvoiceDetail — find the multi-line component
mustReplace(
  '          userId={user?.id}\n          onClose',
  '          userId={user?.id}\n          bankAccounts={bankAccounts}\n          onClose',
  '3. Pass bankAccounts prop'
)

// 4. Update InvoiceDetail signature
mustReplace(
  'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit }) {',
  'function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit, bankAccounts = [] }) {\n  const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]\n  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || \'\')\n  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank\n  async function changeBankAccount(id) { setSelectedBankId(id); await supabase.from(\'invoices\').update({ bank_account_id: id }).eq(\'id\', inv.id) }',
  '4. InvoiceDetail signature + bank state'
)

// 5. Add bank account display before notes section
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
  '5. Bank account display'
)

// 6. Add bank details to printed invoice — before the footer
mustReplace(
  '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e8e3db;text-align:center;font-size:10px;color:#999">',
  `\${(() => {
  const bank = bankAccounts.find(b => b.id === selectedBankId) || bankAccounts.find(b => b.is_default) || bankAccounts[0]
  if (!bank) return ''
  let html = '<div style="margin-top:20px;padding:14px 16px;background:#faf8f5;border:1px solid #e8e3db;border-radius:3px">'
  html += '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#999;margin-bottom:6px">Payment Account</div>'
  html += '<div style="font-weight:600;font-size:12px">' + bank.account_name + '</div>'
  html += '<div style="font-size:11px;color:#666">' + bank.bank_name + '</div>'
  html += '<div style="font-size:11px">Account: ' + bank.account_number + '</div>'
  if (bank.sort_code) html += '<div style="font-size:11px">Sort code: ' + bank.sort_code + '</div>'
  if (bank.routing_number) html += '<div style="font-size:11px">Routing: ' + bank.routing_number + '</div>'
  if (bank.swift_bic) html += '<div style="font-size:11px">SWIFT/BIC: ' + bank.swift_bic + '</div>'
  html += '</div>'
  return html
})()}
<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e8e3db;text-align:center;font-size:10px;color:#999">`,
  '6. Bank in printed invoice'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
