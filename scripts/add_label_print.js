import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('printArtworkLabel')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add QRCode import at top (it's already a dependency via ArtworkPage)
const importAnchor = "import { useState, useEffect, useMemo, useRef } from 'react'"
if (!src.includes(importAnchor)) { console.error('import anchor not found'); process.exit(1) }
src = src.replace(importAnchor, importAnchor + "\nimport QRCode from 'qrcode'")

// 2. Add Print label button next to Edit button
const oldButtons = `                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(w)}>Edit</button>`
if (!src.includes(oldButtons)) { console.error('Edit button anchor not found'); process.exit(1) }
src = src.replace(oldButtons,
  `                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(w)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => printArtworkLabel(w, artistMap)}>Label</button>`)

// 3. Add printArtworkLabel function before the closing of the file (before printArtworkList)
const printListAnchor = '\nfunction printArtworkList('
if (!src.includes(printListAnchor)) { console.error('printArtworkList anchor not found'); process.exit(1) }

const labelFn = `
async function printArtworkLabel(w, artistMap) {
  const url = \`\${window.location.origin}/artwork/\${w.id}\`
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 160,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const artistName = artistMap[w.artist_id]?.name || ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'
  const html = \`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label - \${e(w.title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Helvetica,sans-serif;background:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
  .label{
    width:4in;height:2in;
    border:1.5px solid #000;
    display:flex;align-items:center;
    padding:10px 12px;gap:12px;
    page-break-inside:avoid;
  }
  .qr{flex-shrink:0;width:1.3in;height:1.3in}
  .qr img{width:100%;height:100%;display:block}
  .details{flex:1;overflow:hidden}
  .title{font-weight:700;font-size:11px;line-height:1.3;margin-bottom:4px}
  .line{font-size:10px;line-height:1.5;color:#222}
  @media print{
    body{display:block;min-height:unset}
    @page{size:4in 2in;margin:0}
    .label{border:1.5px solid #000 !important}
  }
</style>
</head><body>
<div class="label">
  <div class="qr"><img src="\${qrDataUrl}" alt="QR"></div>
  <div class="details">
    <div class="title">\${e(w.title)}</div>
    \${artistName ? \`<div class="line">\${e(artistName)}</div>\` : ''}
    \${w.year ? \`<div class="line">\${e(w.year)}</div>\` : ''}
    \${w.medium ? \`<div class="line">\${e(w.medium)}</div>\` : ''}
    \${w.dimensions ? \`<div class="line">\${e(w.dimensions)} \${dimUnit}</div>\` : ''}
  </div>
</div>
</body></html>\`

  const win = window.open('', '_blank', 'width=600,height=400')
  if (!win) { alert('Please allow popups to print labels'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

`

src = src.replace(printListAnchor, labelFn + printListAnchor)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully - Label print button added')
