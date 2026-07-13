/**
 * Fixes \uXXXX sequences that appear as raw text in JSX text nodes.
 * Only fixes patterns like: >text \uXXXX text<
 * Does NOT touch JS strings, template literals, or comment lines.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src')

function fixFile(fp) {
  if (!['.jsx'].includes(path.extname(fp))) return
  let src = fs.readFileSync(fp, 'utf8')
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1)
  if (src.startsWith('\\uFEFF')) src = src.slice(6)

  const lines = src.split('\n')
  let changed = false

  const fixed = lines.map((line, i) => {
    if (!line.includes('\\u')) return line
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) return line

    // Match \uXXXX that is:
    // 1. After a > (JSX text node start)  
    // 2. NOT inside quotes (', ", `)
    // 3. NOT already inside {} expression
    // Strategy: split line by JSX text segments between > and <
    // A JSX text segment is between > and the next < or {
    
    let newLine = line
    // Replace \uXXXX that appears after > and before < or {, not inside any quotes
    // Pattern: after closing >, plain text with \uXXXX before next < or {
    newLine = newLine.replace(
      />([^<{}\n]*\\u[0-9A-Fa-f]{4,5}[^<{}\n]*?)(?=[<{])/g,
      (m, text) => {
        // Only fix if the \u is not inside a string (no quotes around it in this segment)
        if (text.includes("'") || text.includes('"') || text.includes('`')) return m
        const fixedText = text.replace(/\\u([0-9A-Fa-f]{4,5})/g, (_, h) => `{'\\u${h}'}`)
        if (fixedText !== text) {
          changed = true
          console.log(`  ${path.basename(fp)}:${i+1} fixed: ${text.trim().slice(0,50)}`)
        }
        return `>${fixedText}`
      }
    )
    return newLine
  }).join('\n')

  if (changed) fs.writeFileSync(fp, fixed, 'utf8')
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory() && !['node_modules','.git','dist'].includes(e.name)) walk(full)
    else if (e.isFile()) fixFile(full)
  }
}

console.log('Fixing raw \\uXXXX in JSX text nodes...\n')
walk(SRC)
console.log('\nDone.')
