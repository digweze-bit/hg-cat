// Patches migrate_tessera.js to strip all non-printable characters
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, 'migrate_tessera.js')

let src = fs.readFileSync(file, 'utf8')

// Fix 1: Replace clean() to strip ALL non-printable and non-ASCII chars
// Find the current clean() line and replace it
src = src.replace(
  /const clean = v => [^\n]+/,
  "const clean = v => { if (v === null || v === undefined) return null; const s = String(v).replace(/[\\x00-\\x1F\\x7F-\\xFF]/g, '').trim(); return s || null }"
)

// Fix 2: Also strip in parseTab so raw data is clean before anything else
src = src.replace(
  "      const s = v.trim()\n      if (s === '' || s === 'nan') return null\n      // Fix common latin-1 → UTF-8 mojibake\n      return s\n        .replace(/Ã—/g, 'x')\n        .replace(/â‚¦/g, 'N')\n        .replace(/Ã—/g, 'x')",
  "      const s = v.trim()\n      if (s === '' || s === 'nan') return null\n      // Strip ALL non-printable chars (including \\x0b vertical tab) and non-ASCII\n      return s.replace(/[\\x00-\\x1F\\x7F-\\xFF]/g, '').trim() || null"
)

fs.writeFileSync(file, src, 'utf8')

// Verify
const lines = src.split('\n')
const cleanLine = lines.findIndex(l => l.includes('const clean ='))
console.log(`clean() is now on line ${cleanLine + 1}:`)
console.log(lines[cleanLine])

const parseTabStart = lines.findIndex(l => l.includes('function parseTab'))
console.log(`\nparseTab strip logic:`)
for (let i = parseTabStart; i < parseTabStart + 15; i++) {
  console.log(lines[i])
}
