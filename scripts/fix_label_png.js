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
  // 5x2 inches at 150 DPI = 750 x 300 px
  const DPI = 150
  const W = 5 * DPI   // 750px
  const H = 2 * DPI   // 300px
  const PAD = 20

  // Generate QR code as data URL
  const url = window.location.origin + '/artwork/' + w.id
  const qrSize = H - PAD * 2  // 260px
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: qrSize,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  // Draw on canvas
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Black border
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 3
  ctx.strokeRect(2, 2, W - 4, H - 4)

  // Draw QR code
  await new Promise(res => {
    const qrImg = new Image()
    qrImg.onload = () => {
      ctx.drawImage(qrImg, PAD, PAD, qrSize, qrSize)
      res()
    }
    qrImg.src = qrDataUrl
  })

  // Text area starts after QR code
  const textX = PAD + qrSize + PAD
  const textMaxW = W - textX - PAD
  const artistName = artistMap[w.artist_id] ? artistMap[w.artist_id].name : ''
  const dimUnit = w.dimension_unit === 'cm' ? 'cm' : 'in'

  const lines = [
    { text: w.title || '', bold: true, size: 18 },
    { text: artistName, bold: false, size: 15 },
    { text: w.year || '', bold: false, size: 14 },
    { text: w.medium || '', bold: false, size: 14 },
    { text: w.dimensions ? w.dimensions + ' ' + dimUnit : '', bold: false, size: 14 },
  ].filter(l => l.text)

  let y = PAD + 22
  for (const line of lines) {
    ctx.font = (line.bold ? 'bold ' : '') + line.size + 'px Arial, sans-serif'
    ctx.fillStyle = '#1a1714'
    // Word wrap
    const words = line.text.split(' ')
    let currentLine = ''
    for (const word of words) {
      const test = currentLine ? currentLine + ' ' + word : word
      if (ctx.measureText(test).width > textMaxW && currentLine) {
        ctx.fillText(currentLine, textX, y)
        y += line.size + 4
        currentLine = word
      } else {
        currentLine = test
      }
    }
    if (currentLine) ctx.fillText(currentLine, textX, y)
    y += line.size + (line.bold ? 10 : 6)
  }

  // Download as PNG
  const link = document.createElement('a')
  const safeTitle = (w.title || 'label').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
  link.download = safeTitle + '_label.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}

`

src = src.slice(0, fnStart) + newFn + src.slice(fnEnd)

// Remove the debug alert/stopPropagation from the button
src = src.replace(
  /onClick=\{.*?e\.stopPropagation\(\).*?printArtworkLabel\(w, artistMap\).*?\}\}/,
  'onClick={() => printArtworkLabel(w, artistMap)}'
)

// Remove the alert from inside the function if present
src = src.replace("  alert('LABEL: title=' + w.title + ', year=' + w.year + ', medium=' + w.medium)\n", '')
src = src.replace("  console.log('LABEL DEBUG:', JSON.stringify({title:w.title,artist:artistName,year:w.year,medium:w.medium,dim:w.dimensions}))\n", '')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Label function rewritten as canvas PNG download')
