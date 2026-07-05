import { useState, useEffect, useMemo } from 'react'
import { fetchAll } from '../lib/supabase'

const PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"%3E%3Crect width="400" height="500" fill="%23ede9e2"/%3E%3C/svg%3E'

export default function Catalogue() {
  const [artists, setArtists]     = useState([])
  const [artworks, setArtworks]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeArtist, setActiveArtist] = useState(null)
  const [selected, setSelected]   = useState(null)
  const [search, setSearch]       = useState('')
  const [mediumFilter, setMediumFilter] = useState('')
  const [availFilter, setAvailFilter]   = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [groupByLocation, setGroupByLocation] = useState(false)

  useEffect(() => {
    async function load() {
      const [a, w] = await Promise.all([
        fetchAll('artists', { filters: [['visible','eq',true]], order: 'name' }),
        fetchAll('artworks', { filters: [['visible','eq',true]], order: 'sort_order' }),
      ])
      setArtists(a)
      setArtworks(w)
      setLoading(false)
    }
    load()
  }, [])

  const artistMap = useMemo(() =>
    Object.fromEntries(artists.map(a => [a.id, a])), [artists])

  // Works for the selected artist, with filters applied
  const artistWorks = useMemo(() => {
    if (!activeArtist) return []
    return artworks.filter(w => {
      if (w.artist_id !== activeArtist.id) return false
      if (mediumFilter && w.medium !== mediumFilter) return false
      if (availFilter && w.availability !== availFilter) return false
      if (locationFilter && w.location !== locationFilter) return false
      return true
    })
  }, [artworks, activeArtist, mediumFilter, availFilter, locationFilter])

  // Filtered artist list
  const filteredArtists = useMemo(() =>
    artists.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase())),
    [artists, search])

  // Group artist list alphabetically
  const grouped = useMemo(() => {
    const groups = {}
    filteredArtists.forEach(a => {
      const letter = a.name[0].toUpperCase()
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(a)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredArtists])

  // Available mediums / locations for the active artist
  const mediums = useMemo(() => {
    if (!activeArtist) return []
    return [...new Set(artworks.filter(w => w.artist_id === activeArtist.id).map(w => w.medium).filter(Boolean))].sort()
  }, [artworks, activeArtist])

  const locations = useMemo(() => {
    if (!activeArtist) return []
    return [...new Set(artworks.filter(w => w.artist_id === activeArtist.id).map(w => w.location).filter(Boolean))].sort()
  }, [artworks, activeArtist])

  // Works grouped by location
  const worksByLocation = useMemo(() => {
    if (!groupByLocation) return [['all', artistWorks]]
    const groups = {}
    artistWorks.forEach(w => {
      const key = w.location || 'Location not specified'
      if (!groups[key]) groups[key] = []
      groups[key].push(w)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [artistWorks, groupByLocation])

  const workCount = activeArtist
    ? artworks.filter(w => w.artist_id === activeArtist.id).length
    : 0

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--parchment)' }}>
      <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', color:'var(--muted)' }}>Loading gallery…</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--parchment)', display:'flex', flexDirection:'column' }}>

      {/* ── HEADER ── */}
      <header style={{ background:'var(--white)', borderBottom:'1px solid var(--line)', position:'sticky', top:0, zIndex:20 }}>
        <div style={{ maxWidth:1440, margin:'0 auto', padding:'0 32px', display:'flex', alignItems:'center', justifyContent:'space-between', height:68 }}>
          <div style={{ cursor:'pointer' }} onClick={() => { setActiveArtist(null); setSelected(null) }}>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', letterSpacing:'.03em' }}>Hourglass Gallery</div>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.12em', marginTop:1 }}>Victoria Island · Lagos</div>
          </div>
          <a href="/admin" style={{ fontSize:12, color:'var(--muted)', textDecoration:'none' }}>Staff login</a>
        </div>
      </header>

      <div style={{ flex:1, display:'flex', maxWidth:1440, margin:'0 auto', width:'100%' }}>

        {/* ── ARTIST INDEX (left rail) ── */}
        <aside style={{ width:280, flexShrink:0, borderRight:'1px solid var(--line)', background:'var(--white)', position:'sticky', top:68, height:'calc(100vh - 68px)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--line)' }}>
            <input
              style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--line)', borderRadius:3, fontSize:13, fontFamily:'var(--font-sans)', background:'var(--parchment)', color:'var(--ink)' }}
              placeholder="Search artists…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
            {grouped.map(([letter, group]) => (
              <div key={letter}>
                <div style={{ padding:'6px 20px 3px', fontSize:10, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em' }}>
                  {letter}
                </div>
                {group.map(a => {
                  const wc = artworks.filter(w => w.artist_id === a.id).length
                  const isActive = activeArtist?.id === a.id
                  return (
                    <div
                      key={a.id}
                      onClick={() => { setActiveArtist(a); setSelected(null); setMediumFilter(''); setAvailFilter(''); setLocationFilter(''); setGroupByLocation(false) }}
                      style={{ padding:'8px 20px', cursor:'pointer', borderLeft:`3px solid ${isActive ? 'var(--gold)' : 'transparent'}`, background: isActive ? 'var(--parchment)' : 'transparent', transition:'all 120ms' }}
                    >
                      <div style={{ fontSize:13, fontWeight: isActive ? 500 : 400, color:'var(--ink)' }}>{a.name}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>
                        {[a.nationality, wc ? `${wc} work${wc !== 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          <div style={{ padding:'12px 20px', borderTop:'1px solid var(--line)', fontSize:11, color:'var(--muted)' }}>
            {artists.length} artists
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex:1, minWidth:0, padding:'28px 32px' }}>
          {!activeArtist ? (
            // Landing — no artist selected
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
              <div style={{ textAlign:'center', maxWidth:480 }}>
                <div style={{ fontFamily:'var(--font-serif)', fontSize:'2rem', marginBottom:10, fontWeight:300 }}>
                  Contemporary African Art
                </div>
                <p style={{ fontSize:14, color:'var(--muted)', lineHeight:1.75 }}>
                  Select an artist from the index to explore their works in the gallery.
                </p>
                <div style={{ marginTop:28, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                  {artists.slice(0, 8).map(a => (
                    <button
                      key={a.id}
                      onClick={() => setActiveArtist(a)}
                      style={{ padding:'6px 14px', fontSize:12, border:'1px solid var(--line)', borderRadius:3, cursor:'pointer', background:'var(--white)', color:'var(--ink)', fontFamily:'var(--font-sans)' }}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Artist header */}
              <div style={{ marginBottom:24, paddingBottom:20, borderBottom:'1px solid var(--line)' }}>
                <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                  {activeArtist.portrait_url && (
                    <img
                      src={activeArtist.portrait_url}
                      alt={activeArtist.name}
                      style={{ width:64, height:64, borderRadius:'50%', objectFit:'cover', border:'1px solid var(--line)', flexShrink:0 }}
                    />
                  )}
                  <div style={{ flex:1 }}>
                    <h1 style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', fontWeight:400, marginBottom:4 }}>
                      {activeArtist.name}
                    </h1>
                    <div style={{ fontSize:13, color:'var(--muted)', marginBottom: activeArtist.bio ? 12 : 0 }}>
                      {[
                        activeArtist.nationality,
                        activeArtist.born && activeArtist.died ? `${activeArtist.born}–${activeArtist.died}` : activeArtist.born,
                        activeArtist.medium,
                      ].filter(Boolean).join(' · ')}
                    </div>
                    {activeArtist.bio && (
                      <p style={{ fontSize:13, color:'var(--ink-soft)', lineHeight:1.75, maxWidth:640 }}>
                        {activeArtist.bio.slice(0, 300)}{activeArtist.bio.length > 300 ? '…' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Filters row */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20, alignItems:'center' }}>
                <span style={{ fontSize:13, color:'var(--muted)', marginRight:4 }}>
                  {artistWorks.length} of {workCount} work{workCount !== 1 ? 's' : ''}
                </span>
                {mediums.length > 1 && (
                  <select
                    style={{ padding:'6px 10px', border:'1px solid var(--line)', borderRadius:3, fontSize:12, fontFamily:'var(--font-sans)', background:'var(--white)', color:'var(--ink)' }}
                    value={mediumFilter}
                    onChange={e => setMediumFilter(e.target.value)}
                  >
                    <option value="">All media</option>
                    {mediums.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                <select
                  style={{ padding:'6px 10px', border:'1px solid var(--line)', borderRadius:3, fontSize:12, fontFamily:'var(--font-sans)', background:'var(--white)', color:'var(--ink)' }}
                  value={availFilter}
                  onChange={e => setAvailFilter(e.target.value)}
                >
                  <option value="">All works</option>
                  <option value="Available">Available</option>
                  <option value="Sold">Sold</option>
                  <option value="NFS">NFS</option>
                </select>
                {locations.length > 1 && (
                  <select
                    style={{ padding:'6px 10px', border:'1px solid var(--line)', borderRadius:3, fontSize:12, fontFamily:'var(--font-sans)', background:'var(--white)', color:'var(--ink)' }}
                    value={locationFilter}
                    onChange={e => setLocationFilter(e.target.value)}
                  >
                    <option value="">All locations</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                )}
                {locations.length > 1 && (
                  <button
                    onClick={() => setGroupByLocation(g => !g)}
                    style={{ padding:'6px 12px', fontSize:12, border:'1px solid var(--line)', borderRadius:3, cursor:'pointer', background: groupByLocation ? 'var(--ink)' : 'var(--white)', color: groupByLocation ? 'var(--white)' : 'var(--ink)', fontFamily:'var(--font-sans)' }}
                  >
                    Group by location
                  </button>
                )}
                {(mediumFilter || availFilter || locationFilter) && (
                  <button
                    onClick={() => { setMediumFilter(''); setAvailFilter(''); setLocationFilter('') }}
                    style={{ padding:'6px 12px', fontSize:12, border:'none', borderRadius:3, cursor:'pointer', background:'transparent', color:'var(--muted)', fontFamily:'var(--font-sans)' }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Works grid */}
              {artistWorks.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
                  <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', marginBottom:6 }}>No works found</div>
                  <p style={{ fontSize:13 }}>Try adjusting your filters</p>
                </div>
              ) : (
                worksByLocation.map(([groupName, works]) => (
                  <div key={groupName} style={{ marginBottom: groupByLocation ? 40 : 0 }}>
                    {groupByLocation && (
                      <div style={{ marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--line)' }}>
                        <div style={{ fontSize:12, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>
                          📍 {groupName} · {works.length} work{works.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:16 }}>
                      {works.map(w => (
                        <ArtworkCard
                          key={w.id}
                          artwork={w}
                          onClick={() => setSelected(w)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </main>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ background:'var(--ink)', color:'rgba(255,255,255,.45)', padding:'28px 32px', textAlign:'center', fontSize:12 }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1rem', color:'rgba(255,255,255,.75)', marginBottom:5 }}>Hourglass Gallery</div>
        <div>298A Akin Olugbade Street, Victoria Island, Lagos</div>
      </footer>

      {/* ── ARTWORK DETAIL MODAL ── */}
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

function ArtworkCard({ artwork: w, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ cursor:'pointer', background:'var(--white)', border:'1px solid var(--line)', borderRadius:3, overflow:'hidden', transition:'box-shadow 150ms, transform 150ms' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ aspectRatio:'4/5', overflow:'hidden', background:'var(--parchment-2)', position:'relative' }}>
        <img
          src={w.image_url || PLACEHOLDER}
          alt={w.title}
          loading="lazy"
          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition: w.image_position || 'center', display:'block' }}
          onError={e => { e.target.src = PLACEHOLDER }}
        />
        {w.availability !== 'Available' && (
          <div style={{ position:'absolute', top:8, right:8, background: w.availability === 'Sold' ? 'rgba(139,26,26,.85)' : 'rgba(146,96,10,.85)', color:'#fff', fontSize:9, padding:'3px 8px', borderRadius:20, fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>
            {w.availability}
          </div>
        )}
      </div>
      <div style={{ padding:'10px 12px 12px' }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'0.95rem', lineHeight:1.25, marginBottom:3 }}>{w.title}</div>
        <div style={{ fontSize:11, color:'var(--muted)' }}>
          {[w.year, w.medium].filter(Boolean).join(' · ')}
        </div>
        {w.dimensions && <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{w.dimensions}</div>}
      </div>
    </div>
  )
}

function ArtworkDetail({ artwork: w, artist, onClose }) {
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(26,23,20,.6)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:'var(--white)', borderRadius:4, maxWidth:860, width:'100%', maxHeight:'90vh', display:'flex', overflow:'hidden', boxShadow:'0 8px 48px rgba(0,0,0,.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Image */}
        <div style={{ width:'45%', flexShrink:0, background:'var(--parchment-2)', position:'relative' }}>
          <img
            src={w.image_url || PLACEHOLDER}
            alt={w.title}
            style={{ width:'100%', height:'100%', objectFit:'contain', objectPosition: w.image_position || 'center', display:'block' }}
            onError={e => { e.target.src = PLACEHOLDER }}
          />
        </div>
        {/* Details */}
        <div style={{ flex:1, padding:'28px 28px 24px', overflowY:'auto', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', fontWeight:400, marginBottom:4, lineHeight:1.2 }}>{w.title}</div>
              {artist && <div style={{ fontSize:13, color:'var(--muted)' }}>{artist.name}</div>}
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:20, lineHeight:1, padding:4 }}>✕</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              ['Year', w.year],
              ['Medium', w.medium],
              ['Dimensions', w.dimensions],
              ['Series', w.series],
              ['Location', w.location],
              ['Status', w.availability],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:13, color: label === 'Status' ? (val === 'Available' ? 'var(--green)' : val === 'Sold' ? 'var(--red)' : 'var(--amber)') : 'var(--ink)', fontWeight: label === 'Status' ? 500 : 400 }}>{val}</div>
              </div>
            ))}
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
              <p style={{ fontSize:13, lineHeight:1.75, color:'var(--ink-soft)' }}>
                {artist.bio.slice(0, 350)}{artist.bio.length > 350 ? '…' : ''}
              </p>
            </div>
          )}

          {w.tags?.length > 0 && (
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {w.tags.map(t => (
                <span key={t} style={{ fontSize:11, padding:'3px 10px', background:'var(--parchment-2)', borderRadius:20, color:'var(--muted)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
