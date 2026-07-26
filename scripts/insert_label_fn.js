import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('printArtworkLabel')) {
  console.log('Already has printArtworkLabel')
  process.exit(0)
}

const anchor = '\nfunction printArtworkList('
if (!src.includes(anchor)) { console.error('printArtworkList anchor not found'); process.exit(1) }

const labelFn = `
async function printArtworkLabel(w, artistMap) {
  const url = \`\${window.location.origin}/artwork/\${w.id}\`
  const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#000', light: '#fff' } })
  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const artistName = artistMap[w.artist_id]?.name || ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'
  const html = \`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Helvetica,sans-serif;background:#fff;padding:20px}
.label{width:480px;min-height:200px;border:2px solid #000;display:flex;align-items:center;padding:14px 16px;gap:16px}
.qr img{width:150px;height:150px;display:block;flex-shrink:0}
.details{flex:1;min-width:0}
.title{font-weight:700;font-size:12px;line-height:1.4;margin-bottom:6px}
.line{font-size:11px;line-height:1.7;color:#111}
@media print{body{padding:0}@page{size:4in 2in;margin:0}.label{width:4in;min-height:2in;border:1.5px solid #000;padding:10px 12px;gap:12px}.qr img{width:1.3in;height:1.3in}.title{font-size:10px}.line{font-size:9px}}
</style></head><body>
<div class="label">
  <div class="qr"><img src="\${qrDataUrl}" alt="QR"></div>
  <div class="details">
    <div class="title">\${e(w.title)}</div>
    \${artistName?'<div class="line">'+e(artistName)+'</div>':''}
    \${w.year?'<div class="line">'+e(w.year)+'</div>':''}
    \${w.medium?'<div class="line">'+e(w.medium)+'</div>':''}
    \${w.dimensions?'<div class="line">'+e(w.dimensions)+' '+dimUnit+'</div>':''}
  </div>
</div>
</body></html>\`

  const win = window.open('', '_blank', 'width=560,height=280')
  if (!win) { alert('Allow popups to print labels'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 500)
}

`

src = src.replace(anchor, labelFn + anchor)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('printArtworkLabel inserted before printArtworkList')
