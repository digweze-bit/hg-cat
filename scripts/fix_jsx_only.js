/**
 * Fixes \uXXXX sequences in JSX that render as literal text.
 * Catches patterns:
 * 1. Between > and < : >text \uXXXX text<
 * 2. Between > and { : >\uXXXX{
 * 3. Between } and { : } \uXXXX {  (JSX text between expressions)
 * 4. In placeholder/title attributes
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src')

const ATTR_REPLACEMENTS = {
  '\\u2026': '...', '\\u2014': '-', '\\u2013': '-',
  '\\u00B7': '.', '\\u00D7': 'x', '\\u20A6': 'N',
  '\\u2022': '*', '\\u2192': '>', '\\u2190': '<',
}

function fixFile(fp) {
  if (!['.jsx'].includes(path.extname(fp))) return
  let src = fs.readFileSync(fp, 'utf8')
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1)
  if (src.startsWith('\\uFEFF')) src = src.slice(6)

  const lines = src.split('\n')
  let changed = false

  const fixed = lines.map((line, i) => {
    if (!line.includes('\\u')) return line
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return line

    let newLine = line

    // Fix 1: \uXXXX between > and < (not inside quotes or {})
    newLine = newLine.replace(
      />([^<{}\n'"` ]*\\u[0-9A-Fa-f]{4,5}[^<{}\n'"` ]*?)(?=[<{])/g,
      (m, text) => {
        const fixedText = text.replace(/\\u([0-9A-Fa-f]{4,5})/g, (_, h) => `{'\\u${h}'}`)
        if (fixedText !== text) changed = true
        return `>${fixedText}`
      }
    )

    // Fix 2: \uXXXX immediately before { in JSX text
    newLine = newLine.replace(
      />((?:[^<{}"'`])*?)(\\u[0-9A-Fa-f]{4,5})\{/g,
      (m, before, escape) => {
        changed = true
        return `>${before}{'${escape}'}{`
      }
    )

    // Fix 3: } \uXXXX { pattern (JSX text between expressions)
    newLine = newLine.replace(
      /\}(\s*\\u[0-9A-Fa-f]{4,5}\s*)\{/g,
      (m, text) => {
        const fixedText = text.replace(/\\u([0-9A-Fa-f]{4,5})/g, (_, h) => `{'\\u${h}'}`)
        if (fixedText !== text) changed = true
        return `}${fixedText}{`
      }
    )

    // Fix 4: placeholder/title attributes
    if (newLine.match(/placeholder=|title=|aria-/)) {
      for (const [bad, good] of Object.entries(ATTR_REPLACEMENTS)) {
        if (newLine.includes(bad)) {
          newLine = newLine.split(bad).join(good)
          changed = true
        }
      }
    }

    return newLine
  }).join('\n')

  if (changed) {
    fs.writeFileSync(fp, fixed, 'utf8')
    console.log(`  Fixed: ${path.basename(fp)}`)
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory() && !['node_modules','.git','dist'].includes(e.name)) walk(full)
    else if (e.isFile()) fixFile(full)
  }
}

console.log('Fixing \\uXXXX in JSX...\n')
walk(SRC)
console.log('\nDone.')
