import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { useNavigate } from 'react-router-dom'

const EMPTY = { name:'', nationality:'', medium:'', bio:'', born:'', died:'', portrait_url:'', link:'', sort_order:0 }

export default function Artists() {
  const navigate = useNavigate()
  const [artists, setArtists] = useState([])
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('az') // 'az' | 'sold' | 'most'
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const [a, w] = await Promise.all([
      fetchAll('artists', { order: 'name' }),
      fetchAll('artworks', { order: 'sort_order' }),
    ])
    setArtists(a)
    setArtworks(w)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Work counts and sold counts per artist
  const workCounts = useMemo(() => {
    const counts = {}
    artworks.forEach(w => { counts[w.artist_id] = (counts[w.artist_id] || 0) + 1 })
    return counts
  }, [artworks])

  const soldCounts = useMemo(() => {
    const counts = {}
    artworks.filter(w => w.availability === 'Sold').forEach(w => {
      counts[w.artist_id] = (counts[w.artist_id] || 0) + 1
    })
    return counts
  }, [artworks])

  const filtered = useMemo(() => {
    let list = artists.filter(a =>
      !search || a.name?.toLowerCase().includes(search.toLowerCase())
    )
    if (sortBy === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'sold') list = [...list].sort((a, b) => (soldCounts[b.id] || 0) - (soldCounts[a.id] || 0))
    if (sortBy === 'most') list = [...list].sort((a, b) => (workCounts[b.id] || 0) - (workCounts[a.id] || 0))
    return list
  }, [artists, search, sortBy, workCounts, soldCounts])

  async function toggleVisible(artist) {
    await supabase.from('artists').update({ visible: !artist.visible }).eq('id', artist.id)
    cacheInvalidate('artists')
    setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, visible: !a.visible } : a))
  }

  async function handlePortraitUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      // Resize before upload
      const resized = await resizeImage(file, 800)
      const ext = file.name.split('.').pop()
      const path = `portraits/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('artist-portraits').upload(path, resized)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('artist-portraits').getPublicUrl(path)
      setForm(f => ({ ...f, portrait_url: publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
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
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this artist? This cannot be undone.')) return
    await supabase.from('artists').delete().eq('id', id)
    cacheInvalidate('artists')
    setArtists(prev => prev.filter(a => a.id !== id))
  }

  function openEdit(artist) {
    setForm({ ...EMPTY, ...artist })
    setEditId(artist.id)
    setModal('edit')
  }

  function closeModal() { setModal(null); setForm(EMPTY); setEditId(null) }

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading artists…</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Artists</div>
          <div className="page-subtitle">{artists.length} artists · {artists.filter(a=>a.visible).length} visible</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('add') }}>+ Add artist</button>
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'center' }}>
        <input className="form-input" style={{ maxWidth:300 }} placeholder="Search artists…" value={search} onChange={e=>setSearch(e.target.value)} />
        <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden', marginLeft:8 }}>
          {[['az','A – Z'],['most','Most works'],['sold','Frequently sold']].map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)}
              style={{ padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:'var(--font-sans)', border:'none', borderRight:'1px solid var(--line)', background: sortBy===key ? 'var(--ink)' : 'var(--white)', color: sortBy===key ? 'var(--white)' : 'var(--muted)', transition:'all 150ms' }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize:13, color:'var(--muted)', marginLeft:4 }}>{filtered.length} artists</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Artist</th><th>Nationality</th><th>Medium</th>
                <th>Works</th><th>Sold</th>
                <th>Visible</th><th style={{ width:160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {a.portrait_url && <img src={a.portrait_url} alt="" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }} />}
                      <div>
                        <div style={{ fontWeight:500 }}>{a.name}</div>
                        {a.born && <div style={{ fontSize:11, color:'var(--muted)' }}>{a.born}{a.died ? '–'+a.died : ''}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ color:'var(--muted)', fontSize:13 }}>{a.nationality || '—'}</td>
                  <td style={{ color:'var(--muted)', fontSize:13 }}>{a.medium || '—'}</td>
                  <td style={{ fontSize:13 }}>{workCounts[a.id] || 0}</td>
                  <td style={{ fontSize:13, color: soldCounts[a.id] ? 'var(--green)' : 'var(--muted)' }}>{soldCounts[a.id] || 0}</td>
                  <td>
                    <button
                      onClick={() => toggleVisible(a)}
                      style={{ fontSize:18, cursor:'pointer', background:'none', border:'none',
                               color: a.visible ? 'var(--green)' : 'var(--line)' }}
                      title={a.visible ? 'Visible — click to hide' : 'Hidden — click to show'}
                    >
                      {a.visible ? '◉' : '○'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
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

      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{modal === 'edit' ? 'Edit artist' : 'Add artist'}</div>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>✕</button>
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
                  <input className="form-input" value={form.portrait_url||''} onChange={e=>setForm(f=>({...f,portrait_url:e.target.value}))} placeholder="https://… or upload below" />
                </div>
                <div className="form-group">
                  <label className="form-label">Upload portrait</label>
                  <input type="file" accept="image/*" onChange={handlePortraitUpload} style={{ fontSize:12, color:'var(--muted)' }} />
                  {uploading && <div style={{ fontSize:11, color:'var(--muted)' }}>Uploading…</div>}
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
                {saving ? 'Saving…' : 'Save artist'}
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
