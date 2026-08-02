import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/CatalogueBuilder.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('availOnly')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.error('ANCHOR NOT FOUND: ' + label)
    console.error('--- Looking for ---')
    console.error(oldStr.slice(0, 200))
    process.exit(1)
  }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add new state variables after showNotes
mustReplace(
  `  const [showNotes, setShowNotes] = useState(false)`,
  `  const [showNotes, setShowNotes] = useState(false)
  const [availOnly, setAvailOnly] = useState(true)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [batchSize, setBatchSize] = useState(40) // 20 | 40 | 'all'`,
  '1. Add filter/view/batch state'
)

// 2. Update filtered to respect availOnly and remove search-required gate
mustReplace(
  `  const filtered = search.trim()
    ? artworks.filter(w => {
        const q = search.toLowerCase()
        const artist = artistMap[w.artist_id]?.name || ''
        return w.title?.toLowerCase().includes(q) ||
          artist.toLowerCase().includes(q) ||
          w.hg_code?.toLowerCase().includes(q) ||
          w.medium?.toLowerCase().includes(q)
      })
    : []`,
  `  const filtered = artworks.filter(w => {
    if (availOnly && w.availability !== 'Available') return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const artist = artistMap[w.artist_id]?.name || ''
    return w.title?.toLowerCase().includes(q) ||
      artist.toLowerCase().includes(q) ||
      w.hg_code?.toLowerCase().includes(q) ||
      w.medium?.toLowerCase().includes(q)
  })
  const displayLimit = batchSize === 'all' ? filtered.length : Number(batchSize)`,
  '2. Update filtered logic'
)

// 3. Replace the search input and results section
mustReplace(
  `          <input
            className="form-input"
            style={{ marginBottom: 12, fontSize: 14 }}
            placeholder="Search by artist, title, medium, HG code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {search.trim() && (
            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 4, marginBottom: 16 }}>
              {filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results</div>
              )}
              {filtered.slice(0, 100).map(w => {
                const isSelected = selected.some(s => s.id === w.id)
                return (
                  <div key={w.id}
                    onClick={() => toggleSelect(w)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      cursor: 'pointer', borderBottom: '1px solid var(--line-soft)',
                      background: isSelected ? 'var(--parchment)' : 'transparent',
                    }}>
                    {w.thumbnail_url || w.image_url
                      ? <img src={w.thumbnail_url || w.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, background: 'var(--parchment-2)', borderRadius: 2, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{artistMap[w.artist_id]?.name || ''}{w.year ? ' \\u00b7 ' + w.year : ''}</div>
                    </div>
                    <div style={{ fontSize: 18, color: isSelected ? 'var(--green,#27ae60)' : 'var(--line)', flexShrink: 0 }}>
                      {isSelected ? '\\u2713' : '\\u25cb'}
                    </div>
                  </div>
                )
              })}
              {filtered.length > 100 && (
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  Showing first 100 of {filtered.length} results — narrow your search
                </div>
              )}
            </div>
          )}`,
  `          {/* Search bar + controls */}
          <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
            <input
              className="form-input"
              style={{ flex:1, minWidth:180, fontSize:14 }}
              placeholder="Search by artist, title, medium, HG code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
              <input type="checkbox" checked={availOnly} onChange={e => setAvailOnly(e.target.checked)} />
              Available only
            </label>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
            <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
              {[['grid','Grid'],['list','List']].map(([k,l]) => (
                <button key={k} onClick={() => setViewMode(k)}
                  style={{ padding:'4px 10px', fontSize:10, cursor:'pointer', border:'none',
                    background: viewMode===k ? 'var(--ink)' : 'var(--white)',
                    color: viewMode===k ? '#fff' : 'var(--muted)' }}>{l}</button>
              ))}
            </div>
            <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
              {[['20','20'],['40','40'],['all','All']].map(([k,l]) => (
                <button key={k} onClick={() => setBatchSize(k==='all'?'all':Number(k))}
                  style={{ padding:'4px 10px', fontSize:10, cursor:'pointer', border:'none',
                    background: String(batchSize)===k ? 'var(--ink)' : 'var(--white)',
                    color: String(batchSize)===k ? '#fff' : 'var(--muted)' }}>{l}</button>
              ))}
            </div>
            <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>{filtered.length} results</span>
          </div>

          {/* Results — Grid or List */}
          <div style={{ maxHeight:480, overflowY:'auto', border:'1px solid var(--line)', borderRadius:4, marginBottom:16 }}>
            {filtered.length === 0 && (
              <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No results</div>
            )}
            {viewMode === 'grid' ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(100px, 1fr))', gap:6, padding:8 }}>
                {filtered.slice(0, displayLimit).map(w => {
                  const isSelected = selected.some(s => s.id === w.id)
                  return (
                    <div key={w.id} onClick={() => toggleSelect(w)}
                      style={{ cursor:'pointer', position:'relative', borderRadius:4,
                        border: isSelected ? '2px solid var(--green,#27ae60)' : '2px solid transparent',
                        overflow:'hidden' }}>
                      {(w.thumbnail_url || w.image_url)
                        ? <img src={w.thumbnail_url || w.image_url} alt="" loading="lazy"
                            style={{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' }} />
                        : <div style={{ width:'100%', aspectRatio:'1', background:'var(--parchment-2)' }} />
                      }
                      {isSelected && (
                        <div style={{ position:'absolute', top:4, right:4, width:20, height:20, borderRadius:'50%',
                          background:'var(--green,#27ae60)', color:'#fff', display:'flex', alignItems:'center',
                          justifyContent:'center', fontSize:12, fontWeight:700 }}>\\u2713</div>
                      )}
                      <div style={{ padding:'4px 5px', fontSize:9, lineHeight:1.3, overflow:'hidden' }}>
                        <div style={{ fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.title}</div>
                        <div style={{ color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{artistMap[w.artist_id]?.name || ''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              filtered.slice(0, displayLimit).map(w => {
                const isSelected = selected.some(s => s.id === w.id)
                return (
                  <div key={w.id} onClick={() => toggleSelect(w)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                      cursor:'pointer', borderBottom:'1px solid var(--line-soft)',
                      background: isSelected ? 'var(--parchment)' : 'transparent' }}>
                    {(w.thumbnail_url || w.image_url)
                      ? <img src={w.thumbnail_url || w.image_url} alt="" loading="lazy"
                          style={{ width:40, height:40, objectFit:'cover', borderRadius:2, flexShrink:0 }} />
                      : <div style={{ width:40, height:40, background:'var(--parchment-2)', borderRadius:2, flexShrink:0 }} />
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.title}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name || ''}{w.year ? ' \\u00b7 ' + w.year : ''}</div>
                    </div>
                    <div style={{ fontSize:18, color: isSelected ? 'var(--green,#27ae60)' : 'var(--line)', flexShrink:0 }}>
                      {isSelected ? '\\u2713' : '\\u25cb'}
                    </div>
                  </div>
                )
              })
            )}
            {filtered.length > displayLimit && (
              <div style={{ padding:'10px 12px', fontSize:11, color:'var(--muted)', textAlign:'center', borderTop:'1px solid var(--line-soft)' }}>
                Showing {displayLimit} of {filtered.length} — increase batch size or narrow your search
              </div>
            )}
          </div>`,
  '3. Replace search and results section'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
