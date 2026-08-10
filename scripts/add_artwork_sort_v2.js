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
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error('---'); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add artworkSort state
mustReplace(
  "  const [mediumFilter, setMediumFilter] = useState('')",
  "  const [mediumFilter, setMediumFilter] = useState('')\n  const [artworkSort, setArtworkSort] = useState('title')",
  '1. Add artworkSort state'
)

// 2. Add sort to filteredWorks
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
  '2. Add sort to filteredWorks'
)

// 3. Insert sort pills between the filter div closing and the Works grid
mustReplace(
  `          </div>

          {/* Works grid */}`,
  `          </div>

          {/* Sort */}
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            {[['title','A \\u2013 Z'],['year_desc','Newest'],['year_asc','Oldest'],['recent','Recently added']].map(([key,label]) => (
              <button key={key} onClick={() => setArtworkSort(key)}
                style={{ padding:'4px 12px', fontSize:11, borderRadius:14, cursor:'pointer',
                  border: artworkSort===key ? '1px solid #1a1714' : '1px solid #e0dbd5',
                  background: artworkSort===key ? '#1a1714' : 'transparent',
                  color: artworkSort===key ? '#fff' : '#999', fontFamily:'inherit' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Works grid */}`,
  '3. Insert sort pills'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
