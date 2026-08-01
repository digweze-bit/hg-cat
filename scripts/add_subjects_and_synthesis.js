import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('activeSubject')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.error('ANCHOR NOT FOUND: ' + label)
    console.error('--- Looking for ---')
    console.error(oldStr)
    process.exit(1)
  }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add new state after artistSearch state
mustReplace(
  "const [artistSearch, setArtistSearch] = useState('')",
  `const [artistSearch, setArtistSearch] = useState('')
  const [viewMode, setViewMode] = useState('artist') // 'artist' | 'subject'
  const [subjects, setSubjects] = useState([])
  const [activeSubject, setActiveSubject] = useState(null)
  const [subjectSearch, setSubjectSearch] = useState('')
  const [synthText, setSynthText] = useState('')
  const [synthLoading, setSynthLoading] = useState(false)`,
  '1. Add subject/synthesis state'
)

// 2. Add subjects-loading effect after the artists-loading effect
mustReplace(
  `  useEffect(() => {
    fetchAll('artists', { order: 'name', onUpdate: setArtists }).then(setArtists)
  }, [])`,
  `  useEffect(() => {
    fetchAll('artists', { order: 'name', onUpdate: setArtists }).then(setArtists)
  }, [])

  // ── Load distinct subject names once
  function loadSubjects() {
    supabase.from('archive_entries').select('subject').not('subject', 'is', null).then(({ data }) => {
      const uniq = [...new Set((data || []).map(d => d.subject).filter(Boolean))].sort()
      setSubjects(uniq)
    })
  }
  useEffect(() => { loadSubjects() }, [])`,
  '2. Add subjects loading'
)

// 3. Gate the artist-entries effect to only run in artist mode, and add a sibling effect for subject mode
mustReplace(
  `  useEffect(() => {
    if (!activeArtistId) return
    setLoading(true)
    Promise.all([
      fetchAll('artworks', { filters:[['artist_id','eq',activeArtistId]], order:'title' }),
      fetchAll('archive_entries', { filters:[['artist_id','eq',activeArtistId]], order:'created_at' }),
    ]).then(([w, e]) => {
      setArtworks(w)
      setEntries(e)
      // Load provenance for all these artworks
      if (w.length) {
        supabase.from('provenance_entries')
          .select('*')
          .in('artwork_id', w.map(x => x.id))
          .order('sort_order', { ascending: true })
          .then(({ data }) => setProvenance(data || []))
      } else {
        setProvenance([])
      }
      setLoading(false)
    })
  }, [activeArtistId])`,
  `  useEffect(() => {
    if (viewMode !== 'artist' || !activeArtistId) return
    setLoading(true)
    Promise.all([
      fetchAll('artworks', { filters:[['artist_id','eq',activeArtistId]], order:'title' }),
      fetchAll('archive_entries', { filters:[['artist_id','eq',activeArtistId]], order:'created_at' }),
    ]).then(([w, e]) => {
      setArtworks(w)
      setEntries(e)
      // Load provenance for all these artworks
      if (w.length) {
        supabase.from('provenance_entries')
          .select('*')
          .in('artwork_id', w.map(x => x.id))
          .order('sort_order', { ascending: true })
          .then(({ data }) => setProvenance(data || []))
      } else {
        setProvenance([])
      }
      setLoading(false)
    })
  }, [activeArtistId, viewMode])

  // ── Load entries when a SUBJECT is selected
  useEffect(() => {
    if (viewMode !== 'subject' || !activeSubject) return
    setLoading(true)
    fetchAll('archive_entries', { filters:[['subject','eq',activeSubject]], order:'created_at' }).then(e => {
      setEntries(e)
      setArtworks([])
      setProvenance([])
      setLoading(false)
    })
  }, [activeSubject, viewMode])`,
  '3. Gate artist effect, add subject effect'
)

// 4. Update selectArtist and add selectSubject / newSubject
mustReplace(
  `  function selectArtist(id) {
    setActiveArtistId(id)
    setFilter('all')
    setDrawer(null)
    setModal(null)
    navigate(\`/admin/archive/\${id}\`, { replace: true })
  }`,
  `  function selectArtist(id) {
    setViewMode('artist')
    setActiveSubject(null)
    setActiveArtistId(id)
    setFilter('all')
    setDrawer(null)
    setModal(null)
    navigate(\`/admin/archive/\${id}\`, { replace: true })
  }

  function selectSubject(name) {
    setViewMode('subject')
    setActiveArtistId(null)
    setActiveSubject(name)
    setFilter('all')
    setDrawer(null)
    setModal(null)
    navigate(\`/admin/archive\`, { replace: true })
  }

  function newSubject() {
    const name = window.prompt('New subject name (e.g. "Zaria Rebels", "Natural Synthesis"):')
    if (!name || !name.trim()) return
    selectSubject(name.trim())
    openAddEntry()
  }`,
  '4. Add selectSubject / newSubject'
)

// 5. Update saveEntry payload to support subject mode + refresh subjects list
mustReplace(
  `      const payload = {
        artist_id: activeArtistId,
        type: form.type, title: form.title, date: form.date||null,
        source: form.source||null, description: form.description||null,
        tags: form.tags ? form.tags.split(',').map(t=>t.trim()).filter(Boolean) : [],
        artwork_id: form.artwork_id||null, starred: !!form.starred,
        image_url: form.image_url||null, file_name: form.file_name||null,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'editEntry' && editTarget) {
        await supabase.from('archive_entries').update(payload).eq('id', editTarget.id)
        setEntries(prev => prev.map(e => e.id === editTarget.id ? { ...e, ...payload } : e))
      } else {
        const { data } = await supabase.from('archive_entries').insert(payload).select().single()
        setEntries(prev => [data, ...prev])
      }
      setModal(null); toast('Saved')`,
  `      const payload = {
        artist_id: viewMode === 'artist' ? activeArtistId : null,
        subject: viewMode === 'subject' ? activeSubject : null,
        type: form.type, title: form.title, date: form.date||null,
        source: form.source||null, description: form.description||null,
        tags: form.tags ? form.tags.split(',').map(t=>t.trim()).filter(Boolean) : [],
        artwork_id: form.artwork_id||null, starred: !!form.starred,
        image_url: form.image_url||null, file_name: form.file_name||null,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'editEntry' && editTarget) {
        await supabase.from('archive_entries').update(payload).eq('id', editTarget.id)
        setEntries(prev => prev.map(e => e.id === editTarget.id ? { ...e, ...payload } : e))
      } else {
        const { data } = await supabase.from('archive_entries').insert(payload).select().single()
        setEntries(prev => [data, ...prev])
        if (viewMode === 'subject') loadSubjects()
      }
      setModal(null); toast('Saved')`,
  '5. Update saveEntry for subject support'
)

// 6. Add runSynthesis function after deleteEntry
mustReplace(
  `  async function deleteEntry(id) {
    if (!confirm('Delete this item?')) return
    await supabase.from('archive_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setDrawer(null)
  }`,
  `  async function deleteEntry(id) {
    if (!confirm('Delete this item?')) return
    await supabase.from('archive_entries').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
    setDrawer(null)
  }

  // ══════════════════════════════════════════════════════════
  // AI SYNTHESIS — draft provenance-supporting research summary
  // ══════════════════════════════════════════════════════════
  async function runSynthesis() {
    if (entries.length === 0) return alert('No archive items to synthesise yet')
    const subjectName = viewMode === 'artist' ? activeArtist?.name : activeSubject
    setSynthText('')
    setSynthLoading(true)
    setModal('synthesis')
    try {
      const itemsBlock = entries.map((e, i) => \`[\${i+1}] (\${e.type}) \${e.title}
Date: \${e.date||'—'} | Source: \${e.source||'—'}
\${e.description ? 'Description: ' + e.description.slice(0,1000) : ''}
Tags: \${(e.tags||[]).join(', ')||'none'}\`).join('\\n---\\n')

      const prompt = \`You are a research assistant for Hourglass Gallery, Lagos, preparing background material to support a provenance document for: "\${subjectName}".

Using ONLY the archive materials below, write a structured research synthesis with these sections:
1. OVERVIEW — who/what this is and why it matters
2. DOCUMENTED HISTORY — chronological account drawn directly from the sources, citing each source by title
3. KEY THEMES — recurring ideas or patterns across the materials
4. GAPS — what is not yet documented that would strengthen a provenance case
5. SOURCES CONSULTED — list each archive item with its source and date

Be precise and conservative. Do not state anything as fact unless it is directly supported by the materials below. This will inform, not replace, a formal provenance chain.

ARCHIVE MATERIALS:
\${itemsBlock}\`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1800, messages: [{ role: 'user', content: prompt }] })
      })
      const data = await res.json()
      const text = data.content?.map(b => b.text || '').join('') || 'No response generated.'
      setSynthText(text)
    } catch (err) {
      setSynthText('Synthesis failed: ' + err.message)
    } finally {
      setSynthLoading(false)
    }
  }`,
  '6. Add runSynthesis function'
)

// 7. Replace the rail's title/search/list block with an Artist/Subject toggle version
mustReplace(
  `        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line)' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1rem', marginBottom:8 }}>Live Archive</div>
          <input
            className="form-input"
            style={{ fontSize:12 }}
            placeholder="Search artists…"
            value={artistSearch}
            onChange={e => setArtistSearch(e.target.value)}
          />
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {filteredArtists.map(a => (
            <div key={a.id}
              onClick={() => selectArtist(a.id)}
              style={{ padding:'8px 14px', cursor:'pointer', fontSize:13,
                       borderLeft:\`3px solid \${a.id===activeArtistId?'var(--gold)':'transparent'}\`,
                       background: a.id===activeArtistId ? 'var(--parchment)' : 'transparent' }}>
              <div style={{ fontWeight: a.id===activeArtistId?500:400 }}>{a.name}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{a.nationality||''}</div>
            </div>
          ))}
        </div>`,
  `        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--line)' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1rem', marginBottom:8 }}>Live Archive</div>
          <div style={{ display:'flex', gap:0, marginBottom:8, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
            {[['artist','Artists'],['subject','Subjects']].map(([key,label]) => (
              <button key={key} onClick={() => setViewMode(key)}
                style={{ flex:1, padding:'5px 8px', fontSize:11, cursor:'pointer', border:'none',
                         background: viewMode===key ? 'var(--ink)' : 'var(--white)',
                         color: viewMode===key ? 'var(--white)' : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>
          {viewMode === 'artist' ? (
            <input
              className="form-input"
              style={{ fontSize:12 }}
              placeholder="Search artists…"
              value={artistSearch}
              onChange={e => setArtistSearch(e.target.value)}
            />
          ) : (
            <div style={{ display:'flex', gap:6 }}>
              <input
                className="form-input"
                style={{ fontSize:12, flex:1 }}
                placeholder="Search subjects…"
                value={subjectSearch}
                onChange={e => setSubjectSearch(e.target.value)}
              />
              <button className="btn btn-outline btn-sm" style={{ padding:'4px 8px', fontSize:16, lineHeight:1 }} onClick={newSubject} title="New subject">+</button>
            </div>
          )}
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {viewMode === 'artist' ? filteredArtists.map(a => (
            <div key={a.id}
              onClick={() => selectArtist(a.id)}
              style={{ padding:'8px 14px', cursor:'pointer', fontSize:13,
                       borderLeft:\`3px solid \${a.id===activeArtistId?'var(--gold)':'transparent'}\`,
                       background: a.id===activeArtistId ? 'var(--parchment)' : 'transparent' }}>
              <div style={{ fontWeight: a.id===activeArtistId?500:400 }}>{a.name}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{a.nationality||''}</div>
            </div>
          )) : subjects.filter(s => !subjectSearch || s.toLowerCase().includes(subjectSearch.toLowerCase())).map(s => (
            <div key={s}
              onClick={() => selectSubject(s)}
              style={{ padding:'8px 14px', cursor:'pointer', fontSize:13,
                       borderLeft:\`3px solid \${s===activeSubject?'var(--gold)':'transparent'}\`,
                       background: s===activeSubject ? 'var(--parchment)' : 'transparent' }}>
              <div style={{ fontWeight: s===activeSubject?500:400 }}>{s}</div>
            </div>
          ))}
          {viewMode === 'subject' && subjects.length === 0 && (
            <div style={{ padding:'16px 14px', fontSize:12, color:'var(--muted)' }}>No subjects yet — click + to create one</div>
          )}
        </div>`,
  '7. Rail: add Artist/Subject toggle'
)

// 8. Update the "no artist selected" placeholder to also handle subject mode, and the header to show subject name + synthesis button
mustReplace(
  `        {!activeArtistId ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', marginBottom:8 }}>Select an artist</div>
              <p style={{ fontSize:13 }}>Choose from the index to view their archive</p>
            </div>
          </div>
        ) : (<>`,
  `        {(!activeArtistId && !activeSubject) ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', marginBottom:8 }}>Select an artist or subject</div>
              <p style={{ fontSize:13 }}>Choose from the index to view the archive</p>
            </div>
          </div>
        ) : (<>`,
  '8. Update empty-state for subject mode'
)

// 9. Update header title and buttons to work for both artist and subject
mustReplace(
  `              <div>
                <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.15rem' }}>{activeArtist?.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {entries.length} archive items · {artworks.length} works · {entries.filter(e=>e.starred).length} key refs
                </div>
              </div>
              <div style={{ display:'flex', gap:7 }}>
                <button className="btn btn-outline btn-sm" onClick={openAddArtwork}>+ Add artwork</button>
                <button className="btn btn-primary btn-sm" onClick={() => openAddEntry()}>+ Add to archive</button>
              </div>`,
  `              <div>
                <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.15rem' }}>{viewMode==='artist' ? activeArtist?.name : activeSubject}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {entries.length} archive items{viewMode==='artist' ? \` · \${artworks.length} works\` : ''} · {entries.filter(e=>e.starred).length} key refs
                </div>
              </div>
              <div style={{ display:'flex', gap:7 }}>
                {viewMode === 'artist' && <button className="btn btn-outline btn-sm" onClick={openAddArtwork}>+ Add artwork</button>}
                <button className="btn btn-outline btn-sm" onClick={runSynthesis} disabled={entries.length===0}>&#10024; Synthesise</button>
                <button className="btn btn-primary btn-sm" onClick={() => openAddEntry()}>+ Add to archive</button>
              </div>`,
  '9. Header: subject-aware title, synthesise button'
)

// 10. Insert the Synthesis modal right before the Add/Edit Entry modal comment
mustReplace(
  `      {/* ── Add / Edit Archive Entry ── */}`,
  `      {/* ── AI Synthesis ── */}
      {modal === 'synthesis' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">&#10024; Synthesis — {viewMode==='artist' ? activeArtist?.name : activeSubject}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {synthLoading ? (
                <div style={{ textAlign:'center', padding:'40px 0', color:'var(--muted)' }}>Reading archive materials and drafting synthesis…</div>
              ) : (
                <div style={{ fontSize:13, lineHeight:1.8, whiteSpace:'pre-wrap', color:'var(--ink)' }}>{synthText}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { navigator.clipboard.writeText(synthText); toast('Copied to clipboard') }} disabled={synthLoading || !synthText}>Copy text</button>
              <button className="btn btn-primary" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Archive Entry ── */}`,
  '10. Insert Synthesis modal'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
