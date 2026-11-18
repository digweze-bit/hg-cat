import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { LOCATIONS, LEGACY_LOCATIONS, COUNT_STATUS, ARTWORK_FIELDS, selectAll, sizeText, printTags, openPrintWindow } from '../lib/stock'

// Stock take section: every count ever run (with its differences and how they
// were resolved), starting a new count, and printing QR stock tags.

const fmtDate = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function StockTake() {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('stocktake-tab') || 'counts' } catch { return 'counts' } })
  const [artists, setArtists] = useState([])
  useEffect(() => { supabase.from('artists').select('id,name').order('name').then(({ data }) => setArtists(data || [])) }, [])
  useEffect(() => { try { sessionStorage.setItem('stocktake-tab', tab) } catch { /* private mode */ } }, [tab])

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Stock take</div>
        <div className="page-subtitle">Check what is physically here against HG Cat, resolve the differences, keep the record.</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'counts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('counts')}>Stock takes</button>
        <button className={`btn btn-sm ${tab === 'tags' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('tags')}>QR tags</button>
      </div>
      {tab === 'counts' ? <Counts artists={artists} /> : <Tags artists={artists} />}
    </div>
  )
}

function Counts({ artists }) {
  const navigate = useNavigate()
  const [counts, setCounts] = useState([])
  const [tallies, setTallies] = useState({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stock_counts').select('*').order('started_at', { ascending: false })
      setCounts(data || [])
      // Progress for counts still open.
      const openIds = (data || []).filter(c => c.status === 'counting' || c.status === 'review').map(c => c.id)
      if (openIds.length) {
        const rows = await selectAll(() => supabase.from('stock_count_items').select('count_id,expected,result,resolution').in('count_id', openIds))
        const t = {}
        rows.forEach(r => {
          const x = t[r.count_id] ||= { total: 0, checked: 0, diffs: 0 }
          if (r.expected) { x.total++; if (r.result !== 'pending') x.checked++ }
          if (['elsewhere', 'not_found', 'unrecorded', 'off_site'].includes(r.result) && !r.resolution) x.diffs++
        })
        setTallies(t)
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div>
  const active = counts.filter(c => c.status === 'counting' || c.status === 'review')
  const past = counts.filter(c => c.status === 'closed' || c.status === 'cancelled')

  const row = c => {
    const t = tallies[c.id]
    return (
      <div key={c.id} className="card card-hover" style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => navigate(`/admin/stock-take/${c.id}`)}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>#{c.number}</span>
          <span style={{ fontWeight: 500, flex: '1 1 200px' }}>{c.title}</span>
          <span className={`badge ${COUNT_STATUS[c.status].badge}`}>{COUNT_STATUS[c.status].label}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          <span>{c.scope === 'artist' ? 'By artist' : c.scope === 'location' ? 'By location' : 'Whole gallery'}</span>
          <span>Started {fmtDate(c.started_at)}</span>
          {c.closed_at && <span>{c.status === 'closed' ? 'Closed' : 'Cancelled'} {fmtDate(c.closed_at)}</span>}
          {t && <span>{t.checked} of {t.total} checked</span>}
          {t && c.status === 'review' && <span style={{ color: t.diffs ? 'var(--amber)' : 'var(--green)' }}>{t.diffs} open differences</span>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setStarting(true)}>+ New stock take</button>
      </div>
      <div className="sidebar-section" style={{ color: 'var(--muted)', padding: '0 0 8px' }}>In progress</div>
      {active.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>{active.map(row)}</div>
        : <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>No stock take in progress.</div>}
      <div className="sidebar-section" style={{ color: 'var(--muted)', padding: '0 0 8px' }}>History</div>
      {past.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{past.map(row)}</div>
        : <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Closed stock takes are kept here.</div>}
      {starting && <StartModal artists={artists} onClose={() => setStarting(false)} onStarted={id => navigate(`/admin/stock-take/${id}`)} />}
    </>
  )
}

function StartModal({ artists, onClose, onStarted }) {
  const [scope, setScope] = useState('artist')
  const [artistId, setArtistId] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // How many works the count will list.
  useEffect(() => {
    setPreview(null)
    if ((scope === 'artist' && !artistId) || (scope === 'location' && !location)) return
    let q = supabase.from('artworks').select('id', { count: 'exact', head: true }).in('availability', ['Available', 'Reserved', 'NFS'])
    if (scope === 'artist') q = q.eq('artist_id', artistId)
    if (scope === 'location') q = q.ilike('location', location)
    q.then(({ count }) => setPreview(count ?? 0))
  }, [scope, artistId, location])

  async function start() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('stock_count_start', {
      p_scope: scope, p_artist: scope === 'artist' ? artistId : null, p_location: scope === 'location' ? location : null, p_notes: notes,
    })
    if (error) { setErr(error.message); setBusy(false); return }
    onStarted(data.id)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">New stock take</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Count</label>
            <select className="form-select" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="artist">One artist's works</option>
              <option value="location">Everything in one location</option>
              <option value="all">The whole gallery</option>
            </select>
          </div>
          {scope === 'artist' && (
            <div className="form-group">
              <label className="form-label">Artist</label>
              <select className="form-select" value={artistId} onChange={e => setArtistId(e.target.value)}>
                <option value="">Choose{'…'}</option>
                {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          {scope === 'location' && (
            <div className="form-group">
              <label className="form-label">Location</label>
              <select className="form-select" value={location} onChange={e => setLocation(e.target.value)}>
                <option value="">Choose{'…'}</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                {LEGACY_LOCATIONS.map(l => <option key={l} value={l}>{l} (old label, not yet sorted)</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Year-end count, done by Chidalu" />
          </div>
          {preview != null && (
            <div style={{ fontSize: 13, background: 'var(--parchment)', padding: '10px 12px', borderRadius: 3 }}>
              HG Cat lists <strong>{preview}</strong> work{preview === 1 ? '' : 's'} in stock (Available, on loan or NFS) to check.
              {scope === 'all' && ' A whole-gallery count is long — counting one location or artist at a time is easier.'}
            </div>
          )}
          {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || (scope === 'artist' && !artistId) || (scope === 'location' && !location)} onClick={start}>
            {busy ? 'Starting…' : 'Start counting'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── QR TAGS ──────────────────────────────────────────────────
function Tags({ artists }) {
  const [artistId, setArtistId] = useState('')
  const [location, setLocation] = useState('')
  const [onlyUntagged, setOnlyUntagged] = useState(true)
  const [works, setWorks] = useState([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [giveCodes, setGiveCodes] = useState(true)
  const [skip, setSkip] = useState(0)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const artistName = useMemo(() => { const m = Object.fromEntries(artists.map(a => [a.id, a.name])); return id => m[id] || '' }, [artists])

  useEffect(() => {
    if (!artistId && !location) { setWorks([]); return }
    setLoading(true)
    selectAll(() => {
      let q = supabase.from('artworks').select(ARTWORK_FIELDS).in('availability', ['Available', 'Reserved', 'NFS']).order('title')
      if (artistId) q = q.eq('artist_id', artistId)
      if (location) q = q.ilike('location', location)
      return q
    }).then(rows => {
      setWorks(rows); setPicked(new Set(rows.filter(w => !w.tag_printed_at).map(w => w.id))); setLoading(false)
    }).catch(e => { setErr(e.message); setLoading(false) })
  }, [artistId, location])

  const shown = onlyUntagged ? works.filter(w => !w.tag_printed_at) : works
  const chosen = works.filter(w => picked.has(w.id))
  const needCodes = chosen.filter(w => !w.hg_code).length
  const toggle = id => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function print() {
    setErr('')
    const win = openPrintWindow()
    try {
      if (!win) throw new Error('Allow pop-ups for HG Cat to print tags')
      let list = chosen
      if (giveCodes && needCodes) {
        list = []
        for (const [i, w] of chosen.entries()) {
          if (w.hg_code) { list.push(w); continue }
          setBusy(`Giving HG codes ${i + 1}/${chosen.length}…`)
          const { data: code, error } = await supabase.rpc('next_hg_code')
          if (error) throw error
          const { error: e2 } = await supabase.from('artworks').update({ hg_code: code }).eq('id', w.id)
          if (e2) throw e2
          list.push({ ...w, hg_code: code })
        }
        cacheInvalidate('artworks')
      }
      setBusy('Preparing tags…')
      await printTags(win, list, artistName, { skip: Number(skip) || 0 })
      const now = new Date().toISOString()
      const ids = list.map(w => w.id)
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from('artworks').update({ tag_printed_at: now }).in('id', ids.slice(i, i + 200))
        if (error) throw error
      }
      const byId = Object.fromEntries(list.map(w => [w.id, w]))
      setWorks(ws => ws.map(w => byId[w.id] ? { ...byId[w.id], tag_printed_at: now } : w))
      setPicked(new Set())
    } catch (e) { setErr(e.message); if (win && !win.closed) win.close() }
    setBusy('')
  }

  return (
    <>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, fontSize: 13, lineHeight: 1.6 }}>
        Print a small QR tag for the back of each work (A4 sheets of 24 labels, 63.5 {'×'} 33.9 mm {'—'} Avery L7159 or similar).
        Scanning a tag with any phone camera opens the work in HG Cat, where it can be ticked off in a stock take or moved to a new location.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="form-select" style={{ maxWidth: 260 }} value={artistId} onChange={e => setArtistId(e.target.value)}>
          <option value="">Any artist</option>
          {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 200 }} value={location} onChange={e => setLocation(e.target.value)}>
          <option value="">Any location</option>
          {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          {LEGACY_LOCATIONS.map(l => <option key={l} value={l}>{l} (old label, not yet sorted)</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={onlyUntagged} onChange={e => setOnlyUntagged(e.target.checked)} /> Only works without a tag
        </label>
      </div>

      {!artistId && !location ? (
        <div className="card" style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Choose an artist or a location to list works in stock.</div>
      ) : loading ? <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div> : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
            <span><strong>{chosen.length}</strong> selected of {works.length} in stock</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set(shown.map(w => w.id)))}>Select all shown</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
          <div className="card" style={{ maxHeight: 420, overflowY: 'auto', marginBottom: 14 }}>
            {shown.length === 0 && <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Every work here already has a tag.</div>}
            {shown.map(w => (
              <label key={w.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.has(w.id)} onChange={() => toggle(w.id)} />
                <div style={{ width: 36, height: 36, background: 'var(--parchment-2)', flexShrink: 0 }}>
                  {(w.thumbnail_url || w.image_url) && <img src={w.thumbnail_url || w.image_url} alt="" loading="lazy" style={{ width: 36, height: 36, objectFit: 'cover' }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1, fontSize: 13 }}>
                  <div>{w.title} <span style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 600 }}>{w.hg_code || 'no HG code'}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {[artistName(w.artist_id), w.year, sizeText(w), w.location].filter(Boolean).join(' · ')}
                    {w.tag_printed_at && ` · tag printed ${fmtDate(w.tag_printed_at)}`}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            {needCodes > 0 && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={giveCodes} onChange={e => setGiveCodes(e.target.checked)} />
                Give the {needCodes} work{needCodes === 1 ? '' : 's'} without an HG code a new code
              </label>
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              Skip <input className="form-input" type="number" min="0" max="23" style={{ width: 64 }} value={skip} onChange={e => setSkip(e.target.value)} /> used labels on the first sheet
            </label>
            <button className="btn btn-primary" disabled={!chosen.length || !!busy} onClick={print}>{busy || `Print ${chosen.length} tag${chosen.length === 1 ? '' : 's'}`}</button>
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{err}</div>}
        </>
      )}
    </>
  )
}
