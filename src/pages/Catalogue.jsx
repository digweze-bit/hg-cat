import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, fetchAll } from '../lib/supabase'

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"%3E%3Crect width="400" height="500" fill="%23ede9e2"/%3E%3C/svg%3E'

export default function Catalogue() {
  const [artists, setArtists]   = useState([])
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null) // selected artwork for detail
  const [filters, setFilters]   = useState({ artist: '', medium: '', availability: '', location: '', search: '' })
  const [groupBy, setGroupBy]   = useState('none') // 'none' | 'artist' | 'location'
  const [view, setView]         = useState('grid') // 'grid' | 'list'

  useEffect(() => {
    async function load() {
      const [a, w] = await Promise.all([
        fetchAll('artists', { filters: [['visible','eq',true]], order: 'sort_order' }),
        fetchAll('artworks', { filters: [['visible','eq',true]], order: 'sort_order' }),
      ])
      setArtists(a)
      setArtworks(w)
      setLoading(false)
    }
    load()
  }, [])

  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])

  const filtered = useMemo(() => {
    return artworks.filter(w => {
      const artist = artistMap[w.artist_id]
      if (filters.artist && w.artist_id !== filters.artist) return false
      if (filters.medium && w.medium !== filters.medium) return false
      if (filters.availability && w.availability !== filters.availability) return false
      if (filters.location && w.location !== filters.location) return false
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const inTitle = w.title?.toLowerCase().includes(q)
        const inArtist = artist?.name?.toLowerCase().includes(q)
        const inMedium = w.medium?.toLowerCase().includes(q)
        if (!inTitle && !inArtist && !inMedium) return false
      }
      return true
    })
  }, [artworks, filters, artistMap])

  const mediums = useMemo(() => [...new Set(artworks.map(w => w.medium).filter(Boolean))].sort(), [artworks])
  const locations = useMemo(() => [...new Set(artworks.map(w => w.location).filter(Boolean))].sort(), [artworks])

  // Group artworks
  const grouped = useMemo(() => {
    if (groupBy === 'artist') {
      const groups = {}
      filtered.forEach(w => {
        const key = artistMap[w.artist_id]?.name || 'Unknown Artist'
        if (!groups[key]) groups[key] = []
        groups[key].push(w)
      })
      return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b))
    }
    if (groupBy === 'location') {
      const groups = {}
      filtered.forEach(w => {
        const key = w.location || 'Location not specified'
        if (!groups[key]) groups[key] = []
        groups[key].push(w)
      })
      return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b))
    }
    return [['all', filtered]]
  }, [filtered, groupBy, artistMap])

  const setFilter = useCallback((key, val) => {
    setFilters(f => ({ ...f, [key]: val }))
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <span style={{ fontFamily:'var(--font-serif)', fontSize:'1.4rem', color:'var(--muted)' }}>Loading gallery…</span>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--parchment)' }}>
      {/* ── HEADER ── */}
      <header style={{ background:'var(--white)', borderBottom:'1px solid var(--line)', position:'sticky', top:0, zIndex:20 }}>
        <div style={{ maxWidth:1440, margin:'0 auto', padding:'0 28px', display:'flex', alignItems:'center', justifyContent:'space-between', height:64 }}>
          <div>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.4rem', letterSpacing:'.02em' }}>Hourglass Gallery</div>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginTop:1 }}>Contemporary African Art · Lagos</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} work{filtered.length !== 1 ? 's' : ''}</span>
            <a href="/admin" style={{ fontSize:12, color:'var(--muted)' }}>Admin</a>
          </div>
        </div>
      </header>

      {/* ── FILTERS ── */}
      <div style={{ background:'var(--white)', borderBottom:'1px solid var(--line)' }}>
        <div style={{ maxWidth:1440, margin:'0 auto', padding:'12px 28px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input
            className="form-input"
            style={{ width:200 }}
            placeholder="Search artworks, artists…"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
          />
          <select className="form-select" style={{ width:170 }} value={filters.artist} onChange={e => setFilter('artist', e.target.value)}>
            <option value="">All artists</option>
            {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="form-select" style={{ width:170 }} value={filters.medium} onChange={e => setFilter('medium', e.target.value)}>
            <option value="">All media</option>
            {mediums.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {locations.length > 0 && (
            <select className="form-select" style={{ width:160 }} value={filters.location} onChange={e => setFilter('location', e.target.value)}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          <select className="form-select" style={{ width:150 }} value={filters.availability} onChange={e => setFilter('availability', e.target.value)}>
            <option value="">All status</option>
            <option value="Available">Available</option>
            <option value="Reserved">Reserved</option>
            <option value="Sold">Sold</option>
          </select>
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            <select className="form-select" style={{ width:150 }} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              <option value="none">No grouping</option>
              <option value="artist">Group by artist</option>
              <option value="location">Group by location</option>
            </select>
            {(filters.search || filters.artist || filters.medium || filters.availability || filters.location) && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ artist:'', medium:'', availability:'', location:'', search:'' })}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── ARTWORKS ── */}
      <main style={{ maxWidth:1440, margin:'0 auto', padding:'28px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 0', color:'var(--muted)' }}>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.4rem', marginBottom:8 }}>No works found</div>
            <p style={{ fontSize:13 }}>Try adjusting your filters</p>
          </div>
        ) : (
          grouped.map(([groupName, works]) => (
            <div key={groupName} style={{ marginBottom: groupBy !== 'none' ? 48 : 0 }}>
              {groupBy !== 'none' && (
                <div style={{ marginBottom:20, paddingBottom:10, borderBottom:'1px solid var(--line)' }}>
                  <h2 style={{ fontSize:'1.4rem' }}>{groupName}</h2>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{works.length} work{works.length !== 1 ? 's' : ''}</span>
                </div>
              )}
              <div className="catalogue-grid">
                {works.map(w => (
                  <ArtworkCard
                    key={w.id}
                    artwork={w}
                    artist={artistMap[w.artist_id]}
                    onClick={() => setSelected(w)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer style={{ background:'var(--ink)', color:'rgba(255,255,255,.5)', padding:'32px 28px', textAlign:'center', marginTop:60 }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.1rem', color:'rgba(255,255,255,.8)', marginBottom:6 }}>Hourglass Gallery</div>
        <div style={{ fontSize:12 }}>298A Akin Olugbade Street, Victoria Island, Lagos</div>
      </footer>

      {/* ── DETAIL MODAL ── */}
      {selected && (
        <ArtworkDetail
          artwork={selected}
          artist={artistMap[selected.artist_id]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function ArtworkCard({ artwork: w, artist, onClick }) {
  const availColor = w.availability === 'Available' ? 'var(--green)' : w.availability === 'Sold' ? 'var(--red)' : 'var(--amber)'
  return (
    <div className="card card-hover" style={{ cursor:'pointer' }} onClick={onClick}>
      <div style={{ aspectRatio:'4/5', overflow:'hidden', background:'var(--parchment-2)', position:'relative' }}>
        <img
          src={w.image_url || PLACEHOLDER}
          alt={w.title}
          loading="lazy"
          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: w.image_position || 'center' }}
          onError={e => { e.target.src = PLACEHOLDER }}
        />
        {w.availability !== 'Available' && (
          <div style={{ position:'absolute', top:10, right:10, background: w.availability === 'Sold' ? 'var(--red)' : 'var(--amber)', color:'#fff', fontSize:10, padding:'3px 9px', borderRadius:20, fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' }}>
            {w.availability}
          </div>
        )}
      </div>
      <div style={{ padding:'12px 14px 14px' }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1rem', marginBottom:2, lineHeight:1.2 }}>{w.title}</div>
        {artist && <div style={{ fontSize:12, color:'var(--muted)' }}>{artist.name}</div>}
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
          {[w.year, w.medium].filter(Boolean).join(' · ')}
        </div>
        {w.location && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>📍 {w.location}</div>}
      </div>
    </div>
  )
}

function ArtworkDetail({ artwork: w, artist, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" onClick={e => e.stopPropagation()} style={{ maxHeight:'92vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{w.title}</div>
            {artist && <div style={{ fontSize:13, color:'var(--muted)', marginTop:3 }}>{artist.name}</div>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>
          {/* Image */}
          <div style={{ aspectRatio:'3/4', background:'var(--parchment-2)', borderRadius:3, overflow:'hidden' }}>
            <img
              src={w.image_url || PLACEHOLDER}
              alt={w.title}
              style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: w.image_position || 'center' }}
              onError={e => { e.target.src = PLACEHOLDER }}
            />
          </div>
          {/* Details */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', marginBottom:4 }}>{w.title}</div>
              {artist && <div style={{ fontSize:14, color:'var(--muted)' }}>{artist.name}{artist.nationality ? ` · ${artist.nationality}` : ''}</div>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                ['Year', w.year],
                ['Medium', w.medium],
                ['Dimensions', w.dimensions],
                ['Series', w.series],
                ['Location', w.location],
              ].filter(([,v]) => v).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:13 }}>{val}</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:3 }}>Status</div>
                <div style={{ fontSize:13, color: w.availability === 'Available' ? 'var(--green)' : w.availability === 'Sold' ? 'var(--red)' : 'var(--amber)', fontWeight:500 }}>
                  {w.availability}
                </div>
              </div>
            </div>
            {w.writeup && (
              <div>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>About this work</div>
                <p style={{ fontSize:13, lineHeight:1.75, color:'var(--ink-soft)' }}>{w.writeup}</p>
              </div>
            )}
            {artist?.bio && (
              <div>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>About the artist</div>
                <p style={{ fontSize:13, lineHeight:1.75, color:'var(--ink-soft)' }}>{artist.bio.slice(0, 400)}{artist.bio.length > 400 ? '…' : ''}</p>
              </div>
            )}
            {w.tags?.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {w.tags.map(t => <span key={t} style={{ fontSize:11, padding:'3px 10px', background:'var(--parchment-2)', borderRadius:20, color:'var(--muted)' }}>{t}</span>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
