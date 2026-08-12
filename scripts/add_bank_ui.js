import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('changeBankAccount')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add bank state inside InvoiceDetail after payForm
mustReplace(
  "  const [payForm, setPayForm] = useState({ amount:'', currency: inv.currency, method:'transfer', paid_at: new Date().toISOString().split('T')[0], reference:'', notes:'' })",
  `  const [payForm, setPayForm] = useState({ amount:'', currency: inv.currency, method:'transfer', paid_at: new Date().toISOString().split('T')[0], reference:'', notes:'' })
  const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]
  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || '')
  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank
  async function changeBankAccount(id) {
    setSelectedBankId(id)
    if (id) await supabase.from('invoices').update({ bank_account_id: id }).eq('id', inv.id)
    else await supabase.from('invoices').update({ bank_account_id: null }).eq('id', inv.id)
  }`,
  '1. Bank state in InvoiceDetail'
)

// 2. Add bank account UI before editable notes
mustReplace(
  '            {/* Editable notes */}',
  `            {/* Payment account */}
            <div style={{ background:'var(--parchment)', padding:'12px 14px', borderRadius:3, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)' }}>Payment account</div>
                <div style={{ display:'flex', gap:6 }}>
                  <select className="form-select" style={{ width:'auto', fontSize:11, padding:'2px 8px' }}
                    value={selectedBankId} onChange={e => changeBankAccount(e.target.value)}>
                    <option value="">No bank details</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.currency})</option>)}
                  </select>
                </div>
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
                <div style={{ fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>No bank details will appear on this invoice</div>
              )}
            </div>

            {/* Editable notes */}`,
  '2. Bank account UI'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
