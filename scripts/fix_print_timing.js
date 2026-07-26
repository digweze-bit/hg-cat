import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Find printInvoice function
const anchor = src.indexOf('async function printInvoice() {')
if (anchor < 0) { console.error('printInvoice not found'); process.exit(1) }

// Find its closing brace — search for the next '\n  }\n' after anchor
const closeIdx = src.indexOf('\n  }\n', anchor)
if (closeIdx < 0) { console.error('printInvoice closing brace not found'); process.exit(1) }

const oldFn = src.slice(anchor, closeIdx + 4)
console.log('Found printInvoice, length:', oldFn.length)
console.log('---')
console.log(oldFn)
console.log('---')

const newFn = `async function printInvoice() {
    // Open window IMMEDIATELY (synchronously, in direct response to the click).
    // If we await anything before window.open(), browsers may treat the delayed
    // open() as a non-user-initiated popup and show a blank/background tab.
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Please allow popups for this site to print invoices'); return }
    w.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#888;">Preparing invoice...</body></html>')
    w.document.close()

    let logoB64 = null
    try { const assets = await import('../lib/assets'); logoB64 = assets.LOGO_SMALL_B64 || assets.LOGO_B64 } catch(_) {}
    let html
    try {
      html = await buildInvoiceHTML(inv, client, items, payments, logoB64)
    } catch(err) {
      console.error('Failed to build invoice HTML:', err)
      w.document.open()
      w.document.write('<html><body style="font-family:sans-serif;padding:40px;color:#c0392b;">Failed to generate invoice: ' + err.message + '</body></html>')
      w.document.close()
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 500)
  }`

src = src.slice(0, anchor) + newFn + src.slice(closeIdx + 4)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('printInvoice fixed - window opens synchronously before async work')
