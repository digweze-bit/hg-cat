import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/ArtworkPage.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes("artwork.dimension_unit === 'cm' ? 'cm' : 'in'")) {
  console.log('Already patched')
  process.exit(0)
}

const oldLine = "  ['Dimensions', artwork.dimensions],"
if (!src.includes(oldLine)) { console.error('Dimensions line not found'); process.exit(1) }
src = src.replace(
  oldLine,
  "  ['Dimensions', artwork.dimensions ? \`\${artwork.dimensions} \${artwork.dimension_unit === 'cm' ? 'cm' : 'in'}\` : null],"
)

// Also fix the whatsapp share text
src = src.replace(
  "${[artwork.year, artwork.medium, artwork.dimensions].filter(Boolean).join(' · ')}",
  "${[artwork.year, artwork.medium, artwork.dimensions ? artwork.dimensions + ' ' + (artwork.dimension_unit === 'cm' ? 'cm' : 'in') : null].filter(Boolean).join(' · ')}"
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ArtworkPage.jsx patched')
