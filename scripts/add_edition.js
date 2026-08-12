import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Catalogue.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,120)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add edition_info to data query
mustReplace(
  "select:'id,title,artist_id,year,medium,dimensions,availability,image_url,price,sort_order',",
  "select:'id,title,artist_id,year,medium,dimensions,availability,image_url,price,sort_order,edition_info,created_at,image_position',",
  '1. Add edition_info to query'
)

// 2. Add edition_info to ArtworkCard subtitle
mustReplace(
  "{[w.year, w.medium].filter(Boolean).join(' \\u00B7 ')}",
  "{[w.year, w.medium, w.edition_info].filter(Boolean).join(' \\u00B7 ')}",
  '2. Edition in ArtworkCard'
)

// 3. Add Edition to ArtworkDetail grid
mustReplace(
  "[['Year',w.year],['Medium',w.medium],['Dimensions',w.dimensions],['Series',w.series],",
  "[['Year',w.year],['Medium',w.medium],['Dimensions',w.dimensions],['Edition',w.edition_info],['Series',w.series],",
  '3. Edition in ArtworkDetail grid'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
