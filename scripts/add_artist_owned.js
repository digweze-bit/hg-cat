import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('artist_owned')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Filter dropdown - add artist_owned option
src = src.replace(
  `          <option value="gallery">Gallery owned</option>\n          <option value="consignment">Consignment</option>`,
  `          <option value="gallery">Gallery owned</option>\n          <option value="artist_owned">Artist owned</option>\n          <option value="consignment">Consignment</option>`
)

// 2. List display - add artist_owned label
const oldDisplay = `{w.ownership === 'consignment'\n                        ? (\n                          <span style={{ fontSize:11, color:'var(--amber)' }}>`
if (!src.includes(oldDisplay)) { console.error('Display anchor not found'); process.exit(1) }
src = src.replace(
  `                      : <span>Gallery</span>}`,
  `                      : w.ownership === 'artist_owned'\n                          ? <span style={{ fontSize:11, color:'var(--green,#2d6a4f)' }}>Artist owned</span>\n                          : <span>Gallery</span>}`
)

// 3. Ownership radio buttons - add artist_owned
const oldRadios = `[['gallery','Gallery owned'],['consignment','Consignment']]`
if (!src.includes(oldRadios)) { console.error('Radio buttons anchor not found'); process.exit(1) }
src = src.replace(oldRadios, `[['gallery','Gallery owned'],['artist_owned','Artist owned'],['consignment','Consignment']]`)

// 4. Show consignment fields for artist_owned too
src = src.split(`form.ownership === 'consignment' && (`).join(`(form.ownership === 'consignment' || form.ownership === 'artist_owned') && (`)

// 5. Context-sensitive consignor label
src = src.replace(
  `                      <label className="form-label">Consignor name</label>`,
  `                      <label className="form-label">{form.ownership === 'artist_owned' ? 'Artist / consignor name' : 'Consignor name'}</label>`
)

// 6. Commission section - show "n/a when fixed price set" note and clear on fixed price
// Find the commission rate input and update it
const oldCommInput = `onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))}`
if (!src.includes(oldCommInput)) { console.error('Commission input anchor not found'); process.exit(1) }
src = src.replace(
  oldCommInput,
  `onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} disabled={!!(form.consignment_price)} placeholder={form.consignment_price ? 'N/A — fixed price set' : ''}`
)

// 7. Save payload - include consignment fields for artist_owned too
// commission_rate should be null if fixed price is set
src = src.replace(
  `        consignment_price: form.ownership === 'consignment' && form.consignment_price ? Number(form.consignment_price) : null,\n        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,\n        commission_rate:   form.ownership === 'consignment' ? Number(form.commission_rate) || 40 : null,`,
  `        consignment_price: (form.ownership === 'consignment' || form.ownership === 'artist_owned') && form.consignment_price ? Number(form.consignment_price) : null,\n        consignor_name:    (form.ownership === 'consignment' || form.ownership === 'artist_owned') ? form.consignor_name || null : null,\n        commission_rate:   (form.ownership === 'consignment' || form.ownership === 'artist_owned') ? (form.consignment_price ? null : Number(form.commission_rate) || null) : null,`
)

// 8. Auto-create consignor for artist_owned too
src = src.replace(
  `      if (payload.ownership === 'consignment' && payload.consignor_name) {`,
  `      if ((payload.ownership === 'consignment' || payload.ownership === 'artist_owned') && payload.consignor_name) {`
)

// 9. Clear commission when consignment_price is set (add to consignment_price onChange)
const oldPriceChange = `onChange={e=>setForm(f=>({...f,consignment_price:e.target.value}))}`
if (!src.includes(oldPriceChange)) { console.error('Consignment price onChange anchor not found'); process.exit(1) }
src = src.replace(
  oldPriceChange,
  `onChange={e=>setForm(f=>({...f,consignment_price:e.target.value,commission_rate:e.target.value?'':f.commission_rate}))}`
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
