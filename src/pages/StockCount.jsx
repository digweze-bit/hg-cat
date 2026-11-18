import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'
import { auditLog } from '../lib/audit'
import { cacheInvalidate } from '../lib/cache'
import {
  LOCATIONS, OFF_SITE_REASONS, RESULT, COUNT_STATUS, ARTWORK_FIELDS,
  isProblem, selectAll, sizeText, uploadStockPhoto, photoVariants,
} from '../lib/stock'

// One stock take. While counting, staff walk round with a phone and mark each
// expected work; afterwards every difference is resolved before closing.

const fmtWhen = t => t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const RESOLUTION = { updated: 'HG Cat updated', accepted: 'Left as is', created: 'Record created', no_change: 'No change needed' }

export default function StockCount() {
  const { countId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [count, setCount] = useState(null)
  const [items, setItems] = useState([])
  const [artists, setArtists] = useState({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('todo')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState({})          // itemId → true while saving
  const [picker, setPicker] = useState(null)    // { item, kind: 'elsewhere' | 'off_site' }
  const [noteFor, setNoteFor] = useState(null)  // { item, resolution, title, required }
  const [finding, setFinding] = useState(false)

  async function load() {
    try {
      const [c, list, a] = await Promise.all([
        supabase.from('stock_counts').select('*').eq('id', countId).single(),
        selectAll(() => supabase.from('stock_count_items').select(`*, artwork:artworks(${ARTWORK_FIELDS})`).eq('count_id', countId).order('created_at')),
        supabase.from('artists').select('id,name'),
      ])
      if (c.error) throw c.error
      setCount(c.data)
      setItems(list)
      setArtists(Object.fromEntries((a.data || []).map(x => [x.id, x.name])))
      if (c.data.status === 'review') setTab(t => t === 'todo' ? 'problems' : t)
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [countId]) // eslint-disable-line react-hooks/exhaustive-deps

  const artistName = id => artists[id] || ''
  const counting = count?.status === 'counting'
  const reviewing = count?.status === 'review'
  const open = counting || reviewing

  const stats = useMemo(() => {
    const s = { total: 0, checked: 0, problems: 0, unresolved: 0 }
    Object.keys(RESULT).forEach(k => { s[k] = 0 })
    items.forEach(i => {
      s[i.result]++
      if (i.expected) s.total++
      if (i.expected && i.result !== 'pending') s.checked++
      if (isProblem(i)) { s.problems++; if (!i.resolution) s.unresolved++ }
    })
    return s
  }, [items])

  const shown = useMemo(() => {
    let list = items
    if (tab === 'todo') list = list.filter(i => i.result === 'pending')
    else if (tab === 'checked') list = list.filter(i => i.result !== 'pending')
    else if (tab === 'problems') list = list.filter(isProblem)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(i => `${i.artwork?.title || ''} ${i.artwork?.hg_code || ''} ${artistName(i.artwork?.artist_id)} ${i.note || ''}`.toLowerCase().includes(s))
    }
    const key = i => `${artistName(i.artwork?.artist_id) || '~'}|${i.artwork?.title || i.note || ''}`
    return [...list].sort((a, b) =>
      (tab === 'problems' ? (!!a.resolution - !!b.resolution) : 0) || key(a).localeCompare(key(b)))
  }, [items, tab, q, artists]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patchItem(item, patch) {
    setBusy(b => ({ ...b, [item.id]: true })); setErr('')
    const { data, error } = await supabase.from('stock_count_items').update(patch).eq('id', item.id)
      .select(`*, artwork:artworks(${ARTWORK_FIELDS})`).single()
    setBusy(b => ({ ...b, [item.id]: false }))
    if (error) { setErr(error.message); return false }
    setItems(list => list.map(i => i.id === item.id ? data : i))
    return true
  }

  const mark = (item, result, extra = {}) => patchItem(item, {
    result, found_location: null, off_site_reason: null, ...extra,
    checked_by: result === 'pending' ? null : user?.id,
    checked_at: result === 'pending' ? null : new Date().toISOString(),
    resolution: null, resolution_note: null, resolved_by: null, resolved_at: null,
  })

  const resolve = (item, resolution, note) => patchItem(item, {
    resolution, resolution_note: note || null,
    resolved_by: resolution ? user?.id : null,
    resolved_at: resolution ? new Date().toISOString() : null,
  })

  async function addPhoto(item, file) {
    if (!file) return
    setBusy(b => ({ ...b, [item.id]: true }))
    try {
      const url = await uploadStockPhoto(file, countId)
      await patchItem(item, { photo_url: url })
    } catch (e) { setErr('Photo upload failed: ' + e.message) }
    setBusy(b => ({ ...b, [item.id]: false }))
  }

  async function updateArtwork(item, patch, label) {
    const w = item.artwork
    const { error } = await supabase.from('artworks').update(patch).eq('id', w.id)
    if (error) { setErr(error.message); return false }
    cacheInvalidate('artworks')
    auditLog('artwork.updated', { entityType: 'artwork', entityId: w.id, entityLabel: w.title, metadata: { via: `Stock take #${count.number}`, change: label } })
    return true
  }

  async function useAsImage(item) {
    if (await updateArtwork(item, photoVariants(item.photo_url), 'Stock-take photo set as artwork image')) load()
  }

  async function setLocation(item, loc) {
    if (await updateArtwork(item, { location: loc }, `Location → ${loc}`))
      await resolve(item, 'updated', `Location changed to ${loc}`)
  }

  // An unrecorded work becomes a hidden draft artwork so nothing found on the
  // walk-round is lost; staff complete the details from Artworks.
  async function createRecord(item) {
    setBusy(b => ({ ...b, [item.id]: true }))
    const { data: code, error: codeErr } = await supabase.rpc('next_hg_code')
    if (codeErr) { setErr(codeErr.message); setBusy(b => ({ ...b, [item.id]: false })); return }
    const row = {
      title: item.note?.trim() || 'Untitled (found in stock take)',
      artist_id: item.found_artist_id || count.artist_id || null,
      location: item.found_location || count.location || null,
      availability: 'Available', visible: false, hg_code: code,
      notes: `Found during stock take #${count.number} on ${fmtWhen(item.checked_at)}. Details to complete.`,
      ...(item.photo_url ? photoVariants(item.photo_url) : {}),
    }
    const { data, error } = await supabase.from('artworks').insert(row).select('id,title').single()
    setBusy(b => ({ ...b, [item.id]: false }))
    if (error) { setErr(error.message); return }
    cacheInvalidate('artworks')
    auditLog('artwork.created', { entityType: 'artwork', entityId: data.id, entityLabel: data.title, metadata: { via: `Stock take #${count.number}` } })
    await patchItem(item, { artwork_id: data.id, resolution: 'created', resolution_note: `New record ${code} (hidden until completed)`, resolved_by: user?.id, resolved_at: new Date().toISOString() })
  }

  async function finishCounting() {
    const left = items.filter(i => i.result === 'pending').length
    if (left && !confirm(`${left} work${left === 1 ? ' has' : 's have'} not been checked. They will be marked Not found. Finish counting?`)) return
    const now = new Date().toISOString()
    if (left) {
      const { error } = await supabase.from('stock_count_items').update({ result: 'not_found', checked_at: now, checked_by: user?.id })
        .eq('count_id', countId).eq('result', 'pending')
      if (error) { setErr(error.message); return }
    }
    const { error } = await supabase.from('stock_counts').update({ status: 'review', finished_at: now }).eq('id', countId)
    if (error) { setErr(error.message); return }
    setTab('problems'); load()
  }

  async function setStatus(status, msg) {
    if (msg && !confirm(msg)) return
    const patch = { status }
    if (status === 'closed' || status === 'cancelled') Object.assign(patch, { closed_at: new Date().toISOString(), closed_by: user?.id })
    if (status === 'counting') Object.assign(patch, { finished_at: null })
    const { error } = await supabase.from('stock_counts').update(patch).eq('id', countId)
    if (error) { setErr(error.message); return }
    load()
  }

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading stock take{'…'}</div>
  if (!count) return <div style={{ color: 'var(--red)' }}>{err || 'Stock take not found'}</div>

  const pct = stats.total ? Math.round(stats.checked / stats.total * 100) : 100
  const TABS = counting
    ? [['todo', 'To check', stats.pending], ['checked', 'Checked', stats.checked + stats.unrecorded], ['problems', 'Differences', stats.problems], ['all', 'All', null]]
    : [['problems', 'Differences', stats.problems], ['checked', 'All checked', null]]

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8, paddingLeft: 0 }} onClick={() => navigate('/admin/stock-take')}>{'←'} All stock takes</button>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">{count.title}</div>
          <div className="page-subtitle">
            #{count.number} {'·'} {count.scope === 'artist' ? 'By artist' : count.scope === 'location' ? 'By location' : 'Whole gallery'} {'·'} started {fmtWhen(count.started_at)}
            {' '}<span className={`badge ${COUNT_STATUS[count.status].badge}`}>{COUNT_STATUS[count.status].label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {counting && <button className="btn btn-outline" onClick={() => setFinding(true)}>+ Found a work not listed</button>}
          {counting && <button className="btn btn-primary" onClick={finishCounting}>Finish counting</button>}
          {reviewing && <button className="btn btn-outline" onClick={() => setStatus('counting', 'Go back to counting? Differences already resolved stay resolved.')}>Back to counting</button>}
          {reviewing && <button className="btn btn-primary" disabled={stats.unresolved > 0} title={stats.unresolved ? 'Resolve every difference first' : ''}
            onClick={() => setStatus('closed', 'Close this stock take? It will be kept on record and can no longer be changed.')}>Close stock take</button>}
          {!open && <button className="btn btn-outline" onClick={() => printReport(count, items, artistName, stats)}>Print report</button>}
          {open && <button className="btn btn-ghost" onClick={() => printReport(count, items, artistName, stats)}>Print</button>}
        </div>
      </div>

      {/* Progress */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span><strong>{stats.checked}</strong> of {stats.total} expected works checked</span>
          <span style={{ color: 'var(--muted)' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--parchment-2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          <span>Seen {stats.seen}</span>
          <span>Elsewhere {stats.elsewhere}</span>
          <span>Off site {stats.off_site}</span>
          <span style={{ color: stats.not_found ? 'var(--red)' : undefined }}>Not found {stats.not_found}</span>
          <span>Found, not listed {stats.unrecorded}</span>
          {!counting && <span style={{ color: stats.unresolved ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>
            {stats.unresolved ? `${stats.unresolved} difference${stats.unresolved === 1 ? '' : 's'} to resolve` : 'All differences resolved'}
          </span>}
        </div>
        {count.notes && <div style={{ fontSize: 12, marginTop: 8 }}>{count.notes}</div>}
      </div>

      {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {TABS.map(([k, label, n]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(k)}>
            {label}{n != null ? ` (${n})` : ''}
          </button>
        ))}
      </div>
      <input className="form-input" style={{ maxWidth: 320, marginBottom: 14 }} placeholder="Search title, HG code or artist" value={q} onChange={e => setQ(e.target.value)} />

      {shown.length === 0 ? (
        <div className="card" style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {tab === 'todo' ? 'Everything on the list has been checked.' : tab === 'problems' ? 'No differences.' : 'Nothing here.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(item => (
            <ItemCard key={item.id} item={item} count={count} artistName={artistName} busy={!!busy[item.id]}
              counting={counting} reviewing={reviewing}
              onMark={(r, extra) => mark(item, r, extra)}
              onPick={kind => setPicker({ item, kind })}
              onPhoto={f => addPhoto(item, f)}
              onUseImage={() => useAsImage(item)}
              onSetLocation={loc => setLocation(item, loc)}
              onCreate={() => createRecord(item)}
              onOpen={() => navigate('/admin/artworks', { state: { editArtworkId: item.artwork.id, returnTo: `/admin/stock-take/${countId}` } })}
              onResolve={(resolution, title, required) => setNoteFor({ item, resolution, title, required })}
              onUnresolve={() => resolve(item, null)} />
          ))}
        </div>
      )}

      {picker && (
        <PickerModal kind={picker.kind} item={picker.item} onClose={() => setPicker(null)}
          onSave={async patch => { if (await mark(picker.item, picker.kind, patch)) setPicker(null) }} />
      )}

      {noteFor && (
        <NoteModal title={noteFor.title} required={noteFor.required} onClose={() => setNoteFor(null)}
          onSave={async note => { if (await resolve(noteFor.item, noteFor.resolution, note)) setNoteFor(null) }} />
      )}

      {finding && (
        <FoundModal count={count} items={items} artists={artists} uid={user?.id}
          onClose={() => setFinding(false)}
          onDone={() => { setFinding(false); load() }} />
      )}
    </div>
  )
}

function ItemCard({ item, count, artistName, busy, counting, reviewing, onMark, onPick, onPhoto, onUseImage, onSetLocation, onCreate, onOpen, onResolve, onUnresolve }) {
  const fileRef = useRef(null)
  const w = item.artwork
  const img = item.photo_url || w?.thumbnail_url || w?.image_url
  const problem = isProblem(item)
  const r = RESULT[item.result]
  const where = item.expected_location || w?.location

  return (
    <div className="card" style={{ padding: 12, opacity: busy ? .6 : 1, borderLeft: `3px solid ${problem && !item.resolution ? 'var(--amber)' : 'transparent'}` }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 72, height: 72, flexShrink: 0, background: 'var(--parchment-2)', borderRadius: 2, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>
          {img ? <img src={img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'No image'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500 }}>{w?.title || item.note || 'Unrecorded work'}</span>
            {w?.hg_code && <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>{w.hg_code}</span>}
            {item.result !== 'pending' && <span className={`badge ${r.badge}`}>{r.label}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {[artistName(w?.artist_id || item.found_artist_id), w?.year, sizeText(w)].filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {item.expected
              ? <>HG Cat location: <strong>{where || 'not set'}</strong></>
              : w ? <>HG Cat says: <strong>{w.availability}</strong>{w.location ? `, ${w.location}` : ''}</> : <span style={{ color: 'var(--amber)' }}>Not in HG Cat</span>}
            {item.expected_availability === 'Reserved' && <span style={{ color: 'var(--blue)' }}> {'·'} on loan{w?.loaned_to ? ` to ${w.loaned_to}` : ''}</span>}
            {item.expected_availability === 'NFS' && <span style={{ color: 'var(--muted)' }}> {'·'} NFS</span>}
          </div>
          {item.result === 'elsewhere' && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2 }}>Found at: <strong>{item.found_location}</strong></div>}
          {item.result === 'unrecorded' && item.found_location && <div style={{ fontSize: 12, marginTop: 2 }}>Found at: <strong>{item.found_location}</strong></div>}
          {item.result === 'off_site' && <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 2 }}>Off site: <strong>{item.off_site_reason}</strong></div>}
          {item.note && w && <div style={{ fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>{item.note}</div>}
          {item.resolution && (
            <div style={{ fontSize: 12, marginTop: 4, color: 'var(--green)' }}>
              {'✓'} {RESOLUTION[item.resolution]}{item.resolution_note ? ` — ${item.resolution_note}` : ''}
              {reviewing && item.resolution !== 'created' && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6, padding: '0 6px' }} onClick={onUnresolve}>Undo</button>}
            </div>
          )}
        </div>
      </div>

      {/* Counting: one tap per work */}
      {counting && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {item.expected && <>
            <button disabled={busy} className={`btn btn-sm ${item.result === 'seen' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onMark('seen')}>{'✓'} Seen{count.scope === 'location' ? ' here' : ''}</button>
            <button disabled={busy} className={`btn btn-sm ${item.result === 'elsewhere' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPick('elsewhere')}>Elsewhere</button>
            <button disabled={busy} className={`btn btn-sm ${item.result === 'off_site' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onPick('off_site')}>Off site</button>
            <button disabled={busy} className={`btn btn-sm ${item.result === 'not_found' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onMark('not_found')}>Not found</button>
          </>}
          <button disabled={busy} className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()}>{item.photo_url ? 'Retake photo' : 'Photo'}</button>
          {item.result !== 'pending' && item.expected && <button disabled={busy} className="btn btn-sm btn-ghost" onClick={() => onMark('pending')}>Undo</button>}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { onPhoto(e.target.files[0]); e.target.value = '' }} />
        </div>
      )}

      {/* Review: resolve each difference */}
      {reviewing && problem && !item.resolution && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {item.result === 'elsewhere' && w && <button disabled={busy} className="btn btn-sm btn-primary" onClick={() => onSetLocation(item.found_location)}>Update location to {item.found_location}</button>}
          {item.result === 'off_site' && w && <button disabled={busy} className="btn btn-sm btn-primary" onClick={() => onSetLocation(item.off_site_reason)}>Set location to {item.off_site_reason}</button>}
          {item.result === 'not_found' && <button disabled={busy} className="btn btn-sm btn-outline" onClick={() => onMark('seen')}>Found it after all</button>}
          {item.result === 'unrecorded' && !w && <button disabled={busy} className="btn btn-sm btn-primary" onClick={onCreate}>Create HG Cat record</button>}
          {w && <button disabled={busy} className="btn btn-sm btn-outline" onClick={onOpen}>Open in Artworks</button>}
          {w && <button disabled={busy} className="btn btn-sm btn-outline" onClick={() => onResolve('updated', 'What did you change in HG Cat?', false)}>Fixed in HG Cat</button>}
          <button disabled={busy} className="btn btn-sm btn-ghost" onClick={() => onResolve('accepted', 'Why leave this as it is?', true)}>Leave as is</button>
        </div>
      )}

      {reviewing && item.photo_url && w && !w.image_url && (
        <button disabled={busy} className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={onUseImage}>Use photo as the artwork's image</button>
      )}
      {counting && item.photo_url && w && !w.image_url && (
        <button disabled={busy} className="btn btn-sm btn-ghost" style={{ marginTop: 6 }} onClick={onUseImage}>This work has no image {'—'} use this photo</button>
      )}
    </div>
  )
}

function LocationSelect({ value, onChange }) {
  const custom = value && !LOCATIONS.includes(value)
  const [other, setOther] = useState(custom)
  return (
    <>
      <select className="form-select" value={other ? '__other' : value} onChange={e => {
        if (e.target.value === '__other') { setOther(true); onChange('') } else { setOther(false); onChange(e.target.value) }
      }}>
        <option value="">Choose{'…'}</option>
        {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
        <option value="__other">Somewhere else{'…'}</option>
      </select>
      {other && <input className="form-input" style={{ marginTop: 6 }} autoFocus placeholder="Where?" value={value} onChange={e => onChange(e.target.value)} />}
    </>
  )
}

function PickerModal({ kind, item, onClose, onSave }) {
  const [loc, setLoc] = useState(item.found_location || '')
  const [reason, setReason] = useState(item.off_site_reason || (item.expected_availability === 'Reserved' ? 'On loan' : ''))
  const [note, setNote] = useState(item.note || '')
  const ok = kind === 'elsewhere' ? loc.trim() : reason
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{kind === 'elsewhere' ? 'Where is it?' : 'Why is it off site?'}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13 }}>{item.artwork?.title}</div>
          {kind === 'elsewhere' ? (
            <div className="form-group"><label className="form-label">Found at</label><LocationSelect value={loc} onChange={setLoc} /></div>
          ) : (
            <div className="form-group">
              <label className="form-label">Reason</label>
              <select className="form-select" value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">Choose{'…'}</option>
                {OFF_SITE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'off_site' ? 'e.g. collected by framer 12 Nov' : ''} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!ok} onClick={() => onSave(kind === 'elsewhere'
            ? { found_location: loc.trim(), note: note.trim() || null }
            : { off_site_reason: reason, note: note.trim() || null })}>Save</button>
        </div>
      </div>
    </div>
  )
}

function NoteModal({ title, required, onClose, onSave }) {
  const [note, setNote] = useState('')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
        </div>
        <div className="modal-body">
          <textarea className="form-textarea" autoFocus value={note} onChange={e => setNote(e.target.value)}
            placeholder={required ? 'Required — this is kept with the stock take record' : 'Optional'} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={required && !note.trim()} onClick={() => onSave(note.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}

// A work found on site that isn't on the list: either it is in HG Cat under a
// different artist/location/status, or it has no record at all.
function FoundModal({ count, items, artists, uid, onClose, onDone }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)       // artwork row, or 'none'
  const [desc, setDesc] = useState('')
  const [artistId, setArtistId] = useState(count.artist_id || '')
  const [loc, setLoc] = useState(count.location || '')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const like = `%${s.replace(/[%,()]/g, ' ')}%`
      const { data } = await supabase.from('artworks').select(ARTWORK_FIELDS).or(`title.ilike.${like},hg_code.ilike.${like}`).limit(15)
      setResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const onList = id => items.find(i => i.artwork_id === id)

  async function save() {
    setSaving(true); setErr('')
    try {
      const existing = picked && picked !== 'none' ? onList(picked.id) : null
      if (existing && !existing.expected) throw new Error('This work has already been added to this stock take')
      const photo_url = file ? await uploadStockPhoto(file, count.id) : undefined
      const now = new Date().toISOString()
      let res
      if (existing) {
        // Already on the list — just mark it seen where it was found.
        const same = !loc.trim() || loc.trim() === (existing.expected_location || '')
        res = await supabase.from('stock_count_items').update({
          result: same ? 'seen' : 'elsewhere', found_location: same ? null : loc.trim(),
          checked_by: uid, checked_at: now, ...(photo_url ? { photo_url } : {}),
        }).eq('id', existing.id)
      } else {
        res = await supabase.from('stock_count_items').insert({
          count_id: count.id, artwork_id: picked === 'none' ? null : picked.id, expected: false, result: 'unrecorded',
          found_location: loc.trim() || null, note: picked === 'none' ? desc.trim() : (desc.trim() || null),
          photo_url: photo_url || null, checked_by: uid, checked_at: now,
          found_artist_id: picked === 'none' ? (artistId || null) : null,
          expected_availability: picked === 'none' ? null : picked.availability,
          expected_location: picked === 'none' ? null : picked.location,
        })
      }
      if (res.error) throw res.error
      onDone()
    } catch (e) { setErr(e.message); setSaving(false) }
  }

  const canSave = picked && (picked !== 'none' || desc.trim()) && !saving

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Found a work not on the list</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!picked && <>
            <div className="form-group">
              <label className="form-label">Is it in HG Cat? Search by title or HG code</label>
              <input className="form-input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. HG/2310 or Market Women" />
            </div>
            {results.map(w => (
              <div key={w.id} className="card card-hover" style={{ padding: 8, display: 'flex', gap: 10, cursor: 'pointer' }} onClick={() => setPicked(w)}>
                <div style={{ width: 44, height: 44, background: 'var(--parchment-2)', flexShrink: 0 }}>
                  {(w.thumbnail_url || w.image_url) && <img src={w.thumbnail_url || w.image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover' }} />}
                </div>
                <div style={{ fontSize: 12, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{w.title} <span style={{ color: 'var(--gold)' }}>{w.hg_code}</span></div>
                  <div style={{ color: 'var(--muted)' }}>{artists[w.artist_id]} {'·'} {w.availability}{w.location ? ` · ${w.location}` : ''}</div>
                  {onList(w.id) && <div style={{ color: 'var(--blue)' }}>Already on this list {'—'} will be marked seen</div>}
                </div>
              </div>
            ))}
            <button className="btn btn-outline" onClick={() => setPicked('none')}>It's not in HG Cat</button>
          </>}

          {picked && <>
            <div style={{ fontSize: 13 }}>
              {picked === 'none'
                ? <strong>New work, not in HG Cat</strong>
                : <><strong>{picked.title}</strong> {picked.hg_code} {'·'} HG Cat says {picked.availability}{picked.location ? `, ${picked.location}` : ''}</>}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => setPicked(null)}>Change</button>
            </div>
            {picked === 'none' && <>
              <div className="form-group">
                <label className="form-label">Describe it</label>
                <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Title if known, or e.g. blue abstract, 36 × 48 in, signed bottom right" />
              </div>
              <div className="form-group">
                <label className="form-label">Artist</label>
                <select className="form-select" value={artistId} onChange={e => setArtistId(e.target.value)}>
                  <option value="">Unknown</option>
                  {Object.entries(artists).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </div>
            </>}
            {picked !== 'none' && (
              <div className="form-group">
                <label className="form-label">Note (optional)</label>
                <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
              </div>
            )}
            <div className="form-group"><label className="form-label">Where is it?</label><LocationSelect value={loc} onChange={setLoc} /></div>
            <div className="form-group">
              <label className="form-label">Photo</label>
              <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files[0] || null)} />
            </div>
          </>}
          {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={save}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function printReport(count, items, artistName, stats) {
  const fmt = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const rows = items.filter(isProblem).map(i => {
    const w = i.artwork
    const what = i.result === 'elsewhere' ? `Found at ${i.found_location} (HG Cat: ${i.expected_location || 'not set'})`
      : i.result === 'off_site' ? `Off site: ${i.off_site_reason}`
      : i.result === 'not_found' ? 'Not found'
      : w ? `Found at ${i.found_location || '—'}; HG Cat says ${i.expected_availability || ''}` : 'Not in HG Cat'
    return `<tr><td>${esc(w?.hg_code || '')}</td><td>${esc(w?.title || i.note || '')}</td><td>${esc(artistName(w?.artist_id))}</td>
      <td>${esc(what)}${i.note && w ? `<br><em>${esc(i.note)}</em>` : ''}</td>
      <td>${i.resolution ? esc(RESOLUTION[i.resolution] + (i.resolution_note ? ' — ' + i.resolution_note : '')) : '<strong>Open</strong>'}</td></tr>`
  }).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock take #${count.number}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,"Segoe UI",sans-serif;color:#1a1714;padding:32px 40px;font-size:12px}
h1{font-family:Georgia,serif;font-weight:400;font-size:22px;margin:6px 0}.meta{color:#888;font-size:11px}
.stats{display:flex;gap:18px;margin:16px 0;padding:10px 0;border-top:1px solid #ddd;border-bottom:1px solid #ddd}
table{width:100%;border-collapse:collapse;margin-top:10px}th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:2px solid #1a1714;padding:6px 8px}
td{padding:6px 8px;border-bottom:1px solid #ece8e1;vertical-align:top}</style></head><body>
<div style="font-family:Georgia,serif;font-size:16px">Hourglass Gallery</div>
<h1>Stock take #${count.number} — ${esc(count.title)}</h1>
<div class="meta">Started ${fmt(count.started_at)}${count.closed_at ? ` · Closed ${fmt(count.closed_at)}` : ` · ${COUNT_STATUS[count.status].label}`}</div>
<div class="stats"><span><strong>${stats.total}</strong> expected</span><span><strong>${stats.seen}</strong> seen</span><span><strong>${stats.elsewhere}</strong> elsewhere</span>
<span><strong>${stats.off_site}</strong> off site</span><span><strong>${stats.not_found}</strong> not found</span><span><strong>${stats.unrecorded}</strong> found, not listed</span></div>
<h3 style="font-size:13px">Differences (${stats.problems})</h3>
${rows ? `<table><thead><tr><th>HG code</th><th>Work</th><th>Artist</th><th>Finding</th><th>Resolution</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="margin-top:8px">None — every work was where HG Cat said.</p>'}
</body></html>`
  const win = window.open('', '_blank', 'width=1000,height=750')
  if (!win) return alert('Allow pop-ups to print')
  win.document.write(html); win.document.close()
  setTimeout(() => win.print(), 400)
}
