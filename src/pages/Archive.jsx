import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useParams, useNavigate } from 'react-router-dom'

const TYPES = [
  { id:'photograph', label:'Photograph' }, { id:'press', label:'Press' },
  { id:'biography', label:'Biography' }, { id:'exhibition', label:'Exhibition' },
  { id:'auction', label:'Auction' }, { id:'certificate', label:'Certificate' },
  { id:'correspondence', label:'Correspondence' }, { id:'essay', label:'Essay' },
  { id:'catalogue', label:'Catalogue' }, { id:'artwork_image', label:'Artwork image' },
  { id:'note', label:'Note' },
]
const TYPE_COLORS = {
  photograph:'#2A4E7A', press:'#8B1A1A', biography:'#5A3A7A', exhibition:'#1A6B6B',
  auction:'#92600a', certificate:'#2d6a4f', correspondence:'#8B1A1A', essay:'#5A3A7A',
  catalogue:'#1A6B6B', artwork_image:'#2A4E7A', note:'#6b6760',
}

export default function Archive() {
  const { artistId: paramArtistId } = useParams()
  const navigate = useNavigate()
  const [artists, setArtists] = useState([])
  const [activeArtistId, setActiveArtistId] = useState(paramArtistId || null)
  const [artworks, setArtworks] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [drawer, setDrawer] = useState(null) // entry id
  const [modal, setModal] = useState(null) // 'add' | 'edit'
  const [editEntry, setEditEntry] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  function emptyForm(artistId = activeArtistId) {
    return { type:'note', title:'', date:'', source:'', description:'', tags:'', artwork_id:'', starred:false }
  }

  useEffect(() => {
    fetchAll('artists', { order: 'name' }).then(setArtists)
  }, [])

  useEffect(() => {
    if (!activeArtistId) return
    setLoading(true)
    Promise.all([
      fetchAll('artworks', { filters:[['artist_id','eq',activeArtistId]], order:'title' }),
      fetchAll('archive_entries', { filters:[['artist_id','eq',activeArtistId]], order:'created_at' }),
    ]).then(([w, e]) => { setArtworks(w); setEntries(e); setLoading(false) })
  }, [activeArtistId])

  const activeArtist = artists.find(a => a.id === activeArtistId)
  const filteredEntries = filter === 'all' ? entries : entries.filter(e => e.type === filter)
  const drawnEntry = entries.find(e => e.id === drawer)

  const typeCounts = useMemo(() => {
    const counts = {}
    entries.forEach(e => { counts[e.type] = (counts[e.type]||0)+1 })
    return counts
  }, [entries])

  function selectArtist(id) {
    setActiveArtistId(id)
    setFilter('all')
    setDrawer(null)
    navigate(`/admin/archive/${id}`, { replace: true })
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const isImage = file.type.startsWith('image/')
      let upload = file
      if (isImage) upload = await resizeImage(file, 1200)
      const path = `archive/${activeArtistId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
      const { error } = await supabase.storage.from('archive-files').upload(path, upload)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('archive-files').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl, file_name: file.name }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally { setUploading(false) }
  }

  async function save() {
    if (!form.title) return alert('Title is required')
    setSaving(true)
    try {
      const payload = {
        artist_id: activeArtistId,
        type: form.type, title: form.title, date: form.date||null,
        source: form.source||null, description: form.description||null,
        tags: form.tags ? form.tags.split(',').map(t=>t.trim()).filter(Boolean) : [],
        artwork_id: form.artwork_id||null, starred: form.starred,
        image_url: form.image_url||null, file_name: form.file_name||null,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'edit' && editEntry) {
        await supabase.from('archive_entries').update(payload).eq('id', editEntry.id)
        setEntries(prev => prev.map(e => e.id === editEntry.id ? { ...e, ...payload } : e))
      } else {
        const { data } = await supabase.from('archive_entries').insert(payload).select().single()
        setEntries(prev => [data, ...prev])
      }
      closeModal()
      toast('Saved')
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally { setSaving(false) }
  }

  async function toggleStar(entry) {
    await supabase.from('archive_entries').update({ starred: !entry.starred }).eq('id', entry.id)
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, starred: !e.starred } : e))
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this archive item?')) return
    await supabase.from('archive_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setDrawer(null)
  }

  function openAdd() {
    setForm({ ...emptyForm(), type:'note' })
    setEditEntry(null)
    setModal('add')
  }

  function openEdit(entry) {
    setForm({
      ...entry,
      tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : '',
    })
    setEditEntry(entry)
    setModal('edit')
  }

  function closeModal() { setModal(null); setEditEntry(null); setForm(emptyForm()) }

  const [toastMsg, setToastMsg] = useState('')
  function toast(msg) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2000) }

  return (
    <div style={{ display:'flex', gap:0, height:'calc(100vh - 56px)', overflow:'hidden', margin:'-28px' }}>
      {/* Artist sidebar */}
      <div style={{ width:220, borderRight:'1px solid var(--line)', overflow:'y-auto', background:'var(--white)', flexShrink:0, display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--line)', fontFamily:'var(--font-serif)', fontSize:'1rem' }}>Live Archive</div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {artists.map(a => (
            <div key={a.id}
              onClick={() => selectArtist(a.id)}
              style={{ padding:'9px 16px', cursor:'pointer', borderLeft:`3px solid ${a.id===activeArtistId?'var(--gold)':'transparent'}`,
                       background: a.id===activeArtistId ? 'var(--parchment)' : 'transparent',
                       fontSize:13 }}>
              <div style={{ fontWeight: a.id===activeArtistId ? 500 : 400 }}>{a.name}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{a.nationality||''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main archive */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {!activeArtistId ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--muted)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', marginBottom:8 }}>Select an artist</div>
              <p style={{ fontSize:13 }}>Choose an artist from the index to view their archive</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--line)', background:'var(--white)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem' }}>{activeArtist?.name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                    {entries.length} archive items · {entries.filter(e=>e.starred).length} key references
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add to archive</button>
              </div>
              {/* Type filters */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button
                  className={`btn btn-sm ${filter==='all'?'btn-primary':'btn-ghost'}`}
                  onClick={() => setFilter('all')}
                >All ({entries.length})</button>
                {TYPES.filter(t => typeCounts[t.id]).map(t => (
                  <button key={t.id}
                    className={`btn btn-sm ${filter===t.id?'btn-primary':'btn-ghost'}`}
                    onClick={() => setFilter(t.id)}
                  >{t.label} ({typeCounts[t.id]})</button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
              {loading ? (
                <div style={{ color:'var(--muted)', fontSize:13 }}>Loading archive…</div>
              ) : filteredEntries.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
                  <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', marginBottom:6 }}>No items yet</div>
                  <p style={{ fontSize:13, marginBottom:16 }}>Start building this artist's archive</p>
                  <button className="btn btn-outline" onClick={openAdd}>+ Add first item</button>
                </div>
              ) : (
                <div style={{ columns:'3 200px', gap:12 }}>
                  {filteredEntries.map(e => (
                    <div key={e.id}
                      onClick={() => setDrawer(e.id)}
                      style={{ breakInside:'avoid', marginBottom:12, border:'1px solid var(--line)', borderRadius:3, background:'var(--white)', cursor:'pointer', overflow:'hidden', borderTop:`3px solid ${TYPE_COLORS[e.type]||'var(--line)'}` }}
                    >
                      {e.image_url && <img src={e.image_url} alt="" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />}
                      <div style={{ padding:'8px 10px 10px' }}>
                        <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.08em', color:TYPE_COLORS[e.type]||'var(--muted)', marginBottom:2 }}>
                          {TYPES.find(t=>t.id===e.type)?.label||e.type}
                          {e.starred && ' ★'}
                        </div>
                        <div style={{ fontFamily:'var(--font-serif)', fontSize:12, lineHeight:1.3, marginBottom:2 }}>{e.title}</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{e.date||''}{e.source?' · '+e.source:''}</div>
                        {e.tags?.length > 0 && (
                          <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginTop:4 }}>
                            {e.tags.slice(0,3).map(t => <span key={t} style={{ fontSize:9, padding:'1px 6px', background:'var(--parchment-2)', borderRadius:20, color:'var(--muted)' }}>{t}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Drawer */}
      {drawer && drawnEntry && (
        <div style={{ width:300, borderLeft:'1px solid var(--line)', background:'var(--white)', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--line)', display:'flex', gap:8 }}>
            <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16 }} onClick={() => setDrawer(null)}>✕</button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.08em', color:TYPE_COLORS[drawnEntry.type]||'var(--muted)' }}>
                {TYPES.find(t=>t.id===drawnEntry.type)?.label||drawnEntry.type}
              </div>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:14, lineHeight:1.25 }}>{drawnEntry.title}</div>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>
            {drawnEntry.image_url && <img src={drawnEntry.image_url} alt="" style={{ width:'100%', borderRadius:3, marginBottom:10, border:'1px solid var(--line)' }} />}
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.6 }}>
              {drawnEntry.date && <><strong>{drawnEntry.date}</strong><br/></>}
              {drawnEntry.source}
            </div>
            {drawnEntry.description && <p style={{ fontSize:12, lineHeight:1.7 }}>{drawnEntry.description}</p>}
            {drawnEntry.tags?.length > 0 && (
              <div style={{ marginTop:10, display:'flex', gap:4, flexWrap:'wrap' }}>
                {drawnEntry.tags.map(t => <span key={t} style={{ fontSize:10, padding:'2px 8px', background:'var(--parchment-2)', borderRadius:20, color:'var(--muted)' }}>{t}</span>)}
              </div>
            )}
            {drawnEntry.artwork_id && (
              <div style={{ marginTop:12, padding:'8px 10px', background:'var(--parchment)', borderRadius:3, fontSize:12, color:'var(--muted)' }}>
                Linked to: {artworks.find(w=>w.id===drawnEntry.artwork_id)?.title || 'artwork'}
              </div>
            )}
          </div>
          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--line)', display:'flex', gap:6, flexWrap:'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(drawnEntry)}>✏ Edit</button>
            <button className="btn btn-ghost btn-sm" onClick={() => toggleStar(drawnEntry)}>{drawnEntry.starred ? '★ Unstar' : '☆ Star'}</button>
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => deleteEntry(drawnEntry.id)}>Delete</button>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {modal && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{modal==='edit' ? 'Edit archive item' : 'Add to archive'}</div>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:13 }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5 }}>
                  {TYPES.map(t => (
                    <button key={t.id}
                      onClick={() => setForm(f=>({...f,type:t.id}))}
                      style={{ padding:'7px 4px', border:`1px solid ${form.type===t.id?'var(--ink)':'var(--line)'}`,
                               borderRadius:3, fontSize:9, cursor:'pointer',
                               background: form.type===t.id ? 'var(--ink)' : 'transparent',
                               color: form.type===t.id ? 'var(--white)' : 'var(--muted)' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-input" value={form.title||''} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" value={form.date||''} onChange={e=>setForm(f=>({...f,date:e.target.value}))} placeholder="2024 or 2024-06-01" />
                </div>
                <div className="form-group">
                  <label className="form-label">Source / publication</label>
                  <input className="form-input" value={form.source||''} onChange={e=>setForm(f=>({...f,source:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={4} value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="form-input" value={form.tags||''} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} />
                </div>
                {artworks.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Link to artwork</label>
                    <select className="form-select" value={form.artwork_id||''} onChange={e=>setForm(f=>({...f,artwork_id:e.target.value}))}>
                      <option value="">— none —</option>
                      {artworks.map(w => <option key={w.id} value={w.id}>{w.title} ({w.year||'—'})</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Image or document</label>
                <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={handleFileUpload} />
                {uploading && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Uploading…</div>}
                {form.image_url && (
                  <img src={form.image_url} alt="" style={{ marginTop:8, maxHeight:120, borderRadius:3, border:'1px solid var(--line)' }} />
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="checkbox" id="starred" checked={form.starred||false} onChange={e=>setForm(f=>({...f,starred:e.target.checked}))} style={{ width:'auto' }} />
                <label htmlFor="starred" style={{ fontSize:13, cursor:'pointer' }}>Mark as key reference</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save to archive'}</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:'var(--ink)', color:'var(--white)', padding:'7px 16px', borderRadius:3, fontSize:12, zIndex:200 }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

async function resizeImage(file, maxPx = 1200) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale; canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(file)
  })
}
