import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Replace the entire currency buttons block with a plain select
const oldBlock = `<div style={{ display:"flex", gap:6, alignItems:"center" }}>
                            <div style={{ display:"flex", gap:2, flexShrink:0, border:"2px solid var(--amber)", borderRadius:4, padding:2 }}>
                              {[["NGN","\\u20A6"],["USD","$"],["GBP","\\u00A3"],["EUR","\\u20AC"]].map(([code,sym]) => (
                                <button key={code} type="button" onClick={() => setForm(f=>({...f,consignment_currency:code}))}
                                  style={{ padding:"4px 10px", fontSize:12, border:"1px solid " + ((form.consignment_currency||"NGN")===code ? "var(--ink)" : "var(--line)"),
                                    background: (form.consignment_currency||"NGN")===code ? "var(--ink)" : "var(--white)",
                                    color: (form.consignment_currency||"NGN")===code ? "#fff" : "var(--muted)",
                                    borderRadius:3, cursor:"pointer", fontFamily:"inherit" }}>{sym}</button>
                              ))}
                            </div>
                            <input className="form-input" value={form.consignment_price ? Number(form.consignment_price).toLocaleString() : ""} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value.replace(/,/g,"")}))} placeholder="0" />
                          </div>`

if (src.includes(oldBlock)) {
  src = src.replace(oldBlock, `<div style={{ display:"flex", gap:8 }}>
                            <select value={form.consignment_currency||"NGN"} onChange={e=>setForm(f=>({...f,consignment_currency:e.target.value}))}
                              style={{ width:90, padding:"6px 8px", fontSize:13, border:"2px solid var(--amber)", borderRadius:4, background:"var(--white)", fontFamily:"inherit", cursor:"pointer" }}>
                              <option value="NGN">\\u20A6 NGN</option>
                              <option value="USD">$ USD</option>
                              <option value="GBP">\\u00A3 GBP</option>
                              <option value="EUR">\\u20AC EUR</option>
                            </select>
                            <input className="form-input" style={{ flex:1 }} value={form.consignment_price ? Number(form.consignment_price).toLocaleString() : ""} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value.replace(/,/g,"")}))} placeholder="0" />
                          </div>`)
  console.log('OK: Replaced buttons with select')
} else {
  console.log('Block not found, trying line-based...')
  const lines = src.split('\n')
  const ambIdx = lines.findIndex(l => l.includes('amber') && l.includes('borderRadius:4') && l.includes('padding:2'))
  if (ambIdx < 0) { console.error('Amber border div not found'); process.exit(1) }
  // Find start and end of the block
  let startIdx = ambIdx - 1 // the flex gap:6 div
  let endIdx = ambIdx
  // Find the closing </div> for the outer flex container
  let depth = 0
  for (let i = startIdx; i < lines.length; i++) {
    depth += (lines[i].match(/<div/g)||[]).length - (lines[i].match(/<\/div>/g)||[]).length
    if (depth <= 0 && i > startIdx) { endIdx = i; break }
  }
  console.log(`Replacing lines ${startIdx+1} to ${endIdx+1}`)
  lines.splice(startIdx, endIdx - startIdx + 1,
    '                          <div style={{ display:"flex", gap:8 }}>',
    '                            <select value={form.consignment_currency||"NGN"} onChange={e=>setForm(f=>({...f,consignment_currency:e.target.value}))}',
    '                              style={{ width:90, padding:"6px 8px", fontSize:13, border:"2px solid var(--amber)", borderRadius:4, background:"var(--white)", fontFamily:"inherit", cursor:"pointer" }}>',
    '                              <option value="NGN">\\u20A6 NGN</option>',
    '                              <option value="USD">$ USD</option>',
    '                              <option value="GBP">\\u00A3 GBP</option>',
    '                              <option value="EUR">\\u20AC EUR</option>',
    '                            </select>',
    '                            <input className="form-input" style={{ flex:1 }} value={form.consignment_price ? Number(form.consignment_price).toLocaleString() : ""} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value.replace(/,/g,"")}))} placeholder="0" />',
    '                          </div>'
  )
  src = lines.join('\n')
  console.log('OK: Replaced via line-based approach')
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
