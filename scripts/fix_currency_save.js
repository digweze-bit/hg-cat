import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

let changed = false

// 1. Add to fetch query if missing
if (!src.includes('consignment_currency,image_url')) {
  src = src.replace('commission_rate,image_url', 'commission_rate,consignment_currency,image_url')
  console.log('OK: 1. Fetch query')
  changed = true
}

// 2. Add to save payload if missing
if (!src.includes("consignment_currency: form.ownership")) {
  src = src.replace(
    "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,\n\n        commission_rate:",
    "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,\n        consignment_currency: form.ownership === 'consignment' ? form.consignment_currency || 'NGN' : null,\n        commission_rate:"
  )
  console.log('OK: 2. Save payload')
  changed = true
}

// 3. Add to form init if missing
if (!src.includes("consignment_currency: artwork.consignment_currency")) {
  src = src.replace(
    "      commission_rate: artwork.commission_rate || 40,",
    "      commission_rate: artwork.commission_rate ?? 40,\n      consignment_currency: artwork.consignment_currency || 'NGN',"
  )
  console.log('OK: 3. Form init')
  changed = true
}

if (!changed) { console.log('Already patched'); process.exit(0) }

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
