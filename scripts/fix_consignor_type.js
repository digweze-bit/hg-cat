import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let src = fs.readFileSync(file, 'utf8')
src = src.replace(
  "await supabase.from('consignors').insert({ name: trimmed, type: 'individual', created_at: new Date().toISOString() })",
  "await supabase.from('consignors').insert({ name: trimmed, type: 'Collector', created_at: new Date().toISOString() })"
)
fs.writeFileSync(file, src, 'utf8')
console.log('Fixed type value')
