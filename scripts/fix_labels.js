import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let src = fs.readFileSync(file, 'utf8')

const before = src.includes("onClick={() => setPrintMenu(m => !m)}>Print list</button>")
console.log('onClick intact before:', before)

const fixes = [
  ['c3a2e280a0e2809c', '\u2193'],  // ↓ down arrow
  ['c3a2e280a0e28098', '\u2191'],  // ↑ up arrow
  ['c3a2e282ace2809c', '\u2014'],  // — em dash
  ['c3a2e282ace2809d', '\u2014'],  // — em dash variant
  ['c3a2e282acc2a6',   '\u2026'],  // … ellipsis
  ['c3a2e2809ac2a6',   '\u20a6'],  // ₦ naira (THIS one)
  ['c3a2c282c2a6',     '\u20a6'],  // ₦ naira (previous variant)
  ['c382c2b7',         '\u00b7'],  // · middle dot (subtitle)
  ['c2b7',             '\u00b7'],  // · middle dot
  ['c3a2c286c292',     '\u2192'],  // → right arrow
  ['c3a2c286c290',     '\u2190'],  // ← left arrow
  ['c3a2c286c2bb',     '\u21bb'],  // ↻ clockwise
]

let total = 0
for (const [hex, char] of fixes) {
  const bad = Buffer.from(hex, 'hex').toString('utf8')
  const count = src.split(bad).length - 1
  if (count > 0) {
    src = src.split(bad).join(char)
    total += count
    console.log(`Fixed ${count}x -> ${char}`)
  }
}

const after = src.includes("onClick={() => setPrintMenu(m => !m)}>Print list</button>")
if (!after) { console.error('ERROR: onClick broken! Aborting.'); process.exit(1) }
console.log('onClick intact after:', after)
fs.writeFileSync(file, src, 'utf8')
console.log(`Done: ${total} fixes`)
