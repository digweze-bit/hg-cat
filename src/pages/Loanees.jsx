import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'

const LOANEE_TYPES = ['Individual', 'Institution', 'Museum', 'Gallery', 'Corporate', 'Other']

export default function Loanees() {
  const navigate = useNavigate()
  const [loanees, setLoanees]   = useState([])
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [modal, setModal]       = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving]     = useState(false)

  const blank = { name:'', type:'Individual', email:'', phone:'', address:'', notes:'' }
  const [form, setForm] = useState(blank)

  async function load() {
    const [{ data: l }, { data: aws }, { data: arts }] = await Promise.all([
      supabase.from('loanees').select('*').order('name'),
      supabase.from('artworks')
        .select('id,title,year,medium,availability,image_url,thumbnail_url,artist_id,location,loanee_id,loaned_to,loan_date,loan_due_date')
        .or('loanee_id.not.is.null,availability.eq.Reserved'),
      supabase.from('artists').select('id,name'),
    ])
    setLoanees(l || [])
    setArtworks(aws || [])
    setArtists(arts || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const artistMap = Object.fromEntries((artists || []).map(a => [a.id, a.name]))
  const today = new Date().toISOString().split('T')[0]

  const worksFor = l => artworks.filter(w => w.loanee_id === l.id)

  function openNew() {
    setForm(blank)
    setEditTarget(null)
    setModal(true)
  }

  function openEdit(l, e) {
    e.stopPropagation()
    setForm({
      name:l.name, type:l.type||'Individual', email:l.email||'',
      phone:l.phone||'', address:l.address||'', notes:l.notes||'',
    })
    setEditTarget(l)
    setModal(true)
  }

  async function save() {
    if (!form.name.trim()) return alert('Name is required')
    setSaving(true)
    const payload = {
      name: form.name.trim(), type: form.type,
      email: form.email||null, phone: form.phone||null,
      address: form.address||null, notes: form.notes||null,
      updated_at: new Date().toISOString(),
    }
    if (editTarget) {
      await supabase.from('loanees').update(payload).eq('id', editTarget.id)
    } else {
      await supabase.from('loanees').insert({ ...payload, created_at: new Date().toISOString() })
    }
    cacheInvalidate('loanees')
    await load()
    setModal(false)
    setSaving(false)
    if (editTarget) setSelected(s => s?.id === editTarget.id ? { ...s, ...payload } : s)
  }

  async function del(l, e) {
    e.stopPropagation()
    const onLoan = worksFor(l).length
    const warning = onLoan
      ? `"${l.name}" has ${onLoan} artwork${onLoan!==1?'s':''} currently on loan. Deleting will unlink ${onLoan!==1?'them':'it'} — the works stay Reserved but lose their loanee. Continue?`
      : `Delete loanee "${l.name}"? This cannot be undone.`
    if (!confirm(warning)) return
    await supabase.from('loanees').delete().eq('id', l.id)
    cacheInvalidate('loanees')
    if (selected?.id === l.id) setSelected(null)
    await load()
  }

  const filtered = loanees.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.type?.toLowerCase().includes(search.toLowerCase())
  )

  const selectedWorks = selected ? worksFor(selected) : []
  const unattributed = artworks.filter(w => !w.loanee_id && w.availability === 'Reserved')

  if (loading) return <div style={{color:'var(--muted)'}}>Loading{'…'}</div>

  return (
    <div style={{display:'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap:20, height:'calc(100vh - 120px)'}}>

      {/* {'──'} LEFT {'—'} loanee list {'──'} */}
      <div style={{display:'flex', flexDirection:'column', gap:0, minWidth:0}}>
        <div className="page-header" style={{marginBottom:12}}>
          <div>
            <div className="page-title">Loanees</div>
            <div className="page-subtitle">{loanees.length} on record</div>
          </div>
          <button className="btn btn-primary" onClick={openNew}>+ Add loanee</button>
        </div>

        <input className="form-input" placeholder="Search loanees..." value={search}
          onChange={e=>setSearch(e.target.value)} style={{marginBottom:12}}/>

        <div className="card" style={{flex:1, overflowY:'auto', padding:0}}>
          {filtered.length === 0 && (
            <div style={{padding:32, textAlign:'center', color:'var(--muted)'}}>
              {loanees.length === 0 ? 'No loanees yet' : 'No loanees match that search'}
            </div>
          )}
          {filtered.map(l => {
            const works = worksFor(l)
            const overdue = works.filter(w => w.loan_due_date && w.loan_due_date < today).length
            const isSelected = selected?.id === l.id
            return (
              <div key={l.id}
                onClick={() => setSelected(isSelected ? null : l)}
                style={{
                  padding:'14px 18px', borderBottom:'1px solid var(--line-soft)',
                  cursor:'pointer', background: isSelected ? 'var(--surface-1,#f5f3f0)' : 'transparent',
                  display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                }}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:14, marginBottom:3}}>{l.name}</div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    <span style={{fontSize:11, color:'var(--muted)', background:'var(--surface-0,#f8f7f5)', padding:'1px 7px', borderRadius:3}}>{l.type||'Individual'}</span>
                    {l.phone && <span style={{fontSize:11, color:'var(--muted)'}}>{l.phone}</span>}
                  </div>
                  <div style={{fontSize:11, color:'var(--muted)', marginTop:4}}>
                    {works.length} work{works.length!==1?'s':''} on loan
                    {overdue > 0 && <span style={{color:'var(--danger,#c0392b)', fontWeight:600}}> {'·'} {overdue} overdue</span>}
                  </div>
                </div>
                <div style={{display:'flex', gap:6, flexShrink:0, marginLeft:12}}>
                  <button className="btn btn-ghost btn-sm" onClick={e=>openEdit(l,e)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--danger,#c0392b)'}} onClick={e=>del(l,e)}>{'✕'}</button>
                </div>
              </div>
            )
          })}
        </div>

        {unattributed.length > 0 && !selected && (
          <div style={{fontSize:12, color:'var(--muted)', padding:'10px 14px', background:'var(--parchment)', borderRadius:3, marginTop:12}}>
            {unattributed.length} work{unattributed.length!==1?'s are':' is'} marked Reserved with no loanee recorded.
            Set the loan entry on {unattributed.length!==1?'those artworks':'that artwork'} to attribute {unattributed.length!==1?'them':'it'}.
          </div>
        )}
      </div>

      {/* {'──'} RIGHT {'—'} loanee detail {'──'} */}
      {selected && (
        <div style={{display:'flex', flexDirection:'column', gap:0, minWidth:0}}>
          <div className="page-header" style={{marginBottom:12}}>
            <div>
              <div className="page-title">{selected.name}</div>
              <div className="page-subtitle">
                {selected.type} {'·'} {selectedWorks.length} work{selectedWorks.length!==1?'s':''} on loan
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>{'✕'} Close</button>
          </div>

          {(selected.email||selected.phone||selected.address||selected.notes) && (
            <div className="card" style={{marginBottom:12, padding:'12px 18px', display:'flex', gap:24, flexWrap:'wrap'}}>
              {selected.email && <div style={{fontSize:13}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Email</span>{selected.email}</div>}
              {selected.phone && <div style={{fontSize:13}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Phone</span>{selected.phone}</div>}
              {selected.address && <div style={{fontSize:13}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Address</span>{selected.address}</div>}
              {selected.notes && <div style={{fontSize:13,maxWidth:400}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Notes</span>{selected.notes}</div>}
            </div>
          )}

          <div className="card" style={{flex:1, overflowY:'auto', padding:0}}>
            <div style={{padding:'12px 18px', borderBottom:'1px solid var(--line-soft)', fontWeight:600, fontSize:13}}>
              Works on loan ({selectedWorks.length})
            </div>
            {selectedWorks.length === 0 && (
              <div style={{padding:32, textAlign:'center', color:'var(--muted)'}}>
                No artworks currently on loan to this loanee.<br/>
                <span style={{fontSize:12}}>
                  Set an artwork's availability to <strong>Reserved</strong> and pick <strong>{selected.name}</strong> in its loan entry.
                </span>
              </div>
            )}
            {selectedWorks.length > 0 && (
              <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'var(--surface-0,#f8f7f5)'}}>
                    {['','Artist','Title','Year','Medium','Location','Loaned','Due back'].map((h,i)=>(
                      <th key={i} style={{padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--line-soft)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedWorks.map(w => {
                    const isOverdue = w.loan_due_date && w.loan_due_date < today
                    return (
                      <tr key={w.id} onClick={() => navigate('/admin/artworks', { state: { editArtworkId: w.id } })}
                        style={{borderBottom:'1px solid var(--line-soft)', cursor:'pointer'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--parchment)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'8px 14px', width:44}}>
                          {(w.thumbnail_url || w.image_url)
                            ? <img src={w.thumbnail_url || w.image_url} alt="" style={{width:36, height:36, objectFit:'cover', borderRadius:2}}/>
                            : <div style={{width:36, height:36, background:'var(--surface-1,#f0ece7)', borderRadius:2}}/>
                          }
                        </td>
                        <td style={{padding:'8px 14px', fontSize:13}}>{artistMap[w.artist_id]||'—'}</td>
                        <td style={{padding:'8px 14px', fontSize:13, fontStyle:'italic'}}>{w.title}</td>
                        <td style={{padding:'8px 14px', fontSize:13, color:'var(--muted)'}}>{w.year||'—'}</td>
                        <td style={{padding:'8px 14px', fontSize:13, color:'var(--muted)'}}>{w.medium||'—'}</td>
                        <td style={{padding:'8px 14px', fontSize:13, color:'var(--muted)'}}>{w.location||'—'}</td>
                        <td style={{padding:'8px 14px', fontSize:13, color:'var(--muted)'}}>{w.loan_date||'—'}</td>
                        <td style={{padding:'8px 14px', fontSize:13, color: isOverdue ? 'var(--danger,#c0392b)' : 'var(--muted)', fontWeight: isOverdue ? 600 : 400}}>
                          {w.loan_due_date||'—'}{isOverdue ? ' · OVERDUE' : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* {'──'} MODAL {'—'} add / edit loanee {'──'} */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:540}}>
            <div className="modal-header">
              <div className="modal-title">{editTarget ? 'Edit loanee' : 'Add loanee'}</div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(false)}>{'✕'}</button>
            </div>
            <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:14}}>

              <div className="form-row">
                <div className="form-group" style={{flex:2}}>
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Person or institution name"/>
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {LOANEE_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-input" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Loan terms, insurance, handling notes"/>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving||!form.name.trim()}>
                {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add loanee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
