import QRCode from 'qrcode'

// The wall/shelf label used for every item type: a QR code on the left, the
// item's details on the right, 4x2 inches at 200 DPI, downloaded as a PNG.
// The label never carries a price — the price lives on the page the QR opens.
//
//   lines: [title, ...details] — the first line is set bold, the rest light
export async function downloadQrLabel({ url, lines, filename }) {
  const DPI = 200
  const W = 4 * DPI   // 800px
  const H = 2 * DPI   // 400px
  const PAD = 28
  const BORDER = 2

  // Font stack: Optima on Mac, Gill Sans on Windows, fallback to Trebuchet
  const FONT = 'Optima, "Gill Sans", "Gill Sans MT", Trebuchet MS, sans-serif'

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

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  await new Promise(res => {
    const qrImg = new Image()
    qrImg.onload = () => {
      ctx.drawImage(qrImg, qrLeft, qrTop, qrSize, qrSize)
      res()
    }
    qrImg.src = qrDataUrl
  })

  const textX = qrLeft + qrSize + PAD * 1.5
  const textMaxW = W - textX - PAD

  const TITLE_SIZE = 30
  const DETAIL_SIZE = 26
  const LINE_GAP = Math.round(DETAIL_SIZE * 1.8)

  const textLines = lines
    .map((text, i) => ({ text: text || '', size: i === 0 ? TITLE_SIZE : DETAIL_SIZE, weight: i === 0 ? '700' : '300' }))
    .filter(l => l.text)

  // Center the text block on the QR code's vertical extent
  const totalTextH = textLines.reduce((acc, l, i) =>
    acc + (i < textLines.length - 1 ? LINE_GAP : l.size), 0)
  const textBlockCenter = qrTop + qrSize / 2
  let y = Math.round(textBlockCenter - totalTextH / 2) + (textLines[0]?.size || 0)

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

  // Border last so it sits on top of everything
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = BORDER
  ctx.strokeRect(BORDER / 2, BORDER / 2, W - BORDER, H - BORDER)

  const safeTitle = (filename || 'label').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
  const link = document.createElement('a')
  link.download = safeTitle + '_label.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}
