import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('consignment_currency')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add consignment_currency to the fetch select
mustReplace(
  "commission_rate,location",
  "commission_rate,consignment_currency,location",
  '1. Add consignment_currency to fetch'
)

// 2. Add consignment_currency to EMPTY and edit form init
mustReplace(
  "      consignor_contact: artwork.consignor_contact || '',\n      commission_rate: artwork.commission_rate || 40,",
  "      consignor_contact: artwork.consignor_contact || '',\n      commission_rate: artwork.commission_rate ?? 40,\n      consignment_currency: artwork.consignment_currency || 'NGN',",
  '2. Edit form init'
)

// 3. Add to save payload
mustReplace(
  "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,",
  "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,\n        consignment_currency: form.ownership === 'consignment' ? form.consignment_currency || 'NGN' : null,",
  '3. Save payload'
)

// 4. Replace the consignment form section with enhanced version
mustReplace(
  `                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Consignment price (₦) <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--amber)', fontSize:10 }}>— minimum agreed with owner, not shown publicly</span></label>
                          <input className="form-input" type="number" value={form.consignment_price||''} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value}))} placeholder="0" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gallery commission (%)</label>
                          <input className="form-input" type="number" min={0} max={100} value={form.commission_rate||40} onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} />
                          {form.consignment_price && form.commission_rate && (
                            <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                              Gallery earns ₦{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} · Owner receives ₦{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>`,
  `                      {/* Commission vs Fixed price */}
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
                          <label className="form-label">Consignment price <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--amber)', fontSize:10 }}>— agreed with owner</span></label>
                          <div style={{ display:'flex', gap:6 }}>
                            <select className="form-select" style={{ width:80, flexShrink:0 }} value={form.consignment_currency||'NGN'} onChange={e=>setForm(f=>({...f,consignment_currency:e.target.value}))}>
                              <option value="NGN">₦</option><option value="USD">$</option><option value="GBP">£</option><option value="EUR">€</option>
                            </select>
                            <input className="form-input" value={form.consignment_price ? Number(form.consignment_price).toLocaleString() : ''} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value.replace(/,/g,'')}))} placeholder="0" />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gallery commission (%)</label>
                          <input className="form-input" type="number" min={0} max={100} value={form.commission_rate} onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} disabled={Number(form.commission_rate)===0} />
                          {form.consignment_price && Number(form.commission_rate) > 0 && (() => {
                            const sym = {NGN:'₦',USD:'$',GBP:'£',EUR:'€'}[form.consignment_currency||'NGN'] || '₦'
                            return (
                              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                                Gallery earns {sym}{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} · Owner receives {sym}{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}
                              </div>
                            )
                          })()}
                          {Number(form.commission_rate) === 0 && (
                            <div style={{ fontSize:10, color:'var(--amber)', marginTop:4 }}>Fixed price — gallery takes no commission</div>
                          )}
                        </div>
                      </div>`,
  '4. Enhanced consignment form'
)

// 5. Update artwork grid display for consignment to show currency
mustReplace(
  "                          Consignment{w.consignment_price ? ` · ₦${Number(w.consignment_price).toLocaleString()}` : ''}",
  "                          Consignment{w.consignment_price ? ` · ${({NGN:'₦',USD:'$',GBP:'£',EUR:'€'})[w.consignment_currency||'NGN']||'₦'}${Number(w.consignment_price).toLocaleString()}` : ''}{Number(w.commission_rate)===0 ? ' · Fixed' : (w.commission_rate ? ` · ${w.commission_rate}%` : '')}",
  '5. Grid display currency'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
