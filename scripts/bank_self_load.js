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

// 1. InvoiceDetail — add self-loading bank accounts after payForm
mustReplace(
  "  const defaultBank = bankAccounts.find(b => b.is_default) || bankAccounts[0]\n  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || defaultBank?.id || '')\n  const selectedBank = bankAccounts.find(b => b.id === selectedBankId) || defaultBank",
  `  const [bankAccounts2, setBankAccounts2] = useState([])
  useEffect(() => { supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccounts2(data||[])) }, [])
  const defaultBank = bankAccounts2.find(b => b.is_default) || bankAccounts2[0]
  const [selectedBankId, setSelectedBankId] = useState(inv.bank_account_id || '')
  const selectedBank = bankAccounts2.find(b => b.id === selectedBankId) || (selectedBankId ? null : defaultBank)`,
  '1. InvoiceDetail self-load'
)

// Fix references to bankAccounts in InvoiceDetail's JSX
src = src.replace(
  /{bankAccounts\.map\(b => <option key=\{b\.id\} value=\{b\.id\}>\{b\.account_name\} \(\{b\.currency\}\)<\/option>\)\}/,
  "{bankAccounts2.map(b => <option key={b.id} value={b.id}>{b.account_name} ({b.currency})</option>)}"
)
console.log('OK: 1b. Fix bankAccounts ref in InvoiceDetail JSX')

// 2. InvoiceModal — add self-loading bank accounts
mustReplace(
  "function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, bankAccounts = [], onClose, onSave, editInvoice=null }) {\n  const isEdit = !!editInvoice",
  `function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, bankAccounts = [], onClose, onSave, editInvoice=null }) {
  const isEdit = !!editInvoice
  const [bankAccts, setBankAccts] = useState([])
  useEffect(() => { supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccts(data||[])) }, [])`,
  '2. InvoiceModal self-load'
)

// Fix bankAccounts references in InvoiceModal form init and JSX
src = src.replace(
  "bank_account_id: editInvoice.bank_account_id || (bankAccounts.find(b=>b.is_default)?.id) || '',",
  "bank_account_id: editInvoice?.bank_account_id || '',"
)
console.log('OK: 2b. Fix edit form init')

src = src.replace(
  "bank_account_id: (bankAccounts.find(b=>b.is_default)?.id) || '',",
  "bank_account_id: '',"
)
console.log('OK: 2c. Fix new form init')

// Fix the select in InvoiceModal to use bankAccts
src = src.replace(
  "{bankAccounts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}",
  "{bankAccts.map(b => <option key={b.id} value={b.id}>{b.account_name} - {b.bank_name} ({b.currency})</option>)}"
)
console.log('OK: 2d. Fix InvoiceModal dropdown')

// 3. Add useEffect to set default bank once loaded in InvoiceModal
mustReplace(
  "  useEffect(() => { supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccts(data||[])) }, [])",
  `  useEffect(() => { supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccts(data||[])) }, [])
  useEffect(() => { if (bankAccts.length > 0 && !form.bank_account_id) { const def = bankAccts.find(b=>b.is_default); if (def) setForm(f=>({...f, bank_account_id: def.id})) } }, [bankAccts])`,
  '3. Set default bank once loaded'
)

// 4. Same for InvoiceDetail — set default once loaded
mustReplace(
  "  useEffect(() => { supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccounts2(data||[])) }, [])",
  `  useEffect(() => { supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccounts2(data||[])) }, [])
  useEffect(() => { if (bankAccounts2.length > 0 && !selectedBankId) { const def = bankAccounts2.find(b=>b.is_default); if (def) setSelectedBankId(def.id) } }, [bankAccounts2])`,
  '4. Set default bank in InvoiceDetail'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
