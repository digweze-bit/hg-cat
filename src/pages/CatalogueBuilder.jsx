import { useState, useEffect, useRef } from 'react'
import { supabase, fetchAll } from '../lib/supabase'

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function CatalogueBuilder() {
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists] = useState([])
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [step, setStep] = useState('select') // 'select' | 'review' | 'edit-details'
  const [overrides, setOverrides] = useState({}) // id -> { title, price, bio, note }
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const previewRef = useRef(null)

  // Options
  const [layout, setLayout] = useState('single') // 'single' | 'double' | 'quad'
  const [showPrice, setShowPrice] = useState(false)
  const [showBio, setShowBio] = useState(false)
  const [bioPlacement, setBioPlacement] = useState('end') // 'end' | 'inline'
  const [showNotes, setShowNotes] = useState(false)
  const [availOnly, setAvailOnly] = useState(true)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [batchSize, setBatchSize] = useState(40) // 20 | 40 | 'all'
  const [showLogo, setShowLogo] = useState(true)
  const [notes, setNotes] = useState({}) // artwork id -> custom note
  const [bios, setBios] = useState({})
  const [LOGO_B64, setLogoB64] = useState(null)

  const dragIdx = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [aw, ar] = await Promise.all([
        fetchAll('artworks', {
          select: 'id,title,artist_id,year,medium,dimensions,dimension_unit,image_url,thumbnail_url,price,retail_price,hg_code,availability,writeup,notes',
          order: 'title',
        }),
        fetchAll('artists', { select: 'id,name,bio', order: 'name' }),
      ])
      setArtworks(aw)
      setArtists(ar)
      const bioMap = {}
      ar.forEach(a => { if (a.bio) bioMap[a.name] = a.bio })
      setBios(bioMap)
      setLoading(false)
    }
    load()
    import('../lib/assets').then(m => setLogoB64(m.LOGO_B64 || null)).catch(() => {})
  }, [])

  const artistMap = {}
  artists.forEach(a => { artistMap[a.id] = a })

  const filtered = artworks.filter(w => {
    if (availOnly && w.availability !== 'Available') return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const artist = artistMap[w.artist_id]?.name || ''
    return w.title?.toLowerCase().includes(q) ||
      artist.toLowerCase().includes(q) ||
      w.hg_code?.toLowerCase().includes(q) ||
      w.medium?.toLowerCase().includes(q)
  })
  const displayLimit = batchSize === 'all' ? filtered.length : Number(batchSize)

  function toggleSelect(w) {
    setSelected(prev => {
      if (prev.find(s => s.id === w.id)) return prev.filter(s => s.id !== w.id)
      return [...prev, { ...w, artist_name: artistMap[w.artist_id]?.name || '' }]
    })
  }

  function removeSelected(id) {
    setSelected(prev => prev.filter(w => w.id !== id))
    setNotes(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function onDragStart(i) { dragIdx.current = i }
  function onDragOver(e, i) { e.preventDefault(); setDragOver(i) }
  function onDrop(i) {
    if (dragIdx.current === null || dragIdx.current === i) { setDragOver(null); return }
    const reordered = [...selected]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(i, 0, moved)
    setSelected(reordered)
    dragIdx.current = null
    setDragOver(null)
  }

  // ── Generate catalogue ──
  async function generate() {
    if (selected.length === 0) return alert('Select at least one artwork')
    setGenerating(true)

    async function toB64(url) {
      if (!url) return null
      try {
        const r = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now(), { cache: 'no-store' })
        const blob = await r.blob()
        return await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(blob) })
      } catch { return null }
    }

    const imgMap = {}
    await Promise.all(selected.map(async w => { imgMap[w.id] = await toB64(w.image_url) }))

    const du = (w) => w.dimension_unit === 'cm' ? 'cm' : 'in'

    // Apply overrides
    const finalSelected = selected.map(w => ({
      ...w,
      title: overrides[w.id]?.title ?? w.title,
      price: overrides[w.id]?.price ?? w.price,
    }))

    function card(w, size) {
      const img = imgMap[w.id]
      const details = [w.medium, w.dimensions ? w.dimensions + ' ' + du(w) : null, w.year ? String(w.year) : null].filter(Boolean).join(' \u00b7 ')
      const price = showPrice && (w.price || w.retail_price)
        ? (w.price || ('\u20a6' + Number(w.retail_price).toLocaleString()))
        : null
      const bio = showBio && bioPlacement === 'inline' ? bios[w.artist_name] : null
      const note = showNotes && notes[w.id] ? notes[w.id] : null
      const fs = size === 'full' ? 12 : size === 'half' ? 11 : 10

      return `<div class="card card-${size}">
        ${img ? `<div class="img-wrap"><img src="${img}" /></div>` : '<div class="img-ph"></div>'}
        <div class="meta">
          <div class="t" style="font-size:${fs}px">${esc(w.title || 'Untitled')}</div>
          <div class="a" style="font-size:${fs}px">${esc(w.artist_name)}</div>
          ${details ? `<div class="d" style="font-size:${fs}px">${esc(details)}</div>` : ''}
          ${price ? `<div class="pr" style="font-size:${fs}px">${esc(price)}</div>` : ''}
          ${note ? `<div class="nt" style="font-size:${fs}px">${esc(note)}</div>` : ''}
          ${bio ? `<div class="ib">${bio.split('\n\n').map(p => '<p>' + esc(p) + '</p>').join('')}</div>` : ''}
        </div>
      </div>`
    }

    let pages = []

    if (showLogo && LOGO_B64) {
      pages.push(`<div class="pg logo-pg"><img src="${LOGO_B64}" class="logo" /></div>`)
    }

    if (layout === 'single') {
      finalSelected.forEach(w => pages.push(`<div class="pg">${card(w,'full')}</div>`))
    } else if (layout === 'double') {
      for (let i = 0; i < finalSelected.length; i += 2) {
        const c = [card(finalSelected[i],'half')]
        if (finalSelected[i+1]) c.push(card(finalSelected[i+1],'half'))
        pages.push(`<div class="pg dbl">${c.join('')}</div>`)
      }
    } else {
      for (let i = 0; i < finalSelected.length; i += 4) {
        const c = finalSelected.slice(i,i+4).map(w => card(w,'quarter'))
        pages.push(`<div class="pg quad">${c.join('')}</div>`)
      }
    }

    if (showBio && bioPlacement === 'end') {
      const used = [...new Set(finalSelected.map(w => w.artist_name))].filter(Boolean).sort()
      used.filter(n => bios[n]).forEach(n => {
        pages.push(`<div class="pg bio-pg"><div class="bn">${esc(n)}</div><div class="bt">${bios[n].split('\n\n').map(p=>'<p>'+esc(p)+'</p>').join('')}</div></div>`)
      })
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalogue</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Helvetica,sans-serif;background:#f5f3f0;color:#1a1714}
.pg{width:100%;max-width:420px;margin:12px auto;background:#fff;aspect-ratio:3/4;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:28px 24px;box-shadow:0 1px 6px rgba(0,0,0,.08);border-radius:2px;overflow:hidden;page-break-after:always;position:relative}
.pg.dbl{gap:16px}
.pg.quad{flex-wrap:wrap;flex-direction:row;gap:10px;justify-content:center;align-content:center}
.logo-pg{justify-content:center}
.logo{max-width:180px;max-height:100px;object-fit:contain}
.card{display:flex;flex-direction:column;align-items:center;width:100%}
.card-half{max-width:100%}
.card-quarter{max-width:48%;flex:0 0 48%}
.img-wrap{width:100%;display:flex;justify-content:center;margin-bottom:12px}
.img-wrap img{max-width:100%;max-height:55vh;object-fit:contain;display:block}
.card-half .img-wrap img{max-height:28vh}
.card-quarter .img-wrap img{max-height:16vh}
.img-ph{width:100%;height:180px;background:#f0ece7;border-radius:2px;margin-bottom:12px}
.meta{text-align:center;max-width:380px}
.t{font-weight:600;letter-spacing:.01em;margin-bottom:1px}
.a{color:#6b6760;margin-bottom:1px}
.d{color:#9a9490;margin-bottom:1px}
.pr{color:#92600a;margin-top:3px}
.nt{color:#3d3a36;font-style:italic;margin-top:5px;line-height:1.5}
.ib{margin-top:8px;text-align:left;color:#3d3a36;line-height:1.6;font-size:10px}
.ib p{margin-bottom:.6em}
.bio-pg{align-items:flex-start;padding:32px 28px}
.bn{font-size:16px;font-weight:600;margin-bottom:12px;letter-spacing:.02em}
.bt{font-size:12px;line-height:1.8;color:#3d3a36}
.bt p{margin-bottom:.8em}
.dl-bar{position:fixed;bottom:0;left:0;right:0;background:#1a1714;padding:10px 20px;display:flex;justify-content:center;gap:12px;z-index:10}
.dl-bar button{padding:8px 20px;border:none;border-radius:3px;font-size:13px;cursor:pointer;font-weight:500}
.dl-btn{background:#E05C2A;color:#fff}
.bk-btn{background:transparent;color:#aaa;border:1px solid #555}
@media(max-width:440px){.pg{margin:8px auto;padding:20px 16px;border-radius:0;box-shadow:none}}
@media print{body{background:#fff}.pg{box-shadow:none;margin:0;max-width:100%;border-radius:0;aspect-ratio:auto;min-height:100vh}.dl-bar{display:none}@page{margin:0;size:A4 portrait}}
</style></head><body>
${pages.join('\n')}
<div class="dl-bar">
  <button class="bk-btn" onclick="window.close()">Close</button>
  <button class="dl-btn" onclick="window.print()">Download PDF</button>
</div>
</body></html>`

    setPreviewHtml(html)
    setStep('review')
    setGenerating(false)
  }

  function getOverride(id, field) {
    return overrides[id]?.[field] ?? null
  }
  function setOverride(id, field, value) {
    setOverrides(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading artworks...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Catalogue builder</div>
        <div className="page-subtitle">
          {artworks.length} artworks available &middot; {selected.length} selected
        </div>
      </div>

      {step === 'select' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* LEFT — Search and select */}
        <div>
          {/* Search bar + controls */}
          <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
            <input
              className="form-input"
              style={{ flex:1, minWidth:180, fontSize:14 }}
              placeholder="Search by artist, title, medium, HG code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
              <input type="checkbox" checked={availOnly} onChange={e => setAvailOnly(e.target.checked)} />
              Available only
            </label>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
            <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
              {[['grid','Grid'],['list','List']].map(([k,l]) => (
                <button key={k} onClick={() => setViewMode(k)}
                  style={{ padding:'4px 10px', fontSize:10, cursor:'pointer', border:'none',
                    background: viewMode===k ? 'var(--ink)' : 'var(--white)',
                    color: viewMode===k ? '#fff' : 'var(--muted)' }}>{l}</button>
              ))}
            </div>
            <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
              {[['20','20'],['40','40'],['all','All']].map(([k,l]) => (
                <button key={k} onClick={() => setBatchSize(k==='all'?'all':Number(k))}
                  style={{ padding:'4px 10px', fontSize:10, cursor:'pointer', border:'none',
                    background: String(batchSize)===k ? 'var(--ink)' : 'var(--white)',
                    color: String(batchSize)===k ? '#fff' : 'var(--muted)' }}>{l}</button>
              ))}
            </div>
            <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>{filtered.length} results</span>
          </div>

          {/* Results — Grid or List */}
          <div style={{ maxHeight:480, overflowY:'auto', border:'1px solid var(--line)', borderRadius:4, marginBottom:16 }}>
            {filtered.length === 0 && (
              <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No results</div>
            )}
            {viewMode === 'grid' ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:6, padding:8 }}>
                {filtered.slice(0, displayLimit).map(w => {
                  const isSelected = selected.some(s => s.id === w.id)
                  return (
                    <div key={w.id} onClick={() => toggleSelect(w)}
                      style={{ cursor:'pointer', position:'relative', borderRadius:4,
                        border: isSelected ? '2px solid var(--green,#27ae60)' : '2px solid transparent',
                        overflow:'hidden' }}>
                      {(w.thumbnail_url || w.image_url)
                        ? <img src={w.thumbnail_url || w.image_url} alt="" loading="lazy"
                            style={{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' }} />
                        : <div style={{ width:'100%', aspectRatio:'1', background:'var(--parchment-2)' }} />
                      }
                      {isSelected && (
                        <div style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%',
                          background:'var(--green,#27ae60)', color:'#fff', display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:12, fontWeight:700 }}>\u2713</div>
                      )}
                      <div style={{ padding:'4px 5px', fontSize:9, lineHeight:1.3, overflow:'hidden' }}>
                        <div style={{ fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.title}</div>
                        <div style={{ color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{artistMap[w.artist_id]?.name || ''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              filtered.slice(0, displayLimit).map(w => {
                const isSelected = selected.some(s => s.id === w.id)
                return (
                  <div key={w.id} onClick={() => toggleSelect(w)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                      cursor:'pointer', borderBottom:'1px solid var(--line-soft)',
                      background: isSelected ? 'var(--parchment)' : 'transparent' }}>
                    {(w.thumbnail_url || w.image_url)
                      ? <img src={w.thumbnail_url || w.image_url} alt="" loading="lazy"
                          style={{ width:40, height:40, objectFit:'cover', borderRadius:2, flexShrink:0 }} />
                      : <div style={{ width:40, height:40, background:'var(--parchment-2)', borderRadius:2, flexShrink:0 }} />
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.title}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name || ''}{w.year ? ' \u00b7 ' + w.year : ''}</div>
                    </div>
                    <div style={{ fontSize:18, color: isSelected ? 'var(--green,#27ae60)' : 'var(--line)', flexShrink:0 }}>
                      {isSelected ? '\u2713' : '\u25cb'}
                    </div>
                  </div>
                )
              })
            )}
            {filtered.length > displayLimit && (
              <div style={{ padding:'10px 12px', fontSize:11, color:'var(--muted)', textAlign:'center', borderTop:'1px solid var(--line-soft)' }}>
                Showing {displayLimit} of {filtered.length} — increase batch size or narrow your search
              </div>
            )}
          </div>

          {/* Selected artworks — drag to reorder */}
          {selected.length > 0 && (
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 8 }}>
                Selected ({selected.length}) — drag to reorder
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selected.map((w, i) => (
                  <div key={w.id}
                    draggable
                    onDragStart={() => onDragStart(i)}
                    onDragOver={e => onDragOver(e, i)}
                    onDrop={() => onDrop(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                      border: `1px solid ${dragOver === i ? 'var(--ink)' : 'var(--line)'}`,
                      borderRadius: 4, background: 'var(--white)', cursor: 'grab',
                    }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)', width: 20, textAlign: 'center' }}>{i + 1}</span>
                    {(w.thumbnail_url || w.image_url)
                      ? <img src={w.thumbnail_url || w.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 2 }} />
                      : <div style={{ width: 32, height: 32, background: 'var(--parchment-2)', borderRadius: 2 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{w.artist_name}</div>
                    </div>
                    {showNotes && (
                      <input
                        className="form-input"
                        style={{ width: 120, fontSize: 10, padding: '2px 6px' }}
                        placeholder="Note..."
                        value={notes[w.id] || ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setNotes(prev => ({ ...prev, [w.id]: e.target.value }))}
                      />
                    )}
                    <button
                      onClick={() => removeSelected(w.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px' }}
                    >&times;</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Options panel */}
        <div>
          <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 2 }}>Catalogue options</div>

            {/* Layout */}
            <div>
              <label className="form-label">Layout</label>
              <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                {[['single', '1 per page'], ['double', '2 per page'], ['quad', '4 per page']].map(([key, label]) => (
                  <button key={key}
                    onClick={() => setLayout(key)}
                    style={{
                      flex: 1, padding: '7px 8px', fontSize: 11, cursor: 'pointer', border: 'none',
                      borderRight: '1px solid var(--line)',
                      background: layout === key ? 'var(--ink)' : 'var(--white)',
                      color: layout === key ? '#fff' : 'var(--muted)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logo page */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showLogo} onChange={e => setShowLogo(e.target.checked)} />
              Logo page (first page)
            </label>

            {/* Show price */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} />
              Show prices
            </label>

            {/* Show notes */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showNotes} onChange={e => setShowNotes(e.target.checked)} />
              Add notes per artwork
            </label>

            {/* Bio options */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showBio} onChange={e => setShowBio(e.target.checked)} />
              Include artist bios
            </label>
            {showBio && (
              <div style={{ paddingLeft: 24 }}>
                <div style={{ display: 'flex', gap: 0, border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                  {[['end', 'At end'], ['inline', 'Below artwork']].map(([key, label]) => (
                    <button key={key}
                      onClick={() => setBioPlacement(key)}
                      style={{
                        flex: 1, padding: '6px 8px', fontSize: 11, cursor: 'pointer', border: 'none',
                        borderRight: '1px solid var(--line)',
                        background: bioPlacement === key ? 'var(--ink)' : 'var(--white)',
                        color: bioPlacement === key ? '#fff' : 'var(--muted)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            <button
              className="btn btn-primary"
              style={{ marginTop: 8, width: '100%' }}
              onClick={generate}
              disabled={generating || selected.length === 0}
            >
              {generating ? 'Generating...' : `Review catalogue (${selected.length} work${selected.length !== 1 ? 's' : ''})`}
            </button>

            {selected.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                Search and select artworks to build your catalogue
              </div>
            )}
          </div>
        </div>
      </div>

      </div>}

      {/* Review step */}
      {step === 'review' && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.85)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#1a1714' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:500 }}>Review catalogue</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setStep('select')}
                style={{ padding:'6px 14px', background:'transparent', border:'1px solid #555', color:'#aaa', borderRadius:3, cursor:'pointer', fontSize:12 }}>
                Back
              </button>
              <button onClick={() => setStep('edit-details')}
                style={{ padding:'6px 14px', background:'transparent', border:'1px solid #888', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12 }}>
                Edit details
              </button>
              <button onClick={() => {
                const w = window.open('', '_blank')
                if (!w) { alert('Allow popups to generate PDF'); return }
                w.document.open(); w.document.write(previewHtml); w.document.close(); w.focus()
              }}
                style={{ padding:'6px 14px', background:'#E05C2A', border:'none', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:500 }}>
                Create PDF
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center' }}>
            <iframe ref={previewRef} srcDoc={previewHtml}
              style={{ width:'100%', maxWidth:480, height:'100%', border:'none', background:'#f5f3f0' }}
              title="Catalogue preview" />
          </div>
        </div>
      )}

      {/* Edit details step */}
      {step === 'edit-details' && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'var(--white)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#1a1714' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:500 }}>Edit catalogue details</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { generate(); }}
                style={{ padding:'6px 14px', background:'#E05C2A', border:'none', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:500 }}>
                Update preview
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', padding:'20px 24px' }}>
            <div style={{ maxWidth:700, margin:'0 auto', display:'flex', flexDirection:'column', gap:16 }}>
              {selected.map((w, i) => (
                <div key={w.id} style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:16, padding:'14px 16px', border:'1px solid var(--line)', borderRadius:6 }}>
                  {(w.thumbnail_url || w.image_url)
                    ? <img src={w.thumbnail_url || w.image_url} alt="" style={{ width:80, height:80, objectFit:'cover', borderRadius:4 }} />
                    : <div style={{ width:80, height:80, background:'var(--parchment-2)', borderRadius:4 }} />
                  }
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--muted)' }}>{i+1}. {w.artist_name}</div>
                    <div className="form-row" style={{ gap:8 }}>
                      <div className="form-group" style={{ flex:2 }}>
                        <label className="form-label" style={{ fontSize:10 }}>Title</label>
                        <input className="form-input" style={{ fontSize:12, padding:'4px 8px' }}
                          value={overrides[w.id]?.title ?? w.title}
                          onChange={e => setOverride(w.id, 'title', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex:1 }}>
                        <label className="form-label" style={{ fontSize:10 }}>Price</label>
                        <input className="form-input" style={{ fontSize:12, padding:'4px 8px' }}
                          value={overrides[w.id]?.price ?? (w.price || '')}
                          onChange={e => setOverride(w.id, 'price', e.target.value)} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize:10 }}>Note (appears below artwork)</label>
                      <input className="form-input" style={{ fontSize:12, padding:'4px 8px' }}
                        value={overrides[w.id]?.note ?? (notes[w.id] || '')}
                        onChange={e => { setOverride(w.id, 'note', e.target.value); setNotes(prev => ({...prev, [w.id]: e.target.value})) }} />
                    </div>
                    {showBio && (
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize:10 }}>Bio ({w.artist_name})</label>
                        <textarea className="form-textarea" rows={2} style={{ fontSize:11 }}
                          value={overrides[w.id]?.bio ?? (bios[w.artist_name] || '')}
                          onChange={e => { setOverride(w.id, 'bio', e.target.value); setBios(prev => ({...prev, [w.artist_name]: e.target.value})) }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
