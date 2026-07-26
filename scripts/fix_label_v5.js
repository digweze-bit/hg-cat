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
  // 4x2 inches at 200 DPI = 800 x 400 px
  const DPI = 200
  const W = 4 * DPI   // 800px
  const H = 2 * DPI   // 400px
  const PAD = 28
  const BORDER = 2

  // Font stack: Optima on Mac, Gill Sans on Windows, fallback to Trebuchet
  const FONT = 'Optima, "Gill Sans", "Gill Sans MT", Trebuchet MS, sans-serif'

  const url = window.location.origin + '/artwork/' + w.id

  // QR: 58% of height, vertically centered
  const qrSize = Math.round(H * 0.58)
  const qrLeft = PAD
  const qrTop = Math.round((H - qrSize) / 2)

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: qrSize,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Black border — drawn LAST so it's always visible
  // (draw content first, border on top)

  // Draw QR code
  await new Promise(res => {
    const qrImg = new Image()
    qrImg.onload = () => {
      ctx.drawImage(qrImg, qrLeft, qrTop, qrSize, qrSize)
      res()
    }
    qrImg.src = qrDataUrl
  })

  // Text area
  const textX = qrLeft + qrSize + PAD * 1.5
  const textMaxW = W - textX - PAD

  const TITLE_SIZE = 28
  const DETAIL_SIZE = 24
  const LINE_GAP = Math.round(DETAIL_SIZE * 1.8)

  const artistName = artistMap[w.artist_id] ? artistMap[w.artist_id].name : ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'

  const textLines = [
    { text: w.title || '', size: TITLE_SIZE, weight: '500' },
    { text: artistName, size: DETAIL_SIZE, weight: '300' },
    { text: w.year || '', size: DETAIL_SIZE, weight: '300' },
    { text: w.medium || '', size: DETAIL_SIZE, weight: '300' },
    { text: w.dimensions ? w.dimensions + ' ' + dimUnit : '', size: DETAIL_SIZE, weight: '300' },
  ].filter(l => l.text)

  // Calculate total text height for vertical centering relative to QR
  const totalTextH = textLines.reduce((acc, l, i) =>
    acc + l.size + (i < textLines.length - 1 ? LINE_GAP : 0), 0)

  // Center text block relative to QR code vertical extent
  let y = qrTop + Math.round((qrSize - totalTextH) / 2) + TITLE_SIZE

  ctx.fillStyle = '#1a1714'

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i]
    ctx.font = line.weight + ' ' + line.size + 'px ' + FONT
    ctx.letterSpacing = line.weight === '300' ? '1px' : '0px'

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
    if (cur) ctx.fillText(cur, textX, y)
    if (i < textLines.length - 1) y += LINE_GAP
  }

  // Draw border LAST so it sits on top of everything
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = BORDER
  ctx.strokeRect(BORDER / 2, BORDER / 2, W - BORDER, H - BORDER)

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
console.log('Label v5: Optima/Gill Sans, border drawn last, text centered to QR')
