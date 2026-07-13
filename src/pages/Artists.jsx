import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { useNavigate } from 'react-router-dom'

const EMPTY = { name:'', nationality:'', medium:'', bio:'', born:'', died:'', portrait_url:'', link:'', sort_order:0 }

export default function Artists() {
  const navigate = useNavigate()
  const [artists, setArtists]     = useState([])
  const [counts, setCounts]       = useState({}) // { artist_id: { total, available, sold } }
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [sortBy, setSortBy]       = useState('az')
  const [modal, setModal]         = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected]   = useState(null)  // artist being viewed
  const [artworks, setArtworks]   = useState([])    // artworks for selected artist
  const [awLoading, setAwLoading] = useState(false)

  async function load() {
    // Fetch artists first \u2014 show immediately
    const a = await fetchAll('artists', { order: 'name' })
    setArtists(a)
    setLoading(false)

    // Then fetch counts in background \u2014 only 2 tiny queries
    const [avail, sold] = await Promise.all([
      supabase.from('artworks').select('artist_id').eq('availability', 'Available'),
      supabase.from('artworks').select('artist_id').eq('availability', 'Sold'),
    ])
    const c = {}
    ;(avail.data || []).forEach(w => {
      if (!c[w.artist_id]) c[w.artist_id] = { total:0, available:0, sold:0 }
      c[w.artist_id].available++
      c[w.artist_id].total++
    })
    ;(sold.data || []).forEach(w => {
      if (!c[w.artist_id]) c[w.artist_id] = { total:0, available:0, sold:0 }
      c[w.artist_id].sold++
      c[w.artist_id].total++
    })
    setCounts(c)
  }

  useEffect(() => { load() }, [])

  async function loadArtistArtworks(artist) {
    setSelected(artist)
    setArtworks([])
    setAwLoading(true)
    const { data } = await supabase
      .from('artworks')
      .select('id,title,year,medium,dimensions,availability,image_url,price,retail_price,hg_code,location')
      .eq('artist_id', artist.id)
      .eq('visible', true)
      .order('sort_order')
    setArtworks(data || [])
    setAwLoading(false)
  }

  const filtered = useMemo(() => {
    let list = artists.filter(a =>
      !search || a.name?.toLowerCase().includes(search.toLowerCase())
    )
    if (sortBy === 'az')   list = [...list].sort((a,b) => a.name.localeCompare(b.name))
    if (sortBy === 'sold') list = [...list].sort((a,b) => (counts[b.id]?.sold||0) - (counts[a.id]?.sold||0))
    if (sortBy === 'most') list = [...list].sort((a,b) => (counts[b.id]?.total||0) - (counts[a.id]?.total||0))
    return list
  }, [artists, search, sortBy, counts])

  function toggleVisible(artist) {
    setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, visible: !a.visible } : a))
    cacheInvalidate('artists')
    supabase.from('artists').update({ visible: !artist.visible }).eq('id', artist.id)
      .then(({ error }) => {
        if (error) setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, visible: artist.visible } : a))
      })
  }

  async function handlePortraitUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const resized = await resizeImage(file, 800)
      const ext = file.name.split('.').pop()
      const path = `portraits/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('artist-portraits').upload(path, resized)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('artist-portraits').getPublicUrl(path)
      setForm(f => ({ ...f, portrait_url: publicUrl }))
    } catch (err) { alert('Upload failed: ' + err.message) }
    finally { setUploading(false) }
  }

  async function handleSave() {
    if (!form.name) return alert('Name is required')
    setSaving(true)
    try {
      if (modal === 'edit') {
        await supabase.from('artists').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editId)
      } else {
        await supabase.from('artists').insert({ ...form, visible: true })
      }
      cacheInvalidate('artists')
      await load()
      closeModal()
    } catch (err) { alert('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  function handleDelete(id) {
    if (!confirm('Delete this artist? This cannot be undone.')) return
    setArtists(prev => prev.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
    cacheInvalidate('artists')
    supabase.from('artists').delete().eq('id', id).then(({ error }) => {
      if (error) { alert('Delete failed: ' + error.message); load() }
    })
  }

  function openEdit(artist) { setForm({ ...EMPTY, ...artist }); setEditId(artist.id); setModal('edit') }
  function closeModal() { setModal(null); setForm(EMPTY); setEditId(null) }

  if (loading) return <div style={{ color:'var(--muted)', padding:32 }}>Loading artists{'\u2026'}</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Artists</div>
          <div className="page-subtitle">{artists.length} artists \u00B7 {artists.filter(a=>a.visible).length} visible</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('add') }}>+ Add artist</button>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
        <input className="form-input" style={{ maxWidth:260 }} placeholder="Search artists\u2026" value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
          {[['az','A \u2013 Z'],['most','Most works'],['sold','Most sold']].map(([key,label]) => (
            <button key={key} onClick={() => setSortBy(key)}
              style={{ padding:'6px 12px', fontSize:12, cursor:'pointer', border:'none',
                borderRight:'1px solid var(--line)',
                background: sortBy===key ? 'var(--ink)' : 'var(--white)',
                color: sortBy===key ? 'var(--white)' : 'var(--muted)' }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} artists</span>
      </div>

      {/* Two-panel layout when artist selected */}
      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap:20 }}>

        {/* Artist table */}
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Artist</th><th>Nationality</th><th>Medium</th>
                  <th>Available</th><th>Sold</th><th>Visible</th>
                  <th style={{ width:160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}
                    onClick={() => selected?.id === a.id ? setSelected(null) : loadArtistArtworks(a)}
                    style={{ cursor:'pointer', background: selected?.id === a.id ? 'var(--surface-1,#f5f3f0)' : 'transparent' }}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        {a.portrait_url && <img src={a.portrait_url} alt="" loading="lazy" decoding="async" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }} />}
                        <div>
                          <div style={{ fontWeight:500 }}>{a.name}</div>
                          {a.born && <div style={{ fontSize:11, color:'var(--muted)' }}>{a.born}{a.died ? '\u2013'+a.died : ''}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ color:'var(--muted)', fontSize:13 }}>{a.nationality || '\u2014'}</td>
                    <td style={{ color:'var(--muted)', fontSize:13 }}>{a.medium || '\u2014'}</td>
                    <td style={{ fontSize:13, color:'var(--green,#27ae60)', fontWeight: counts[a.id]?.available ? 600 : 400 }}>
                      {counts[a.id]?.available || 0}
                    </td>
                    <td style={{ fontSize:13, color:'var(--muted)' }}>{counts[a.id]?.sold || 0}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleVisible(a)}
                        style={{ fontSize:18, cursor:'pointer', background:'none', border:'none',
                          color: a.visible ? 'var(--green)' : 'var(--line)' }}>
                        {a.visible ? '\u25C9' : '\u25CB'}
                      </button>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/archive/${a.id}`)}>Archive</button>
                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => handleDelete(a.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Artist detail panel */}
        {selected && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:16 }}>{selected.name}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                  {[selected.nationality, selected.medium, selected.born && `b. ${selected.born}`].filter(Boolean).join(' \u00B7 ')}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>{'\u2715'}</button>
            </div>

            {/* Counts */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
              {[
                ['Total', counts[selected.id]?.total || 0, 'var(--ink)'],
                ['Available', counts[selected.id]?.available || 0, 'var(--green,#27ae60)'],
                ['Sold', counts[selected.id]?.sold || 0, 'var(--muted)'],
              ].map(([label, val, color]) => (
                <div key={label} className="card" style={{ padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:700, color }}>{val}</div>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Available artworks */}
            <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:8, fontWeight:600 }}>
              Available works
            </div>
            <div className="card" style={{ padding:0, maxHeight:500, overflowY:'auto' }}>
              {awLoading
                ? <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Loading{'\u2026'}</div>
                : artworks.filter(w => w.availability === 'Available').length === 0
                ? <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No available works</div>
                : artworks.filter(w => w.availability === 'Available').map(w => (
                  <div key={w.id} style={{ display:'flex', gap:10, padding:'10px 12px', borderBottom:'1px solid var(--line-soft)', alignItems:'center' }}>
                    {w.image_url
                      ? <img src={w.image_url} alt="" loading="lazy" decoding="async" style={{ width:44, height:44, objectFit:'cover', borderRadius:2, flexShrink:0 }} />
                      : <div style={{ width:44, height:44, background:'var(--surface-1,#f0ece7)', borderRadius:2, flexShrink:0 }} />
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.title}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>
                        {[w.year, w.medium, w.location].filter(Boolean).join(' \u00B7 ')}
                      </div>
                      {(w.price || w.retail_price) && (
                        <div style={{ fontSize:12, color:'var(--ink)', fontWeight:500, marginTop:2 }}>
                          {w.price || `\u20A6${Number(w.retail_price).toLocaleString()}`}
                        </div>
                      )}
                    </div>
                    {w.hg_code && (
                      <div style={{ fontSize:10, color:'var(--gold,#b8862a)', fontWeight:600, flexShrink:0 }}>{w.hg_code}</div>
                    )}
                  </div>
                ))
              }
            </div>

            <div style={{ marginTop:10, display:'flex', gap:8 }}>
              <button className="btn btn-outline btn-sm" style={{ flex:1 }} onClick={() => openEdit(selected)}>Edit artist</button>
              <button className="btn btn-outline btn-sm" style={{ flex:1 }} onClick={() => navigate(`/admin/archive/${selected.id}`)}>Archive</button>
            </div>
          </div>
        )}
      </div>

      {/* Edit / Add modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{modal === 'edit' ? 'Edit artist' : 'Add artist'}</div>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>{'\u2715'}</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nationality</label>
                  <input className="form-input" value={form.nationality||''} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Primary medium</label>
                  <input className="form-input" value={form.medium||''} onChange={e=>setForm(f=>({...f,medium:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Born</label>
                  <input className="form-input" value={form.born||''} onChange={e=>setForm(f=>({...f,born:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Died (if applicable)</label>
                  <input className="form-input" value={form.died||''} onChange={e=>setForm(f=>({...f,died:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Website / link</label>
                  <input className="form-input" value={form.link||''} onChange={e=>setForm(f=>({...f,link:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Biography</label>
                <textarea className="form-textarea" rows={5} value={form.bio||''} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Portrait URL</label>
                  <input className="form-input" value={form.portrait_url||''} onChange={e=>setForm(f=>({...f,portrait_url:e.target.value}))} placeholder="https://\u2026 or upload below" />
                </div>
                <div className="form-group">
                  <label className="form-label">Upload portrait</label>
                  <input type="file" accept="image/*" onChange={handlePortraitUpload} style={{ fontSize:12, color:'var(--muted)' }} />
                  {uploading && <div style={{ fontSize:11, color:'var(--muted)' }}>Uploading{'\u2026'}</div>}
                </div>
              </div>
              {form.portrait_url && (
                <img src={form.portrait_url} alt="" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--line)' }} />
              )}
              <div className="form-group">
                <label className="form-label">Sort order</label>
                <input className="form-input" type="number" style={{ width:100 }} value={form.sort_order||0} onChange={e=>setForm(f=>({...f,sort_order:parseInt(e.target.value)||0}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving\u2026' : 'Save artist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function resizeImage(file, maxPx = 1200) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(file)
  })
}
