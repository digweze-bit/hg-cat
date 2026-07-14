import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

function escH(s) {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

export default function CatalogueBuilder() {
  const [artworks, setArtworks]     = useState([])   // all artworks (for search)
  const [artists, setArtists]       = useState([])   // all artists (for bios)
  const [selected, setSelected]     = useState([])   // ordered selection
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [dragOver, setDragOver]     = useState(null)

  // Options
  const [format, setFormat]         = useState('single')  // 'single' | 'double'
  const [showPrice, setShowPrice]   = useState(false)
  const [showBio, setShowBio]       = useState(false)
  const [bios, setBios]             = useState({})        // artist name -> bio override

  const [LOGO_B64, setLogoB64]      = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: aw }, { data: ar }] = await Promise.all([
        supabase.from('artworks')
          .select('id,title,artist_id,year,medium,dimensions,image_url,price,retail_price,hg_code,availability')
          .eq('availability', 'Available')
          .order('hg_code', { ascending: false }),
        supabase.from('artists').select('id,name,bio').order('name'),
      ])
      setArtworks(aw || [])
      setArtists(ar || [])
      // Pre-populate bios from artists table
      const bioMap = {}
      ;(ar || []).forEach(a => { if (a.bio) bioMap[a.name] = a.bio })
      setBios(bioMap)
      setLoading(false)
    }
    load()

    // Load logo
    import('../lib/assets').then(m => setLogoB64(m.LOGO_B64 || null))
  }, [])

  // Build artist map
  const artistMap = {}
  artists.forEach(a => { artistMap[a.id] = a })

  // Filter artworks for search
  const filtered = search.trim()
    ? artworks.filter(w => {
        const q = search.toLowerCase()
        const artist = artistMap[w.artist_id]?.name || ''
        return w.title?.toLowerCase().includes(q) ||
               artist.toLowerCase().includes(q) ||
               w.hg_code?.toLowerCase().includes(q) ||
               w.medium?.toLowerCase().includes(q)
      })
    : artworks

  function toggleSelect(artwork) {
    setSelected(prev => {
      if (prev.find(w => w.id === artwork.id)) {
        return prev.filter(w => w.id !== artwork.id)
      }
      const artistName = artistMap[artwork.artist_id]?.name || ''
      return [...prev, { ...artwork, artist_name: artistName }]
    })
  }

  function removeSelected(id) {
    setSelected(prev => prev.filter(w => w.id !== id))
  }

  // Drag to reorder
  const dragIdx = useRef(null)

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

  async function generate(previewOnly = false) {
    if (selected.length === 0) { alert('Select at least one artwork'); return }
    setGenerating(true)

    // Convert images to base64
    async function toB64(url) {
      if (!url) return null
      try {
        const r = await fetch(url)
        const blob = await r.blob()
        return await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result)
          reader.onerror = rej
          reader.readAsDataURL(blob)
        })
      } catch { return null }
    }

    const imgMap = {}
    await Promise.all(selected.map(async w => {
      imgMap[w.id] = await toB64(w.image_url)
    }))

    function caption(w) {
      const details = [w.medium, w.dimensions, w.year ? String(w.year) : null].filter(Boolean).join(' \u00B7 ')
      const price = showPrice && (w.price || w.retail_price)
        ? (w.price || ('NGN ' + Number(w.retail_price).toLocaleString()))
        : null
      return `<div class="caption">
        <div class="t">${escH(w.title || 'Untitled')}</div>
        <div class="a">${escH(w.artist_name || '')}</div>
        ${details ? `<div class="d">${escH(details)}</div>` : ''}
        ${price ? `<div class="p">${escH(price)}</div>` : ''}
      </div>`
    }

    let pages = ''

    // Cover page — always first
    pages += `<div class="page cover">
      ${LOGO_B64 ? `<img src="${LOGO_B64}" class="cover-logo">` : `<div class="cover-text">HOURGLASS GALLERY</div>`}
    </div>`

    // Artwork pages
    if (format === 'single') {
      selected.forEach(w => {
        const img = imgMap[w.id]
        pages += `<div class="page art-page">
          <div class="img-wrap">
            ${img ? `<img src="${img}" class="art-img">` : `<div class="img-ph"></div>`}
          </div>
          ${caption(w)}
        </div>`
      })
    } else {
      for (let i = 0; i < selected.length; i += 2) {
        const w1 = selected[i], w2 = selected[i + 1]
        pages += `<div class="page art-page two-up">
          <div class="col">
            <div class="img-wrap two">
              ${imgMap[w1.id] ? `<img src="${imgMap[w1.id]}" class="art-img">` : `<div class="img-ph"></div>`}
            </div>
            ${caption(w1)}
          </div>
          <div class="col">
            ${w2 ? `<div class="img-wrap two">
              ${imgMap[w2.id] ? `<img src="${imgMap[w2.id]}" class="art-img">` : `<div class="img-ph"></div>`}
            </div>${caption(w2)}` : ''}
          </div>
        </div>`
      }
    }

    // Bio pages
    if (showBio) {
      const seen = new Set()
      selected.forEach(w => {
        if (!w.artist_name || seen.has(w.artist_name)) return
        seen.add(w.artist_name)
        const bio = bios[w.artist_name]
        if (!bio) return
        pages += `<div class="page bio-page">
          <div class="bio-name">${escH(w.artist_name)}</div>
          <div class="bio-text">${escH(bio)}</div>
        </div>`
      })
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hourglass Gallery</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&display=swap');
body{font-family:'Cormorant Garamond',Georgia,serif;color:#1a1714;background:#fff;}
.page{width:100%;min-height:100vh;page-break-after:always;padding:36px 48px 32px;display:flex;flex-direction:column;}
.cover{align-items:center;justify-content:center;}
.cover-logo{height:52px;object-fit:contain;opacity:.85;}
.cover-text{font-size:18px;font-weight:300;letter-spacing:.2em;}
.art-page{justify-content:space-between;}
.img-wrap{display:flex;align-items:center;justify-content:center;flex:1;padding:8px 0 18px;}
.img-wrap.two{flex:none;height:38vh;padding:0 0 12px;}
.art-img{max-width:100%;max-height:100%;object-fit:contain;display:block;}
.img-ph{width:100%;height:100%;background:#f5f2ee;}
.two-up{flex-direction:row;gap:36px;}
.col{flex:1;display:flex;flex-direction:column;}
.caption{border-top:1px solid #e8e3db;padding-top:11px;}
.t{font-size:14px;font-weight:600;letter-spacing:.01em;margin-bottom:2px;}
.a{font-size:13px;font-weight:300;color:#444;margin-bottom:3px;}
.d{font-size:11px;font-weight:300;color:#aaa;letter-spacing:.03em;margin-bottom:2px;}
.p{font-size:12px;font-weight:400;color:#1a1714;margin-top:3px;}
.bio-page{justify-content:center;padding-top:80px;}
.bio-name{font-size:22px;font-weight:300;letter-spacing:.03em;margin-bottom:24px;}
.bio-text{font-size:13px;font-weight:300;line-height:2;color:#444;max-width:480px;}
@media print{.page{min-height:100vh;}@page{margin:0;size:A4 portrait;}}
</style></head><body>${pages}</body></html>`

    setGenerating(false)
    const win = window.open('', '_blank', 'width=900,height=750')
    if (!win) { alert('Please allow popups'); return }
    win.document.write(html)
    win.document.close()
    if (!previewOnly) setTimeout(() => win.print(), 3000)
  }

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  const uniqueArtistsInSelection = [...new Set(selected.map(w => w.artist_name).filter(Boolean))]

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:24, height:'calc(100vh - 80px)', overflow:'hidden' }}>

      {/* LEFT: Search & browse */}
      <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div className="page-header" style={{ paddingBottom:16 }}>
          <div className="page-title">Catalogue Builder</div>
          <div className="page-subtitle">{artworks.length} available works</div>
        </div>

        <input className="form-input" style={{ marginBottom:12 }}
          placeholder="Search by title, artist, medium, HG code..."
          value={search} onChange={e => setSearch(e.target.value)} />

        <div style={{ overflowY:'auto', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12 }}>
            {filtered.slice(0, 120).map(w => {
              const isSelected = !!selected.find(s => s.id === w.id)
              const artistName = artistMap[w.artist_id]?.name || ''
              return (
                <div key={w.id}
                  onClick={() => toggleSelect({ ...w, artist_name: artistName })}
                  style={{ cursor:'pointer', border:`2px solid ${isSelected ? 'var(--ink)' : 'var(--line-soft)'}`,
                    borderRadius:4, overflow:'hidden', background: isSelected ? 'var(--parchment-2,#f5f2ee)' : '#fff',
                    transition:'border-color 150ms' }}>
                  <div style={{ height:120, background:'#f5f2ee', overflow:'hidden' }}>
                    {w.image_url
                      ? <img src={w.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <div style={{ width:'100%', height:'100%', background:'#ece9e4' }} />}
                  </div>
                  <div style={{ padding:'8px 10px' }}>
                    <div style={{ fontSize:12, fontWeight:isSelected?700:500, lineHeight:1.3 }}>{w.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{artistName}</div>
                    {w.hg_code && <div style={{ fontSize:10, color:'var(--amber)', marginTop:2 }}>{w.hg_code}</div>}
                    {isSelected && <div style={{ fontSize:10, color:'var(--ink)', marginTop:4, fontWeight:700 }}>{'\u2713'} Selected</div>}
                  </div>
                </div>
              )
            })}
            {filtered.length > 120 && (
              <div style={{ gridColumn:'1/-1', textAlign:'center', padding:16, color:'var(--muted)', fontSize:12 }}>
                Showing 120 of {filtered.length} — refine your search to see more
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Selection, options, generate */}
      <div style={{ display:'flex', flexDirection:'column', borderLeft:'1px solid var(--line-soft)', paddingLeft:24, overflow:'hidden' }}>

        {/* Selected artworks — drag to reorder */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>
            Selected ({selected.length})
          </div>
          {selected.length === 0 && (
            <div style={{ fontSize:12, color:'var(--muted)', padding:'12px 0' }}>Click artworks to add them</div>
          )}
          <div style={{ overflowY:'auto', maxHeight:220 }}>
            {selected.map((w, i) => (
              <div key={w.id} draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => onDragOver(e, i)}
                onDrop={() => onDrop(i)}
                onDragEnd={() => setDragOver(null)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', marginBottom:4, borderRadius:3,
                  background: dragOver === i ? 'var(--parchment-2)' : 'var(--surface-1,#f8f7f5)',
                  border:'1px solid var(--line-soft)', cursor:'grab' }}>
                <span style={{ color:'var(--muted)', fontSize:14, cursor:'grab' }}>{'\u2630'}</span>
                {w.image_url && <img src={w.image_url} alt="" style={{ width:32, height:32, objectFit:'cover', borderRadius:2 }} />}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.title}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{w.artist_name}</div>
                </div>
                <button onClick={() => removeSelected(w.id)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:14, padding:2 }}>
                  {'\u00D7'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop:'1px solid var(--line-soft)', paddingTop:16, marginBottom:16 }}>

          {/* Format */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>Format</div>
            {[['single','One per page'],['double','Two per page']].map(([val,label]) => (
              <label key={val} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:6 }}>
                <input type="radio" name="fmt" value={val} checked={format===val} onChange={() => setFormat(val)} />
                {label}
              </label>
            ))}
          </div>

          {/* Toggles */}
          <div style={{ marginBottom:14 }}>
            {[['showPrice','Show price','boolean'],['showBio','Include artist bios','boolean']].map(([key,label]) => {
              const val = key === 'showPrice' ? showPrice : showBio
              const setter = key === 'showPrice' ? setShowPrice : setShowBio
              return (
                <label key={key} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:8 }}>
                  <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} style={{ width:15, height:15 }} />
                  {label}
                </label>
              )
            })}
          </div>

          {/* Per-artist bio */}
          {showBio && uniqueArtistsInSelection.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>
                Biographies
              </div>
              <div style={{ overflowY:'auto', maxHeight:160 }}>
                {uniqueArtistsInSelection.map(name => (
                  <div key={name} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:600, marginBottom:4 }}>{name}</div>
                    <textarea className="form-textarea" rows={3} style={{ fontSize:11 }}
                      value={bios[name] || ''}
                      onChange={e => setBios(b => ({...b, [name]: e.target.value}))}
                      placeholder="Bio pulled from Artists section — edit to override" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Generate buttons */}
        <div style={{ marginTop:'auto', display:'flex', flexDirection:'column', gap:10 }}>
          <button className="btn btn-outline" onClick={() => generate(true)} disabled={generating || selected.length === 0}>
            {generating ? 'Generating...' : 'Preview'}
          </button>
          <button className="btn btn-primary" onClick={() => generate(false)} disabled={generating || selected.length === 0}>
            {generating ? 'Generating...' : 'Generate & Print'}
          </button>
          {selected.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>Clear selection</button>
          )}
        </div>
      </div>
    </div>
  )
}
