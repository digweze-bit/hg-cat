import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

const src = fs.readFileSync(file, 'utf8')

// Find the print button text and triangle
const searches = ['Print', 'print', 'Print list', '\u25be', '\u2399']
for (const s of searches) {
  const idx = src.indexOf(s)
  if (idx >= 0) {
    const snippet = src.substring(idx - 2, idx + 10)
    const bytes = Buffer.from(snippet, 'utf8')
    console.log(`Found "${s}" at ${idx}:`)
    console.log('  text:', JSON.stringify(snippet))
    console.log('  hex:', bytes.toString('hex').match(/.{2}/g).join(' '))
  }
}

// Find anything that looks like â or Ã near "Print"
const printIdx = src.indexOf('Print')
if (printIdx >= 0) {
  const around = src.substring(printIdx - 10, printIdx + 20)
  console.log('\nAround Print:', JSON.stringify(around))
  console.log('Hex:', Buffer.from(around,'utf8').toString('hex').match(/.{2}/g).join(' '))
}
