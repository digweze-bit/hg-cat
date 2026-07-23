import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Catalogue.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('shareArtist')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add useNavigate/useParams imports and sync activeArtist with URL
const importAnchor = "import { useState, useEffect, useMemo } from 'react'"
if (!src.includes(importAnchor)) { console.error('Import anchor not found'); process.exit(1) }
src = src.replace(importAnchor, "import { useState, useEffect, useMemo } from 'react'\nimport { useParams, useNavigate } from 'react-router-dom'")

// 2. Add useParams/useNavigate hooks and sync effect near top of component
const compAnchor = "  const [activeArtist, setActiveArtist] = useState(null)"
if (!src.includes(compAnchor)) { console.error('activeArtist state anchor not found'); process.exit(1) }
src = src.replace(compAnchor, `  const { artistId: urlArtistId } = useParams()
  const navigate = useNavigate()
  const [activeArtist, setActiveArtist] = useState(null)`)

// 3. Sync activeArtist from URL param once artists are loaded
const artistsLoadAnchor = "      setArtists(a)"
if (!src.includes(artistsLoadAnchor)) { console.error('setArtists anchor not found'); process.exit(1) }
src = src.replace(
  artistsLoadAnchor,
  `${artistsLoadAnchor}\n      if (urlArtistId) {\n        const found = a.find(x => x.id === urlArtistId)\n        if (found) setActiveArtist(found)\n      }`
)

// 4. Update setActiveArtist calls to also navigate (open artist -> push URL, close -> pop to /)
// Replace the "Artist List" back button navigation
src = src.replace(
  `onClick={() => { setActiveArtist(null); setSelected(null); setMediumFilter(''); setAvailFilter('') }}`,
  `onClick={() => { setActiveArtist(null); setSelected(null); setMediumFilter(''); setAvailFilter(''); navigate('/') }}`
)

// 5. Add a helper to open an artist and push its URL (find where artist cards are clicked in the index view)
// Search for onClick that sets activeArtist to an artist row
const cardClickPattern = /onClick=\{\(\) => setActiveArtist\((\w+)\)\}/g
src = src.replace(cardClickPattern, (m, varName) => `onClick={() => { setActiveArtist(${varName}); navigate(\`/artist/\${${varName}.id}\`) }}`)

// 6. Add shareArtist function and Share button next to work count in header
const headerAnchor = `          <div style={{ marginLeft:'auto', fontSize:13, color:'#999' }}>{wc} work{wc !== 1 ? 's' : ''}</div>
        </div>`

const newHeader = `          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
            <span style={{ fontSize:13, color:'#999' }}>{wc} work{wc !== 1 ? 's' : ''}</span>
            <button onClick={() => shareArtist(activeArtist)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:3, border:'1px solid #25D366', background:'#fff', color:'#25D366', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              Share
            </button>
          </div>
        </div>`

if (!src.includes(headerAnchor)) { console.error('Header anchor not found'); process.exit(1) }
src = src.replace(headerAnchor, newHeader)

// 7. Add shareArtist function before the "ARTIST DETAIL VIEW" comment
const detailViewAnchor = src.match(/\/\/[^\n]*ARTIST DETAIL VIEW[^\n]*\n/)
if (!detailViewAnchor) { console.error('ARTIST DETAIL VIEW comment not found'); process.exit(1) }
const shareFn = `function shareArtist(artist) {
    const url = \`\${window.location.origin}/artist/\${artist.id}\`
    const text = \`*\${artist.name}*\${artist.nationality ? ', ' + artist.nationality : ''}\\n\\n\${url}\`
    if (navigator.share) {
      navigator.share({ title: artist.name, text, url }).catch(() => {})
    } else {
      window.open(\`https://wa.me/?text=\${encodeURIComponent(text)}\`, '_blank')
    }
  }

  `
src = src.replace(detailViewAnchor[0], shareFn + detailViewAnchor[0])

// 8. Fix bio rendering — split into paragraphs, remove truncation, add spacing
const oldBio = `              {activeArtist.bio && (
                <p style={{ fontSize:13, color:'#555', lineHeight:1.75, maxWidth:640, margin:0 }}>
                  {activeArtist.bio.slice(0, 300)}{activeArtist.bio.length > 300 ? '\\u2026' : ''}
                </p>
              )}`

const newBio = `              {activeArtist.bio && (
                <div style={{ maxWidth:640 }}>
                  {activeArtist.bio.split(/\\n\\s*\\n/).map((para, i) => (
                    <p key={i} style={{ fontSize:13, color:'#555', lineHeight:1.75, margin: i === 0 ? 0 : '12px 0 0' }}>
                      {para.trim()}
                    </p>
                  ))}
                </div>
              )}`

if (!src.includes(oldBio)) { console.error('Bio block anchor not found'); process.exit(1) }
src = src.replace(oldBio, newBio)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Catalogue.jsx patched successfully')
