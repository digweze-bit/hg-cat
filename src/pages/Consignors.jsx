import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'

const CONSIGNOR_TYPES = ['Artist', 'Estate', 'Collector', 'Dealer', 'Institution', 'Other']
const TERM_TYPES = ['commission', 'fixed']

export default function Consignors() {
  const [consignors, setConsignors] = useState([])
  const [artworks, setArtworks]     = useState([])
  const [artists, setArtists]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(null)   // clicked consignor
  const [modal, setModal]           = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving]         = useState(false)

  const blank = {
    name:'', type:'Collector', email:'', phone:'', address:'',
    sale_type:'secondary',       // primary | secondary | both
    term_type:'commission',      // commission | fixed
    commission_rate:40,          // %
    fixed_amount:'',             // NGN amount if fixed
    notes:'',
  }
  const [form, setForm] = useState(blank)

  async function load() {
    const [{ data: cons }, { data: aws }, { data: arts }] = await Promise.all([
      supabase.from('consignors').select('*').order('name'),
      supabase.from('artworks').select('id,title,year,medium,availability,image_url,consignor_name,artist_id,ownership,consignment_price,commission_rate').eq('ownership','consignment'),
      supabase.from('artists').select('id,name'),
    ])
    setConsignors(cons || [])
    setArtworks(aws || [])
    setArtists(arts || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const artistMap = Object.fromEntries((artists||[]).map(a => [a.id, a.name]))

  function openNew() {
    setForm(blank)
    setEditTarget(null)
    setModal(true)
  }

  function openEdit(c, e) {
    e.stopPropagation()
    setForm({
      name:c.name, type:c.type||'Collector', email:c.email||'', phone:c.phone||'',
      address:c.address||'', sale_type:c.sale_type||'secondary',
      term_type:c.term_type||'commission', commission_rate:c.commission_rate??40,
      fixed_amount:c.fixed_amount||'', notes:c.notes||'',
    })
    setEditTarget(c)
    setModal(true)
  }

  async function save() {
    if (!form.name.trim()) return alert('Name is required')
    setSaving(true)
    const payload = {
      name: form.name.trim(), type: form.type, email: form.email||null,
      phone: form.phone||null, address: form.address||null,
      sale_type: form.sale_type, term_type: form.term_type,
      commission_rate: form.term_type==='commission' ? Number(form.commission_rate) : null,
      fixed_amount: form.term_type==='fixed' ? form.fixed_amount||null : null,
      notes: form.notes||null,
      updated_at: new Date().toISOString(),
    }
    if (editTarget) {
      await supabase.from('consignors').update(payload).eq('id', editTarget.id)
    } else {
      await supabase.from('consignors').insert({ ...payload, created_at: new Date().toISOString() })
    }
    cacheInvalidate('consignors')
    await load()
    setModal(false)
    setSaving(false)
    if (editTarget) setSelected(s => s?.id === editTarget.id ? { ...s, ...payload } : s)
  }

  async function del(c, e) {
    e.stopPropagation()
    if (!confirm(`Delete consignor "${c.name}"? This cannot be undone.`)) return
    await supabase.from('consignors').delete().eq('id', c.id)
    cacheInvalidate('consignors')
    if (selected?.id === c.id) setSelected(null)
    await load()
  }

  const filtered = consignors.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.type?.toLowerCase().includes(search.toLowerCase())
  )

  // Artworks for selected consignor \u2014 match by consignor_name (existing field on artworks)
  const consignorArtworks = selected
    ? artworks.filter(w => w.consignor_name?.toLowerCase() === selected.name?.toLowerCase())
    : []

  function termSummary(c) {
    if (c.term_type === 'fixed') return c.fixed_amount ? `Fixed \u20A6${Number(c.fixed_amount).toLocaleString()}` : 'Fixed (TBC)'
    return `${c.commission_rate ?? 40}% commission`
  }

  const saleTypeLabel = { primary:'Primary', secondary:'Secondary', both:'Primary & Secondary' }

  if (loading) return <div style={{color:'var(--muted)'}}>Loading{'\u2026'}</div>

  return (
    <div style={{display:'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap:20, height:'calc(100vh - 120px)'}}>

      {/* \u2500\u2500 LEFT \u2014 consignor list \u2500\u2500 */}
      <div style={{display:'flex', flexDirection:'column', gap:0, minWidth:0}}>
        <div className="page-header" style={{marginBottom:12}}>
          <div>
            <div className="page-title">Consignors</div>
            <div className="page-subtitle">{consignors.length} on record</div>
          </div>
          <button className="btn btn-primary" onClick={openNew}>+ Add consignor</button>
        </div>

        <input className="form-input" placeholder="Search consignors..." value={search}
          onChange={e=>setSearch(e.target.value)} style={{marginBottom:12}}/>

        <div className="card" style={{flex:1, overflowY:'auto', padding:0}}>
          {filtered.length === 0 && (
            <div style={{padding:32, textAlign:'center', color:'var(--muted)'}}>No consignors yet</div>
          )}
          {filtered.map(c => {
            const cArtworks = artworks.filter(w => w.consignor_name?.toLowerCase() === c.name?.toLowerCase())
            const isSelected = selected?.id === c.id
            return (
              <div key={c.id}
                onClick={() => setSelected(isSelected ? null : c)}
                style={{
                  padding:'14px 18px', borderBottom:'1px solid var(--line-soft)',
                  cursor:'pointer', background: isSelected ? 'var(--surface-1,#f5f3f0)' : 'transparent',
                  display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                }}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:14, marginBottom:3}}>{c.name}</div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    <span style={{fontSize:11, color:'var(--muted)', background:'var(--surface-0,#f8f7f5)', padding:'1px 7px', borderRadius:3}}>{c.type||'Collector'}</span>
                    <span style={{fontSize:11, color:'var(--muted)'}}>{saleTypeLabel[c.sale_type]||'Secondary'}</span>
                    <span style={{fontSize:11, color:'var(--gold,#b8862a)', fontWeight:500}}>{termSummary(c)}</span>
                  </div>
                  <div style={{fontSize:11, color:'var(--muted)', marginTop:4}}>
                    {cArtworks.length} artwork{cArtworks.length!==1?'s':''} consigned
                  </div>
                </div>
                <div style={{display:'flex', gap:6, flexShrink:0, marginLeft:12}}>
                  <button className="btn btn-ghost btn-sm" onClick={e=>openEdit(c,e)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--danger,#c0392b)'}} onClick={e=>del(c,e)}>{'\u2715'}</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* \u2500\u2500 RIGHT \u2014 consignor detail \u2500\u2500 */}
      {selected && (
        <div style={{display:'flex', flexDirection:'column', gap:0, minWidth:0}}>
          <div className="page-header" style={{marginBottom:12}}>
            <div>
              <div className="page-title">{selected.name}</div>
              <div className="page-subtitle">{selected.type} {'\u00B7'} {saleTypeLabel[selected.sale_type]} {'\u00B7'} {termSummary(selected)}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>{'\u2715'} Close</button>
          </div>

          {/* Contact strip */}
          {(selected.email||selected.phone||selected.address||selected.notes) && (
            <div className="card" style={{marginBottom:12, padding:'12px 18px', display:'flex', gap:24, flexWrap:'wrap'}}>
              {selected.email && <div style={{fontSize:13}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Email</span>{selected.email}</div>}
              {selected.phone && <div style={{fontSize:13}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Phone</span>{selected.phone}</div>}
              {selected.address && <div style={{fontSize:13}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Address</span>{selected.address}</div>}
              {selected.notes && <div style={{fontSize:13,maxWidth:400}}><span style={{color:'var(--muted)',fontSize:11,display:'block'}}>Notes</span>{selected.notes}</div>}
            </div>
          )}

          {/* Consigned artworks */}
          <div className="card" style={{flex:1, overflowY:'auto', padding:0}}>
            <div style={{padding:'12px 18px', borderBottom:'1px solid var(--line-soft)', fontWeight:600, fontSize:13}}>
              Consigned artworks ({consignorArtworks.length})
            </div>
            {consignorArtworks.length === 0 && (
              <div style={{padding:32, textAlign:'center', color:'var(--muted)'}}>
                No artworks matched to this consignor.<br/>
                <span style={{fontSize:12}}>Link artworks by setting the consignor name to <strong>{selected.name}</strong> in the Artworks page.</span>
              </div>
            )}
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--surface-0,#f8f7f5)'}}>
                  {['','Artist','Title','Year','Medium','Availability','Consignment price','Commission'].map(h=>(
                    <th key={h} style={{padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'1px solid var(--line-soft)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consignorArtworks.map(w => (
                  <tr key={w.id} style={{borderBottom:'1px solid var(--line-soft)'}}>
                    <td style={{padding:'8px 14px', width:44}}>
                      {w.image_url
                        ? <img src={w.image_url} alt="" style={{width:36, height:36, objectFit:'cover', borderRadius:2}}/>
                        : <div style={{width:36, height:36, background:'var(--surface-1,#f0ece7)', borderRadius:2}}/>
                      }
                    </td>
                    <td style={{padding:'8px 14px', fontSize:13}}>{artistMap[w.artist_id]||'\u2014'}</td>
                    <td style={{padding:'8px 14px', fontSize:13, fontStyle:'italic'}}>{w.title}</td>
                    <td style={{padding:'8px 14px', fontSize:13, color:'var(--muted)'}}>{w.year||'\u2014'}</td>
                    <td style={{padding:'8px 14px', fontSize:13, color:'var(--muted)'}}>{w.medium||'\u2014'}</td>
                    <td style={{padding:'8px 14px'}}>
                      <span style={{fontSize:11, padding:'2px 8px', borderRadius:3,
                        background: w.availability==='Sold' ? '#fef2f0' : w.availability==='Reserved' ? '#fef9ec' : '#f0faf4',
                        color: w.availability==='Sold' ? '#c0392b' : w.availability==='Reserved' ? '#b8862a' : '#27ae60',
                      }}>{w.availability}</span>
                    </td>
                    <td style={{padding:'8px 14px', fontSize:13}}>
                      {w.consignment_price ? `\u20A6${Number(w.consignment_price).toLocaleString()}` : '\u2014'}
                    </td>
                    <td style={{padding:'8px 14px', fontSize:13, color:'var(--gold,#b8862a)'}}>
                      {w.commission_rate != null ? `${w.commission_rate}%` : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* \u2500\u2500 MODAL \u2014 add / edit consignor \u2500\u2500 */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:540}}>
            <div className="modal-header">
              <div className="modal-title">{editTarget ? 'Edit consignor' : 'Add consignor'}</div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(false)}>{'\u2715'}</button>
            </div>
            <div className="modal-body" style={{display:'flex', flexDirection:'column', gap:14}}>

              <div className="form-row">
                <div className="form-group" style={{flex:2}}>
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Full name or estate name"/>
                </div>
                <div className="form-group" style={{flex:1}}>
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {CONSIGNOR_TYPES.map(t=><option key={t}>{t}</option>)}
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

              <div style={{borderTop:'1px solid var(--line)', paddingTop:14}}>
                <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12}}>Consignment terms</div>

                <div className="form-row" style={{marginBottom:12}}>
                  <div className="form-group">
                    <label className="form-label">Sale type</label>
                    <select className="form-select" value={form.sale_type} onChange={e=>setForm(f=>({...f,sale_type:e.target.value}))}>
                      <option value="primary">Primary sale</option>
                      <option value="secondary">Secondary sale</option>
                      <option value="both">Primary & Secondary</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Term type</label>
                    <select className="form-select" value={form.term_type} onChange={e=>setForm(f=>({...f,term_type:e.target.value}))}>
                      <option value="commission">Commission %</option>
                      <option value="fixed">Fixed price (net to consignor)</option>
                    </select>
                  </div>
                </div>

                {form.term_type === 'commission' && (
                  <div className="form-group" style={{maxWidth:180}}>
                    <label className="form-label">Gallery commission %</label>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <input className="form-input" type="number" min={0} max={100} value={form.commission_rate}
                        onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} style={{maxWidth:80}}/>
                      <span style={{fontSize:13, color:'var(--muted)'}}>% to gallery {'\u00B7'} {100-Number(form.commission_rate)}% to consignor</span>
                    </div>
                  </div>
                )}

                {form.term_type === 'fixed' && (
                  <div className="form-group" style={{maxWidth:260}}>
                    <label className="form-label">Net amount to consignor ({'\u20A6'})</label>
                    <input className="form-input" type="number" value={form.fixed_amount}
                      onChange={e=>setForm(f=>({...f,fixed_amount:e.target.value}))} placeholder="e.g. 500000"/>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Any additional terms, context, or contact notes"/>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving||!form.name.trim()}>
                {saving ? 'Saving\u2026' : editTarget ? 'Save changes' : 'Add consignor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
