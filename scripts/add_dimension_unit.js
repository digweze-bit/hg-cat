import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('dimension_unit')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add dimension_unit to EMPTY defaults
const oldEmpty = "const EMPTY = { title:'', artist_id:'', year:'', medium:'', category:'', dimensions:'', series:''"
if (!src.includes(oldEmpty)) { console.error('EMPTY anchor not found'); process.exit(1) }
src = src.replace(oldEmpty, "const EMPTY = { title:'', artist_id:'', year:'', medium:'', category:'', dimensions:'', dimension_unit:'in', series:''")

// 2. Add dimension_unit to the select query
src = src.replace(
  "select:'id,title,artist_id,year,medium,category,dimensions,availability,ownership",
  "select:'id,title,artist_id,year,medium,category,dimensions,dimension_unit,availability,ownership"
)

// 3. Add dimension_unit to save payload
const oldPayload = "        dimensions:        form.dimensions || null,"
if (!src.includes(oldPayload)) { console.error('Payload anchor not found'); process.exit(1) }
src = src.replace(oldPayload, "        dimensions:        form.dimensions || null,\n        dimension_unit:    form.dimension_unit || 'in',")

// 4. Add convertDimensions helper function near top (after EMPTY const)
const emptyLineEnd = src.indexOf('\n', src.indexOf(oldEmpty.replace("dimension_unit:'in', ", "")) )
const converterFn = `

function convertDimensions(str, fromUnit, toUnit) {
  if (!str || fromUnit === toUnit) return str
  const factor = fromUnit === 'in' && toUnit === 'cm' ? 2.54 : (1 / 2.54)
  return str.replace(/(\\d+(\\.\\d+)?)/g, (m) => {
    const val = parseFloat(m) * factor
    const rounded = Math.round(val * 100) / 100
    return String(rounded)
  })
}`

// Insert after the EMPTY const line (find its full line and insert after)
const emptyLineMatch = src.match(/const EMPTY = \{[^\n]*\}\n/)
if (!emptyLineMatch) { console.error('Could not locate EMPTY line for converter insertion'); process.exit(1) }
src = src.replace(emptyLineMatch[0], emptyLineMatch[0] + converterFn + '\n')

// 5. Replace the Dimensions form field with dimensions input + unit toggle
const oldField = `                <div className="form-group">
                  <label className="form-label">Dimensions</label>
                  <input className="form-input" value={form.dimensions||''} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))} />
                </div>`

const newField = `                <div className="form-group">
                  <label className="form-label">Dimensions</label>
                  <input className="form-input" value={form.dimensions||''} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))} placeholder="e.g. 50 x 60" />
                  <div style={{ display:'flex', gap:14, marginTop:6 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}>
                      <input type="radio" name="dimUnit" checked={(form.dimension_unit||'in')==='in'}
                        onChange={() => setForm(f => ({...f, dimensions: convertDimensions(f.dimensions, f.dimension_unit||'in', 'in'), dimension_unit:'in'}))} />
                      Inches
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}>
                      <input type="radio" name="dimUnit" checked={(form.dimension_unit||'in')==='cm'}
                        onChange={() => setForm(f => ({...f, dimensions: convertDimensions(f.dimensions, f.dimension_unit||'in', 'cm'), dimension_unit:'cm'}))} />
                      cm
                    </label>
                  </div>
                </div>`

if (!src.includes(oldField)) { console.error('Dimensions field anchor not found'); process.exit(1) }
src = src.replace(oldField, newField)

// 6. Update openEdit to load dimension_unit
src = src.replace(
  /(function openEdit\(artwork\) \{[\s\S]{0,400}?setForm\(\{[\s\S]{0,20}\.\.\.EMPTY,\s*\.\.\.artwork,)/,
  (m) => m  // artwork spread already includes dimension_unit since select includes it — no change needed
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
