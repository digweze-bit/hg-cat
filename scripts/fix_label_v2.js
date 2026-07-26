import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Replace the entire printArtworkLabel function
const fnStart = src.indexOf('\nasync function printArtworkLabel(')
if (fnStart < 0) { console.error('printArtworkLabel not found'); process.exit(1) }

// Find its end — next top-level function
const fnEnd = src.indexOf('\nfunction printArtworkList(', fnStart)
if (fnEnd < 0) { console.error('end anchor not found'); process.exit(1) }

const newFn = `
async function printArtworkLabel(w, artistMap) {
  const url = window.location.origin + '/artwork/' + w.id
  const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const artistName = artistMap[w.artist_id] ? artistMap[w.artist_id].name : ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'
  const details = [
    w.title ? '<b>' + e(w.title) + '</b>' : '',
    artistName ? e(artistName) : '',
    w.year ? e(w.year) : '',
    w.medium ? e(w.medium) : '',
    w.dimensions ? e(w.dimensions) + ' ' + dimUnit : '',
  ].filter(Boolean).join('<br>')

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label</title>' +
    '<style>' +
    '* { box-sizing: border-box; margin: 0; padding: 0; }' +
    'body { font-family: Arial, Helvetica, sans-serif; background: #fff; padding: 20px; }' +
    'table { border-collapse: collapse; border: 2px solid #000; width: 480px; }' +
    'td { vertical-align: middle; padding: 12px; }' +
    'td.qr { width: 160px; }' +
    'td.qr img { width: 150px; height: 150px; display: block; }' +
    'td.info { font-size: 12px; line-height: 1.7; }' +
    '@media print {' +
    '@page { size: 4in 2in; margin: 0; }' +
    'body { padding: 0; }' +
    'table { width: 4in; }' +
    'td.qr { width: 1.4in; }' +
    'td.qr img { width: 1.3in; height: 1.3in; }' +
    'td.info { font-size: 10px; }' +
    '}' +
    '</style></head><body>' +
    '<table><tr>' +
    '<td class="qr"><img src="' + qrDataUrl + '" alt="QR"></td>' +
    '<td class="info">' + details + '</td>' +
    '</tr></table>' +
    '</body></html>'

  const win = window.open('', '_blank', 'width=560,height=260')
  if (!win) { alert('Allow popups to print labels'); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(function() { win.print() }, 600)
}

`

src = src.slice(0, fnStart) + newFn + src.slice(fnEnd)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Label function rewritten with table layout')
