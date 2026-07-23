import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('class="thumb-cell"')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add thumbnail cell to each row
const oldRow = `  const rows = artworks.map((w, i) => \`
    <tr>
      <td>\${i + 1}</td>
      <td><strong>\${escH(w.title)}</strong>\${w.series ? \`<br><span style="color:#888;font-size:10px">\${escH(w.series)}</span>\` : ''}</td>`

const newRow = `  const rows = artworks.map((w, i) => \`
    <tr>
      <td>\${i + 1}</td>
      <td class="thumb-cell">\${(w.thumbnail_url || w.image_url) ? \`<img src="\${w.thumbnail_url || w.image_url}" class="thumb-img" />\` : '<div class="thumb-placeholder"></div>'}</td>
      <td><strong>\${escH(w.title)}</strong>\${w.series ? \`<br><span style="color:#888;font-size:10px">\${escH(w.series)}</span>\` : ''}</td>`

if (!src.includes(oldRow)) { console.error('Row anchor not found'); process.exit(1) }
src = src.replace(oldRow, newRow)

// 2. Add thumbnail column header
src = src.replace(
  '<thead><tr><th>#</th><th>Title</th>',
  '<thead><tr><th>#</th><th></th><th>Title</th>'
)

// 3. Add CSS for thumbnail cell
const oldStyle = 'tr:nth-child(even) td{background:#faf9f7;}'
if (!src.includes(oldStyle)) { console.error('Style anchor not found'); process.exit(1) }
src = src.replace(
  oldStyle,
  `tr:nth-child(even) td{background:#faf9f7;}
.thumb-cell{width:52px;padding:6px !important;}
.thumb-img{width:44px;height:44px;object-fit:cover;border-radius:2px;display:block;}
.thumb-placeholder{width:44px;height:44px;background:#ece8e1;border-radius:2px;}`
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
