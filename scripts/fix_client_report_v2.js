import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// 1. Sort filtered invoices oldest first
const oldSort = "  // Group by currency\n  const byCurrency = {}"
if (!src.includes(oldSort)) { console.error('Sort anchor not found'); process.exit(1) }
src = src.replace(oldSort,
  "  // Sort oldest first\n  filtered = [...filtered].sort((a,b) => (a.issue_date||'').localeCompare(b.issue_date||''))\n\n  // Group by currency\n  const byCurrency = {}")

// 2. Add thumbnail to invoice copy item rows
const oldItemRow = `const itemRows = items.map(it => \`
        <tr>
          <td style='padding:8px 6px'><strong>\${e(it.title)}</strong>\${it.artist_name ? '<br><span style="color:#6b6760;font-size:11px">'+e(it.artist_name)+'</span>' : ''}</td>
          <td style='text-align:right;padding:8px 6px'>\${fmt(it.line_total, inv.currency)}</td>
        </tr>\`).join('')`

if (!src.includes(oldItemRow)) { console.error('Item row anchor not found'); process.exit(1) }

const newItemRow = `const itemRows = items.map(it => {
        const imgSrc = it.thumbnail_url || it.image_url || it.cover_url || ''
        return \`<tr>
          <td style='padding:8px 6px;width:52px;vertical-align:middle'>\${imgSrc ? \`<img src="\${imgSrc}" style="width:44px;height:44px;object-fit:cover;border-radius:2px;display:block">\` : '<div style="width:44px;height:44px;background:#f0ece7;border-radius:2px"></div>'}</td>
          <td style='padding:8px 6px;vertical-align:middle'><strong>\${e(it.title)}</strong>\${it.artist_name ? '<br><span style="color:#6b6760;font-size:11px">'+e(it.artist_name)+'</span>' : ''}\${it.year ? '<br><span style="color:#aaa;font-size:11px">'+e(it.year)+'</span>' : ''}\${it.medium ? '<br><span style="color:#aaa;font-size:11px">'+e(it.medium)+'</span>' : ''}</td>
          <td style='text-align:right;padding:8px 6px;vertical-align:middle'>\${fmt(it.line_total, inv.currency)}</td>
        </tr>\`
      }).join('')`

src = src.replace(oldItemRow, newItemRow)

// 3. Update the table header to add image column
const oldHeader = `<thead><tr style='border-bottom:1px solid #e8e3db'>
              <th style='text-align:left;padding:6px'>Item</th>
              <th style='text-align:right;padding:6px'>Amount</th>
            </tr></thead>`

if (!src.includes(oldHeader)) { console.error('Table header anchor not found'); process.exit(1) }

const newHeader = `<thead><tr style='border-bottom:1px solid #e8e3db'>
              <th style='padding:6px;width:52px'></th>
              <th style='text-align:left;padding:6px'>Item</th>
              <th style='text-align:right;padding:6px'>Amount</th>
            </tr></thead>`

src = src.replace(oldHeader, newHeader)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Client report v2: thumbnails on invoice copies, oldest-first sort')
