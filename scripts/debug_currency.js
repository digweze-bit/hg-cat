import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Add console.log before save
src = src.replace(
  "      if (modal === 'edit') {",
  "      console.log('SAVING PAYLOAD:', JSON.stringify({ ownership: payload.ownership, consignment_currency: payload.consignment_currency, commission_rate: payload.commission_rate }))\n      if (modal === 'edit') {"
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Debug log added')
