import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Find the attachInvoices section and add image embedding before building HTML
const oldAttach = `  // Invoice copies if requested
  let invoiceCopies = ''
  if (attachInvoices && filtered.length > 0) {`

if (!src.includes(oldAttach)) { console.error('Attach section not found'); process.exit(1) }

const newAttach = `  // Embed item images as data URLs for print window (cross-origin images need this)
  async function embedImg(url) {
    if (!url) return ''
    try {
      const resp = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now(), { cache: 'no-store', mode: 'cors' })
      if (!resp.ok) return ''
      const blob = await resp.blob()
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob) })
    } catch { return '' }
  }

  // Pre-embed all item images if attaching invoices
  if (attachInvoices && invoiceItems.length > 0) {
    await Promise.all(invoiceItems.map(async it => {
      const src = it.thumbnail_url || it.image_url || it.cover_url
      if (src) it._imgData = await embedImg(src)
    }))
  }

  // Invoice copies if requested
  let invoiceCopies = ''
  if (attachInvoices && filtered.length > 0) {`

src = src.replace(oldAttach, newAttach)

// Update the item row to use _imgData instead of raw URL
const oldImgSrc = `const imgSrc = it.thumbnail_url || it.image_url || it.cover_url || ''
        return \`<tr>
          <td style='padding:8px 6px;width:52px;vertical-align:middle'>\${imgSrc ? \`<img src="\${imgSrc}" style="width:44px;height:44px;object-fit:cover;border-radius:2px;display:block">\` : '<div style="width:44px;height:44px;background:#f0ece7;border-radius:2px"></div>'}</td>`

if (!src.includes(oldImgSrc)) { console.error('imgSrc anchor not found'); process.exit(1) }

const newImgSrc = `const imgData = it._imgData || ''
        return \`<tr>
          <td style='padding:8px 6px;width:52px;vertical-align:middle'>\${imgData ? \`<img src="\${imgData}" style="width:44px;height:44px;object-fit:cover;border-radius:2px;display:block">\` : '<div style="width:44px;height:44px;background:#f0ece7;border-radius:2px"></div>'}</td>`

src = src.replace(oldImgSrc, newImgSrc)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Client report v3: images embedded as data URLs for print window')
