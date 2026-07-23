import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes("w.dimension_unit === 'cm' ? 'cm' : 'in'")) {
  console.log('Already patched')
  process.exit(0)
}

const oldLine = "  <td>${escH(w.dimensions || '—')}</td>"
if (!src.includes(oldLine)) { console.error('Print list dimensions line not found'); process.exit(1) }
src = src.replace(
  oldLine,
  "  <td>${w.dimensions ? escH(w.dimensions + ' ' + (w.dimension_unit === 'cm' ? 'cm' : 'in')) : '—'}</td>"
)

// Also add dimension_unit to the print list select query if it exists
if (src.includes("select:'id,title,artist_id,year,medium,category,dimensions,dimension_unit")) {
  console.log('Select query already includes dimension_unit')
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Artworks.jsx print list patched')
