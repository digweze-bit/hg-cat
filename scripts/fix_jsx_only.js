/**
 * fix_jsx_only.js - ONLY fixes \uXXXX in JSX text nodes. No duplicate removal.
 * Safe to run multiple times.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src')

function fixFile(fp) {
  if (!['.jsx','.js'].includes(path.extname(fp))) return
  let src = fs.readFileSync(fp, 'utf8')
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1)
  if (src.startsWith('\\uFEFF')) src = src.slice(6)

  // Fix \uXXXX in JSX text nodes only
  // A JSX text node is content between > and < that is NOT inside {} or quotes
  const lines = src.split('\n')
  let changed = false

  const fixed = lines.map(line => {
    // Skip lines that don't have \u sequences
    if (!line.includes('\\u')) return line
    // Skip pure JS lines (no JSX angle brackets)
    if (!line.includes('>') && !line.includes('<')) return line
    // Skip comment lines
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return line
    
    // Fix: text between > and < containing \uXXXX
    const newLine = line.replace(/>([^<{}'"`]*\\u[0-9A-Fa-f]{4,5}[^<{}'"`]*)</g, (m, text) => {
      const fixedText = text.replace(/\\u([0-9A-Fa-f]{4,5})/g, (_, h) => `{'\\u${h}'}`)
      if (fixedText !== text) changed = true
      return `>${fixedText}<`
    })
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

console.log('Fixing \\uXXXX in JSX text nodes only...\n')
walk(SRC)
console.log('\nDone.')
