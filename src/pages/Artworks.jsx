import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'

const AVAILABILITY = ['Available', 'Reserved', 'Sold', 'NFS']
const IMAGE_POSITIONS = ['center', 'top', 'bottom', 'left', 'right']
const EMPTY = { title:'', artist_id:'', year:'', medium:'', dimensions:'', series:'', availability:'Available', writeup:'', image_url:'', image_position:'center', price:'', tags:'', location:'', sort_order:0, ownership:'gallery', consignment_price:'', consignor_name:'', consignor_contact:'', commission_rate:40 }

export default function Artworks() {
  const [artists, setArtists] = useState([])
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ artist:'', availability:'', location:'', search:'', visible:'', ownership:'' })
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'az' | 'price_desc' | 'price_asc' | 'location'
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [page, setPage] = useState(0)
  const PER_PAGE = 60

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

  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])
  const locations = useMemo(() => [...new Set(artworks.map(w => w.location).filter(Boolean))].sort(), [artworks])

  const filtered = useMemo(() => artworks.filter(w => {
    if (filters.artist && w.artist_id !== filters.artist) return false
    if (filters.availability && w.availability !== filters.availability) return false
    if (filters.location && w.location !== filters.location) return false
    if (filters.visible === 'true' && !w.visible) return false
    if (filters.visible === 'false' && w.visible) return false
    if (filters.ownership && w.ownership !== filters.ownership) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const a = artistMap[w.artist_id]
      if (!w.title?.toLowerCase().includes(q) &&
          !a?.name?.toLowerCase().includes(q) &&
          !w.medium?.toLowerCase().includes(q) &&
          !w.series?.toLowerCase().includes(q)) return false
    }
    return true
  }), [artworks, filters, artistMap])

  const sorted = useMemo(() => {
    let list = [...filtered]
    if (sortBy === 'az') list.sort((a, b) => a.title.localeCompare(b.title))
    else if (sortBy === 'recent') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    else if (sortBy === 'price_desc') list.sort((a, b) => parsePrice(b.price) - parsePrice(a.price))
    else if (sortBy === 'price_asc') list.sort((a, b) => parsePrice(a.price) - parsePrice(b.price))
    else if (sortBy === 'location') list.sort((a, b) => (a.location || 'zzz').localeCompare(b.location || 'zzz'))
    return list
  }, [filtered, sortBy])

  const paginated = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(sorted.length / PER_PAGE)

  async function toggleVisible(artwork) {
    await supabase.from('artworks').update({ visible: !artwork.visible }).eq('id', artwork.id)
    setArtworks(prev => prev.map(w => w.id === artwork.id ? { ...w, visible: !w.visible } : w))
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const resized = await resizeImage(file, 1200)
      const path = `works/${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const { error } = await supabase.storage.from('artwork-images').upload(path, resized)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('artwork-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!form.title) return alert('Title is required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        sort_order: parseInt(form.sort_order) || 0,
        consignment_price: form.ownership === 'consignment' && form.consignment_price ? Number(form.consignment_price) : null,
        consignor_name: form.ownership === 'consignment' ? form.consignor_name || null : null,
        consignor_contact: form.ownership === 'consignment' ? form.consignor_contact || null : null,
        commission_rate: form.ownership === 'consignment' ? Number(form.commission_rate) || 40 : null,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'edit') {
        await supabase.from('artworks').update(payload).eq('id', editId)
      } else {
        await supabase.from('artworks').insert({ ...payload, visible: true })
      }
      await load()
      closeModal()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this artwork?')) return
    await supabase.from('artworks').delete().eq('id', id)
    setArtworks(prev => prev.filter(w => w.id !== id))
  }

  function openEdit(artwork) {
    setForm({
      ...EMPTY, ...artwork,
      tags: Array.isArray(artwork.tags) ? artwork.tags.join(', ') : '',
      ownership: artwork.ownership || 'gallery',
      consignment_price: artwork.consignment_price || '',
      consignor_name: artwork.consignor_name || '',
      consignor_contact: artwork.consignor_contact || '',
      commission_rate: artwork.commission_rate || 40,
    })
    setEditId(artwork.id)
    setModal('edit')
  }

  function closeModal() { setModal(null); setForm(EMPTY); setEditId(null) }

  const sf = (key, val) => { setFilters(f => ({...f, [key]: val})); setPage(0) }

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading artworks…</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Artworks</div>
          <div className="page-subtitle">{artworks.length} total · {artworks.filter(w=>w.visible).length} visible · {artworks.filter(w=>w.availability==='Available').length} available</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('add') }}>+ Add artwork</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
        <input className="form-input" style={{ width:220 }} placeholder="Search…" value={filters.search} onChange={e=>sf('search',e.target.value)} />
        <select className="form-select" style={{ width:180 }} value={filters.artist} onChange={e=>sf('artist',e.target.value)}>
          <option value="">All artists</option>
          {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="form-select" style={{ width:150 }} value={filters.availability} onChange={e=>sf('availability',e.target.value)}>
          <option value="">All status</option>
          {AVAILABILITY.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {locations.length > 0 && (
          <select className="form-select" style={{ width:160 }} value={filters.location} onChange={e=>sf('location',e.target.value)}>
            <option value="">All locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select className="form-select" style={{ width:170 }} value={filters.ownership} onChange={e=>sf('ownership',e.target.value)}>
          <option value="">All ownership</option>
          <option value="gallery">Gallery owned</option>
          <option value="consignment">Consignment</option>
        </select>
        <select className="form-select" style={{ width:140 }} value={filters.visible} onChange={e=>sf('visible',e.target.value)}>
          <option value="">All visibility</option>
          <option value="true">Visible</option>
          <option value="false">Hidden</option>
        </select>

        {/* Sort controls */}
        <div style={{ marginLeft:'auto', display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
          {[
            ['recent','Most recent'],
            ['az','A – Z'],
            ['price_desc','Price ↓'],
            ['price_asc','Price ↑'],
            ['location','Location'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => { setSortBy(key); setPage(0) }}
              style={{ padding:'6px 12px', fontSize:11, cursor:'pointer', fontFamily:'var(--font-sans)', border:'none', borderRight:'1px solid var(--line)', background: sortBy===key ? 'var(--ink)' : 'var(--white)', color: sortBy===key ? 'var(--white)' : 'var(--muted)', whiteSpace:'nowrap', transition:'all 150ms' }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize:13, color:'var(--muted)' }}>{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width:60 }}>Image</th>
                <th style={{ cursor:'pointer', color: sortBy==='az'?'var(--ink)':'inherit' }} onClick={() => { setSortBy('az'); setPage(0) }}>Title {sortBy==='az'?'↑':''}</th>
                <th>Artist</th>
                <th style={{ cursor:'pointer', color: sortBy==='recent'?'var(--ink)':'inherit' }} onClick={() => { setSortBy('recent'); setPage(0) }}>Year {sortBy==='recent'?'↓':''}</th>
                <th style={{ cursor:'pointer', color: sortBy==='location'?'var(--ink)':'inherit' }} onClick={() => { setSortBy('location'); setPage(0) }}>Location {sortBy==='location'?'↑':''}</th>
                <th>Ownership</th>
                <th style={{ cursor:'pointer', color: ['price_desc','price_asc'].includes(sortBy)?'var(--ink)':'inherit' }} onClick={() => { setSortBy(sortBy==='price_desc'?'price_asc':'price_desc'); setPage(0) }}>Price {sortBy==='price_desc'?'↓':sortBy==='price_asc'?'↑':''}</th>
                <th>Status</th><th>Visible</th>
                <th style={{ width:120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map(w => (
                <tr key={w.id}>
                  <td>
                    {w.image_url
                      ? <img src={w.image_url} alt="" style={{ width:44, height:44, objectFit:'cover', objectPosition: w.image_position||'center', borderRadius:2, border:'1px solid var(--line)' }} />
                      : <div style={{ width:44, height:44, background:'var(--parchment-2)', borderRadius:2, border:'1px solid var(--line)' }} />
                    }
                  </td>
                  <td>
                    <div style={{ fontWeight:500, fontSize:13 }}>{w.title}</div>
                    {w.medium && <div style={{ fontSize:11, color:'var(--muted)' }}>{w.medium}</div>}
                  </td>
                  <td style={{ fontSize:13 }}>{artistMap[w.artist_id]?.name || '—'}</td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>{w.year || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{w.location || '—'}</td>
                  <td>
                    {w.ownership === 'consignment'
                      ? <span className="badge badge-amber" title={w.consignor_name ? `Consignor: ${w.consignor_name}` : ''}>
                          Consignment{w.consignment_price ? ` · ₦${Number(w.consignment_price).toLocaleString()}` : ''}
                        </span>
                      : <span className="badge badge-blue">Gallery owned</span>
                    }
                  </td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{w.price || '—'}</td>
                  <td>
                    <span className={`badge ${w.availability==='Available'?'badge-green':w.availability==='Sold'?'badge-red':'badge-amber'}`}>
                      {w.availability}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => toggleVisible(w)}
                      style={{ fontSize:18, cursor:'pointer', background:'none', border:'none', color: w.visible ? 'var(--green)' : 'var(--line)' }}
                    >{w.visible ? '◉' : '○'}</button>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:5 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(w)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => handleDelete(w.id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding:'14px 20px', borderTop:'1px solid var(--line)', display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p-1)}>← Prev</button>
            <span style={{ fontSize:13, color:'var(--muted)' }}>Page {page+1} of {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages-1} onClick={() => setPage(p => p+1)}>Next →</button>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-xl">
            <div className="modal-header">
              <div className="modal-title">{modal === 'edit' ? `Edit — ${form.title}` : 'Add artwork'}</div>
              <button className="btn btn-ghost btn-icon" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              {/* Left */}
              <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Artist</label>
                  <select className="form-select" value={form.artist_id||''} onChange={e=>setForm(f=>({...f,artist_id:e.target.value}))}>
                    <option value="">— select —</option>
                    {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <input className="form-input" value={form.year||''} onChange={e=>setForm(f=>({...f,year:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Series</label>
                    <input className="form-input" value={form.series||''} onChange={e=>setForm(f=>({...f,series:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Medium</label>
                  <input className="form-input" value={form.medium||''} onChange={e=>setForm(f=>({...f,medium:e.target.value}))} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Dimensions</label>
                    <input className="form-input" value={form.dimensions||''} onChange={e=>setForm(f=>({...f,dimensions:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Price</label>
                    <input className="form-input" value={form.price||''} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="e.g. ₦2,500,000" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Location</label>
                    <input className="form-input" value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="e.g. Main Gallery" list="location-list" />
                    <datalist id="location-list">
                      {locations.map(l => <option key={l} value={l} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Availability</label>
                    <select className="form-select" value={form.availability} onChange={e=>setForm(f=>({...f,availability:e.target.value}))}>
                      {AVAILABILITY.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (comma-separated)</label>
                  <input className="form-input" value={form.tags||''} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="portrait, oil, abstract" />
                </div>

                {/* Ownership */}
                <div style={{ background:'var(--parchment)', borderRadius:3, padding:'12px 14px', display:'flex', flexDirection:'column', gap:11 }}>
                  <div style={{ fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:2 }}>Ownership</div>
                  <div className="form-row">
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:`1px solid ${form.ownership==='gallery'?'var(--ink)':'var(--line)'}`, borderRadius:3, background: form.ownership==='gallery'?'var(--ink)':'var(--white)' }}>
                      <input type="radio" name="ownership" value="gallery" checked={form.ownership==='gallery'} onChange={()=>setForm(f=>({...f,ownership:'gallery'}))} style={{ width:'auto', accentColor:'white' }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, color: form.ownership==='gallery'?'var(--white)':'var(--ink)' }}>Gallery owned</div>
                        <div style={{ fontSize:10, color: form.ownership==='gallery'?'rgba(255,255,255,.6)':'var(--muted)' }}>Purchased by Hourglass Gallery</div>
                      </div>
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:`1px solid ${form.ownership==='consignment'?'var(--amber)':'var(--line)'}`, borderRadius:3, background: form.ownership==='consignment'?'#fdf3e0':'var(--white)' }}>
                      <input type="radio" name="ownership" value="consignment" checked={form.ownership==='consignment'} onChange={()=>setForm(f=>({...f,ownership:'consignment'}))} style={{ width:'auto', accentColor:'var(--amber)' }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, color: form.ownership==='consignment'?'var(--amber)':'var(--ink)' }}>Consignment</div>
                        <div style={{ fontSize:10, color: form.ownership==='consignment'?'#b8860b':'var(--muted)' }}>Owner retains title</div>
                      </div>
                    </label>
                  </div>

                  {form.ownership === 'consignment' && (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Consignor name</label>
                          <input className="form-input" value={form.consignor_name||''} onChange={e=>setForm(f=>({...f,consignor_name:e.target.value}))} placeholder="Owner's name" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Consignor contact</label>
                          <input className="form-input" value={form.consignor_contact||''} onChange={e=>setForm(f=>({...f,consignor_contact:e.target.value}))} placeholder="Phone or email" />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Consignment price (₦) <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--amber)', fontSize:10 }}>— minimum agreed with owner, not shown publicly</span></label>
                          <input className="form-input" type="number" value={form.consignment_price||''} onChange={e=>setForm(f=>({...f,consignment_price:e.target.value}))} placeholder="0" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gallery commission (%)</label>
                          <input className="form-input" type="number" min={0} max={100} value={form.commission_rate||40} onChange={e=>setForm(f=>({...f,commission_rate:e.target.value}))} />
                          {form.consignment_price && form.commission_rate && (
                            <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                              Gallery earns ₦{Math.round(Number(form.consignment_price) * Number(form.commission_rate) / 100).toLocaleString()} · Owner receives ₦{Math.round(Number(form.consignment_price) * (100 - Number(form.commission_rate)) / 100).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Write-up / description</label>
                  <textarea className="form-textarea" rows={4} value={form.writeup||''} onChange={e=>setForm(f=>({...f,writeup:e.target.value}))} />
                </div>
              </div>

              {/* Right — image */}
              <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
                <div className="form-group">
                  <label className="form-label">Artwork image</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload} />
                  {uploading && <div style={{ fontSize:11, color:'var(--muted)' }}>Uploading…</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Image URL (or paste after upload)</label>
                  <input className="form-input" value={form.image_url||''} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))} />
                </div>
                {form.image_url && (
                  <div style={{ aspectRatio:'3/4', background:'var(--parchment-2)', borderRadius:3, overflow:'hidden' }}>
                    <img src={form.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: form.image_position||'center' }} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Image position</label>
                  <select className="form-select" value={form.image_position||'center'} onChange={e=>setForm(f=>({...f,image_position:e.target.value}))}>
                    {IMAGE_POSITIONS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sort order</label>
                  <input className="form-input" type="number" style={{ width:100 }} value={form.sort_order||0} onChange={e=>setForm(f=>({...f,sort_order:e.target.value}))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save artwork'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function parsePrice(priceStr) {
  if (!priceStr) return 0
  return parseFloat(String(priceStr).replace(/[^0-9.]/g, '')) || 0
}

async function resizeImage(file, maxPx = 1200) {
  return new Promise(resolve => {
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
