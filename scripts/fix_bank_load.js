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

// 1. Remove the fire-and-forget bank load
mustReplace(
  "    supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data,error})=>{ console.log('Bank accounts loaded:', data?.length, error); setBankAccounts(data||[]) })\n    setLoading(false)",
  "    setLoading(false)",
  '1. Remove old bank load'
)

// 2. Add bank_accounts to the main Promise.all
mustReplace(
  "    const [{ data:c }, { data:inv }, { data:bks }, r] = await Promise.all([",
  "    const [{ data:c }, { data:inv }, { data:bks }, r, { data:ba }] = await Promise.all([",
  '2a. Add to destructuring'
)

mustReplace(
  "      fetchLiveRates(),\n    ])",
  "      fetchLiveRates(),\n      supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name'),\n    ])",
  '2b. Add query to Promise.all'
)

// 3. Set bankAccounts alongside other state
mustReplace(
  "    setClients(c); setInvoices(inv); setBooks(bks); setRates(r)",
  "    setClients(c); setInvoices(inv); setBooks(bks); setRates(r); setBankAccounts(ba||[])",
  '3. Set bankAccounts in state'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
