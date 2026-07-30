import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('dupWarning')) { console.log('Already patched'); process.exit(0) }

// 1. Update ClientModal signature
src = src.replace(
  'function ClientModal({ onClose, onSave }) {',
  'function ClientModal({ onClose, onSave, existingClients = [] }) {'
)

// 2. Add dupWarning state
src = src.replace(
  '  const [saving, setSaving] = useState(false)\n  async function save() {',
  '  const [saving, setSaving] = useState(false)\n  const [dupWarning, setDupWarning] = useState([])\n  async function save() {'
)

// 3. Replace name input with dup-checking version
const oldNameInput = '<div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>'

const newNameInput = `<div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={e => {
              const v = e.target.value
              setForm(f=>({...f, name: v}))
              if (v.length > 2) {
                const q = v.toLowerCase()
                setDupWarning(existingClients.filter(c =>
                  c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(' ')[0])
                ).slice(0, 3))
              } else { setDupWarning([]) }
            }} />
            {dupWarning.length > 0 && (
              <div style={{ marginTop:6, padding:'8px 10px', background:'#fef9ec', border:'1px solid #f0c040', borderRadius:4 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#92600a', marginBottom:4 }}>&#9888; Possible duplicate</div>
                {dupWarning.map(c => (
                  <div key={c.id} style={{ fontSize:11, color:'#6b6760', padding:'2px 0' }}>
                    {c.name}{c.phone ? ' \u00b7 ' + c.phone : ''}{c.email ? ' \u00b7 ' + c.email : ''}
                  </div>
                ))}
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>Check this client does not already exist before saving.</div>
              </div>
            )}
          </div>`

if (!src.includes(oldNameInput)) { console.error('Name input anchor not found'); process.exit(1) }
src = src.replace(oldNameInput, newNameInput)

// 4. Pass existingClients to ClientModal from parent
src = src.replace(
  '<ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />',
  '<ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />'
)
// In case it wasn't already updated
src = src.replace(
  '<ClientModal onClose={() => setModal(null)} onSave={load} />',
  '<ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Duplicate client detection added successfully')
