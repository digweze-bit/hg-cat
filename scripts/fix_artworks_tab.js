import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('visibleArtworks')) { console.log('Already patched'); process.exit(0) }

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

// 1. Add visibleArtworks derived value right after filteredArtists
mustReplace(
  `  const filteredArtists = artists.filter(a => archiveArtistIds.includes(a.id) && (!artistSearch || a.name.toLowerCase().includes(artistSearch.toLowerCase())))`,
  `  const filteredArtists = artists.filter(a => archiveArtistIds.includes(a.id) && (!artistSearch || a.name.toLowerCase().includes(artistSearch.toLowerCase())))
  // Only show artworks that already have provenance or archive material — keeps the list focused
  const visibleArtworks = artworks.filter(w =>
    provenance.some(p => p.artwork_id === w.id) || entries.some(e => e.artwork_id === w.id)
  )`,
  '1. Add visibleArtworks derived list'
)

// 2. Update openAddArtwork to open a chooser modal instead of jumping straight to create-new
mustReplace(
  `  function openAddArtwork() {
    setForm({ title:'', year:'', medium:'', dimensions:'', provNotes:'', notes:'' })
    setModal('addArtwork')
  }`,
  `  const [artworkPickerSearch, setArtworkPickerSearch] = useState('')

  function openAddArtwork() {
    setArtworkPickerSearch('')
    setModal('chooseArtwork')
  }
  function openCreateNewArtwork() {
    setForm({ title:'', year:'', medium:'', dimensions:'', provNotes:'', notes:'' })
    setModal('addArtwork')
  }
  function pickExistingArtwork(id) {
    setModal(null)
    setTab('artworks')
    setDrawer({ type:'artwork', id })
  }`,
  '2. Update openAddArtwork, add pickExistingArtwork'
)

// 3. Use visibleArtworks in the artworks tab list rendering
mustReplace(
  `                <div>
                  {artworks.length === 0
                    ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
                        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', marginBottom:8 }}>No artworks yet</div>
                        <button className="btn btn-outline" onClick={openAddArtwork}>+ Add first artwork</button>
                      </div>
                    : artworks.map(w => {`,
  `                <div>
                  {visibleArtworks.length === 0
                    ? <div style={{ textAlign:'center', padding:'60px 0', color:'var(--muted)' }}>
                        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', marginBottom:8 }}>No documented artworks yet</div>
                        <p style={{ fontSize:12, marginBottom:14 }}>Only works with archive material or provenance appear here</p>
                        <button className="btn btn-outline" onClick={openAddArtwork}>+ Add artwork</button>
                      </div>
                    : visibleArtworks.map(w => {`,
  '3. Use visibleArtworks in list, update empty state'
)

// 4. Insert the artwork chooser modal + updated create-new modal wiring, right before the existing addArtwork modal
mustReplace(
  `      {modal === 'addArtwork' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Add artwork to archive</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>`,
  `      {modal === 'chooseArtwork' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Add artwork to archive</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <input
                className="form-input"
                placeholder="Search available artworks…"
                value={artworkPickerSearch}
                onChange={e => setArtworkPickerSearch(e.target.value)}
                autoFocus
              />
              <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid var(--line)', borderRadius:3 }}>
                {artworks
                  .filter(w => w.availability === 'Available')
                  .filter(w => !visibleArtworks.some(v => v.id === w.id))
                  .filter(w => !artworkPickerSearch || w.title.toLowerCase().includes(artworkPickerSearch.toLowerCase()))
                  .map(w => (
                    <div key={w.id}
                      onClick={() => pickExistingArtwork(w.id)}
                      style={{ padding:'8px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--line-soft)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--parchment)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {w.image_url && <img src={w.image_url} alt="" style={{ width:36, height:36, objectFit:'cover', borderRadius:2 }} />}
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{w.title}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{[w.year, w.medium].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ))}
                {artworks.filter(w => w.availability === 'Available' && !visibleArtworks.some(v => v.id === w.id)).length === 0 && (
                  <div style={{ padding:'16px 12px', fontSize:12, color:'var(--muted)', textAlign:'center' }}>No other available artworks to add</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={openCreateNewArtwork}>+ Create new artwork instead</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'addArtwork' && (
        <div className="modal-overlay" style={{ zIndex:60 }}>
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Create new artwork</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>`,
  '4. Insert artwork chooser modal'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
