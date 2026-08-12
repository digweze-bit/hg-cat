import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Replace the silent fire-and-forget with proper error handling
src = src.replace(
  "supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data})=>setBankAccounts(data||[]))",
  "supabase.from('bank_accounts').select('*').order('is_default',{ascending:false}).order('account_name').then(({data,error})=>{ console.log('Bank accounts loaded:', data?.length, error); setBankAccounts(data||[]) })"
)

console.log('OK: Added debug log to bank load')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
