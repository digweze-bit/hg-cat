import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Catalogue.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('artworkSort')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,120)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add artworkSort state after mediumFilter/availFilter
mustReplace(
  `  const [mediumFilter, setMediumFilter] = useState('')`,
  `  const [mediumFilter, setMediumFilter] = useState('')
  const [artworkSort, setArtworkSort] = useState('title') // 'title' | 'year_desc' | 'year_asc' | 'recent'`,
  '1. Add artworkSort state'
)

// 2. Apply sort to filteredWorks
mustReplace(
  `    if (!activeArtist) return []
    return artworks.filter(w => {
      if (w.artist_id !== activeArtist.id) return false
      if (mediumFilter && w.medium !== mediumFilter) return false
      if (availFilter && w.availability !== availFilter) return false
      return true
    })
  }, [artworks, activeArtist, mediumFilter, availFilter])`,
  `    if (!activeArtist) return []
    let list = artworks.filter(w => {
      if (w.artist_id !== activeArtist.id) return false
      if (mediumFilter && w.medium !== mediumFilter) return false
      if (availFilter && w.availability !== availFilter) return false
      return true
    })
    if (artworkSort === 'title') list.sort((a,b) => (a.title||'').localeCompare(b.title||''))
    else if (artworkSort === 'year_desc') list.sort((a,b) => (Number(b.year)||0) - (Number(a.year)||0))
    else if (artworkSort === 'year_asc') list.sort((a,b) => (Number(a.year)||0) - (Number(b.year)||0))
    else if (artworkSort === 'recent') list.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    return list
  }, [artworks, activeArtist, mediumFilter, availFilter, artworkSort])`,
  '2. Apply sort to filteredWorks'
)

// 3. Find where the medium filter pills render and add sort pills after them
// Look for the mediumFilter buttons section
mustReplace(
  `  const mediums = useMemo(() => {
    if (!activeArtist) return []
    return [...new Set(artworks.filter(w => w.artist_id === activeArtist.id).map(w => w.medium).filter(Boolean))].sort()
  }, [artworks, activeArtist])`,
  `  const mediums = useMemo(() => {
    if (!activeArtist) return []
    return [...new Set(artworks.filter(w => w.artist_id === activeArtist.id).map(w => w.medium).filter(Boolean))].sort()
  }, [artworks, activeArtist])

  const ARTWORK_SORTS = [
    ['title', 'A \\u2013 Z'],
    ['year_desc', 'Newest first'],
    ['year_asc', 'Oldest first'],
    ['recent', 'Recently added'],
  ]`,
  '3. Add sort options constant'
)

// 4. Find the medium filter rendering in the JSX and add sort pills nearby
// Look for mediumFilter buttons rendering
const mediumPillsAnchor = `{mediums.length > 1 && (`
if (!src.includes(mediumPillsAnchor)) {
  console.error('NOT FOUND: Medium pills anchor')
  // Try to find where filtered works are rendered
  const altAnchor = `{filteredWorks.map(`
  if (src.includes(altAnchor)) {
    src = src.replace(altAnchor, `{/* Sort pills */}
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:10, color:'#999', textTransform:'uppercase', letterSpacing:'.06em' }}>Sort:</span>
                {ARTWORK_SORTS.map(([key,label]) => (
                  <button key={key} onClick={() => setArtworkSort(key)}
                    style={{ padding:'3px 10px', fontSize:11, borderRadius:14, cursor:'pointer', border: artworkSort===key ? '1px solid #1a1714' : '1px solid #e0dbd5',
                      background: artworkSort===key ? '#1a1714' : 'transparent', color: artworkSort===key ? '#fff' : '#999', fontFamily:'inherit' }}>
                    {label}
                  </button>
                ))}
              </div>

              {filteredWorks.map(`)
    console.log('OK: 4. Added sort pills (alt anchor)')
  } else {
    console.error('NOT FOUND: filteredWorks.map anchor either')
    process.exit(1)
  }
} else {
  // Add sort pills after medium filter section
  // Find the closing of the medium filter section
  const mediumSectionEnd = src.indexOf(`)}`, src.indexOf(mediumPillsAnchor) + 100)
  if (mediumSectionEnd > 0) {
    const insertPoint = src.indexOf('\n', mediumSectionEnd + 2)
    const sortPills = `
              {/* Sort */}
              <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:10, color:'#999', textTransform:'uppercase', letterSpacing:'.06em' }}>Sort:</span>
                {ARTWORK_SORTS.map(([key,label]) => (
                  <button key={key} onClick={() => setArtworkSort(key)}
                    style={{ padding:'3px 10px', fontSize:11, borderRadius:14, cursor:'pointer', border: artworkSort===key ? '1px solid #1a1714' : '1px solid #e0dbd5',
                      background: artworkSort===key ? '#1a1714' : 'transparent', color: artworkSort===key ? '#fff' : '#999', fontFamily:'inherit' }}>
                    {label}
                  </button>
                ))}
              </div>`
    src = src.slice(0, insertPoint) + sortPills + src.slice(insertPoint)
    console.log('OK: 4. Added sort pills (after medium filter)')
  }
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
