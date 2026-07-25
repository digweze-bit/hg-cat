import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

const oldRow = `  <td class="td-title">
    <em style="font-style:italic;font-size:12px;color:#1a1714"></em>

    \${it.year?'<br><span style="font-size:11px;color:#aaa">'+e(it.year)+'</span>':''}
    \${it.medium?'<br><span style="font-size:11px;color:#aaa">'+e(it.medium)+'</span>':''}\${it.dimensions?'<br><span style="font-size:11px;color:#aaa">'+e(it.dimensions)+'</span>':''}
  </td>`

if (!src.includes(oldRow)) {
  console.error('Exact row not found - trying broader search')
  const idx = src.indexOf('<td class="td-title">')
  if (idx < 0) { console.error('td-title not found at all'); process.exit(1) }
  console.log('Context around td-title:')
  console.log(src.slice(idx, idx + 600))
  process.exit(1)
}

const newRow = `  <td class="td-title">
    <em style="font-style:italic;font-size:12px;color:#1a1714">\${e(it.title)}</em>
    \${it.artist_name?'<br><span style="font-size:11px;color:#6b6760">'+e(it.artist_name)+'</span>':''}
    \${it.year?'<br><span style="font-size:11px;color:#aaa">'+e(it.year)+'</span>':''}
    \${it.medium?'<br><span style="font-size:11px;color:#aaa">'+e(it.medium)+'</span>':''}
    \${it.dimensions?'<br><span style="font-size:11px;color:#aaa">'+e(it.dimensions)+'</span>':''}
  </td>`

src = src.replace(oldRow, newRow)

// Also remove the duplicate td{padding} CSS rule
src = src.replace(
  'td{padding:14px 8px;border-bottom:1px solid #ece8e1;vertical-align:middle;}\ntd{padding:10px 8px;border-bottom:1px solid #ece8e1;vertical-align:middle;}',
  'td{padding:14px 8px;border-bottom:1px solid #ece8e1;vertical-align:middle;}'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Fixed invoice row - title and artist name restored')
