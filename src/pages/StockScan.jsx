import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { auditLog } from '../lib/audit'
import { cacheInvalidate } from '../lib/cache'
import { LOCATIONS, RESULT, ARTWORK_FIELDS, sizeText } from '../lib/stock'

// What a QR stock tag opens. Shows the work, lets staff tick it off in any
// stock take that is counting, and move it to a new location in one step.

export default function StockScan() {
  const { artworkId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [w, setW] = useState(null)
  const [artist, setArtist] = useState('')
  const [counts, setCounts] = useState([])     // counting stock takes
  const [items, setItems] = useState({})       // count_id → item for this work
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data: art, error } = await supabase.from('artworks').select(ARTWORK_FIELDS).eq('id', artworkId).maybeSingle()
    if (error || !art) { setErr(error?.message || 'This tag does not match a work in HG Cat.'); setLoading(false); return }
    setW(art)
    const [{ data: a }, { data: c }] = await Promise.all([
      art.artist_id ? supabase.from('artists').select('name').eq('id', art.artist_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('stock_counts').select('*').eq('status', 'counting').order('started_at', { ascending: false }),
    ])
    setArtist(a?.name || '')
    setCounts(c || [])
    if (c?.length) {
      const { data: its } = await supabase.from('stock_count_items').select('*').eq('artwork_id', artworkId).in('count_id', c.map(x => x.id))
      setItems(Object.fromEntries((its || []).map(i => [i.count_id, i])))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [artworkId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tick the work off in a count: Seen if it's on the list, otherwise add it
  // as found-but-not-listed at the given location.
  async function tick(count, location) {
    setBusy(true); setErr(''); setMsg('')
    const now = new Date().toISOString()
    const it = items[count.id]
    const loc = location || count.location || w.location
    let res
    if (it?.expected) {
      const same = !location || location === (it.expected_location || '')
      res = await supabase.from('stock_count_items').update({
        result: same ? 'seen' : 'elsewhere', found_location: same ? null : location,
        off_site_reason: null, checked_by: user?.id, checked_at: now,
      }).eq('id', it.id)
    } else if (it) {
      res = await supabase.from('stock_count_items').update({ found_location: loc, checked_by: user?.id, checked_at: now }).eq('id', it.id)
    } else {
      res = await supabase.from('stock_count_items').insert({
        count_id: count.id, artwork_id: w.id, expected: false, result: 'unrecorded', found_location: loc || null,
        expected_availability: w.availability, expected_location: w.location, checked_by: user?.id, checked_at: now,
      })
    }
    setBusy(false)
    if (res.error) { setErr(res.error.message); return }
    setMsg(`Recorded in stock take #${count.number}.`)
    load()
  }

  async function move() {
    if (!moveTo) return
    setBusy(true); setErr(''); setMsg('')
    const { error } = await supabase.from('artworks').update({ location: moveTo }).eq('id', w.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    cacheInvalidate('artworks')
    auditLog('artwork.updated', { entityType: 'artwork', entityId: w.id, entityLabel: w.title, metadata: { via: 'QR tag scan', change: `Location ${w.location || 'not set'} → ${moveTo}` } })
    setMsg(`Moved to ${moveTo}.`)
    setMoveTo('')
    load()
  }

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div>
  if (!w) return <div className="card" style={{ padding: 20, color: 'var(--red)' }}>{err}</div>

  const img = w.image_url || w.thumbnail_url
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        {img && <img src={img} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', background: 'var(--parchment)', marginBottom: 12 }} />}
        <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>{w.hg_code}</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>{w.title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{[artist, w.year, sizeText(w)].filter(Boolean).join(' · ')}</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>
          <strong>{w.availability}</strong>{w.loaned_to ? ` (on loan to ${w.loaned_to})` : ''} {'·'} Location: <strong>{w.location || 'not set'}</strong>
        </div>
        {w.availability === 'Sold' && <div style={{ fontSize: 13, color: 'var(--red)', marginTop: 6 }}>HG Cat shows this work as sold. If it is here, record it in a stock take so it gets checked.</div>}
      </div>

      {msg && <div style={{ color: 'var(--green)', fontSize: 13, marginBottom: 10 }}>{'✓'} {msg}</div>}
      {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{err}</div>}

      {counts.map(c => {
        const it = items[c.id]
        return (
          <div key={c.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Stock take #{c.number} {'—'} <strong>{c.title}</strong>
              {it && it.result !== 'pending' && <span className={`badge ${RESULT[it.result].badge}`} style={{ marginLeft: 6 }}>{RESULT[it.result].label}</span>}
              {!it && <div style={{ fontSize: 12, color: 'var(--amber)' }}>Not on this count's list {'—'} it will be added as found, not listed.</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => tick(c)}>
                {'✓'} {it?.expected ? `Seen${c.location ? ` in ${c.location}` : ''}` : `Found here${c.location ? ` (${c.location})` : ''}`}
              </button>
              <select className="form-select" style={{ maxWidth: 200 }} value="" disabled={busy} onChange={e => e.target.value && tick(c, e.target.value)}>
                <option value="">Seen somewhere else{'…'}</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/stock-take/${c.id}`)}>Open count</button>
            </div>
          </div>
        )
      })}

      <div className="card" style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Move this work</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select className="form-select" style={{ maxWidth: 220 }} value={moveTo} onChange={e => setMoveTo(e.target.value)}>
            <option value="">New location{'…'}</option>
            {LOCATIONS.filter(l => l !== w.location).map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className="btn btn-outline btn-sm" disabled={!moveTo || busy} onClick={move}>Move</button>
        </div>
      </div>

      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/artworks', { state: { editArtworkId: w.id } })}>Open full record in Artworks</button>
    </div>
  )
}
