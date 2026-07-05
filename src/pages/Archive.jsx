import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { useParams, useNavigate } from 'react-router-dom'

// ── CONSTANTS ────────────────────────────────────────────────
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
const PROV_TYPES = [
  'Creation','Exhibition','Gallery acquisition','Private acquisition',
  'Corporate acquisition','Auction / private sale','Gallery representation',
  'Bequest / inheritance','Private sale','Gap in record',
]

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function Archive() {
  const { artistId: paramArtistId } = useParams()
  const navigate = useNavigate()

  const [artists, setArtists]           = useState([])
  const [activeArtistId, setActiveArtistId] = useState(paramArtistId || null)
  const [artworks, setArtworks]         = useState([])
  const [entries, setEntries]           = useState([])
  const [provenance, setProvenance]     = useState([]) // all prov entries for artist's artworks
  const [loading, setLoading]           = useState(false)
  const [tab, setTab]                   = useState('archive') // 'archive' | 'artworks'
  const [filter, setFilter]             = useState('all')
  const [drawer, setDrawer]             = useState(null)   // { type: 'entry'|'artwork', id }
  const [modal, setModal]               = useState(null)   // 'addEntry'|'editEntry'|'addArtwork'|'provenance'|'addProv'|'editProv'
  const [editTarget, setEditTarget]     = useState(null)
  const [form, setForm]                 = useState({})
  const [saving, setSaving]             = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [toastMsg, setToastMsg]         = useState('')
  const [artistSearch, setArtistSearch] = useState('')

  // ── Load artists once
  useEffect(() => {
    fetchAll('artists', { order: 'name' }).then(setArtists)
  }, [])

  // ── Load artworks, entries, provenance when artist changes
  useEffect(() => {
    if (!activeArtistId) return
    setLoading(true)
    Promise.all([
      fetchAll('artworks', { filters:[['artist_id','eq',activeArtistId]], order:'title' }),
      fetchAll('archive_entries', { filters:[['artist_id','eq',activeArtistId]], order:'created_at' }),
    ]).then(([w, e]) => {
      setArtworks(w)
      setEntries(e)
      // Load provenance for all these artworks
      if (w.length) {
        supabase.from('provenance_entries')
          .select('*')
          .in('artwork_id', w.map(x => x.id))
          .order('sort_order', { ascending: true })
          .then(({ data }) => setProvenance(data || []))
      } else {
        setProvenance([])
      }
      setLoading(false)
    })
  }, [activeArtistId])

  // ── Derived
  const activeArtist    = artists.find(a => a.id === activeArtistId)
  const filteredArtists = artists.filter(a => !artistSearch || a.name.toLowerCase().includes(artistSearch.toLowerCase()))
  const filteredEntries = filter === 'all' ? entries : entries.filter(e => e.type === filter)
  const typeCounts      = useMemo(() => {
    const c = {}; entries.forEach(e => { c[e.type] = (c[e.type]||0)+1 }); return c
  }, [entries])

  const drawnEntry   = drawer?.type === 'entry'   ? entries.find(e => e.id === drawer.id)   : null
  const drawnArtwork = drawer?.type === 'artwork' ? artworks.find(w => w.id === drawer.id) : null
  const artworkProvenance = drawnArtwork
    ? provenance.filter(p => p.artwork_id === drawnArtwork.id).sort((a,b) => a.sort_order - b.sort_order)
    : []
  const provScore = artworkProvenance.length
    ? Math.round(100 * artworkProvenance.filter(p => !p.is_gap && p.verified).length / artworkProvenance.length)
    : null

  // ── Navigation
  function selectArtist(id) {
    setActiveArtistId(id)
    setFilter('all')
    setDrawer(null)
    setModal(null)
    navigate(`/admin/archive/${id}`, { replace: true })
  }

  // ── Toast
  function toast(msg) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2200) }

  // ── File upload
  async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      let upload = file
      if (file.type.startsWith('image/')) upload = await resizeImage(file, 1200)
      const path = `archive/${activeArtistId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`
      const { error } = await supabase.storage.from('archive-files').upload(path, upload)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('archive-files').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl, file_name: file.name }))
    } catch (err) { alert('Upload failed: ' + err.message) }
    finally { setUploading(false) }
  }

  // ══════════════════════════════════════════════════════════
  // ARCHIVE ENTRY CRUD
  // ══════════════════════════════════════════════════════════
  function openAddEntry(artworkId = '') {
    setForm({ type:'note', title:'', date:'', source:'', description:'', tags:'', artwork_id: artworkId, starred:false })
    setEditTarget(null)
    setModal('addEntry')
  }
  function openEditEntry(entry) {
    setForm({ ...entry, tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : '' })
    setEditTarget(entry)
    setModal('editEntry')
  }
  async function saveEntry() {
    if (!form.title) return alert('Title is required')
    setSaving(true)
    try {
      const payload = {
        artist_id: activeArtistId,
        type: form.type, title: form.title, date: form.date||null,
        source: form.source||null, description: form.description||null,
        tags: form.tags ? form.tags.split(',').map(t=>t.trim()).filter(Boolean) : [],
        artwork_id: form.artwork_id||null, starred: !!form.starred,
        image_url: form.image_url||null, file_name: form.file_name||null,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'editEntry' && editTarget) {
        await supabase.from('archive_entries').update(payload).eq('id', editTarget.id)
        setEntries(prev => prev.map(e => e.id === editTarget.id ? { ...e, ...payload } : e))
      } else {
        const { data } = await supabase.from('archive_entries').insert(payload).select().single()
        setEntries(prev => [data, ...prev])
      }
      setModal(null); toast('Saved')
    } catch(err) { alert('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }
  async function toggleStar(entry) {
    await supabase.from('archive_entries').update({ starred: !entry.starred }).eq('id', entry.id)
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, starred: !e.starred } : e))
  }
  async function deleteEntry(id) {
    if (!confirm('Delete this item?')) return
    await supabase.from('archive_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setDrawer(null)
  }

  // ══════════════════════════════════════════════════════════
  // ARTWORK CRUD (in archive context)
  // ══════════════════════════════════════════════════════════
  function openAddArtwork() {
    setForm({ title:'', year:'', medium:'', dimensions:'', provNotes:'', notes:'' })
    setModal('addArtwork')
  }
  async function saveArtwork() {
    if (!form.title) return alert('Title is required')
    setSaving(true)
    try {
      const { data } = await supabase.from('artworks').insert({
        artist_id: activeArtistId,
        title: form.title, year: form.year||null,
        medium: form.medium||null, dimensions: form.dimensions||null,
        notes: form.notes||null, provNotes: form.provNotes||null,
        availability: 'Available', visible: true,
      }).select().single()
      setArtworks(prev => [...prev, data])
      setModal(null)
      // Switch to artworks tab and open the new artwork's provenance
      setTab('artworks')
      setDrawer({ type:'artwork', id: data.id })
      toast('Artwork added — build its provenance record below')
    } catch(err) { alert('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  // ══════════════════════════════════════════════════════════
  // PROVENANCE CRUD
  // ══════════════════════════════════════════════════════════
  function openAddProv(artworkId, isGap = false) {
    setForm({
      artwork_id: artworkId, is_gap: isGap,
      date_from:'', date_to:'', owner:'', location:'',
      entry_type: isGap ? 'Gap in record' : 'Private acquisition',
      description:'', docs:'', verified: true,
    })
    setEditTarget(null)
    setModal(isGap ? 'addProvGap' : 'addProv')
  }
  function openEditProv(entry) {
    setForm({ ...entry, docs: Array.isArray(entry.docs) ? entry.docs.join(', ') : (entry.docs||'') })
    setEditTarget(entry)
    setModal(entry.is_gap ? 'addProvGap' : 'addProv')
  }
  async function saveProv() {
    setSaving(true)
    try {
      const isGap = form.is_gap || modal === 'addProvGap'
      const existing = provenance.filter(p => p.artwork_id === form.artwork_id)
      const payload = {
        artwork_id: form.artwork_id,
        is_gap: isGap,
        date_from: form.date_from||null,
        date_to: form.date_to||null,
        owner: isGap ? null : (form.owner||null),
        location: isGap ? null : (form.location||null),
        entry_type: form.entry_type||null,
        description: form.description||null,
        docs: form.docs ? form.docs.split(',').map(d=>d.trim()).filter(Boolean) : [],
        verified: isGap ? false : !!form.verified,
        sort_order: editTarget ? editTarget.sort_order : existing.length,
      }
      if (editTarget) {
        await supabase.from('provenance_entries').update(payload).eq('id', editTarget.id)
        setProvenance(prev => prev.map(p => p.id === editTarget.id ? { ...p, ...payload } : p))
      } else {
        const { data } = await supabase.from('provenance_entries').insert(payload).select().single()
        setProvenance(prev => [...prev, data])
      }
      setModal(null); toast('Provenance entry saved')
    } catch(err) { alert('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }
  async function deleteProv(id) {
    if (!confirm('Delete this provenance entry?')) return
    await supabase.from('provenance_entries').delete().eq('id', id)
    setProvenance(prev => prev.filter(p => p.id !== id))
    toast('Entry deleted')
  }

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden', margin:'-28px' }}>

      {/* ── ARTIST RAIL ── */}
      <div style={{ width:220, borderRight:'1px solid var(--line)', background:'var(--white)', flexShrink:0, display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line)' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1rem', marginBottom:8 }}>Live Archive</div>
          <input
            className="form-input"
            style={{ fontSize:12 }}
            placeholder="Search artists…"
            value={artistSearch}
            onChange={e => setArtistSearch(e.target.value)}
          />
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {filteredArtists.map(a => (
            <div key={a.id}
              onClick={() => selectArtist(a.id)}
              style={{ padding:'8px 14px', cursor:'pointer', fontSize:13,
                       borderLeft:`3px solid ${a.id===activeArtistId?'var(--gold)':'transparent'}`,
                       background: a.id===activeArtistId ? 'var(--parchment)' : 'transparent' }}>
              <div style={{ fontWeight: a.id===activeArtistId?500:400 }}>{a.name}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{a.nationality||''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {!activeArtistId ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', marginBottom:8 }}>Select an artist</div>
              <p style={{ fontSize:13 }}>Choose from the index to view their archive</p>
            </div>
          </div>
        ) : (<>

          {/* Header */}
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--line)', background:'var(--white)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div>
                <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.15rem' }}>{activeArtist?.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {entries.length} archive items · {artworks.length} works · {entries.filter(e=>e.starred).length} key refs
                </div>
              </div>
              <div style={{ display:'flex', gap:7 }}>
                <button className="btn btn-outline btn-sm" onClick={openAddArtwork}>+ Add artwork</button>
                <button className="btn btn-primary btn-sm" onClick={() => openAddEntry()}>+ Add to archive</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:0, borderBottom:'none' }}>
              {[['archive',`Archive (${entries.length})`],['artworks',`Artworks & Provenance (${artworks.length})`]].map(([key,label]) => (
                <button key={key} onClick={() => { setTab(key); setDrawer(null) }}
                  style={{ padding:'6px 14px', fontSize:12, cursor:'pointer', background:'none', border:'none',
                           borderBottom: tab===key ? '2px solid var(--ink)' : '2px solid transparent',
                           color: tab===key ? 'var(--ink)' : 'var(--muted)', fontFamily:'var(--font-sans)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
            <div style={{ flex:1, overflowY:'auto', padding:'18px' }}>
              {loading ? <div style={{ color:'var(--muted)', fontSize:13 }}>Loading…</div>

              : tab === 'archive' ? (
                <>
                  {/* Type filter pills */}
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:14 }}>
                    <button className={`btn btn-sm ${filter==='all'?'btn-primary':'btn-ghost'}`} onClick={() => setFilter('all')}>All ({entries.length})</button>
                    {TYPES.filter(t => typeCounts[t.id]).map(t => (
                      <button key={t.id} className={`btn btn-sm ${filter===t.id?'btn-primary':'btn-ghost'}`} onClick={() => setFilter(t.id)}>
                        {t.label} ({typeCounts[t.id]})
                      </button>
                    ))}
                  </div>

                  {filteredEntries.length === 0
                    ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
                        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', marginBottom:8 }}>No items yet</div>
                        <button className="btn btn-outline" onClick={() => openAddEntry()}>+ Add first item</button>
                      </div>
                    : <div style={{ columns:'3 180px', gap:10 }}>
                        {filteredEntries.map(e => (
                          <div key={e.id}
                            onClick={() => setDrawer({ type:'entry', id:e.id })}
                            style={{ breakInside:'avoid', marginBottom:10, border:'1px solid var(--line)', borderTop:`3px solid ${TYPE_COLORS[e.type]||'var(--line)'}`, borderRadius:3, background:'var(--white)', cursor:'pointer', overflow:'hidden' }}
                          >
                            {e.image_url && <img src={e.image_url} alt="" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />}
                            <div style={{ padding:'8px 10px 10px' }}>
                              <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.08em', color:TYPE_COLORS[e.type]||'var(--muted)', marginBottom:2 }}>
                                {TYPES.find(t=>t.id===e.type)?.label||e.type}{e.starred?' ★':''}
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
                  }
                </>
              )

              : (
                /* ARTWORKS & PROVENANCE TAB */
                <div>
                  {artworks.length === 0
                    ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
                        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', marginBottom:8 }}>No artworks yet</div>
                        <button className="btn btn-outline" onClick={openAddArtwork}>+ Add first artwork</button>
                      </div>
                    : artworks.map(w => {
                        const wProv = provenance.filter(p => p.artwork_id === w.id)
                        const real  = wProv.filter(p => !p.is_gap)
                        const gaps  = wProv.filter(p => p.is_gap)
                        const sc    = wProv.length ? Math.round(100 * real.filter(p=>p.verified).length / wProv.length) : null
                        const scC   = sc === 100 ? 'var(--green)' : sc >= 60 ? 'var(--amber)' : 'var(--red)'
                        const isOpen = drawer?.type === 'artwork' && drawer?.id === w.id
                        return (
                          <div key={w.id}
                            style={{ marginBottom:10, border:`1px solid ${isOpen?'var(--ink)':'var(--line)'}`, borderRadius:3, background:'var(--white)', overflow:'hidden' }}>
                            {/* Artwork row */}
                            <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                              onClick={() => setDrawer(isOpen ? null : { type:'artwork', id:w.id })}>
                              {w.image_url && <img src={w.image_url} alt="" style={{ width:48, height:48, objectFit:'cover', borderRadius:2, border:'1px solid var(--line)', flexShrink:0 }} />}
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontFamily:'var(--font-serif)', fontSize:14, fontWeight:500 }}>{w.title}</div>
                                <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{[w.year, w.medium, w.dimensions].filter(Boolean).join(' · ')}</div>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                                {sc !== null && (
                                  <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:scC }}>{sc}%</div>
                                    <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>prov.</div>
                                  </div>
                                )}
                                <div style={{ fontSize:11, color:'var(--muted)' }}>{wProv.length} entr{wProv.length===1?'y':'ies'}</div>
                                <span style={{ color:'var(--muted)', fontSize:16 }}>{isOpen?'▲':'▼'}</span>
                              </div>
                            </div>

                            {/* Expanded provenance panel */}
                            {isOpen && (
                              <div style={{ borderTop:'1px solid var(--line)', padding:'14px 16px', background:'var(--parchment)' }}>

                                {/* Provenance notes banner */}
                                {(w.provNotes || w.notes) && (
                                  <div style={{ background:'#fdf3e0', border:'1px solid #e0c88a', borderLeft:'3px solid var(--amber)', borderRadius:'0 3px 3px 0', padding:'10px 12px', marginBottom:14, fontSize:12, color:'var(--ink)', lineHeight:1.7 }}>
                                    <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--amber)', marginBottom:4 }}>📝 Provenance notes</div>
                                    {w.provNotes || w.notes}
                                  </div>
                                )}

                                {/* Completeness bar */}
                                {sc !== null && (
                                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, background:'var(--white)', padding:'8px 12px', borderRadius:3 }}>
                                    <span style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>Documentation completeness</span>
                                    <div style={{ flex:1, height:4, background:'var(--line)', borderRadius:2, overflow:'hidden' }}>
                                      <div style={{ height:'100%', width:`${sc}%`, background:scC, borderRadius:2 }} />
                                    </div>
                                    <span style={{ fontSize:12, fontWeight:600, color:scC, whiteSpace:'nowrap' }}>{sc}%</span>
                                  </div>
                                )}

                                {/* Provenance chain */}
                                {wProv.length === 0
                                  ? <div style={{ textAlign:'center', padding:'20px 0', color:'var(--muted)', fontSize:13 }}>No provenance entries yet — add the first record below</div>
                                  : wProv.map((p, i) => (
                                      <ProvEntry key={p.id} entry={p} onEdit={() => openEditProv(p)} onDelete={() => deleteProv(p.id)} />
                                    ))
                                }

                                {/* Add buttons */}
                                <div style={{ display:'flex', gap:8, marginTop:12 }}>
                                  <button className="btn btn-primary btn-sm" onClick={() => openAddProv(w.id, false)}>+ Add ownership entry</button>
                                  <button className="btn btn-sm" style={{ color:'var(--sienna)', borderColor:'var(--sienna)' }} onClick={() => openAddProv(w.id, true)}>⚠ Flag gap</button>
                                  <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }} onClick={() => openAddEntry(w.id)}>+ Add archive item</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                  }
                </div>
              )}
            </div>

            {/* ── ENTRY DRAWER ── */}
            {drawer?.type === 'entry' && drawnEntry && (
              <div style={{ width:300, borderLeft:'1px solid var(--line)', background:'var(--white)', display:'flex', flexDirection:'column', flexShrink:0 }}>
                <div style={{ padding:'11px 13px', borderBottom:'1px solid var(--line)', display:'flex', gap:8, alignItems:'flex-start' }}>
                  <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16 }} onClick={() => setDrawer(null)}>✕</button>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.08em', color:TYPE_COLORS[drawnEntry.type]||'var(--muted)' }}>
                      {TYPES.find(t=>t.id===drawnEntry.type)?.label||drawnEntry.type}
                    </div>
                    <div style={{ fontFamily:'var(--font-serif)', fontSize:14, lineHeight:1.25 }}>{drawnEntry.title}</div>
                  </div>
                </div>
                <div style={{ flex:1, overflowY:'auto', padding:13 }}>
                  {drawnEntry.image_url && <img src={drawnEntry.image_url} alt="" style={{ width:'100%', borderRadius:3, marginBottom:10, border:'1px solid var(--line)' }} />}
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:9, lineHeight:1.6 }}>
                    {drawnEntry.date && <><strong>{drawnEntry.date}</strong><br/></>}
                    {drawnEntry.source}
                  </div>
                  {drawnEntry.description && <p style={{ fontSize:12, lineHeight:1.7, marginBottom:9 }}>{drawnEntry.description}</p>}
                  {drawnEntry.tags?.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:9 }}>
                      {drawnEntry.tags.map(t => <span key={t} style={{ fontSize:10, padding:'2px 8px', background:'var(--parchment-2)', borderRadius:20, color:'var(--muted)' }}>{t}</span>)}
                    </div>
                  )}
                  {drawnEntry.artwork_id && (
                    <div style={{ padding:'7px 10px', background:'var(--parchment)', borderRadius:3, fontSize:12, color:'var(--muted)' }}>
                      Linked to: {artworks.find(w=>w.id===drawnEntry.artwork_id)?.title || 'artwork'}
                    </div>
                  )}
                </div>
                <div style={{ padding:'9px 13px', borderTop:'1px solid var(--line)', display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEditEntry(drawnEntry)}>✏ Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleStar(drawnEntry)}>{drawnEntry.starred?'★ Unstar':'☆ Star'}</button>
                  <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => deleteEntry(drawnEntry.id)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        </>)}
      </div>

      {/* ══════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════ */}

      {/* ── Add / Edit Archive Entry ── */}
      {(modal === 'addEntry' || modal === 'editEntry') && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{modal==='editEntry' ? 'Edit archive item' : 'Add to archive'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:13 }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
                  {TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f=>({...f,type:t.id}))}
                      style={{ padding:'6px 4px', border:`1px solid ${form.type===t.id?'var(--ink)':'var(--line)'}`, borderRadius:3, fontSize:9, cursor:'pointer',
                               background: form.type===t.id?'var(--ink)':'transparent', color: form.type===t.id?'var(--white)':'var(--muted)' }}>
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
                {form.image_url && <img src={form.image_url} alt="" style={{ marginTop:8, maxHeight:120, borderRadius:3, border:'1px solid var(--line)' }} />}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="checkbox" id="starred" checked={!!form.starred} onChange={e=>setForm(f=>({...f,starred:e.target.checked}))} style={{ width:'auto' }} />
                <label htmlFor="starred" style={{ fontSize:13, cursor:'pointer' }}>Mark as key reference</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEntry} disabled={saving}>{saving?'Saving…':'Save to archive'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Artwork ── */}
      {modal === 'addArtwork' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Add artwork to archive</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:13 }}>
              <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 12px', background:'var(--parchment)', borderRadius:3 }}>
                Adding an artwork here creates it in the gallery database and opens the provenance builder so you can start documenting its ownership history immediately.
              </div>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-input" value={form.title||''} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Title of the work" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <input className="form-input" value={form.year||''} onChange={e=>setForm(f=>({...f,year:e.target.value}))} placeholder="e.g. 1973" />
                </div>
                <div className="form-group">
                  <label className="form-label">Medium</label>
                  <input className="form-input" value={form.medium||''} onChange={e=>setForm(f=>({...f,medium:e.target.value}))} placeholder="Oil on canvas" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Dimensions</label>
                <input className="form-input" value={form.dimensions||''} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))} placeholder="91.5 × 61 cm" />
              </div>
              <div className="form-group">
                <label className="form-label">Provenance notes <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:10, color:'var(--gold)' }}>— known history, ownership context</span></label>
                <textarea className="form-textarea" rows={3} value={form.provNotes||''} onChange={e=>setForm(f=>({...f,provNotes:e.target.value}))} placeholder="e.g. Exhibited at FESTAC 77; acquired by Uche Okeke; sold by estate 2026…" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Subject, inscriptions, condition…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveArtwork} disabled={saving}>{saving?'Saving…':'Add artwork & build provenance'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Provenance Entry ── */}
      {(modal === 'addProv' || modal === 'addProvGap' || modal === 'editProv') && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title" style={{ color: modal==='addProvGap' ? 'var(--sienna)' : 'var(--ink)' }}>
                {modal === 'addProvGap' ? '⚠ Flag provenance gap' : editTarget ? 'Edit provenance entry' : 'Add provenance entry'}
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:13 }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">From year / date</label>
                  <input className="form-input" value={form.date_from||''} onChange={e=>setForm(f=>({...f,date_from:e.target.value}))} placeholder="1977" />
                </div>
                <div className="form-group">
                  <label className="form-label">To year / date <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:10 }}>blank = present</span></label>
                  <input className="form-input" value={form.date_to||''} onChange={e=>setForm(f=>({...f,date_to:e.target.value}))} placeholder="1998" />
                </div>
              </div>

              {modal !== 'addProvGap' && <>
                <div className="form-group">
                  <label className="form-label">Owner / custodian *</label>
                  <input className="form-input" value={form.owner||''} onChange={e=>setForm(f=>({...f,owner:e.target.value}))} placeholder="Name of person, institution, or event" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input className="form-input" value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="City, country" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Entry type</label>
                    <select className="form-select" value={form.entry_type||''} onChange={e=>setForm(f=>({...f,entry_type:e.target.value}))}>
                      {PROV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </>}

              <div className="form-group">
                <label className="form-label">{modal==='addProvGap' ? 'Gap description' : 'Description / context'}</label>
                <textarea className="form-textarea" rows={3} value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  placeholder={modal==='addProvGap' ? 'Reason for gap — no documentation available, disputed ownership, etc.' : 'How ownership was transferred, exhibition context, acquisition method…'} />
              </div>

              {modal !== 'addProvGap' && <>
                <div className="form-group">
                  <label className="form-label">Supporting documents <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:10 }}>comma-separated</span></label>
                  <input className="form-input" value={form.docs||''} onChange={e=>setForm(f=>({...f,docs:e.target.value}))} placeholder="Gallery invoice, Exhibition catalogue, Letter of acquisition" />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="checkbox" id="verified" checked={!!form.verified} onChange={e=>setForm(f=>({...f,verified:e.target.checked}))} style={{ width:'auto' }} />
                  <label htmlFor="verified" style={{ fontSize:13, cursor:'pointer' }}>Documentation verified</label>
                </div>
              </>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProv} disabled={saving}>{saving?'Saving…':'Save entry'}</button>
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

// ── PROVENANCE ENTRY CARD ────────────────────────────────────
function ProvEntry({ entry: p, onEdit, onDelete }) {
  if (p.is_gap) return (
    <div style={{ background:'var(--sienna-bg)', border:'1px solid #E8B79A', borderLeft:'3px solid var(--sienna)', borderRadius:'0 3px 3px 0', padding:'9px 12px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--sienna)', marginBottom:3 }}>
          ⚠ Gap in record · {p.date_from||''}{p.date_to?' – '+p.date_to:''}
        </div>
        <div style={{ fontSize:12, color:'var(--sienna)' }}>{p.description || 'No documentation for this period'}</div>
      </div>
      <div style={{ display:'flex', gap:4, marginLeft:10, flexShrink:0 }}>
        <button onClick={onEdit} className="btn btn-ghost btn-sm" style={{ padding:'2px 7px', fontSize:11 }}>✏</button>
        <button onClick={onDelete} className="btn btn-ghost btn-sm" style={{ padding:'2px 7px', fontSize:11, color:'var(--sienna)' }}>✕</button>
      </div>
    </div>
  )
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--line)', borderLeft:'3px solid var(--gold)', borderRadius:'0 3px 3px 0', padding:'9px 12px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--gold)', marginBottom:3 }}>
          {p.date_from||'?'}{p.date_to?' – '+p.date_to:' – present'} · {p.entry_type||''} ·{' '}
          <span style={{ color: p.verified ? 'var(--green)' : 'var(--amber)' }}>{p.verified?'VERIFIED':'UNVERIFIED'}</span>
        </div>
        <div style={{ fontSize:13, fontWeight:500, color:'var(--ink)', marginBottom:2 }}>{p.owner || 'Unknown'}</div>
        <div style={{ fontSize:11, color:'var(--muted)' }}>
          {p.location||''}{p.description ? (p.location?' — ':'')+p.description.slice(0,100)+(p.description.length>100?'…':'') : ''}
        </div>
        {p.docs?.length > 0 && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:5 }}>
            {p.docs.map(d => <span key={d} style={{ fontSize:9, padding:'1px 7px', background:'var(--parchment-2)', borderRadius:20, color:'var(--muted)' }}>📄 {d}</span>)}
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:4, marginLeft:10, flexShrink:0 }}>
        <button onClick={onEdit} className="btn btn-ghost btn-sm" style={{ padding:'2px 7px', fontSize:11 }}>✏</button>
        <button onClick={onDelete} className="btn btn-ghost btn-sm" style={{ padding:'2px 7px', fontSize:11, color:'var(--red)' }}>✕</button>
      </div>
    </div>
  )
}

// ── HELPERS ──────────────────────────────────────────────────
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
