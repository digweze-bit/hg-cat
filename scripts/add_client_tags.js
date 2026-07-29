import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// 1. Add tags to ClientList save payload (country/notes line)
src = src.replace(
  "        country: form.country||null, notes: form.notes||null,\n        updated_at: new Date().toISOString(),",
  "        country: form.country||null, notes: form.notes||null,\n        tags: form.tags||[],\n        updated_at: new Date().toISOString(),"
)

// 2. Add tags to ClientModal save payload
src = src.replace(
  "        notes: form.notes || null,\n      }\n      const { error } = await supabase.from('clients').insert(payload)",
  "        notes: form.notes || null,\n        tags: form.tags||[],\n      }\n      const { error } = await supabase.from('clients').insert(payload)"
)

// 3. Add tags to ClientList openEdit to load existing tags
src = src.replace(
  "    setForm({ ...c, phone_mobile: c.phone_mobile||c.phone||'', phone_work: c.phone_work||'', street: c.street||c.address||'', suburb: c.suburb||'', state: c.state||'', postcode: c.postcode||'' })",
  "    setForm({ ...c, phone_mobile: c.phone_mobile||c.phone||'', phone_work: c.phone_work||'', street: c.street||c.address||'', suburb: c.suburb||'', state: c.state||'', postcode: c.postcode||'', tags: c.tags||[] })"
)

// 4. Add tags field to ClientModal form — after notes textarea
src = src.replace(
  `          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>`,
  `          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Tags</label><TagInput tags={form.tags||[]} onChange={t=>setForm(f=>({...f,tags:t}))} suggestions={CLIENT_TAG_SUGGESTIONS} placeholder="e.g. modernist, sculpture..." /></div>`
)

// 5. Show tags on client detail panel
src = src.replace(
  "               ['Notes', selected.notes],\n             ].filter(([,v]) => v)",
  "               ['Notes', selected.notes],\n             ].filter(([,v]) => v)"
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Client tags wired into Sales.jsx')
