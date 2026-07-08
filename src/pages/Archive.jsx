import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { LOGO_B64 } from '../lib/assets'
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
        {/* Create Provenance Document button */}
        <div style={{ padding:'10px 12px', borderTop:'1px solid var(--line)', flexShrink:0 }}>
          <button
            className="btn btn-gold"
            style={{ width:'100%', fontSize:12, padding:'9px 12px', justifyContent:'center' }}
            onClick={() => setModal('provDoc')}
          >
            📋 Create Provenance Document
          </button>
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

      {/* ── Provenance Document Builder ── */}
      {modal === 'provDoc' && (
        <ProvenanceDocBuilder
          artists={artists}
          allArtworks={artworks}
          allEntries={entries}
          allProvenance={provenance}
          activeArtistId={activeArtistId}
          onClose={() => setModal(null)}
          onLoadArtist={(id) => { selectArtist(id) }}
        />
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

// ══════════════════════════════════════════════════════════════
// PROVENANCE DOCUMENT BUILDER
// A multi-step wizard that generates a printable provenance report
// ══════════════════════════════════════════════════════════════
function ProvenanceDocBuilder({ artists, allArtworks, allEntries, allProvenance, activeArtistId, onClose, onLoadArtist }) {
  const [step, setStep]           = useState(1) // 1=source, 2=artwork details, 3=select evidence, 4=preview
  const [source, setSource]       = useState('') // 'existing' | 'fresh'
  const [selectedArtistId, setSelectedArtistId] = useState(activeArtistId || '')
  const [selectedArtworkId, setSelectedArtworkId] = useState('')
  const [artistSearch, setArtistSearch] = useState('')
  const [artworkSearch, setArtworkSearch] = useState('')

  // Artwork details (used for both fresh and existing — editable either way)
  const [details, setDetails] = useState({
    artistName:'', title:'', year:'', medium:'', dimensions:'',
    catRef:'', location:'', condition:'', notes:'', provNotes:'',
    reportTitle:'', additionalNotes:'', exhibitionHistory:'', otherInfo:'',
    imageUrl:'',
  })

  // Evidence selection
  const [included, setIncluded] = useState(new Set())

  // All artworks across all artists for existing lookup
  const [allArtworksGlobal, setAllArtworksGlobal] = useState([])
  const [allEntriesGlobal, setAllEntriesGlobal]   = useState([])
  const [allProvGlobal, setAllProvGlobal]          = useState([])
  const [loadingGlobal, setLoadingGlobal]          = useState(false)

  // Load all artworks/entries globally when needed
  useEffect(() => {
    if (source !== 'existing') return
    setLoadingGlobal(true)
    Promise.all([
      fetchAll('artworks', { order: 'title' }),
      fetchAll('archive_entries', { order: 'created_at' }),
      fetchAll('provenance_entries', { order: 'sort_order' }),
    ]).then(([w, e, p]) => {
      setAllArtworksGlobal(w)
      setAllEntriesGlobal(e)
      setAllProvGlobal(p)
      setLoadingGlobal(false)
    })
  }, [source])

  const artistMap = Object.fromEntries(artists.map(a => [a.id, a]))

  // Artworks for selected artist
  const artistArtworks = source === 'existing'
    ? allArtworksGlobal.filter(w => !selectedArtistId || w.artist_id === selectedArtistId)
    : []

  const filteredArtworks = artistArtworks.filter(w =>
    !artworkSearch || w.title.toLowerCase().includes(artworkSearch.toLowerCase())
  )

  const selectedArtwork = allArtworksGlobal.find(w => w.id === selectedArtworkId)

  // When artwork selected, populate details
  function selectExistingArtwork(artwork) {
    setSelectedArtworkId(artwork.id)
    const artist = artistMap[artwork.artist_id]
    setDetails(d => ({
      ...d,
      artistName: artist?.name || '',
      title: artwork.title || '',
      year: artwork.year || '',
      medium: artwork.medium || '',
      dimensions: artwork.dimensions || '',
      catRef: artwork.catRef || '',
      location: artwork.location || '',
      condition: artwork.condition || '',
      notes: artwork.notes || '',
      provNotes: artwork.provNotes || '',
      imageUrl: artwork.image_url || '',
      reportTitle: `Provenance Report — ${artwork.title}`,
    }))
    // Auto-select relevant archive evidence
    const artworkEntries = allEntriesGlobal.filter(e => e.artwork_id === artwork.id)
    const artistEntries  = allEntriesGlobal.filter(e => e.artist_id === artwork.artist_id && e.starred)
    const newIncluded = new Set([...artworkEntries.map(e=>e.id), ...artistEntries.map(e=>e.id)])
    setIncluded(newIncluded)
    setStep(2)
  }

  // Evidence pool: artwork-linked + artist key refs + matched by title keywords
  const evidencePool = useMemo(() => {
    const artworkId = source === 'existing' ? selectedArtworkId : null
    const artistId  = source === 'existing' ? selectedArtwork?.artist_id : null
    const titleWords = details.title.toLowerCase().split(/\s+/).filter(w=>w.length>2)

    const pool = []
    const seen = new Set()

    const addEntry = (e, relevance) => {
      if (seen.has(e.id)) return
      seen.add(e.id)
      pool.push({ ...e, _relevance: relevance })
    }

    // Direct artwork links
    allEntriesGlobal.filter(e => e.artwork_id === artworkId).forEach(e => addEntry(e, 'direct'))
    allEntriesGlobal.filter(e => e.artwork_id === artworkId).forEach(e => addEntry(e, 'direct'))

    // Starred artist entries
    if (artistId) {
      allEntriesGlobal.filter(e => e.artist_id === artistId && e.starred && e.artwork_id !== artworkId)
        .forEach(e => addEntry(e, 'key_ref'))
    }

    // Title keyword matches
    if (titleWords.length) {
      allEntriesGlobal
        .filter(e => e.artwork_id !== artworkId)
        .filter(e => {
          const s = [e.title, e.description, ...(e.tags||[])].join(' ').toLowerCase()
          return titleWords.some(w => s.includes(w))
        })
        .forEach(e => addEntry(e, 'keyword'))
    }

    // Artist biography/essay entries
    if (artistId) {
      allEntriesGlobal
        .filter(e => e.artist_id === artistId && ['biography','essay'].includes(e.type))
        .forEach(e => addEntry(e, 'background'))
    }

    return pool
  }, [allEntriesGlobal, selectedArtworkId, selectedArtwork, details.title])

  // Provenance chain for selected artwork
  const provChain = source === 'existing' && selectedArtworkId
    ? allProvGlobal.filter(p => p.artwork_id === selectedArtworkId).sort((a,b) => a.sort_order - b.sort_order)
    : []

  const provScore = provChain.length
    ? Math.round(100 * provChain.filter(p => !p.is_gap && p.verified).length / provChain.length)
    : null
  const scC = provScore === 100 ? '#2d6a4f' : provScore >= 60 ? '#92600a' : '#8b1a1a'

  function toggleEvidence(id) {
    setIncluded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function generateAndPrint() {
    const artist = source === 'existing' ? artistMap[selectedArtwork?.artist_id] : { name: details.artistName }
    const artwork = source === 'existing' ? selectedArtwork : null
    const incEntries = evidencePool.filter(e => included.has(e.id))
    const html = buildProvDocHTML({ details, artist, artwork, provChain, incEntries, provScore, scC, logo: LOGO_B64 })
    const w = window.open('', '_blank', 'width=1000,height=750')
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 600)
  }

  const RELEVANCE_LABEL = { direct:'Linked', key_ref:'Key ref', keyword:'Title match', background:'Background' }
  const RELEVANCE_COLOR = { direct:'var(--green)', key_ref:'var(--gold)', keyword:'var(--blue)', background:'var(--muted)' }

  // ── STEP 1: Source selection
  const renderStep1 = () => (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.65 }}>
        Choose how to start. You can build from an artwork already in the system — pulling its provenance chain and archive evidence automatically — or start from fresh input if the work isn't in the archive yet.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div
          onClick={() => { setSource('existing'); }}
          style={{ padding:'20px', border:`2px solid ${source==='existing'?'var(--ink)':'var(--line)'}`, borderRadius:4, cursor:'pointer', background: source==='existing'?'var(--ink)':'var(--white)', transition:'all 150ms' }}
        >
          <div style={{ fontSize:'1.4rem', marginBottom:8 }}>🗄</div>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.05rem', marginBottom:6, color: source==='existing'?'var(--white)':'var(--ink)' }}>From existing artwork</div>
          <div style={{ fontSize:12, color: source==='existing'?'rgba(255,255,255,.65)':'var(--muted)', lineHeight:1.6 }}>
            Select an artwork already in the Live Archive. Pulls its provenance chain, linked archive entries, and key references automatically.
          </div>
        </div>
        <div
          onClick={() => { setSource('fresh'); setStep(2) }}
          style={{ padding:'20px', border:`2px solid ${source==='fresh'?'var(--ink)':'var(--line)'}`, borderRadius:4, cursor:'pointer', background: source==='fresh'?'var(--ink)':'var(--white)', transition:'all 150ms' }}
        >
          <div style={{ fontSize:'1.4rem', marginBottom:8 }}>✏</div>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.05rem', marginBottom:6, color: source==='fresh'?'var(--white)':'var(--ink)' }}>Fresh input</div>
          <div style={{ fontSize:12, color: source==='fresh'?'rgba(255,255,255,.65)':'var(--muted)', lineHeight:1.6 }}>
            Enter artwork details and provenance information directly. You can still pull in relevant evidence from the archive.
          </div>
        </div>
      </div>

      {source === 'existing' && (
        <div style={{ marginTop:4 }}>
          <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:10 }}>Select artist then artwork</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {/* Artist picker */}
            <div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:5 }}>Artist</div>
              <input className="form-input" placeholder="Search artists…" value={artistSearch} onChange={e=>setArtistSearch(e.target.value)} style={{ marginBottom:6 }} />
              <div style={{ border:'1px solid var(--line)', borderRadius:3, maxHeight:200, overflowY:'auto', background:'var(--white)' }}>
                {artists.filter(a => !artistSearch || a.name.toLowerCase().includes(artistSearch.toLowerCase())).map(a => (
                  <div key={a.id}
                    onClick={() => { setSelectedArtistId(a.id); setSelectedArtworkId(''); setArtworkSearch('') }}
                    style={{ padding:'7px 10px', cursor:'pointer', fontSize:13, borderLeft:`3px solid ${selectedArtistId===a.id?'var(--gold)':'transparent'}`, background: selectedArtistId===a.id?'var(--parchment)':'transparent' }}>
                    {a.name}
                  </div>
                ))}
              </div>
            </div>
            {/* Artwork picker */}
            <div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:5 }}>Artwork</div>
              <input className="form-input" placeholder="Search artworks…" value={artworkSearch} onChange={e=>setArtworkSearch(e.target.value)} style={{ marginBottom:6 }} disabled={!selectedArtistId} />
              <div style={{ border:'1px solid var(--line)', borderRadius:3, maxHeight:200, overflowY:'auto', background:'var(--white)' }}>
                {loadingGlobal
                  ? <div style={{ padding:'12px', fontSize:12, color:'var(--muted)' }}>Loading artworks…</div>
                  : !selectedArtistId
                    ? <div style={{ padding:'12px', fontSize:12, color:'var(--muted)' }}>Select an artist first</div>
                    : filteredArtworks.length === 0
                      ? <div style={{ padding:'12px', fontSize:12, color:'var(--muted)' }}>No artworks found</div>
                      : filteredArtworks.map(w => (
                          <div key={w.id}
                            onClick={() => selectExistingArtwork(w)}
                            style={{ padding:'7px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid var(--line-soft)' }}>
                            {w.image_url && <img src={w.image_url} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:2, flexShrink:0 }} />}
                            <div>
                              <div style={{ fontSize:12, fontWeight:500 }}>{w.title}</div>
                              <div style={{ fontSize:10, color:'var(--muted)' }}>{w.year} · {w.medium}</div>
                            </div>
                          </div>
                        ))
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ── STEP 2: Artwork details
  const renderStep2 = () => (
    <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
      <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 12px', background:'var(--parchment)', borderRadius:3 }}>
        {source === 'existing' ? 'Details pre-filled from the archive. Edit anything that should appear differently in the document.' : 'Enter the artwork details for this provenance document.'}
      </div>
      <div className="form-group">
        <label className="form-label">Report title</label>
        <input className="form-input" value={details.reportTitle||''} onChange={e=>setDetails(d=>({...d,reportTitle:e.target.value}))} placeholder="e.g. Provenance Report — Tutu" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Artist name *</label>
          <input className="form-input" value={details.artistName||''} onChange={e=>setDetails(d=>({...d,artistName:e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Title *</label>
          <input className="form-input" value={details.title||''} onChange={e=>setDetails(d=>({...d,title:e.target.value}))} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Year</label>
          <input className="form-input" value={details.year||''} onChange={e=>setDetails(d=>({...d,year:e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Medium</label>
          <input className="form-input" value={details.medium||''} onChange={e=>setDetails(d=>({...d,medium:e.target.value}))} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Dimensions</label>
          <input className="form-input" value={details.dimensions||''} onChange={e=>setDetails(d=>({...d,dimensions:e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Catalogue raisonné ref.</label>
          <input className="form-input" value={details.catRef||''} onChange={e=>setDetails(d=>({...d,catRef:e.target.value}))} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Current location / owner</label>
          <input className="form-input" value={details.location||''} onChange={e=>setDetails(d=>({...d,location:e.target.value}))} />
        </div>
        <div className="form-group">
          <label className="form-label">Condition</label>
          <input className="form-input" value={details.condition||''} onChange={e=>setDetails(d=>({...d,condition:e.target.value}))} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Notes about the work</label>
        <textarea className="form-textarea" rows={2} value={details.notes||''} onChange={e=>setDetails(d=>({...d,notes:e.target.value}))} placeholder="Subject, inscriptions, signatures…" />
      </div>
      <div className="form-group">
        <label className="form-label">Provenance notes <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:10, color:'var(--gold)' }}>— narrative ownership context, shown in provenance section</span></label>
        <textarea className="form-textarea" rows={3} value={details.provNotes||''} onChange={e=>setDetails(d=>({...d,provNotes:e.target.value}))} placeholder="e.g. Exhibited FESTAC 77; acquired by Uche Okeke; sold by his estate 2026…" />
      </div>
      <div className="form-group">
        <label className="form-label">Exhibition history</label>
        <textarea className="form-textarea" rows={3} value={details.exhibitionHistory||''} onChange={e=>setDetails(d=>({...d,exhibitionHistory:e.target.value}))} placeholder="e.g. FESTAC 77, Lagos; Smithsonian Institution 1982; National Gallery of Modern Art, New Delhi 1996…" />
      </div>
      <div className="form-group">
        <label className="form-label">Other information</label>
        <textarea className="form-textarea" rows={2} value={details.otherInfo||''} onChange={e=>setDetails(d=>({...d,otherInfo:e.target.value}))} placeholder="Literature references, inscriptions, stamps, labels, condition notes…" />
      </div>
      <div className="form-group">
        <label className="form-label">Additional notes for this document</label>
        <textarea className="form-textarea" rows={2} value={details.additionalNotes||''} onChange={e=>setDetails(d=>({...d,additionalNotes:e.target.value}))} placeholder="Any caveats, specific requirements, or context for this report…" />
      </div>

      {/* Provenance chain preview (existing only) */}
      {source === 'existing' && provChain.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:8 }}>
            Provenance chain ({provChain.length} entries) · {provScore}% documented
          </div>
          <div style={{ maxHeight:180, overflowY:'auto', padding:1 }}>
            {provChain.map(p => (
              <div key={p.id} style={{
                padding:'7px 10px', marginBottom:6, fontSize:12,
                background: p.is_gap ? 'var(--sienna-bg)' : 'var(--parchment)',
                border: `1px solid ${p.is_gap?'#E8B79A':'var(--line)'}`,
                borderLeft: `3px solid ${p.is_gap?'var(--sienna)':'var(--gold)'}`,
                borderRadius:'0 3px 3px 0',
              }}>
                <span style={{ color: p.is_gap?'var(--sienna)':'var(--gold)', fontSize:9, textTransform:'uppercase', letterSpacing:'.07em', marginRight:8 }}>
                  {p.is_gap?'⚠ Gap':'→'} {p.date_from||''}{p.date_to?' – '+p.date_to:''}
                </span>
                <strong>{p.is_gap ? 'Undocumented period' : p.owner}</strong>
                {p.location && <span style={{ color:'var(--muted)' }}> · {p.location}</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>The full chain will appear in the document. Add or edit entries via the Artworks & Provenance tab.</div>
        </div>
      )}
    </div>
  )

  // ── STEP 3: Evidence selection
  const renderStep3 = () => (
    <div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, padding:'8px 12px', background:'var(--parchment)', borderRadius:3, lineHeight:1.65 }}>
        Archive items below have been matched to this artwork. Select which ones to include as evidence in the document. Items linked directly to the artwork are pre-selected.
      </div>
      {evidencePool.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)' }}>
          <div style={{ fontSize:'1.2rem', fontFamily:'var(--font-serif)', marginBottom:8 }}>No archive evidence found</div>
          <p style={{ fontSize:13 }}>You can still generate the document — it will include the artwork details and provenance chain.</p>
        </div>
      ) : (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:13, color:'var(--muted)' }}>{included.size} of {evidencePool.length} items selected</span>
            <div style={{ display:'flex', gap:7 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setIncluded(new Set(evidencePool.map(e=>e.id)))}>Select all</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setIncluded(new Set())}>Clear all</button>
            </div>
          </div>
          {evidencePool.map(e => (
            <div key={e.id}
              style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'9px 0', borderBottom:'1px solid var(--line-soft)', cursor:'pointer' }}
              onClick={() => toggleEvidence(e.id)}
            >
              <input type="checkbox" checked={included.has(e.id)} onChange={() => toggleEvidence(e.id)} style={{ width:'auto', marginTop:2, cursor:'pointer', flexShrink:0 }} />
              {e.image_url && <img src={e.image_url} alt="" style={{ width:36, height:36, objectFit:'cover', borderRadius:2, flexShrink:0 }} />}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13 }}>{e.title}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{TYPES.find(t=>t.id===e.type)?.label||e.type} · {e.date||'—'}{e.source?' · '+e.source:''}</div>
              </div>
              <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, background:'var(--parchment-2)', color: RELEVANCE_COLOR[e._relevance]||'var(--muted)', whiteSpace:'nowrap', flexShrink:0 }}>
                {RELEVANCE_LABEL[e._relevance]||e._relevance}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── STEP 4: Preview / generate
  const renderStep4 = () => (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ background:'var(--parchment)', border:'1px solid var(--line)', borderRadius:3, padding:'14px 16px' }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.1rem', marginBottom:4 }}>{details.reportTitle || `Provenance Report — ${details.title}`}</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>{details.artistName} {details.year?'· '+details.year:''} {details.medium?'· '+details.medium:''}</div>
        <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:12 }}>
          <div><span style={{ color:'var(--muted)' }}>Provenance chain: </span>{provChain.length} entries</div>
          <div><span style={{ color:'var(--muted)' }}>Archive evidence: </span>{included.size} items</div>
          <div><span style={{ color:'var(--muted)' }}>Completeness: </span><span style={{ color:scC, fontWeight:500 }}>{provScore !== null ? provScore+'%' : 'n/a'}</span></div>
          <div><span style={{ color:'var(--muted)' }}>Gaps flagged: </span>{provChain.filter(p=>p.is_gap).length}</div>
        </div>
      </div>
      <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7 }}>
        The document will open in a new window, formatted for A4 printing. Use your browser's print dialog to save as PDF or print directly. The document includes the artwork record, provenance chain with completeness analysis, and all selected archive evidence.
      </div>
      <button className="btn btn-gold" style={{ padding:'12px', justifyContent:'center', fontSize:14 }} onClick={generateAndPrint}>
        📋 Generate & print provenance document
      </button>
    </div>
  )

  const canProceed = {
    1: source === 'fresh' || (source === 'existing' && selectedArtworkId),
    2: details.title && details.artistName,
    3: true,
    4: true,
  }

  const STEP_LABELS = ['Source', 'Artwork details', 'Select evidence', 'Generate']

  return (
    <div className="modal-overlay" style={{ zIndex:70, alignItems:'flex-start', paddingTop:40 }}>
      <div className="modal modal-xl" style={{ maxHeight:'88vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Create Provenance Document</div>
            {/* Step indicator */}
            <div style={{ display:'flex', gap:0, marginTop:8 }}>
              {STEP_LABELS.map((label, i) => {
                const s = i + 1
                const done = step > s
                const active = step === s
                return (
                  <div key={s} style={{ display:'flex', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{
                        width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:10, fontWeight:600,
                        background: done ? 'var(--green)' : active ? 'var(--ink)' : 'var(--parchment-2)',
                        color: (done || active) ? 'var(--white)' : 'var(--muted)',
                      }}>{done ? '✓' : s}</div>
                      <span style={{ fontSize:11, color: active ? 'var(--ink)' : 'var(--muted)', fontWeight: active?500:400 }}>{label}</span>
                    </div>
                    {i < STEP_LABELS.length-1 && <div style={{ width:20, height:1, background:'var(--line)', margin:'0 6px' }} />}
                  </div>
                )
              })}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={step === 1 ? onClose : () => setStep(s => s-1)}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 4 && (
            <button
              className="btn btn-primary"
              disabled={!canProceed[step]}
              onClick={() => {
                if (step === 1 && source === 'fresh') { setStep(2); return }
                if (step === 1 && source === 'existing' && !selectedArtworkId) return
                setStep(s => s+1)
              }}
            >
              {step === 3 ? 'Preview document →' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PROVENANCE DOCUMENT HTML ──────────────────────────────────
function buildProvDocHTML({ details, artist, artwork, provChain, incEntries, provScore, scC, logo }) {
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
  const title = details.reportTitle || `Provenance Report — ${details.title}`
  const gapCount = provChain.filter(p=>p.is_gap).length

  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

  const artworkImage = details.imageUrl || artwork?.image_url || null

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${e(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Georgia,serif;color:#1a1714;max-width:800px;margin:0 auto;padding:40px 48px;font-size:14px;}
.header{border-bottom:2px solid #1a1714;padding-bottom:14px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-end;}
.logo-text{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#9A6F3A;margin-bottom:3px;font-family:-apple-system,sans-serif;}

h1{font-size:26px;font-weight:400;margin:0 0 4px;}
h2{font-size:13px;font-weight:400;color:#6b6760;margin:0 0 24px;font-family:-apple-system,sans-serif;}
.section-head{font-family:-apple-system,sans-serif;font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:#9A6F3A;border-bottom:1px solid #ddd9d1;padding-bottom:5px;margin:24px 0 12px;}
.artwork-block{display:flex;gap:22px;padding:16px;background:#F5F0E8;border-left:3px solid #9A6F3A;margin-bottom:6px;}
.artwork-img{width:160px;flex-shrink:0;aspect-ratio:3/4;object-fit:cover;border:1px solid #ddd9d1;}
.artwork-img-placeholder{width:160px;height:200px;background:#ede9e2;display:flex;align-items:center;justify-content:center;font-size:11px;color:#aaa;font-family:-apple-system,sans-serif;flex-shrink:0;}
.fields{display:grid;grid-template-columns:120px 1fr;gap:4px 8px;font-family:-apple-system,sans-serif;font-size:12px;align-content:start;}
.fl{color:#6b6760;}.fv{color:#1a1714;}
.prov-notes{font-family:-apple-system,sans-serif;font-size:13px;line-height:1.75;padding:12px 14px;background:#F5F0E8;border-left:3px solid #9A6F3A;margin-bottom:10px;}
.score-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f9f8f6;border-radius:3px;margin-bottom:10px;font-family:-apple-system,sans-serif;}
.score-track{flex:1;height:4px;background:#ddd9d1;border-radius:2px;overflow:hidden;}
.score-fill{height:100%;border-radius:2px;}
.prov-entry{padding:10px 14px;border:1px solid #ddd9d1;border-left:3px solid #9A6F3A;margin-bottom:8px;border-radius:0 3px 3px 0;}
.prov-gap{padding:10px 14px;border:1px solid #E8B79A;border-left:3px solid #8B3A2A;margin-bottom:8px;border-radius:0 3px 3px 0;background:#F5ECE9;}
.prov-date{font-family:-apple-system,sans-serif;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#9A6F3A;margin-bottom:3px;}
.prov-owner{font-size:14px;margin-bottom:2px;}
.prov-meta{font-family:-apple-system,sans-serif;font-size:11px;color:#6b6760;}
.prov-docs{font-family:-apple-system,sans-serif;font-size:10px;color:#9A6F3A;margin-top:5px;}
.gap-label{font-family:-apple-system,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8B3A2A;margin-bottom:3px;}
.due-diligence{padding:10px 14px;background:#F5ECE9;border:1px solid #E8B79A;border-left:3px solid #8B3A2A;border-radius:0 3px 3px 0;font-family:-apple-system,sans-serif;font-size:12px;color:#8B3A2A;margin-top:8px;}
.ev-item{padding:10px 14px;border:1px solid #ddd9d1;border-left:3px solid #9A6F3A;margin-bottom:8px;border-radius:0 3px 3px 0;}
.ev-type{font-family:-apple-system,sans-serif;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#9A6F3A;margin-bottom:3px;}
.ev-title{font-size:13px;margin-bottom:2px;}
.ev-meta{font-family:-apple-system,sans-serif;font-size:11px;color:#6b6760;}
.ev-desc{font-family:-apple-system,sans-serif;font-size:12px;line-height:1.65;margin-top:6px;color:#3d3a36;}
.ev-img{max-width:200px;margin-top:8px;border:1px solid #ddd9d1;border-radius:2px;}
.footer{margin-top:40px;padding-top:14px;border-top:1px solid #ddd9d1;font-family:-apple-system,sans-serif;font-size:8.5px;color:#aaa;text-align:center;line-height:1.7;}
@media print{body{padding:24px 28px;}}
</style></head><body>

<div class="header">
  <div>
    ${logo ? '<img src="' + logo + '" alt="Hourglass Gallery" style="height:28px;object-fit:contain;object-position:left center;display:block;">' : '<div class="logo-text">Hourglass Gallery &middot; Lagos</div>'}
  </div>
</div>

<h1>${e(title)}</h1>
<h2>${e(details.artistName)} — Provenance &amp; Authentication Report</h2>

<!-- ARTWORK RECORD -->
<div class="section-head">Artwork record</div>
<div class="artwork-block">
  ${artworkImage ? `<img class="artwork-img" src="${e(artworkImage)}" alt="${e(details.title)}">` : `<div class="artwork-img-placeholder">No image on file</div>`}
  <div class="fields">
    <span class="fl">Title</span><span class="fv"><strong>${e(details.title)}</strong></span>
    <span class="fl">Artist</span><span class="fv">${e(details.artistName)}</span>
    ${details.year?`<span class="fl">Year</span><span class="fv">${e(details.year)}</span>`:''}
    ${details.medium?`<span class="fl">Medium</span><span class="fv">${e(details.medium)}</span>`:''}
    ${details.dimensions?`<span class="fl">Dimensions</span><span class="fv">${e(details.dimensions)}</span>`:''}
    ${details.catRef?`<span class="fl">Cat. raisonné</span><span class="fv">${e(details.catRef)}</span>`:''}
    ${details.location?`<span class="fl">Current owner</span><span class="fv">${e(details.location)}</span>`:''}
    ${details.condition?`<span class="fl">Condition</span><span class="fv">${e(details.condition)}</span>`:''}
    ${details.notes?`<span class="fl">Notes</span><span class="fv">${e(details.notes)}</span>`:''}
    ${details.exhibitionHistory?`<span class="fl">Exhibition history</span><span class="fv">${e(details.exhibitionHistory)}</span>`:''}
    ${details.otherInfo?`<span class="fl">Other information</span><span class="fv">${e(details.otherInfo)}</span>`:''}
    ${details.additionalNotes?`<span class="fl">Document notes</span><span class="fv">${e(details.additionalNotes)}</span>`:''}
  </div>
</div>

<!-- PROVENANCE -->
<div class="section-head">Provenance</div>
${details.provNotes ? `<div class="prov-notes">${e(details.provNotes)}</div>` : ''}
${provChain.length ? `

  ${provChain.map(p => p.is_gap
    ? `<div class="prov-gap"><div class="gap-label">⚠ Gap in record · ${e(p.date_from||'')}${p.date_to?' – '+e(p.date_to):''}</div><div style="font-size:12px;color:#8B3A2A">${e(p.description||'No documentation available for this period')}</div></div>`
    : `<div class="prov-entry"><div class="prov-date">${e(p.date_from||'')}${p.date_to?' – '+e(p.date_to):' – present'} · ${e(p.entry_type||'')} · <span style="color:${p.verified?'#2d6a4f':'#92600a'}">${p.verified?'VERIFIED':'UNVERIFIED'}</span></div><div class="prov-owner">${e(p.owner||'Unknown')}</div><div class="prov-meta">${e(p.location||'')}${p.description?' — '+e(p.description.slice(0,120))+(p.description.length>120?'…':''):''}</div>${p.docs?.length?`<div class="prov-docs">Documents: ${p.docs.map(d=>e(d)).join(' · ')}</div>`:''}</div>`
  ).join('')}
  ${gapCount > 0 ? `<div class="due-diligence"><strong>Due diligence note:</strong> ${gapCount} undocumented period${gapCount>1?'s':''} identified in the provenance record. Further investigation is recommended prior to sale, institutional loan, or insurance valuation.</div>` : ''}
` : (!details.provNotes ? `<p style="font-family:-apple-system,sans-serif;font-size:12px;color:#6b6760;font-style:italic">No structured provenance information recorded.</p>` : '')}

<!-- ARCHIVE EVIDENCE -->
${incEntries.length ? `
<div class="section-head">Archive evidence (${incEntries.length} items)</div>
${incEntries.map(ev => `<div class="ev-item">
  <div class="ev-type">${TYPES.find(t=>t.id===ev.type)?.label||ev.type}</div>
  <div class="ev-title">${e(ev.title)}</div>
  <div class="ev-meta">${e(ev.date||'—')}${ev.source?' · '+e(ev.source):''}</div>
  ${ev.description?`<div class="ev-desc">${e(ev.description)}</div>`:''}
  ${ev.image_url?`<img class="ev-img" src="${ev.image_url}" alt="">`:''}
</div>`).join('')}` : ''}

<div class="footer">
  Prepared by Hourglass Gallery · 298A Akin Olugbade Street, Victoria Island, Lagos<br>
  This document is compiled from gallery research records and is provided for provenance, due diligence, insurance, and reference purposes.<br>
  It does not constitute a warranty of title or authenticity.
</div>
</body></html>`
}
