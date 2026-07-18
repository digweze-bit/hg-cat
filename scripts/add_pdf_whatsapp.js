import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let src = fs.readFileSync(file, 'utf8')

if (src.includes('downloadInvoicePDF')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add imports
const oldImport = "import { useAuth } from '../components/AuthProvider'"
const newImport = `import { useAuth } from '../components/AuthProvider'\r
import html2canvas from 'html2canvas'\r
import jsPDF from 'jspdf'`

if (!src.includes(oldImport)) { console.error('Import anchor not found'); process.exit(1) }
src = src.replace(oldImport, newImport)

// 2. Add downloadInvoicePDF function after printInvoice function
const anchor = "    setTimeout(() => { w.print() }, 800)\r\n  }\r\n"
const idx = src.indexOf(anchor)
if (idx < 0) { console.error('printInvoice anchor not found'); process.exit(1) }

const newFn = `    setTimeout(() => { w.print() }, 800)\r
  }\r
\r
  async function downloadInvoicePDF() {\r
    let logoB64 = null\r
    try { const assets = await import('../lib/assets'); logoB64 = assets.LOGO_SMALL_B64 || assets.LOGO_B64 } catch(_) {}\r
    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)\r
    // Render into hidden iframe, then capture with html2canvas\r
    const iframe = document.createElement('iframe')\r
    iframe.style.position = 'fixed'\r
    iframe.style.left = '-9999px'\r
    iframe.style.width = '650px'\r
    iframe.style.height = '900px'\r
    document.body.appendChild(iframe)\r
    iframe.contentDocument.open()\r
    iframe.contentDocument.write(html)\r
    iframe.contentDocument.close()\r
    await new Promise(res => setTimeout(res, 600))\r
    const target = iframe.contentDocument.body\r
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })\r
    const imgData = canvas.toDataURL('image/jpeg', 0.95)\r
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })\r
    const pageWidth = pdf.internal.pageSize.getWidth()\r
    const pageHeight = pdf.internal.pageSize.getHeight()\r
    const imgWidth = pageWidth\r
    const imgHeight = (canvas.height * imgWidth) / canvas.width\r
    let heightLeft = imgHeight\r
    let position = 0\r
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)\r
    heightLeft -= pageHeight\r
    while (heightLeft > 0) {\r
      position = heightLeft - imgHeight\r
      pdf.addPage()\r
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)\r
      heightLeft -= pageHeight\r
    }\r
    document.body.removeChild(iframe)\r
    const filename = \`\${inv.invoice_number}.pdf\`\r
    pdf.save(filename)\r
    return filename\r
  }\r
\r
  async function sendInvoiceWhatsApp() {\r
    const filename = await downloadInvoicePDF()\r
    await new Promise(res => setTimeout(res, 400))\r
    const phone = (client?.phone_mobile || client?.phone || '').replace(/\\D/g, '')\r
    const msg = \`Hi \${client?.name || ''}, please find attached your invoice \${inv.invoice_number} from Hourglass Gallery. The PDF (\${filename}) has just downloaded to your device \u2014 please attach it here.\`\r
    const url = phone ? \`https://wa.me/\${phone}?text=\${encodeURIComponent(msg)}\` : \`https://wa.me/?text=\${encodeURIComponent(msg)}\`\r
    window.open(url, '_blank')\r
  }\r
`

src = src.slice(0, idx) + newFn + src.slice(idx + anchor.length)
fs.writeFileSync(file, src, 'utf8')
console.log('Patched: added downloadInvoicePDF and sendInvoiceWhatsApp')
