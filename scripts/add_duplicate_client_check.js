import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('dupWarning')) { console.log('Already patched'); process.exit(0) }

// 1. Add duplicate detection state to ClientModal
const modalStateAnchor = "function ClientModal({ onClose, onSave }) {\n  const [form, setForm] = useState({ name:'', email:'', phone:'', phone_mobile:'', phone_work:'', company:'', city:'', street:'', suburb:'', state:'', postcode:'', country:'', prefix:'', notes:'', tags:[] })"
if (!src.includes(modalStateAnchor)) { console.error('ClientModal state anchor not found'); process.exit(1) }

src = src.replace(modalStateAnchor,
  `function ClientModal({ onClose, onSave, existingClients = [] }) {
  const [form, setForm] = useState({ name:'', email:'', phone:'', phone_mobile:'', phone_work:'', company:'', city:'', street:'', suburb:'', state:'', postcode:'', country:'', prefix:'', notes:'', tags:[] })
  const [dupWarning, setDupWarning] = useState([])`)

// 2. Add duplicate check when name changes — find the name input onChange
const nameInputAnchor = `onChange={e=>setForm(f=>({...f,name:e.target.value}))}`
// Find first occurrence (in ClientModal, not ClientList)
const modalStart = src.indexOf('function ClientModal(')
const nameInputIdx = src.indexOf(nameInputAnchor, modalStart)
if (nameInputIdx < 0) { console.error('Name input onChange not found'); process.exit(1) }

src = src.slice(0, nameInputIdx) +
  `onChange={e => {
              const val = e.target.value
              setForm(f=>({...f,name:val}))
              if (val.length > 2) {
                const q = val.toLowerCase()
                const matches = existingClients.filter(c =>
                  c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(' ')[0])
                ).slice(0, 3)
                setDupWarning(matches)
              } else {
                setDupWarning([])
              }
            }}` +
  src.slice(nameInputIdx + nameInputAnchor.length)

// 3. Add warning display after name field — find closing of name form-group
const nameGroupAnchor = `<label className="form-label">Full name *</label>`
const nameGroupIdx = src.indexOf(nameGroupAnchor, modalStart)
if (nameGroupIdx < 0) { console.error('Name label not found'); process.exit(1) }

// Find the end of this form-group div
const afterNameField = src.indexOf('</div>', nameGroupIdx)
if (afterNameField < 0) { console.error('Name field end not found'); process.exit(1) }

src = src.slice(0, afterNameField + 6) +
  `
              {dupWarning.length > 0 && (
                <div style={{ marginTop:6, padding:'8px 10px', background:'#fef9ec', border:'1px solid #f0c040', borderRadius:4 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#92600a', marginBottom:4 }}>⚠ Possible duplicate client{dupWarning.length > 1 ? 's' : ''}</div>
                  {dupWarning.map(c => (
                    <div key={c.id} style={{ fontSize:11, color:'#6b6760', padding:'2px 0' }}>
                      {c.name}{c.phone ? ' · ' + c.phone : ''}{c.email ? ' · ' + c.email : ''}
                    </div>
                  ))}
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Check if this client already exists before saving.</div>
                </div>
              )}` +
  src.slice(afterNameField + 6)

// 4. Pass existingClients to ClientModal from parent
src = src.replace(
  '<ClientModal onClose={() => setModal(null)} onSave={load} />',
  '<ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Duplicate client detection added to ClientModal')
