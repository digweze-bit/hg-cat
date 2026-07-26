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
  const BORDER = 3

  const url = window.location.origin + '/artwork/' + w.id

  // QR code: 60% of height
  const qrSize = Math.round(H * 0.6)  // 240px
  const qrTop = (H - qrSize) / 2      // vertically centered
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

  // Vertical divider line (subtle)
  const dividerX = PAD + qrSize + PAD
  ctx.strokeStyle = '#e0dbd4'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(dividerX - PAD / 2, PAD * 1.5)
  ctx.lineTo(dividerX - PAD / 2, H - PAD * 1.5)
  ctx.stroke()

  // Draw QR code
  await new Promise(res => {
    const qrImg = new Image()
    qrImg.onload = () => {
      ctx.drawImage(qrImg, PAD, qrTop, qrSize, qrSize)
      res()
    }
    qrImg.src = qrDataUrl
  })

  // Text setup
  const artistName = artistMap[w.artist_id] ? artistMap[w.artist_id].name : ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'
  const TITLE_SIZE = 28
  const DETAIL_SIZE = 24
  const LINE_GAP = DETAIL_SIZE * 2  // double spacing

  const textLines = [
    { text: w.title || '', size: TITLE_SIZE, font: 'bold ' + TITLE_SIZE + 'px Georgia, serif' },
    { text: artistName, size: DETAIL_SIZE, font: DETAIL_SIZE + 'px Georgia, serif' },
    { text: w.year || '', size: DETAIL_SIZE, font: DETAIL_SIZE + 'px Arial, Helvetica, sans-serif' },
    { text: w.medium || '', size: DETAIL_SIZE, font: DETAIL_SIZE + 'px Arial, Helvetica, sans-serif' },
    { text: w.dimensions ? w.dimensions + ' ' + dimUnit : '', size: DETAIL_SIZE, font: DETAIL_SIZE + 'px Arial, Helvetica, sans-serif' },
  ].filter(l => l.text)

  // Calculate total text block height for vertical centering
  const totalTextH = textLines.reduce((sum, l, i) => {
    return sum + l.size + (i < textLines.length - 1 ? LINE_GAP : 0)
  }, 0)
  const textX = dividerX
  const textMaxW = W - textX - PAD
  let y = (H - totalTextH) / 2 + TITLE_SIZE  // start so block is vertically centered

  ctx.fillStyle = '#1a1714'
  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i]
    ctx.font = line.font
    // Word wrap if needed
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
    y += i < textLines.length - 1 ? LINE_GAP : 0
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
console.log('Label v4: smaller QR, vertically centered text, Georgia serif font')
