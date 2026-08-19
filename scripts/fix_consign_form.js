import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('consignType')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add consignment_currency to fetch if not there
if (!src.includes('consignment_currency')) {
  mustReplace(
    'commission_rate,image_url',
    'commission_rate,consignment_currency,image_url',
    '1a. Fetch select'
  )
  // Add to edit form init
  mustReplace(
    "      commission_rate: artwork.commission_rate || 40,",
    "      commission_rate: artwork.commission_rate ?? 40,\n      consignment_currency: artwork.consignment_currency || 'NGN',",
    '1b. Edit form init'
  )
  // Add to save payload
  mustReplace(
    "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,",
    "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,\n        consignment_currency: form.ownership === 'consignment' ? form.consignment_currency || 'NGN' : null,",
    '1c. Save payload'
  )
}

// 2. Replace the consignment price/commission form section
const oldForm = `                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Consignment price (₦) <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--amber)', fontSize:10 }}>— minimum agreed with owner, not shown publicly</span></label>
                          <input className="form-input" type="number" value={form.consignment_price||''} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value}))} placeholder="0" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gallery commission (%)</label>
                          <input className="form-input" type="number" min={0} max={100} value={form.commission_rate||40} onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} />`

if (!src.includes(oldForm)) {
  console.error('NOT FOUND: old consignment form block')
  // Print what's actually at that location
  const idx = src.indexOf('Consignment price')
  if (idx > 0) console.error('Found "Consignment price" at index ' + idx + ': ' + src.slice(idx, idx+200))
  process.exit(1)
}

const newForm = `                      {/* Commission vs Fixed price */}
                      <div style={{ display:'flex', gap:12, marginBottom:8 }}>
                        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                          <input type="radio" name="consignType" checked={Number(form.commission_rate) > 0} onChange={()=>setForm(f=>({...f,commission_rate:f.commission_rate||40}))} style={{ width:'auto' }} />
                          On commission
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                          <input type="radio" name="consignType" checked={Number(form.commission_rate) === 0} onChange={()=>setForm(f=>({...f,commission_rate:0}))} style={{ width:'auto' }} />
                          Fixed price (no commission)
                        </label>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">{Number(form.commission_rate) === 0 ? 'Fixed price to consignor' : 'Consignment price'} <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--amber)', fontSize:10 }}>— agreed with owner</span></label>
                          <div style={{ display:'flex', gap:6 }}>
                            <select className="form-select" style={{ width:80, flexShrink:0 }} value={form.consignment_currency||'NGN'} onChange={e=>setForm(f=>({...f,consignment_currency:e.target.value}))}>
                              <option value="NGN">{'\u20A6'}</option><option value="USD">$</option><option value="GBP">{'\u00A3'}</option><option value="EUR">{'\u20AC'}</option>
                            </select>
                            <input className="form-input" value={form.consignment_price ? Number(form.consignment_price).toLocaleString() : ''} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value.replace(/,/g,'')}))} placeholder="0" />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gallery commission (%)</label>
                          <input className="form-input" type="number" min={0} max={100} value={form.commission_rate} onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} disabled={Number(form.commission_rate)===0} />`

src = src.replace(oldForm, newForm)
console.log('OK: 2. Replaced consignment form')

// 3. Replace the earnings calculation line
mustReplace(
  "                          {form.consignment_price && form.commission_rate && (\n                            <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>\n                              Gallery earns ₦{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} · Owner receives ₦{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}\n                            </div>\n                          )}",
  `                          {form.consignment_price && Number(form.commission_rate) > 0 ? (() => {
                            const sym = {NGN:'\u20A6',USD:'$',GBP:'\u00A3',EUR:'\u20AC'}[form.consignment_currency||'NGN'] || '\u20A6'
                            return <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Gallery earns {sym}{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} {'\u00B7'} Owner receives {sym}{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}</div>
                          })() : null}
                          {Number(form.commission_rate) === 0 && <div style={{ fontSize:10, color:'var(--amber)', marginTop:4 }}>Fixed price \u2014 gallery takes no commission</div>}`,
  '3. Earnings calculation'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
