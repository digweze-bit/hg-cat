import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('archiveArtistIds')) { console.log('Already patched'); process.exit(0) }

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

// 1. Add archiveArtistIds state right after subjects state
mustReplace(
  `  const [subjects, setSubjects] = useState([])`,
  `  const [subjects, setSubjects] = useState([])
  const [archiveArtistIds, setArchiveArtistIds] = useState([])`,
  '1. Add archiveArtistIds state'
)

// 2. Add loadArchiveArtistIds function and call it, right after loadSubjects definition + its useEffect
mustReplace(
  `  function loadSubjects() {
    supabase.from('archive_entries').select('subject').not('subject', 'is', null).then(({ data }) => {
      const uniq = [...new Set((data || []).map(d => d.subject).filter(Boolean))].sort()
      setSubjects(uniq)
    })
  }
  useEffect(() => { loadSubjects() }, [])`,
  `  function loadSubjects() {
    supabase.from('archive_entries').select('subject').not('subject', 'is', null).then(({ data }) => {
      const uniq = [...new Set((data || []).map(d => d.subject).filter(Boolean))].sort()
      setSubjects(uniq)
    })
  }
  useEffect(() => { loadSubjects() }, [])

  // ── Load which artists actually have archive material
  function loadArchiveArtistIds() {
    supabase.from('archive_entries').select('artist_id').not('artist_id', 'is', null).then(({ data }) => {
      const uniq = [...new Set((data || []).map(d => d.artist_id).filter(Boolean))]
      setArchiveArtistIds(uniq)
    })
  }
  useEffect(() => { loadArchiveArtistIds() }, [])`,
  '2. Add loadArchiveArtistIds'
)

// 3. Update filteredArtists to only include artists with archive material
mustReplace(
  `  const filteredArtists = artists.filter(a => !artistSearch || a.name.toLowerCase().includes(artistSearch.toLowerCase()))`,
  `  const filteredArtists = artists.filter(a => archiveArtistIds.includes(a.id) && (!artistSearch || a.name.toLowerCase().includes(artistSearch.toLowerCase())))`,
  '3. Filter artists to those with archive material'
)

// 4. Add newArtist function right after newSubject function
mustReplace(
  `  function newSubject() {
    const name = window.prompt('New subject name (e.g. "Zaria Rebels", "Natural Synthesis"):')
    if (!name || !name.trim()) return
    selectSubject(name.trim())
    openAddEntry()
  }`,
  `  function newSubject() {
    const name = window.prompt('New subject name (e.g. "Zaria Rebels", "Natural Synthesis"):')
    if (!name || !name.trim()) return
    selectSubject(name.trim())
    openAddEntry()
  }

  async function newArtist() {
    const name = window.prompt('Artist name:')
    if (!name || !name.trim()) return
    const trimmed = name.trim()
    // Check if this artist already exists (case-insensitive) to avoid duplicates
    const existing = artists.find(a => a.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      selectArtist(existing.id)
      openAddEntry()
      return
    }
    const { data, error } = await supabase.from('artists').insert({ name: trimmed }).select().single()
    if (error) { alert('Could not create artist: ' + error.message); return }
    setArtists(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)))
    selectArtist(data.id)
    openAddEntry()
  }`,
  '4. Add newArtist function'
)

// 5. Refresh archiveArtistIds after saving an entry in artist mode (mirror the subject refresh)
mustReplace(
  `        const { data } = await supabase.from('archive_entries').insert(payload).select().single()
        setEntries(prev => [data, ...prev])
        if (viewMode === 'subject') loadSubjects()`,
  `        const { data } = await supabase.from('archive_entries').insert(payload).select().single()
        setEntries(prev => [data, ...prev])
        if (viewMode === 'subject') loadSubjects()
        if (viewMode === 'artist') loadArchiveArtistIds()`,
  '5. Refresh archiveArtistIds after save'
)

// 6. Add "+ New artist" button next to the artist search input
mustReplace(
  `          {viewMode === 'artist' ? (
            <input
              className="form-input"
              style={{ fontSize:12 }}
              placeholder="Search artists…"
              value={artistSearch}
              onChange={e => setArtistSearch(e.target.value)}
            />
          ) : (`,
  `          {viewMode === 'artist' ? (
            <div style={{ display:'flex', gap:6 }}>
              <input
                className="form-input"
                style={{ fontSize:12, flex:1 }}
                placeholder="Search artists…"
                value={artistSearch}
                onChange={e => setArtistSearch(e.target.value)}
              />
              <button className="btn btn-outline btn-sm" style={{ padding:'4px 8px', fontSize:16, lineHeight:1 }} onClick={newArtist} title="New artist">+</button>
            </div>
          ) : (`,
  '6. Add New artist button'
)

// 7. Add an empty-state message when in artist mode with no archive artists yet
mustReplace(
  `          {viewMode === 'subject' && subjects.length === 0 && (
            <div style={{ padding:'16px 14px', fontSize:12, color:'var(--muted)' }}>No subjects yet — click + to create one</div>
          )}`,
  `          {viewMode === 'subject' && subjects.length === 0 && (
            <div style={{ padding:'16px 14px', fontSize:12, color:'var(--muted)' }}>No subjects yet — click + to create one</div>
          )}
          {viewMode === 'artist' && filteredArtists.length === 0 && (
            <div style={{ padding:'16px 14px', fontSize:12, color:'var(--muted)' }}>No artists in the archive yet — click + to add one</div>
          )}`,
  '7. Add empty-state for artist mode'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
