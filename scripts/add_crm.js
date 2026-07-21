import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('client_visits')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add state for visits/interests near clientInvoices useMemo
const stateAnchor = `  const clientInvoices = useMemo(() => {
    if (!selected) return []
    return invoices.filter(i => i.client_id === selected.id)
  }, [selected, invoices])`

const newState = `  const clientInvoices = useMemo(() => {
    if (!selected) return []
    return invoices.filter(i => i.client_id === selected.id)
  }, [selected, invoices])

  const [visits, setVisits] = useState([])
  const [interests, setInterests] = useState([])
  const [visitForm, setVisitForm] = useState({ visit_type:'in-person', notes:'', staff_name:'', visit_date: new Date().toISOString().split('T')[0] })
  const [interestForm, setInterestForm] = useState({ artist_name:'', medium:'', budget_range:'', notes:'' })
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [showInterestForm, setShowInterestForm] = useState(false)

  useEffect(() => {
    if (!selected) { setVisits([]); setInterests([]); return }
    supabase.from('client_visits').select('*').eq('client_id', selected.id).order('visit_date', { ascending: false })
      .then(({ data }) => setVisits(data || []))
    supabase.from('client_interests').select('*').eq('client_id', selected.id).order('created_at', { ascending: false })
      .then(({ data }) => setInterests(data || []))
  }, [selected])

  async function addVisit() {
    if (!selected) return
    await supabase.from('client_visits').insert({ ...visitForm, client_id: selected.id })
    const { data } = await supabase.from('client_visits').select('*').eq('client_id', selected.id).order('visit_date', { ascending: false })
    setVisits(data || [])
    setVisitForm({ visit_type:'in-person', notes:'', staff_name:'', visit_date: new Date().toISOString().split('T')[0] })
    setShowVisitForm(false)
  }

  async function deleteVisit(id) {
    await supabase.from('client_visits').delete().eq('id', id)
    setVisits(prev => prev.filter(v => v.id !== id))
  }

  async function addInterest() {
    if (!selected || !interestForm.artist_name) return
    await supabase.from('client_interests').insert({ ...interestForm, client_id: selected.id })
    const { data } = await supabase.from('client_interests').select('*').eq('client_id', selected.id).order('created_at', { ascending: false })
    setInterests(data || [])
    setInterestForm({ artist_name:'', medium:'', budget_range:'', notes:'' })
    setShowInterestForm(false)
  }

  async function updateInterestStatus(id, status) {
    await supabase.from('client_interests').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setInterests(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  async function deleteInterest(id) {
    await supabase.from('client_interests').delete().eq('id', id)
    setInterests(prev => prev.filter(i => i.id !== id))
  }`

if (!src.includes(stateAnchor)) { console.error('State anchor not found'); process.exit(1) }
src = src.replace(stateAnchor, newState)

// 2. Insert Visits and Interests sections before "Invoice history" section
const invHistAnchor = `          {/* Invoice history */}
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>
            Invoice history ({clientInvoices.length})
          </div>`

const newSections = `          {/* Interests */}
          <div className="card" style={{ padding:'16px 18px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>Interests ({interests.length})</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowInterestForm(s => !s)}>+ Add</button>
            </div>
            {showInterestForm && (
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12, padding:'10px 12px', background:'var(--surface-1,#f8f7f5)', borderRadius:3 }}>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Artist</label>
                    <input className="form-input" value={interestForm.artist_name} onChange={e=>setInterestForm(f=>({...f,artist_name:e.target.value}))} placeholder="Artist name" />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Medium</label>
                    <input className="form-input" value={interestForm.medium} onChange={e=>setInterestForm(f=>({...f,medium:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Budget range</label>
                  <input className="form-input" value={interestForm.budget_range} onChange={e=>setInterestForm(f=>({...f,budget_range:e.target.value}))} placeholder="e.g. ₦2m - ₦5m" />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={2} value={interestForm.notes} onChange={e=>setInterestForm(f=>({...f,notes:e.target.value}))} />
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-primary btn-sm" onClick={addInterest}>Save</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowInterestForm(false)}>Cancel</button>
                </div>
              </div>
            )}
            {interests.length === 0 && !showInterestForm && <div style={{ fontSize:12, color:'var(--muted)' }}>No interests recorded</div>}
            {interests.map(i => (
              <div key={i.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid var(--line-soft)' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{i.artist_name}{i.medium ? \` · \${i.medium}\` : ''}</div>
                  {i.budget_range && <div style={{ fontSize:11, color:'var(--muted)' }}>Budget: {i.budget_range}</div>}
                  {i.notes && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{i.notes}</div>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <select className="form-select" style={{ fontSize:11, padding:'2px 6px', width:'auto' }} value={i.status} onChange={e => updateInterestStatus(i.id, e.target.value)}>
                    <option value="active">Active</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button onClick={() => deleteInterest(i.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red,#c0392b)', fontSize:11 }}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          {/* Visits */}
          <div className="card" style={{ padding:'16px 18px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>Visits & activity ({visits.length})</div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowVisitForm(s => !s)}>+ Log visit</button>
            </div>
            {showVisitForm && (
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12, padding:'10px 12px', background:'var(--surface-1,#f8f7f5)', borderRadius:3 }}>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Type</label>
                    <select className="form-select" value={visitForm.visit_type} onChange={e=>setVisitForm(f=>({...f,visit_type:e.target.value}))}>
                      <option value="in-person">In-person visit</option>
                      <option value="call">Phone call</option>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="event">Event / opening</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Date</label>
                    <input className="form-input" type="date" value={visitForm.visit_date} onChange={e=>setVisitForm(f=>({...f,visit_date:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Staff member</label>
                  <input className="form-input" value={visitForm.staff_name} onChange={e=>setVisitForm(f=>({...f,staff_name:e.target.value}))} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={2} value={visitForm.notes} onChange={e=>setVisitForm(f=>({...f,notes:e.target.value}))} placeholder="What was discussed, works shown, follow-up needed..." />
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-primary btn-sm" onClick={addVisit}>Save</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowVisitForm(false)}>Cancel</button>
                </div>
              </div>
            )}
            {visits.length === 0 && !showVisitForm && <div style={{ fontSize:12, color:'var(--muted)' }}>No visits logged yet</div>}
            {visits.map(v => (
              <div key={v.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'8px 0', borderBottom:'1px solid var(--line-soft)' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, textTransform:'capitalize' }}>{v.visit_type}{v.staff_name ? \` · \${v.staff_name}\` : ''}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{v.visit_date}</div>
                  {v.notes && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{v.notes}</div>}
                </div>
                <button onClick={() => deleteVisit(v.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red,#c0392b)', fontSize:11 }}>Delete</button>
              </div>
            ))}
          </div>

          {/* Invoice history */}
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>
            Invoice history ({clientInvoices.length})
          </div>`

if (!src.includes(invHistAnchor)) { console.error('Invoice history anchor not found'); process.exit(1) }
src = src.replace(invHistAnchor, newSections)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
