/**
 * fix_all.js - Run once to clean the entire codebase:
 * 1. Removes duplicate consecutive lines
 * 2. Fixes \uXXXX in JSX text nodes (wraps in {'\uXXXX'})
 * 3. Strips BOM characters
 * 
 * node scripts/fix_all.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src')

function fixFile(fp) {
  if (!['.jsx','.js'].includes(path.extname(fp))) return
  
  let src = fs.readFileSync(fp, 'utf8')
  // Strip BOM
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1)
  // Strip literal \uFEFF at start
  if (src.startsWith('\\uFEFF')) src = src.slice(6)

  const lines = src.split('\n')
  const deduped = []
  let changed = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const prev = deduped[deduped.length - 1]
    // Skip duplicate non-empty lines
    if (line.trim() !== '' && prev !== undefined && line === prev) {
      console.log(`  DUPE removed in ${path.basename(fp)} line ${i+1}: ${line.trim().slice(0,60)}`)
      changed = true
      continue
    }
    deduped.push(line)
  }

  // Fix \uXXXX in JSX text nodes
  // Pattern: \uXXXX appearing between > and < (JSX text content)
  const rejoined = deduped.join('\n')
  const fixed = rejoined.replace(
    />([^<]*?\\u([0-9A-Fa-f]{4,5})[^<]*?)</g,
    (match, text, hex) => {
      // Only fix if it's raw \uXXXX not already in a JS expression
      if (text.includes("'\\u") || text.includes('"\\u') || text.includes('{')) {
        return match
      }
      const newText = text.replace(/\\u([0-9A-Fa-f]{4,5})/g, (m, h) => `{'\\u${h}'}`)
      if (newText !== text) {
        console.log(`  JSX escape fixed in ${path.basename(fp)}: ...${newText.trim().slice(0,60)}...`)
        changed = true
      }
      return `>${newText}<`
    }
  )

  if (changed) {
    fs.writeFileSync(fp, fixed, 'utf8')
    console.log(`  -> Saved ${path.basename(fp)}`)
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !['node_modules','.git','dist'].includes(entry.name)) {
      walk(full)
    } else if (entry.isFile()) {
      fixFile(full)
    }
  }
}

console.log('Running fix_all.js...\n')
walk(SRC)
console.log('\nDone.')
