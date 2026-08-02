import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('galleryArtistSearch')) { console.log('Already patched'); process.exit(0) }

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

// 1. Replace the simple prompt-based newArtist with a proper two-path modal flow
mustReplace(
  `  async function newArtist() {
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
  `  const [galleryArtistSearch, setGalleryArtistSearch] = useState('')
  const [externalArtistName, setExternalArtistName] = useState('')

  function newArtist() {
    setGalleryArtistSearch('')
    setExternalArtistName('')
    setModal('newArtistChoice')
  }

  function pickGalleryArtist(id) {
    setModal(null)
    selectArtist(id)
    openAddEntry()
  }

  async function createExternalArtist() {
    const trimmed = externalArtistName.trim()
    if (!trimmed) return alert('Enter a name')
    // Guard against accidental duplicates even for external artists
    const existing = artists.find(a => a.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!confirm(\`"\${existing.name}" already exists in the gallery database. Use that record instead?\`)) return
      pickGalleryArtist(existing.id)
      return
    }
    const { data, error } = await supabase.from('artists').insert({ name: trimmed, is_external: true }).select().single()
    if (error) { alert('Could not create artist: ' + error.message); return }
    setArtists(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)))
    setModal(null)
    selectArtist(data.id)
    openAddEntry()
  }`,
  '1. Replace newArtist with two-path flow'
)

// 2. Insert the new modals (choice screen + gallery picker + external form) right before the Synthesis modal comment
mustReplace(
  `      {/* ── AI Synthesis ── */}`,
  `      {/* ── New Artist: choose path ── */}
      {modal === 'newArtistChoice' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <div className="modal-title">Add artist to archive</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button className="btn btn-outline" style={{ justifyContent:'flex-start', padding:'14px 16px', textAlign:'left' }}
                onClick={() => setModal('pickGalleryArtist')}>
                <div style={{ fontWeight:500, marginBottom:3 }}>Gallery artist</div>
                <div style={{ fontSize:11, color:'var(--muted)', fontWeight:400 }}>Search artists already in the gallery database</div>
              </button>
              <button className="btn btn-outline" style={{ justifyContent:'flex-start', padding:'14px 16px', textAlign:'left' }}
                onClick={() => setModal('addExternalArtist')}>
                <div style={{ fontWeight:500, marginBottom:3 }}>External artist</div>
                <div style={{ fontSize:11, color:'var(--muted)', fontWeight:400 }}>Someone not represented by the gallery — for research or comparison</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Artist: pick from gallery roster ── */}
      {modal === 'pickGalleryArtist' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Select gallery artist</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <input
                className="form-input"
                placeholder="Search by name…"
                value={galleryArtistSearch}
                onChange={e => setGalleryArtistSearch(e.target.value)}
                autoFocus
              />
              <div style={{ maxHeight:320, overflowY:'auto', border:'1px solid var(--line)', borderRadius:3 }}>
                {artists
                  .filter(a => !a.is_external)
                  .filter(a => !galleryArtistSearch || a.name.toLowerCase().includes(galleryArtistSearch.toLowerCase()))
                  .map(a => (
                    <div key={a.id}
                      onClick={() => pickGalleryArtist(a.id)}
                      style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--parchment)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontSize:13 }}>{a.name}</div>
                      {archiveArtistIds.includes(a.id) && (
                        <span style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Already in archive</span>
                      )}
                    </div>
                  ))}
                {artists.filter(a => !a.is_external && (!galleryArtistSearch || a.name.toLowerCase().includes(galleryArtistSearch.toLowerCase()))).length === 0 && (
                  <div style={{ padding:'16px 12px', fontSize:12, color:'var(--muted)', textAlign:'center' }}>No matching artists found</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal('newArtistChoice')}>Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Artist: create external ── */}
      {modal === 'addExternalArtist' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <div className="modal-title">Add external artist</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 12px', background:'var(--parchment)', borderRadius:3 }}>
                For artists not represented by the gallery — used for research and comparison only. Won't appear in artwork or invoice artist pickers.
              </div>
              <div className="form-group">
                <label className="form-label">Artist name *</label>
                <input className="form-input" value={externalArtistName} onChange={e=>setExternalArtistName(e.target.value)} placeholder="Full name" autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal('newArtistChoice')}>Back</button>
              <button className="btn btn-primary" onClick={createExternalArtist}>Create & add to archive</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Synthesis ── */}`,
  '2. Insert new artist modals'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
