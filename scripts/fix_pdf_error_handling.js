import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

const oldStart = `  async function downloadInvoicePDF() {
    let logoB64 = null`

if (!src.includes(oldStart)) { console.error('downloadInvoicePDF start not found'); process.exit(1) }

const newStart = `  async function downloadInvoicePDF() {
   try {
    let logoB64 = null`

src = src.replace(oldStart, newStart)

const oldEnd = `    document.body.removeChild(iframe)
    const filename = \`\${inv.invoice_number}.pdf\`
    pdf.save(filename)
    return filename
  }`

if (!src.includes(oldEnd)) { console.error('downloadInvoicePDF end not found'); process.exit(1) }

const newEnd = `    document.body.removeChild(iframe)
    const filename = \`\${inv.invoice_number}.pdf\`
    pdf.save(filename)
    return filename
   } catch(err) {
     console.error('PDF generation failed:', err)
     alert('PDF generation failed: ' + err.message + '\\n\\nCheck the browser console for details.')
     throw err
   }
  }`

src = src.replace(oldEnd, newEnd)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Added error visibility to downloadInvoicePDF')
