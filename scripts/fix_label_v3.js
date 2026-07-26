import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

const fnStart = src.indexOf('\nasync function printArtworkLabel(')
if (fnStart < 0) { console.error('printArtworkLabel not found'); process.exit(1) }
const fnEnd = src.indexOf('\nfunction printArtworkList(', fnStart)
if (fnEnd < 0) { console.error('end anchor not found'); process.exit(1) }

const newFn = `
async function printArtworkLabel(w, artistMap) {
  // 4x2 inches at 200 DPI
  const DPI = 200
  const W = 4 * DPI   // 800px
  const H = 2 * DPI   // 400px
  const PAD = 24
  const BORDER = 3

  const url = window.location.origin + '/artwork/' + w.id
  const qrSize = H - PAD * 2  // 352px — fills most of the height
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: qrSize,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Border
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = BORDER
  ctx.strokeRect(BORDER / 2, BORDER / 2, W - BORDER, H - BORDER)

  // QR code
  await new Promise(res => {
    const qrImg = new Image()
    qrImg.onload = () => {
      ctx.drawImage(qrImg, PAD, PAD, qrSize, qrSize)
      res()
    }
    qrImg.src = qrDataUrl
  })

  // Text layout
  const textX = PAD + qrSize + PAD
  const textMaxW = W - textX - PAD
  const artistName = artistMap[w.artist_id] ? artistMap[w.artist_id].name : ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'

  const lines = [
    { text: w.title || '', size: 26, bold: true },
    { text: artistName, size: 22, bold: false },
    { text: w.year || '', size: 20, bold: false },
    { text: w.medium || '', size: 20, bold: false },
    { text: w.dimensions ? w.dimensions + ' ' + dimUnit : '', size: 20, bold: false },
  ].filter(l => l.text)

  let y = PAD + 30
  for (const line of lines) {
    ctx.font = (line.bold ? 'bold ' : '') + line.size + 'px Arial, Helvetica, sans-serif'
    ctx.fillStyle = '#1a1714'
    // Wrap text if too wide
    const words = line.text.split(' ')
    let cur = ''
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word
      if (ctx.measureText(test).width > textMaxW && cur) {
        ctx.fillText(cur, textX, y)
        y += line.size + 4
        cur = word
      } else {
        cur = test
      }
    }
    if (cur) { ctx.fillText(cur, textX, y); y += line.size + 4 }
    y += line.bold ? 8 : 4
  }

  // Download PNG
  const safeTitle = (w.title || 'label').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
  const link = document.createElement('a')
  link.download = safeTitle + '_label.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}

`

src = src.slice(0, fnStart) + newFn + src.slice(fnEnd)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Label rewritten: 4x2in at 200DPI, larger text, proper proportions')
