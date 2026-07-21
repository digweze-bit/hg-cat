import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('follow_up_date')) {
  console.log('Already patched')
  process.exit(0)
}

// Add follow_up_date to interestForm state
const oldForm = "const [interestForm, setInterestForm] = useState({ artist_name:'', medium:'', budget_range:'', notes:'' })"
if (!src.includes(oldForm)) { console.error('interestForm anchor not found'); process.exit(1) }
src = src.replace(oldForm, "const [interestForm, setInterestForm] = useState({ artist_name:'', medium:'', budget_range:'', notes:'', follow_up_date:'' })")

// Reset with follow_up_date after save
src = src.replace(
  "setInterestForm({ artist_name:'', medium:'', budget_range:'', notes:'' })",
  "setInterestForm({ artist_name:'', medium:'', budget_range:'', notes:'', follow_up_date:'' })"
)

// Add follow-up date field to the interest form UI
const oldFieldAnchor = `                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={2} value={interestForm.notes} onChange={e=>setInterestForm(f=>({...f,notes:e.target.value}))} />
                </div>`

const newFieldAnchor = `                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Follow up by</label>
                  <input className="form-input" type="date" value={interestForm.follow_up_date} onChange={e=>setInterestForm(f=>({...f,follow_up_date:e.target.value}))} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={2} value={interestForm.notes} onChange={e=>setInterestForm(f=>({...f,notes:e.target.value}))} />
                </div>`

if (!src.includes(oldFieldAnchor)) { console.error('Field anchor not found'); process.exit(1) }
src = src.replace(oldFieldAnchor, newFieldAnchor)

// Show follow-up date badge on interest row if set
const oldRow = `                  {i.notes && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{i.notes}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>`

const newRow = `                  {i.notes && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{i.notes}</div>}
                  {i.follow_up_date && (
                    <div style={{ fontSize:11, marginTop:3, color: i.follow_up_date < new Date().toISOString().split('T')[0] ? 'var(--red,#c0392b)' : 'var(--amber,#b8862a)', fontWeight:500 }}>
                      Follow up: {i.follow_up_date}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>`

if (!src.includes(oldRow)) { console.error('Row anchor not found'); process.exit(1) }
src = src.replace(oldRow, newRow)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
