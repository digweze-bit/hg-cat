import { useState, useEffect, useMemo } from 'react'
import { fetchAll } from '../lib/supabase'

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"%3E%3Crect width="400" height="500" fill="%23ede9e2"/%3E%3C/svg%3E'

export default function Catalogue() {
  const [artists, setArtists]   = useState([])
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [sortTab, setSortTab]   = useState('az') // 'az' | 'most' | 'recent'
  const [activeArtist, setActiveArtist] = useState(null)
  const [selected, setSelected] = useState(null)
  const [mediumFilter, setMediumFilter] = useState('')
  const [availFilter, setAvailFilter]   = useState('')

  useEffect(() => {
    async function load() {
      const a = await fetchAll('artists', { select:'id,name,bio,portrait_url,nationality,born,died,updated_at,created_at,visible', filters: [['visible','eq',true]], order: 'name' })
      setArtists(a)
      setLoading(false)
    }
    load()
  }, [])

  // Load artworks for selected artist only
  useEffect(() => {
    if (!activeArtist) return
    fetchAll('artworks', {
      select:'id,title,artist_id,year,medium,dimensions,availability,image_url,price,sort_order',
      filters: [['visible','eq',true],['artist_id','eq',activeArtist.id]],
      order: 'sort_order'
    }).then(w => setArtworks(prev => {
      // Merge \u2014 keep other artists' works, replace this artist's
      const others = prev.filter(x => x.artist_id !== activeArtist.id)
      return [...others, ...w]
    }))
  }, [activeArtist?.id])

  const artistMap = useMemo(() =>
    Object.fromEntries(artists.map(a => [a.id, a])), [artists])

  // Work counts per artist
  const workCounts = useMemo(() => {
    const counts = {}
    artworks.forEach(w => { counts[w.artist_id] = (counts[w.artist_id] || 0) + 1 })
    return counts
  }, [artworks])

  // Filtered + sorted artists
  const sorted = useMemo(() => {
    let list = artists.filter(a =>
      !search || a.name.toLowerCase().includes(search.toLowerCase())
    )
    if (sortTab === 'most') {
      list = [...list].sort((a, b) => (workCounts[b.id] || 0) - (workCounts[a.id] || 0))
    } else if (sortTab === 'recent') {
      list = [...list].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    }
    return list
  }, [artists, search, sortTab, workCounts])

  // Group by first letter for A\u2013Z view
  const grouped = useMemo(() => {
    if (sortTab !== 'az') return [['', sorted]]
    const groups = {}
    sorted.forEach(a => {
      const letter = a.name[0].toUpperCase()
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(a)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [sorted, sortTab])

  // Works for selected artist
  const artistWorks = useMemo(() => {
    if (!activeArtist) return []
    return artworks.filter(w => {
      if (w.artist_id !== activeArtist.id) return false
      if (mediumFilter && w.medium !== mediumFilter) return false
      if (availFilter && w.availability !== availFilter) return false
      return true
    })
  }, [artworks, activeArtist, mediumFilter, availFilter])

  const mediums = useMemo(() => {
    if (!activeArtist) return []
    return [...new Set(artworks.filter(w => w.artist_id === activeArtist.id).map(w => w.medium).filter(Boolean))].sort()
  }, [artworks, activeArtist])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f9f8f6' }}>
      <div style={{ fontFamily:'Georgia,serif', fontSize:'1.2rem', color:'#999' }}>Loading{'...'}</div>
    </div>
  )

  // \u2500\u2500 ARTIST DETAIL VIEW \u2500\u2500
  if (activeArtist) {
    const wc = workCounts[activeArtist.id] || 0
    return (
      <div style={{ minHeight:'100vh', background:'#f9f8f6', fontFamily:'-apple-system,sans-serif' }}>
        {/* Header */}
        <div style={{ background:'#fff', borderBottom:'1px solid #e8e5e0', padding:'18px 40px', display:'flex', alignItems:'center', gap:16 }}>
          <button
            onClick={() => { setActiveArtist(null); setSelected(null); setMediumFilter(''); setAvailFilter('') }}
            style={{ background:'none', border:'none', cursor:'pointer', color:'#c8651b', fontSize:13, fontFamily:'inherit', padding:0, display:'flex', alignItems:'center', gap:5 }}
          >
            &larr; Artist List
          </button>
          <div style={{ width:1, height:16, background:'#e8e5e0' }} />
          <div style={{ fontFamily:'Georgia,serif', fontSize:'1.1rem', color:'#1a1714' }}>{activeArtist.name}</div>
          <div style={{ marginLeft:'auto', fontSize:13, color:'#999' }}>{wc} work{wc !== 1 ? 's' : ''}</div>
        </div>

        {/* Artist info */}
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'28px 40px 0' }}>
          <div style={{ display:'flex', gap:20, alignItems:'flex-start', marginBottom:24 }}>
            {activeArtist.portrait_url && (
              <img src={activeArtist.portrait_url} alt={activeArtist.name}
                style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'1px solid #e8e5e0', flexShrink:0 }} />
            )}
            <div>
              <div style={{ fontFamily:'Georgia,serif', fontSize:'1.7rem', fontWeight:400, color:'#1a1714', marginBottom:4 }}>{activeArtist.name}</div>
              <div style={{ fontSize:13, color:'#999', marginBottom: activeArtist.bio ? 10 : 0 }}>
                {[activeArtist.nationality, activeArtist.born && activeArtist.died ? `${activeArtist.born}\u2013${activeArtist.died}` : activeArtist.born, activeArtist.medium].filter(Boolean).join(' \u00B7 ')}
              </div>
              {activeArtist.bio && (
                <p style={{ fontSize:13, color:'#555', lineHeight:1.75, maxWidth:640, margin:0 }}>
                  {activeArtist.bio.slice(0, 300)}{activeArtist.bio.length > 300 ? '\u2026' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Filters */}
          <div style={{ display:'flex', gap:8, marginBottom:20, alignItems:'center', borderBottom:'1px solid #e8e5e0', paddingBottom:16 }}>
            <span style={{ fontSize:13, color:'#999' }}>{artistWorks.length} work{artistWorks.length !== 1 ? 's' : ''}</span>
            {mediums.length > 1 && (
              <select value={mediumFilter} onChange={e=>setMediumFilter(e.target.value)}
                style={{ padding:'5px 10px', border:'1px solid #e8e5e0', borderRadius:3, fontSize:12, color:'#333', background:'#fff', fontFamily:'inherit' }}>
                <option value="">All media</option>
                {mediums.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <select value={availFilter} onChange={e=>setAvailFilter(e.target.value)}
              style={{ padding:'5px 10px', border:'1px solid #e8e5e0', borderRadius:3, fontSize:12, color:'#333', background:'#fff', fontFamily:'inherit' }}>
              <option value="">All works</option>
              <option value="Available">Available</option>
              <option value="Sold">Sold</option>
              <option value="NFS">NFS</option>
            </select>
            {(mediumFilter || availFilter) && (
              <button onClick={() => { setMediumFilter(''); setAvailFilter('') }}
                style={{ fontSize:12, color:'#c8651b', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                Clear
              </button>
            )}
          </div>

          {/* Works grid */}
          {artistWorks.length === 0
            ? <div style={{ textAlign:'center', padding:'60px 0', color:'#999', fontSize:14 }}>No works found</div>
            : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16, paddingBottom:60 }}>
                {artistWorks.map(w => (
                  <ArtworkCard key={w.id} artwork={w} onClick={() => setSelected(w)} />
                ))}
              </div>
          }
        </div>

        {selected && (
          <ArtworkDetail artwork={selected} artist={activeArtist} onClose={() => setSelected(null)} />
        )}
      </div>
    )
  }

  // {'\u2500'}{'\u2500'} ARTIST INDEX VIEW {'\u2500'}{'\u2500'}
  return (
    <div style={{ minHeight:'100vh', background:'#f9f8f6', fontFamily:'-apple-system,sans-serif' }}>

      {/* Logo + stats header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e8e5e0', padding:'28px 40px 0', textAlign:'center' }}>
        <div style={{ display:'inline-block', border:'1.5px solid #1a1714', padding:'10px 18px', marginBottom:10 }}>
          <div style={{ fontFamily:'Georgia,serif', fontSize:'1.05rem', letterSpacing:'.18em', textTransform:'uppercase', color:'#1a1714' }}>
            Hourglass<span style={{ color:'#c8651b' }}>/</span>
          </div>
          <div style={{ fontSize:9, letterSpacing:'.22em', textTransform:'uppercase', color:'#c8651b', marginTop:1 }}>Gallery</div>
        </div>
        <div style={{ fontSize:11, letterSpacing:'.14em', textTransform:'uppercase', color:'#999', marginBottom:20 }}>
          Artist List
        </div>
        <div style={{ display:'flex', justifyContent:'center', gap:0, marginBottom:0 }}>
          <div style={{ padding:'10px 48px', borderRight:'1px solid #e8e5e0' }}>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'2rem', color:'#c8651b', lineHeight:1 }}>{artists.length}</div>
            <div style={{ fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:'#999', marginTop:4 }}>Artists</div>
          </div>
          <div style={{ padding:'10px 48px' }}>
            <div style={{ fontFamily:'Georgia,serif', fontSize:'2rem', color:'#c8651b', lineHeight:1 }}>{artworks.length}</div>
            <div style={{ fontSize:9, letterSpacing:'.12em', textTransform:'uppercase', color:'#999', marginTop:4 }}>Works</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e8e5e0', padding:'12px 40px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by artist, title, tag or e.g. 'Boadi large works'..."
          style={{ width:'100%', padding:'8px 0', border:'none', borderBottom:'1px solid #e8e5e0', fontSize:13, color:'#333', background:'transparent', fontFamily:'inherit', outline:'none' }}
        />
      </div>

      {/* Sort tabs */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e8e5e0', padding:'0 40px', display:'flex', gap:0 }}>
        {[['az','A \u2013 Z'],['most','Most Works'],['recent','Recently Updated']].map(([key, label]) => (
          <button key={key} onClick={() => setSortTab(key)}
            style={{ padding:'12px 20px', fontSize:12, letterSpacing:'.06em', textTransform:'uppercase', fontFamily:'inherit', cursor:'pointer', background:'none', border:'none', borderBottom: sortTab===key ? '2px solid #c8651b' : '2px solid transparent', color: sortTab===key ? '#c8651b' : '#999', transition:'all 150ms' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Artist grid */}
      <div style={{ maxWidth:1440, margin:'0 auto', padding:'0 40px 60px' }}>
        {grouped.map(([letter, group]) => (
          <div key={letter}>
            {letter && (
              <div style={{ padding:'18px 0 8px', fontSize:12, color:'#bbb', letterSpacing:'.08em' }}>{letter}</div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:0, border:'1px solid #e8e5e0', borderRight:'none', borderBottom:'none' }}>
              {group.map(a => {
                const wc = workCounts[a.id] || 0
                return (
                  <div key={a.id}
                    onClick={() => setActiveArtist(a)}
                    style={{ padding:'16px 20px 14px', borderRight:'1px solid #e8e5e0', borderBottom:'1px solid #e8e5e0', cursor:'pointer', background:'#fff', transition:'background 120ms', minHeight:80, display:'flex', flexDirection:'column', justifyContent:'space-between' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#faf9f7'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div style={{ fontFamily:'Georgia,serif', fontSize:'1rem', color:'#1a1714', lineHeight:1.3 }}>{a.name}</div>
                    <div style={{ fontSize:11, color:'#c8651b', marginTop:12, textAlign:'right' }}>{wc} \u2192</div>
                  </div>
                )
              })}
              {/* Fill empty cells in last row */}
              {group.length % 3 !== 0 && Array(3 - group.length % 3).fill(0).map((_, i) => (
                <div key={`empty-${i}`} style={{ borderRight:'1px solid #e8e5e0', borderBottom:'1px solid #e8e5e0', background:'#fff' }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ background:'#1a1714', color:'rgba(255,255,255,.4)', padding:'24px 40px', textAlign:'center', fontSize:11 }}>
        <div style={{ fontFamily:'Georgia,serif', fontSize:'0.95rem', color:'rgba(255,255,255,.7)', marginBottom:4 }}>Hourglass Gallery</div>
        <div>298A Akin Olugbade Street, Victoria Island, Lagos</div>
      </div>
    </div>
  )
}

function ArtworkCard({ artwork: w, onClick }) {
  return (
    <div onClick={onClick}
      style={{ cursor:'pointer', background:'#fff', border:'1px solid #e8e5e0', borderRadius:2, overflow:'hidden', transition:'box-shadow 150ms' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ aspectRatio:'4/5', overflow:'hidden', background:'#f0ece4', position:'relative' }}>
        <img src={w.image_url || PLACEHOLDER} alt={w.title} loading="lazy"
          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: w.image_position || 'center', display:'block' }}
          onError={e => { e.target.src = PLACEHOLDER }} />
        {w.availability !== 'Available' && (
          <div style={{ position:'absolute', top:8, right:8, background: w.availability === 'Sold' ? 'rgba(139,26,26,.85)' : 'rgba(146,96,10,.85)', color:'#fff', fontSize:9, padding:'3px 8px', borderRadius:20, fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>
            {w.availability}
          </div>
        )}
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <div style={{ fontFamily:'Georgia,serif', fontSize:'0.9rem', lineHeight:1.3, color:'#1a1714', marginBottom:3 }}>{w.title}</div>
        <div style={{ fontSize:11, color:'#999' }}>{[w.year, w.medium].filter(Boolean).join(' \u00B7 ')}</div>
        {w.dimensions && <div style={{ fontSize:11, color:'#bbb', marginTop:1 }}>{w.dimensions}</div>}
      </div>
    </div>
  )
}

function ArtworkDetail({ artwork: w, artist, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,23,20,.65)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:3, maxWidth:860, width:'100%', maxHeight:'90vh', display:'flex', overflow:'hidden', boxShadow:'0 8px 48px rgba(0,0,0,.25)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ width:'45%', flexShrink:0, background:'#f0ece4' }}>
          <img src={w.image_url || PLACEHOLDER} alt={w.title}
            style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition: w.image_position || 'center', display:'block' }}
            onError={e => { e.target.src = PLACEHOLDER }} />
        </div>
        <div style={{ flex:1, padding:'28px', overflowY:'auto', display:'flex', flexDirection:'column', gap:16, fontFamily:'-apple-system,sans-serif' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontFamily:'Georgia,serif', fontSize:'1.4rem', fontWeight:400, color:'#1a1714', marginBottom:4, lineHeight:1.2 }}>{w.title}</div>
              {artist && <div style={{ fontSize:13, color:'#999' }}>{artist.name}</div>}
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#999', fontSize:20, lineHeight:1, padding:4 }}>{'\u2715'}</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[['Year',w.year],['Medium',w.medium],['Dimensions',w.dimensions],['Series',w.series],['Location',w.location],['Status',w.availability]].filter(([,v])=>v).map(([label,val])=>(
              <div key={label}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'#999', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:13, color: label==='Status' ? (val==='Available'?'#2d6a4f':val==='Sold'?'#8b1a1a':'#92600a') : '#1a1714', fontWeight: label==='Status'?500:400 }}>{val}</div>
              </div>
            ))}
          </div>
          {w.writeup && (
            <div>
              <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'#999', marginBottom:8 }}>About this work</div>
              <p style={{ fontSize:13, lineHeight:1.75, color:'#555', margin:0 }}>{w.writeup}</p>
            </div>
          )}
          {artist?.bio && (
            <div>
              <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'#999', marginBottom:8 }}>About the artist</div>
              <p style={{ fontSize:13, lineHeight:1.75, color:'#555', margin:0 }}>{artist.bio.slice(0,350)}{artist.bio.length>350?'\u2026':''}</p>
            </div>
          )}
          {w.tags?.length > 0 && (
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {w.tags.map(t=><span key={t} style={{ fontSize:11, padding:'3px 10px', background:'#f0ece4', borderRadius:20, color:'#999' }}>{t}</span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
