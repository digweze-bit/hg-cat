import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Replace the currency select with button group
const oldSelect = `<select className="form-select" style={{ width:80, flexShrink:0 }} value={form.consignment_currency||"NGN"} onChange={e=>{ alert('Currency changed to: ' + e.target.value); setForm(f=>({...f,consignment_currency:e.target.value})) }}>
                              <option value="NGN">\u20A6</option><option value="USD">$</option><option value="GBP">\u00A3</option><option value="EUR">\u20AC</option>
                            </select>`

if (!src.includes(oldSelect)) {
  // Try without alert
  const altSelect = `<select className="form-select" style={{ width:80, flexShrink:0 }} value={form.consignment_currency||"NGN"} onChange={e=>setForm(f=>({...f,consignment_currency:e.target.value}))}>
                              <option value="NGN">\u20A6</option><option value="USD">$</option><option value="GBP">\u00A3</option><option value="EUR">\u20AC</option>
                            </select>`
  if (!src.includes(altSelect)) {
    console.error('Neither select variant found')
    // Print actual content around line 861
    const lines = src.split('\n')
    for (let i = 859; i < 866; i++) console.log(`${i+1}: ${lines[i]}`)
    process.exit(1)
  }
}

const newButtons = `<div style={{ display:"flex", gap:2, flexShrink:0 }}>
                              {[["NGN","\u20A6"],["USD","$"],["GBP","\u00A3"],["EUR","\u20AC"]].map(([code,sym]) => (
                                <button key={code} type="button" onClick={() => setForm(f=>({...f,consignment_currency:code}))}
                                  style={{ padding:"4px 10px", fontSize:12, border:"1px solid " + ((form.consignment_currency||"NGN")===code ? "var(--ink)" : "var(--line)"),
                                    background: (form.consignment_currency||"NGN")===code ? "var(--ink)" : "var(--white)",
                                    color: (form.consignment_currency||"NGN")===code ? "#fff" : "var(--muted)",
                                    borderRadius:3, cursor:"pointer", fontFamily:"inherit" }}>{sym}</button>
                              ))}
                            </div>`

src = src.replace(oldSelect, newButtons)
if (src.includes(newButtons)) {
  console.log('OK: Replaced with alert version')
} else {
  // Try the non-alert version
  src = raw.replace(/\r\n/g, '\n')
  const altSelect2 = src.match(/<select className="form-select"[^>]*consignment_currency[^]*?<\/select>/)?.[0]
  if (altSelect2) {
    src = src.replace(altSelect2, newButtons)
    console.log('OK: Replaced with regex match')
  } else {
    console.error('Could not find select')
    process.exit(1)
  }
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
