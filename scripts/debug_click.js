import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Add alert to the consignment currency button
src = src.replace(
  'onClick={() => setForm(f=>({...f,consignment_currency:code}))}',
  'onClick={() => { window.alert("Consignment currency: " + code); setForm(f=>({...f,consignment_currency:code})) }}'
)

// Also add alert to the price currency button
src = src.replace(
  'onClick={() => setInputCurrency(c)}',
  'onClick={() => { window.alert("Price currency: " + c); setInputCurrency(c) }}'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('DONE - alerts added to both currency buttons')
