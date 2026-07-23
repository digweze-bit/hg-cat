import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('hideLocationCol')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add flags after title/subtitle calculation
const anchor = `  const subtitle = [
    filters.availability && \`Status: \${filters.availability}\`,
    filters.ownership && \`Ownership: \${filters.ownership}\`,
    filters.search && \`Search: "\${filters.search}"\`,
  ].filter(Boolean).join(' · ')`

if (!src.includes(anchor)) { console.error('subtitle anchor not found'); process.exit(1) }
src = src.replace(anchor, anchor + `

  const hideLocationCol = !!filters.location
  const hideArtistCol = !!filters.artist`)

// 2. Update table header to conditionally include Location/Artist columns
const oldHeader = `<thead><tr><th>#</th><th></th><th>Title</th><th>Artist</th><th>Year</th><th>Medium</th><th>Dimensions</th><th>Location</th><th>Status</th><th>Price</th></tr></thead>`

if (!src.includes(oldHeader)) { console.error('Header anchor not found'); process.exit(1) }
const newHeader = `<thead><tr><th>#</th><th></th><th>Title</th>\${hideArtistCol ? '' : '<th>Artist</th>'}<th>Year</th><th>Medium</th><th>Dimensions</th>\${hideLocationCol ? '' : '<th>Location</th>'}<th>Status</th><th>Price</th></tr></thead>`
src = src.replace(oldHeader, newHeader)

// 3. Update row generation to conditionally include Artist/Location cells
const oldRowMiddle = `      <td><strong>\${escH(w.title)}</strong>\${w.series ? \`<br><span style="color:#888;font-size:10px">\${escH(w.series)}</span>\` : ''}</td>
      <td>\${escH(artistMap[w.artist_id]?.name || '—')}</td>
      <td>\${escH(w.year || '—')}</td>
      <td>\${escH(w.medium || '—')}</td>
      <td>\${escH(w.dimensions || '—')}</td>
      <td>\${escH(w.location || '—')}</td>
      <td style="color:\${w.availability === 'Available' ? '#2d6a4f' : w.availability === 'Sold' ? '#8b1a1a' : '#92600a'};font-weight:500">\${escH(w.availability || '—')}</td>
      <td>\${escH(w.price || '—')}</td>
    </tr>\`).join('')`

if (!src.includes(oldRowMiddle)) { console.error('Row middle anchor not found'); process.exit(1) }
const newRowMiddle = `      <td><strong>\${escH(w.title)}</strong>\${w.series ? \`<br><span style="color:#888;font-size:10px">\${escH(w.series)}</span>\` : ''}</td>
      \${hideArtistCol ? '' : \`<td>\${escH(artistMap[w.artist_id]?.name || '—')}</td>\`}
      <td>\${escH(w.year || '—')}</td>
      <td>\${escH(w.medium || '—')}</td>
      <td>\${escH(w.dimensions || '—')}</td>
      \${hideLocationCol ? '' : \`<td>\${escH(w.location || '—')}</td>\`}
      <td style="color:\${w.availability === 'Available' ? '#2d6a4f' : w.availability === 'Sold' ? '#8b1a1a' : '#92600a'};font-weight:500">\${escH(w.availability || '—')}</td>
      <td>\${escH(w.price || '—')}</td>
    </tr>\`).join('')`

src = src.replace(oldRowMiddle, newRowMiddle)

// 4. Make the header title more prominent (already shows location/artist name) - increase size
src = src.replace(
  '.report-title{font-size:14px;font-weight:600;margin:8px 0 2px;}',
  '.report-title{font-family:Georgia,serif;font-size:22px;font-weight:400;margin:8px 0 4px;}'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
