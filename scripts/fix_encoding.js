import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let src = fs.readFileSync(file, 'utf8')

// Fix circles (already working from last run, but include for safety)
const bad1 = Buffer.from('c3a2e28094e280b0', 'hex').toString('utf8')
const bad2 = Buffer.from('c3a2e28094e280b9', 'hex').toString('utf8')
src = src.split(bad1).join('\u25c9')
src = src.split(bad2).join('\u25cb')

// Fix middle dot
const middleDot = Buffer.from('c2b7', 'hex').toString('utf8')
src = src.split(middleDot).join('\u00b7')

// The print symbol (⎙ U+2399) got corrupted to ™ (U+2122 = e2 84 a2)
// Replace in button context with plain text "Print"
src = src.replace('\u2122 Print list', 'Print list')
src = src.replace('\u2122 Print', 'Print')

// Also replace any remaining ™ that was meant to be ⎙
src = src.split('\u2122').join('Print')

// ▾ triangle - replace with plain text arrow
src = src.split('\u2122').join('') // cleanup
// Find corrupted triangle near 'Print'  
src = src.replace("'Print list \u00e2\u0080\u0093\u00be'", "'Print list'")

// Replace the button label directly - use simple ASCII
src = src.replace(
  />[^<]*Print[^<]*list[^<]*<\/button>/g,
  '>Print list \u25be</button>'
)

fs.writeFileSync(file, src, 'utf8')
console.log('Done')
console.log('◉:', src.includes('\u25c9'))
console.log('○:', src.includes('\u25cb'))

// Show the print button
const idx = src.indexOf('Print list')
if (idx >= 0) console.log('Print button:', JSON.stringify(src.substring(idx-5, idx+20)))
