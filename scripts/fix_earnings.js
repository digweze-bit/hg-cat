import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Find the broken block and replace it
const lines = src.split('\n')
const brokenIdx = lines.findIndex(l => l.includes('form.consignment_price && Number(form.commission_rate) > 0'))
if (brokenIdx < 0) { console.error('Block not found'); process.exit(1) }

console.log('Found broken block at line ' + (brokenIdx + 1))

// Find how far the broken block extends - look for the next </div> that closes the form-group
let endIdx = brokenIdx
while (endIdx < lines.length && !lines[endIdx].trim().startsWith('</div>') && !lines[endIdx].includes('</div>') || endIdx === brokenIdx) {
  endIdx++
  if (endIdx - brokenIdx > 10) break
}

// Print what we're replacing
for (let i = brokenIdx; i <= Math.min(endIdx, brokenIdx + 8); i++) {
  console.log(`  ${i+1}: ${lines[i]}`)
}

// Replace from brokenIdx up to and including the closing </div>s
// Find the exact end: look for the closing of the form-row after commission
let replaceEnd = brokenIdx
for (let i = brokenIdx; i < brokenIdx + 10 && i < lines.length; i++) {
  replaceEnd = i
  if (lines[i].trim() === '</>' || lines[i].trim() === '</>') break
  if (lines[i].includes(')}') && lines[i].trim() === ')}') break
}

// Replace the broken lines with clean ones
const replacement = [
  "                          {form.consignment_price && Number(form.commission_rate) > 0 ? (() => {",
  "                            const sym = ({NGN:'\\u20A6',USD:'$',GBP:'\\u00A3',EUR:'\\u20AC'})[form.consignment_currency||'NGN'] || '\\u20A6'",
  "                            return <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Gallery earns {sym}{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} {'\\u00B7'} Owner receives {sym}{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}</div>",
  "                          })() : null}",
  "                          {Number(form.commission_rate) === 0 && <div style={{ fontSize:10, color:'var(--amber)', marginTop:4 }}>Fixed price \\u2014 gallery takes no commission</div>}",
  "                        </div>",
  "                      </div>",
  "                    </>",
  "                  )}",
  "                </div>",
]

// Find correct end - scan for the sequence </div> </div> </> )} </div>
let scanEnd = brokenIdx
for (let i = brokenIdx; i < lines.length; i++) {
  if (lines[i].includes('</div>') && i > brokenIdx + 1) {
    // Check if next few lines close out the section
    scanEnd = i
    // Keep going to find the actual structural close
    if (lines[i+1]?.trim() === '</div>' || lines[i+1]?.trim() === '</>') continue
    break
  }
}

// Actually let's just replace from brokenIdx to the </div> that contains "ownership" section end
// Simpler: replace just the broken earnings lines, keeping structure
lines.splice(brokenIdx, 6,
  "                          {form.consignment_price && Number(form.commission_rate) > 0 ? (() => {",
  "                            const sym = ({NGN:'\\u20A6',USD:'$',GBP:'\\u00A3',EUR:'\\u20AC'})[form.consignment_currency||'NGN'] || '\\u20A6'",
  "                            return <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Gallery earns {sym}{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} {'\\u00B7'} Owner receives {sym}{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}</div>",
  "                          })() : null}",
  "                          {Number(form.commission_rate) === 0 && <div style={{ fontSize:10, color:'var(--amber)', marginTop:4 }}>Fixed price \\u2014 gallery takes no commission</div>}",
  "                        </div>",
)

src = lines.join('\n')
const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('FIXED')
