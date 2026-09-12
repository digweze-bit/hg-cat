import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { auditLog } from '../lib/audit'
import TagInput, { MEDIA_TAG_SUGGESTIONS } from '../components/TagInput'

// The two houses. Everything stored here is filed under one of them.
const BRANDS = [
  { id:'picturebox', label:'Hourglass Picturebox', accent:'#1a3a5c' },
  { id:'adire',      label:'Yellow Adire',         accent:'#b8883a' },
]
const brandOf = id => BRANDS.find(b => b.id === id) || BRANDS[0]

// Soft caption limits, so a post that runs long for its channel says so
// before anyone tries to upload it.
const CHANNELS = [
  { id:'instagram', label:'Instagram', glyph:'◉', limit:2200  },
  { id:'facebook',  label:'Facebook',  glyph:'◐', limit:63206 },
  { id:'x',         label:'X',         glyph:'✕', limit:280   },
  { id:'tiktok',    label:'TikTok',    glyph:'♪', limit:2200  },
  { id:'linkedin',  label:'LinkedIn',  glyph:'▣', limit:3000  },
  { id:'whatsapp',  label:'WhatsApp',  glyph:'◑', limit:1024  },
]
const channelOf = id => CHANNELS.find(c => c.id === id)

const STATUSES = [
  { id:'idea',      label:'Idea',      badge:'badge-gray'  },
  { id:'draft',     label:'Draft',     badge:'badge-gray'  },
  { id:'ready',     label:'Ready',     badge:'badge-blue'  },
  { id:'scheduled', label:'Scheduled', badge:'badge-amber' },
  { id:'published', label:'Published', badge:'badge-green' },
]
const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[0]

const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const EMPTY = {
  brand:'picturebox', kind:'social', channel:'instagram', title:'', caption:'',
  preview_text:'', assets:[], release_date:'', release_time:'', status:'idea',
  tags:[], notes:'',
}

const BUCKET = 'media-files'
const pubUrl = path => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

// Public URLs read .../object/public/media-files/<path>. Recovering <path>
// lets a deleted entry take its files with it.
function storagePath(url) {
  const marker = `/${BUCKET}/`
  const i = (url || '').indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

async function removeFiles(assets) {
  const paths = []
  for (const a of assets || []) {
    for (const u of [a.url, a.thumb_url]) {
      const p = u && storagePath(u)
      if (p) paths.push(p)
    }
  }
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

async function resizeImage(file, maxPx = 1600) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale; canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.88)
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

const pad2 = n => String(n).padStart(2, '0')
const dateKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`
const todayKey = () => { const d = new Date(); return dateKey(d.getFullYear(), d.getMonth(), d.getDate()) }

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Media() {
  const [entries, setEntries]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [brand, setBrand]   = useState('picturebox')  // brand id | 'all'
  const [view, setView]     = useState('social')      // 'social' | 'newsletter' | 'calendar'
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [activeTags, setActiveTags]       = useState([])
  const [sort, setSort]     = useState('created')     // 'created' | 'release'

  const [modal, setModal]   = useState(null)          // null | 'edit' | 'view'
  const [form, setForm]     = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [baseAssets, setBaseAssets] = useState([])    // assets the entry held when the editor opened
  const [active, setActive] = useState(null)          // entry open in the viewer
  const [lightbox, setLightbox] = useState(null)      // asset shown full size

  const [saving, setSaving]     = useState(false)
  const [pending, setPending]   = useState(0)         // files still uploading
  const [newMenu, setNewMenu]   = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [month, setMonth] = useState(() => { const d = new Date(); return { y:d.getFullYear(), m:d.getMonth() } })
  const fileRef = useRef(null)

  function toast(msg) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2200) }

  async function load() {
    const { data, error } = await supabase.from('media_entries')
      .select('*').order('created_at', { ascending: false })
    if (error) setLoadError(error.message)
    else { setEntries(data || []); setLoadError(null) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Everything for the selected house, both kinds - the calendar reads this.
  const scoped = useMemo(
    () => brand === 'all' ? entries : entries.filter(e => e.brand === brand),
    [entries, brand]
  )

  const kind = view === 'newsletter' ? 'newsletter' : 'social'
  const ofKind = useMemo(() => scoped.filter(e => e.kind === kind), [scoped, kind])

  const allTags = useMemo(() => {
    const seen = new Map()
    ofKind.forEach(e => (e.tags || []).forEach(t => seen.set(t, (seen.get(t) || 0) + 1)))
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [ofKind])

  const listed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = ofKind.filter(e => {
      if (filterChannel && e.channel !== filterChannel) return false
      if (filterStatus && e.status !== filterStatus) return false
      if (activeTags.length && !activeTags.every(t => (e.tags || []).includes(t))) return false
      if (q) {
        const hay = [e.title, e.caption, e.preview_text, e.notes, ...(e.tags || [])]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (sort !== 'release') return rows
    // Dated work first, soonest at the top; undated falls to the back.
    return [...rows].sort((a, b) => {
      if (!a.release_date && !b.release_date) return 0
      if (!a.release_date) return 1
      if (!b.release_date) return -1
      return a.release_date.localeCompare(b.release_date)
    })
  }, [ofKind, search, filterChannel, filterStatus, activeTags, sort])

  const datedCount   = scoped.filter(e => e.release_date).length
  const undatedCount = scoped.length - datedCount

  // ---- CRUD -------------------------------------------------
  function openNew(nextKind, channel, releaseDate = '') {
    setNewMenu(false)
    setForm({
      ...EMPTY,
      brand: brand === 'all' ? BRANDS[0].id : brand,
      kind: nextKind,
      channel: nextKind === 'social' ? (channel || 'instagram') : '',
      release_date: releaseDate,
      status: releaseDate ? 'scheduled' : 'idea',
    })
    setEditId(null)
    setBaseAssets([])
    setModal('edit')
  }

  function openEdit(entry) {
    setForm({
      brand: entry.brand, kind: entry.kind, channel: entry.channel || '',
      title: entry.title || '', caption: entry.caption || '',
      preview_text: entry.preview_text || '', assets: entry.assets || [],
      release_date: entry.release_date || '', release_time: entry.release_time || '',
      status: entry.status || 'idea', tags: entry.tags || [], notes: entry.notes || '',
    })
    setEditId(entry.id)
    setBaseAssets(entry.assets || [])
    setModal('edit')
  }

  function openView(entry) { setActive(entry); setModal('view') }

  async function save() {
    if (!form.title.trim()) return alert('Give it a title so you can find it again later')
    if (form.kind === 'social' && !form.channel) return alert('Pick a channel for this post')
    if (pending) return alert('Wait for the uploads to finish first')
    setSaving(true)
    try {
      const payload = {
        brand: form.brand,
        kind: form.kind,
        channel: form.kind === 'social' ? form.channel : null,
        title: form.title.trim(),
        caption: form.caption || null,
        preview_text: form.kind === 'newsletter' ? (form.preview_text || null) : null,
        assets: form.assets,
        release_date: form.release_date || null,
        release_time: form.release_date ? (form.release_time || null) : null,
        status: form.status,
        tags: form.tags,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      }
      let saved
      if (editId) {
        const { data, error } = await supabase.from('media_entries')
          .update(payload).eq('id', editId).select().single()
        if (error) throw error
        saved = data
        setEntries(prev => prev.map(e => e.id === editId ? saved : e))
        // Files dropped during this edit are only cleared once the row is safe.
        const kept = new Set((form.assets || []).map(a => a.url))
        const dropped = baseAssets.filter(a => !kept.has(a.url))
        if (dropped.length) removeFiles(dropped).catch(() => {})
      } else {
        const { data, error } = await supabase.from('media_entries')
          .insert(payload).select().single()
        if (error) throw error
        saved = data
        setEntries(prev => [saved, ...prev])
      }
      cacheInvalidate('media_entries')
      auditLog(editId ? 'media.updated' : 'media.created', {
        entityType:'media_entry', entityId: saved.id, entityLabel: saved.title,
        metadata: { brand: saved.brand, kind: saved.kind, channel: saved.channel },
      })
      setActive(a => (a && a.id === saved.id) ? saved : a)
      setModal(null)
      setEditId(null)
      toast('Stored')
    } catch(err) { alert('Save failed: ' + err.message) }
    finally { setSaving(false) }
  }

  async function del(entry) {
    const n = (entry.assets || []).length
    const files = n ? ` Its ${n} file${n !== 1 ? 's' : ''} will go too.` : ''
    if (!confirm(`Delete "${entry.title}"?${files} This cannot be undone.`)) return
    const { error } = await supabase.from('media_entries').delete().eq('id', entry.id)
    if (error) return alert('Delete failed: ' + error.message)
    removeFiles(entry.assets).catch(() => {})
    cacheInvalidate('media_entries')
    setEntries(prev => prev.filter(e => e.id !== entry.id))
    auditLog('media.deleted', { entityType:'media_entry', entityId: entry.id, entityLabel: entry.title })
    if (active?.id === entry.id) { setActive(null); setModal(null) }
    toast('Deleted')
  }

  // Give a stored entry a release date straight from the calendar.
  async function assignDate(entry, value) {
    const patch = {
      release_date: value || null,
      status: value
        ? (entry.status === 'idea' || entry.status === 'draft' ? 'scheduled' : entry.status)
        : (entry.status === 'scheduled' ? 'draft' : entry.status),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('media_entries').update(patch).eq('id', entry.id)
    if (error) return alert('Could not set the date: ' + error.message)
    cacheInvalidate('media_entries')
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...patch } : e))
    setActive(a => (a && a.id === entry.id) ? { ...a, ...patch } : a)
    toast(value ? `Set for ${fmtDate(value)}` : 'Date cleared')
  }

  async function setStatus(entry, status) {
    const patch = { status, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('media_entries').update(patch).eq('id', entry.id)
    if (error) return alert('Could not update: ' + error.message)
    cacheInvalidate('media_entries')
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...patch } : e))
    setActive(a => (a && a.id === entry.id) ? { ...a, ...patch } : a)
  }

  // ---- uploads ----------------------------------------------
  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setPending(files.length)
    for (const file of files) {
      try {
        const isImage = file.type.startsWith('image/')
        const isVideo = file.type.startsWith('video/')
        if (!isImage && !isVideo) throw new Error(`${file.name} is not an image or a video`)
        const base = `media/${form.brand}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        let asset
        if (isImage) {
          const [full, thumb] = await Promise.all([resizeImage(file, 1600), resizeImage(file, 480)])
          const fullPath = `${base}_full.jpg`
          const thumbPath = `${base}_thumb.jpg`
          const [up, upThumb] = await Promise.all([
            supabase.storage.from(BUCKET).upload(fullPath, full, { contentType:'image/jpeg' }),
            supabase.storage.from(BUCKET).upload(thumbPath, thumb, { contentType:'image/jpeg' }),
          ])
          if (up.error) throw up.error
          if (upThumb.error) throw upThumb.error
          asset = { url: pubUrl(fullPath), thumb_url: pubUrl(thumbPath), media_type:'image' }
        } else {
          const safe = file.name.replace(/[^\w.-]+/g, '_')
          const path = `${base}_${safe}`
          const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
          if (error) throw error
          asset = { url: pubUrl(path), thumb_url: null, media_type:'video' }
        }
        asset = { ...asset, file_name: file.name, mime_type: file.type, size: file.size }
        setForm(f => ({ ...f, assets: [...f.assets, asset] }))
      } catch(err) {
        alert('Upload failed: ' + err.message)
      } finally {
        setPending(n => Math.max(0, n - 1))
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function dropAsset(i) {
    setForm(f => ({ ...f, assets: f.assets.filter((_, idx) => idx !== i) }))
  }

  function moveAsset(i, dir) {
    setForm(f => {
      const j = i + dir
      if (j < 0 || j >= f.assets.length) return f
      const next = [...f.assets]
      const held = next[i]
      next[i] = next[j]
      next[j] = held
      return { ...f, assets: next }
    })
  }

  async function copyText(text, what = 'Text') {
    try { await navigator.clipboard.writeText(text || ''); toast(`${what} copied`) }
    catch(_) { alert('Could not reach the clipboard') }
  }

  // ---- calendar ---------------------------------------------
  const calendar = useMemo(() => {
    const first = new Date(month.y, month.m, 1)
    const startPad = (first.getDay() + 6) % 7          // weeks run Mon to Sun
    const days = new Date(month.y, month.m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startPad; i++) cells.push(null)
    for (let d = 1; d <= days; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [month])

  const byDate = useMemo(() => {
    const map = new Map()
    scoped.forEach(e => {
      if (!e.release_date) return
      if (!map.has(e.release_date)) map.set(e.release_date, [])
      map.get(e.release_date).push(e)
    })
    for (const rows of map.values()) {
      rows.sort((a, b) => (a.release_time || '99:99').localeCompare(b.release_time || '99:99'))
    }
    return map
  }, [scoped])

  const unscheduled = useMemo(
    () => scoped.filter(e => !e.release_date && e.status !== 'published'),
    [scoped]
  )

  function shiftMonth(delta) {
    setMonth(({ y, m }) => {
      const next = m + delta
      if (next < 0) return { y: y - 1, m: 11 }
      if (next > 11) return { y: y + 1, m: 0 }
      return { y, m: next }
    })
  }

  // ---- small pieces -----------------------------------------
  function kindLabel(e) {
    if (e.kind === 'newsletter') return 'Newsletter'
    return channelOf(e.channel)?.label || e.channel || 'Social'
  }

  function Thumb({ entry, size = 64 }) {
    const first = (entry.assets || [])[0]
    const box = {
      width: size, height: size, borderRadius: 3, flexShrink: 0,
      border: '1px solid var(--line)', objectFit: 'cover', background: 'var(--parchment)',
    }
    if (first?.media_type === 'image' && (first.thumb_url || first.url)) {
      return <img src={first.thumb_url || first.url} alt="" style={box} />
    }
    if (first?.media_type === 'video') {
      return (
        <div style={{ ...box, display:'flex', alignItems:'center', justifyContent:'center',
                      color:'var(--muted)', fontSize: size / 3 }}>
          {'▶'}
        </div>
      )
    }
    return (
      <div style={{ ...box, display:'flex', alignItems:'center', justifyContent:'center',
                    color:'var(--line)', fontSize: size / 2.6 }}>
        {entry.kind === 'newsletter' ? '✉' : (channelOf(entry.channel)?.glyph || '◻')}
      </div>
    )
  }

  const tabBtn = (on, accent) => ({
    padding:'8px 16px', fontSize:13, cursor:'pointer', background:'none',
    border:'none', borderBottom: on ? `2px solid ${accent || 'var(--ink)'}` : '2px solid transparent',
    color: on ? 'var(--ink)' : 'var(--muted)', fontWeight: on ? 600 : 400,
    fontFamily:'inherit',
  })

  const pillBtn = on => ({
    padding:'6px 14px', fontSize:12, cursor:'pointer', borderRadius:3,
    border:'1px solid ' + (on ? 'var(--ink)' : 'var(--line)'),
    background: on ? 'var(--ink)' : 'var(--white)',
    color: on ? 'var(--white)' : 'var(--muted)', fontFamily:'inherit',
  })

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading{'…'}</div>

  const channelLimit = form.kind === 'social' ? channelOf(form.channel)?.limit : null
  const captionLen = (form.caption || '').length
  const overLimit = channelLimit && captionLen > channelLimit

  return (
    <div>
      {/* ---- header ---- */}
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between',
                                            alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
        <div>
          <div className="page-title">Media</div>
          <div className="page-subtitle">
            {scoped.length} stored
            {datedCount > 0   && <span> {'·'} {datedCount} with release dates</span>}
            {undatedCount > 0 && <span> {'·'} {undatedCount} held for later</span>}
          </div>
        </div>

        <div style={{ position:'relative' }}>
          <button className="btn btn-primary" onClick={() => setNewMenu(o => !o)}>
            + New storage {'▾'}
          </button>
          {newMenu && (
            <>
              <div onClick={() => setNewMenu(false)}
                style={{ position:'fixed', inset:0, zIndex:40 }} />
              <div style={{ position:'absolute', top:'100%', right:0, marginTop:6, zIndex:41,
                            background:'var(--white)', border:'1px solid var(--line)', borderRadius:4,
                            boxShadow:'var(--shadow-lg)', minWidth:230, overflow:'hidden' }}>
                <div style={{ padding:'8px 14px 4px', fontSize:10, color:'var(--muted)',
                              textTransform:'uppercase', letterSpacing:'.08em' }}>
                  Social media
                </div>
                {CHANNELS.map(c => (
                  <div key={c.id} onClick={() => openNew('social', c.id)}
                    style={{ padding:'8px 14px', fontSize:13, cursor:'pointer', display:'flex', gap:9 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--parchment)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ opacity:.6 }}>{c.glyph}</span> New {c.label} post
                  </div>
                ))}
                <div style={{ padding:'8px 14px 4px', fontSize:10, color:'var(--muted)',
                              textTransform:'uppercase', letterSpacing:'.08em',
                              borderTop:'1px solid var(--line-soft)', marginTop:4 }}>
                  Newsletter
                </div>
                <div onClick={() => openNew('newsletter')}
                  style={{ padding:'8px 14px', fontSize:13, cursor:'pointer', display:'flex', gap:9 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--parchment)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ opacity:.6 }}>{'✉'}</span> New newsletter
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {loadError && (
        <div className="card" style={{ marginBottom:16, borderColor:'var(--red)', color:'var(--red)', fontSize:13 }}>
          Could not load media: {loadError}
        </div>
      )}

      {/* ---- brand tabs ---- */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--line)', marginBottom:14 }}>
        {BRANDS.map(b => (
          <button key={b.id} onClick={() => setBrand(b.id)} style={tabBtn(brand === b.id, b.accent)}>
            <span style={{ display:'inline-block', width:7, height:7, borderRadius:7,
                           background:b.accent, marginRight:7, verticalAlign:'middle' }} />
            {b.label}
            <span style={{ marginLeft:7, fontSize:11, color:'var(--muted)', fontWeight:400 }}>
              {entries.filter(e => e.brand === b.id).length}
            </span>
          </button>
        ))}
        <button onClick={() => setBrand('all')} style={tabBtn(brand === 'all')}>Both</button>
      </div>

      {/* ---- space tabs ---- */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        <button onClick={() => setView('social')} style={pillBtn(view === 'social')}>
          Social media <span style={{ opacity:.65 }}>{scoped.filter(e => e.kind === 'social').length}</span>
        </button>
        <button onClick={() => setView('newsletter')} style={pillBtn(view === 'newsletter')}>
          Newsletter <span style={{ opacity:.65 }}>{scoped.filter(e => e.kind === 'newsletter').length}</span>
        </button>
        <button onClick={() => setView('calendar')} style={pillBtn(view === 'calendar')}>
          Calendar <span style={{ opacity:.65 }}>{datedCount}</span>
        </button>
      </div>

      {view === 'calendar' ? (
        <>
          {/* ---- calendar ---- */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <button className="btn btn-outline btn-sm" onClick={() => shiftMonth(-1)}>{'←'}</button>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.25rem', minWidth:200 }}>
              {MONTHS[month.m]} {month.y}
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => shiftMonth(1)}>{'→'}</button>
            <button className="btn btn-ghost btn-sm"
              onClick={() => { const d = new Date(); setMonth({ y:d.getFullYear(), m:d.getMonth() }) }}>
              Today
            </button>
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--muted)' }}>
              Click any day to store something for it
            </span>
          </div>

          <div className="table-wrap">
          <div className="card" style={{ padding:0, overflow:'hidden', minWidth:720 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)',
                          borderBottom:'1px solid var(--line)' }}>
              {WEEKDAYS.map(d => (
                <div key={d} style={{ padding:'8px 10px', fontSize:10, color:'var(--muted)',
                                      textTransform:'uppercase', letterSpacing:'.08em' }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)' }}>
              {calendar.map((d, i) => {
                const key = d ? dateKey(month.y, month.m, d) : null
                const rows = key ? (byDate.get(key) || []) : []
                const isToday = key === todayKey()
                return (
                  <div key={i}
                    onClick={() => d && openNew(kind === 'newsletter' ? 'newsletter' : 'social',
                                               kind === 'newsletter' ? null : 'instagram', key)}
                    style={{ minHeight:110, padding:6, borderRight:'1px solid var(--line-soft)',
                             borderBottom:'1px solid var(--line-soft)',
                             background: d ? (isToday ? '#fdfaf3' : 'var(--white)') : 'var(--parchment)',
                             cursor: d ? 'pointer' : 'default' }}>
                    {d && (
                      <div style={{ fontSize:11, color: isToday ? 'var(--gold)' : 'var(--muted)',
                                    fontWeight: isToday ? 700 : 400, marginBottom:4 }}>
                        {d}
                      </div>
                    )}
                    {rows.map(e => {
                      const b = brandOf(e.brand)
                      return (
                        <div key={e.id}
                          onClick={ev => { ev.stopPropagation(); openView(e) }}
                          title={`${kindLabel(e)} · ${e.title}`}
                          style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3,
                                   padding:'3px 5px', borderRadius:2, background:'var(--parchment)',
                                   borderLeft:`3px solid ${b.accent}`, fontSize:11, lineHeight:1.25,
                                   overflow:'hidden' }}>
                          <span style={{ opacity:.55, flexShrink:0 }}>
                            {e.kind === 'newsletter' ? '✉' : (channelOf(e.channel)?.glyph || '◻')}
                          </span>
                          <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {e.release_time ? `${e.release_time} ` : ''}{e.title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          </div>

          {/* ---- waiting without a date ---- */}
          <div style={{ marginTop:22 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
              Held for later {'—'} no release date yet
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>
              {unscheduled.length
                ? 'Pick a date to put one on the calendar.'
                : 'Nothing waiting. Everything stored has a date or is already out.'}
            </div>
            {unscheduled.length > 0 && (
              <div className="card" style={{ padding:0 }}>
                {unscheduled.map(e => {
                  const b = brandOf(e.brand)
                  return (
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                                             borderBottom:'1px solid var(--line-soft)' }}>
                      <Thumb entry={e} size={40} />
                      <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => openView(e)}>
                        <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap',
                                      overflow:'hidden', textOverflow:'ellipsis' }}>
                          {e.title}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          <span style={{ color:b.accent }}>{b.label}</span> {'·'} {kindLabel(e)}
                          {' '}{'·'} {statusOf(e.status).label}
                        </div>
                      </div>
                      <input type="date" className="form-input" style={{ width:150, fontSize:12 }}
                        value="" onChange={ev => ev.target.value && assignDate(e, ev.target.value)} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* ---- filters ---- */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
            <input className="form-input" style={{ width:250 }}
              placeholder="Search title, text, tags, notes..."
              value={search} onChange={e => setSearch(e.target.value)} />
            {kind === 'social' && (
              <select className="form-select" style={{ width:160 }}
                value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
                <option value="">All channels</option>
                {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
            <select className="form-select" style={{ width:150 }}
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="form-select" style={{ width:170 }}
              value={sort} onChange={e => setSort(e.target.value)}>
              <option value="created">Newest stored first</option>
              <option value="release">By release date</option>
            </select>
            <span style={{ fontSize:13, color:'var(--muted)', alignSelf:'center', marginLeft:'auto' }}>
              {listed.length} of {ofKind.length}
            </span>
          </div>

          {/* ---- tag recall ---- */}
          {allTags.length > 0 && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:18, alignItems:'center' }}>
              <span style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase',
                             letterSpacing:'.08em', marginRight:2 }}>
                Tags
              </span>
              {allTags.map(([tag, count]) => {
                const on = activeTags.includes(tag)
                return (
                  <button key={tag}
                    onClick={() => setActiveTags(t => on ? t.filter(x => x !== tag) : [...t, tag])}
                    style={{ fontSize:11, padding:'3px 9px', borderRadius:3, cursor:'pointer',
                             fontFamily:'inherit',
                             border:'1px solid ' + (on ? 'var(--ink)' : 'var(--line)'),
                             background: on ? 'var(--ink)' : 'var(--white)',
                             color: on ? 'var(--white)' : 'var(--muted)' }}>
                    {tag} <span style={{ opacity:.6 }}>{count}</span>
                  </button>
                )
              })}
              {activeTags.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveTags([])}>Clear</button>
              )}
            </div>
          )}

          {/* ---- grid ---- */}
          {listed.length === 0 ? (
            <div className="card" style={{ textAlign:'center', padding:44, color:'var(--muted)', fontSize:13 }}>
              {ofKind.length === 0
                ? `Nothing stored here yet. Use "+ New storage" to park your first ${kind === 'newsletter' ? 'newsletter' : 'post'}.`
                : 'Nothing matches those filters.'}
            </div>
          ) : (
            <div style={{ display:'grid', gap:14,
                          gridTemplateColumns:'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {listed.map(e => {
                const b = brandOf(e.brand)
                const st = statusOf(e.status)
                const first = (e.assets || [])[0]
                const extra = (e.assets || []).length - 1
                return (
                  <div key={e.id} className="card card-hover" style={{ padding:0, cursor:'pointer',
                                                                       display:'flex', flexDirection:'column' }}
                    onClick={() => openView(e)}>
                    <div style={{ position:'relative', aspectRatio:'4 / 3', background:'var(--parchment)',
                                  borderBottom:'1px solid var(--line-soft)', overflow:'hidden' }}>
                      {first?.media_type === 'image' && (
                        <img src={first.thumb_url || first.url} alt=""
                          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      )}
                      {first?.media_type === 'video' && (
                        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center',
                                      justifyContent:'center', fontSize:30, color:'var(--muted)' }}>
                          {'▶'}
                        </div>
                      )}
                      {!first && (
                        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center',
                                      justifyContent:'center', fontSize:28, color:'var(--line)' }}>
                          {e.kind === 'newsletter' ? '✉' : (channelOf(e.channel)?.glyph || '◻')}
                        </div>
                      )}
                      <span style={{ position:'absolute', top:8, left:8, fontSize:10, padding:'2px 7px',
                                     borderRadius:3, background:'rgba(255,255,255,.94)', color:b.accent,
                                     fontWeight:600, letterSpacing:'.03em' }}>
                        {kindLabel(e)}
                      </span>
                      {extra > 0 && (
                        <span style={{ position:'absolute', bottom:8, right:8, fontSize:10, padding:'2px 7px',
                                       borderRadius:3, background:'rgba(26,23,20,.8)', color:'#fff' }}>
                          +{extra}
                        </span>
                      )}
                    </div>

                    <div style={{ padding:'11px 13px', display:'flex', flexDirection:'column',
                                  gap:6, flex:1 }}>
                      <div style={{ display:'flex', gap:6, alignItems:'flex-start',
                                    justifyContent:'space-between' }}>
                        <div style={{ fontSize:13, fontWeight:500, lineHeight:1.3 }}>{e.title}</div>
                        <span className={`badge ${st.badge}`} style={{ flexShrink:0 }}>{st.label}</span>
                      </div>
                      {(e.caption || e.preview_text) && (
                        <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.45,
                                      display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical',
                                      overflow:'hidden' }}>
                          {e.caption || e.preview_text}
                        </div>
                      )}
                      {(e.tags || []).length > 0 && (
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {e.tags.slice(0, 4).map(t => (
                            <span key={t} style={{ fontSize:10, padding:'1px 6px', borderRadius:2,
                                                   background:'var(--parchment)', color:'var(--muted)' }}>
                              {t}
                            </span>
                          ))}
                          {e.tags.length > 4 && (
                            <span style={{ fontSize:10, color:'var(--muted)' }}>+{e.tags.length - 4}</span>
                          )}
                        </div>
                      )}
                      <div style={{ marginTop:'auto', fontSize:11,
                                    color: e.release_date ? 'var(--ink)' : 'var(--muted)' }}>
                        {e.release_date
                          ? `${'◈'} ${fmtDate(e.release_date)}${e.release_time ? ` at ${e.release_time}` : ''}`
                          : `${'○'} No release date`}
                        {brand === 'all' && (
                          <span style={{ color:b.accent, marginLeft:8 }}>{'·'} {b.label}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ---- viewer ---- */}
      {modal === 'view' && active && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{active.title}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  <span style={{ color:brandOf(active.brand).accent }}>{brandOf(active.brand).label}</span>
                  {' '}{'·'} {kindLabel(active)} {'·'} stored{' '}
                  {new Date(active.created_at).toLocaleDateString('en-GB',
                    { day:'numeric', month:'short', year:'numeric' })}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>{'✕'}</button>
            </div>

            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:22 }}>
              <div>
                {(active.assets || []).length === 0 && (
                  <div style={{ border:'1px dashed var(--line)', borderRadius:3, padding:34,
                                textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                    No image or video held for this one
                  </div>
                )}
                <div style={{ display:'grid', gap:10 }}>
                  {(active.assets || []).map((a, i) => (
                    <div key={i}>
                      {a.media_type === 'video' ? (
                        <video src={a.url} controls
                          style={{ width:'100%', borderRadius:3, border:'1px solid var(--line)',
                                   background:'#000' }} />
                      ) : (
                        <img src={a.url} alt="" onClick={() => setLightbox(a)}
                          style={{ width:'100%', borderRadius:3, border:'1px solid var(--line)',
                                   cursor:'zoom-in' }} />
                      )}
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:3,
                                    display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {a.file_name}
                        </span>
                        <span style={{ flexShrink:0 }}>
                          {fmtSize(a.size)}
                          {' '}<a href={a.url} target="_blank" rel="noreferrer"
                                 style={{ color:'var(--muted)' }}>open</a>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div>
                  <div className="form-label" style={{ marginBottom:5 }}>Status</div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {STATUSES.map(s => (
                      <button key={s.id} onClick={() => setStatus(active, s.id)}
                        style={pillBtn(active.status === s.id)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="form-label" style={{ marginBottom:5 }}>Release date</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <input type="date" className="form-input" style={{ width:160 }}
                      value={active.release_date || ''}
                      onChange={e => assignDate(active, e.target.value)} />
                    {active.release_date
                      ? <span style={{ fontSize:12, color:'var(--muted)' }}>
                          {fmtDate(active.release_date)}{active.release_time ? ` at ${active.release_time}` : ''}
                        </span>
                      : <span style={{ fontSize:12, color:'var(--muted)' }}>Held for future use</span>}
                  </div>
                </div>

                {active.kind === 'newsletter' && active.preview_text && (
                  <div>
                    <div className="form-label" style={{ marginBottom:4 }}>Preview line</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{active.preview_text}</div>
                  </div>
                )}

                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div className="form-label">
                      {active.kind === 'newsletter' ? 'Newsletter text' : 'Caption'}
                    </div>
                    {active.caption && (
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => copyText(active.caption,
                          active.kind === 'newsletter' ? 'Text' : 'Caption')}>
                        Copy
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap',
                                background:'var(--parchment)', border:'1px solid var(--line-soft)',
                                borderRadius:3, padding:'10px 12px', maxHeight:260, overflowY:'auto' }}>
                    {active.caption || <span style={{ color:'var(--muted)' }}>No text yet</span>}
                  </div>
                </div>

                {(active.tags || []).length > 0 && (
                  <div>
                    <div className="form-label" style={{ marginBottom:5 }}>Tags</div>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      {active.tags.map(t => (
                        <span key={t} style={{ fontSize:11, padding:'2px 8px', borderRadius:3,
                                               background:'var(--ink)', color:'#fff' }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {active.notes && (
                  <div>
                    <div className="form-label" style={{ marginBottom:4 }}>Notes</div>
                    <div style={{ fontSize:12, color:'var(--muted)', whiteSpace:'pre-wrap' }}>
                      {active.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" style={{ color:'var(--red)', marginRight:'auto' }}
                onClick={() => del(active)}>
                Delete
              </button>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => openEdit(active)}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- editor ---- */}
      {modal === 'edit' && (
        <div className="modal-overlay">
          <div className="modal modal-xl">
            <div className="modal-header">
              <div className="modal-title">
                {editId ? 'Edit' : 'New'}{' '}
                {form.kind === 'newsletter' ? 'newsletter' : `${channelOf(form.channel)?.label || ''} post`}
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>{'✕'}</button>
            </div>

            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:22 }}>
              {/* left: files */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div className="form-group">
                  <label className="form-label">Section</label>
                  <select className="form-select" value={form.brand}
                    onChange={e => setForm(f => ({ ...f, brand:e.target.value }))}>
                    {BRANDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Space</label>
                    <select className="form-select" value={form.kind}
                      onChange={e => {
                        const k = e.target.value
                        setForm(f => ({ ...f, kind:k, channel: k === 'social' ? (f.channel || 'instagram') : '' }))
                      }}>
                      <option value="social">Social media</option>
                      <option value="newsletter">Newsletter</option>
                    </select>
                  </div>
                  {form.kind === 'social' && (
                    <div className="form-group">
                      <label className="form-label">Channel</label>
                      <select className="form-select" value={form.channel}
                        onChange={e => setForm(f => ({ ...f, channel:e.target.value }))}>
                        {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Images and video</label>
                  <input ref={fileRef} type="file" accept="image/*,video/*" multiple
                    onChange={handleFiles} style={{ fontSize:12 }} />
                  <div style={{ fontSize:10, color:'var(--muted)' }}>
                    Images are resized for storage. Video is kept as uploaded, up to 200MB a file.
                  </div>
                  {pending > 0 && (
                    <div style={{ fontSize:12, color:'var(--gold)' }}>
                      Uploading {pending} file{pending !== 1 ? 's' : ''}{'…'}
                    </div>
                  )}
                </div>

                {form.assets.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {form.assets.map((a, i) => (
                      <div key={a.url} style={{ display:'flex', gap:10, alignItems:'center',
                                                border:'1px solid var(--line-soft)', borderRadius:3,
                                                padding:6 }}>
                        {a.media_type === 'image'
                          ? <img src={a.thumb_url || a.url} alt=""
                              style={{ width:52, height:52, objectFit:'cover', borderRadius:2,
                                       border:'1px solid var(--line)' }} />
                          : <div style={{ width:52, height:52, borderRadius:2, border:'1px solid var(--line)',
                                          display:'flex', alignItems:'center', justifyContent:'center',
                                          background:'var(--parchment)', color:'var(--muted)' }}>
                              {'▶'}
                            </div>}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, whiteSpace:'nowrap', overflow:'hidden',
                                        textOverflow:'ellipsis' }}>
                            {a.file_name}
                          </div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>
                            {i === 0 ? 'First in the set' : `Position ${i + 1}`}
                            {a.size ? ` · ${fmtSize(a.size)}` : ''}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:2 }}>
                          <button className="btn btn-ghost btn-sm" disabled={i === 0}
                            onClick={() => moveAsset(i, -1)} title="Move up">{'↑'}</button>
                          <button className="btn btn-ghost btn-sm" disabled={i === form.assets.length - 1}
                            onClick={() => moveAsset(i, 1)} title="Move down">{'↓'}</button>
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }}
                            onClick={() => dropAsset(i)} title="Remove">{'✕'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* right: words and dates */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div className="form-group">
                  <label className="form-label">
                    {form.kind === 'newsletter' ? 'Subject line *' : 'Title *'}
                  </label>
                  <input className="form-input" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title:e.target.value }))}
                    placeholder={form.kind === 'newsletter'
                      ? 'e.g. October at the gallery'
                      : 'e.g. Onobrakpeya studio series, frame 3'} />
                </div>

                {form.kind === 'newsletter' && (
                  <div className="form-group">
                    <label className="form-label">Preview line</label>
                    <input className="form-input" value={form.preview_text}
                      onChange={e => setForm(f => ({ ...f, preview_text:e.target.value }))}
                      placeholder="The line readers see after the subject" />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    {form.kind === 'newsletter' ? 'Newsletter text' : 'Caption'}
                  </label>
                  <textarea className="form-textarea" rows={form.kind === 'newsletter' ? 10 : 7}
                    value={form.caption}
                    onChange={e => setForm(f => ({ ...f, caption:e.target.value }))}
                    placeholder={form.kind === 'newsletter'
                      ? 'Write the issue here'
                      : 'Caption, hashtags, the lot'} />
                  <div style={{ fontSize:10, color: overLimit ? 'var(--red)' : 'var(--muted)' }}>
                    {captionLen} character{captionLen !== 1 ? 's' : ''}
                    {channelLimit ? ` of ${channelLimit.toLocaleString()}` : ''}
                    {overLimit ? ` — over the ${channelOf(form.channel).label} limit` : ''}
                  </div>
                </div>

                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Release date</label>
                    <input type="date" className="form-input" value={form.release_date}
                      onChange={e => {
                        const v = e.target.value
                        setForm(f => ({
                          ...f,
                          release_date: v,
                          status: v
                            ? (f.status === 'idea' || f.status === 'draft' ? 'scheduled' : f.status)
                            : (f.status === 'scheduled' ? 'draft' : f.status),
                        }))
                      }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input type="time" className="form-input" value={form.release_time}
                      disabled={!form.release_date}
                      onChange={e => setForm(f => ({ ...f, release_time:e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-select" value={form.status}
                      onChange={e => setForm(f => ({ ...f, status:e.target.value }))}>
                      {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:-6 }}>
                  Leave the date empty to store it for future use {'—'} it stays off the calendar
                  until you set one.
                </div>

                <div className="form-group">
                  <label className="form-label">Tags</label>
                  <TagInput tags={form.tags} onChange={t => setForm(f => ({ ...f, tags:t }))}
                    suggestions={MEDIA_TAG_SUGGESTIONS} placeholder="e.g. studio visit, reel..." />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" rows={2} value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes:e.target.value }))}
                    placeholder="Anything for whoever posts this" />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || pending > 0}>
                {saving ? 'Saving…' : (editId ? 'Save changes' : 'Store it')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- lightbox ---- */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.88)', zIndex:200,
                   display:'flex', alignItems:'center', justifyContent:'center', padding:30,
                   cursor:'zoom-out' }}>
          <img src={lightbox.url} alt=""
            style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
        </div>
      )}

      {toastMsg && (
        <div style={{ position:'fixed', bottom:22, left:'50%', transform:'translateX(-50%)',
                      background:'var(--ink)', color:'#fff', padding:'9px 18px', borderRadius:3,
                      fontSize:13, zIndex:300, boxShadow:'var(--shadow-lg)' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
