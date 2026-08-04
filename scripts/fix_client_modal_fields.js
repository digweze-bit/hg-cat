import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Fix the ClientModal form body — find and replace the broken section
// First locate the modal body in ClientModal
const modalStart = src.indexOf('<div className="modal-title">{editClient ?')
if (modalStart < 0) { console.error('ClientModal title not found'); process.exit(1) }

// Find the modal-body after this
const bodyStart = src.indexOf('<div className="modal-body"', modalStart)
if (bodyStart < 0) { console.error('modal-body not found'); process.exit(1) }

// Find the modal-footer after body
const footerStart = src.indexOf('<div className="modal-footer">', bodyStart)
if (footerStart < 0) { console.error('modal-footer not found'); process.exit(1) }

// Replace the entire body content
const newBody = `<div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-row">
            <div className="form-group" style={{maxWidth:90}}>
              <label className="form-label">Prefix</label>
              <select className="form-select" value={form.prefix||''} onChange={e=>setForm(f=>({...f,prefix:e.target.value}))}>
                <option value="">{'\\u2014'}</option>
                {['Mr','Mrs','Ms','Dr','Prof','Chief','Alhaji','Alhaja','Sir'].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => {
                const v = e.target.value
                setForm(f=>({...f, name: v}))
                if (v.length > 2) {
                  const q = v.toLowerCase()
                  setDupWarning(existingClients.filter(c =>
                    c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(' ')[0])
                  ).filter(c => !editClient || c.id !== editClient.id).slice(0, 3))
                } else { setDupWarning([]) }
              }} />
              {dupWarning.length > 0 && (
                <div style={{ marginTop:6, padding:'8px 10px', background:'#fef9ec', border:'1px solid #f0c040', borderRadius:4 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#92600a', marginBottom:4 }}>&#9888; Possible duplicate</div>
                  {dupWarning.map(c => (
                    <div key={c.id} style={{ fontSize:11, color:'#6b6760', padding:'2px 0' }}>
                      {c.name}{c.phone ? ' \\u00b7 ' + c.phone : ''}{c.email ? ' \\u00b7 ' + c.email : ''}
                    </div>
                  ))}
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>Check this client does not already exist before saving.</div>
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-input" value={form.company||''} onChange={e=>setForm(f=>({...f,company:e.target.value}))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Street address</label>
            <input className="form-input" value={form.street||''} onChange={e=>setForm(f=>({...f,street:e.target.value}))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Country</label>
              <input className="form-input" value={form.country||''} onChange={e=>setForm(f=>({...f,country:e.target.value}))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Tags</label>
            <TagInput tags={form.tags||[]} onChange={t=>setForm(f=>({...f,tags:t}))} suggestions={CLIENT_TAG_SUGGESTIONS} placeholder="e.g. modernist, sculpture..." />
          </div>
        </div>
        `

src = src.slice(0, bodyStart) + newBody + src.slice(footerStart)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ClientModal form rebuilt cleanly with all fields including street')
