import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src')

function processFile(filePath) {
  const ext = path.extname(filePath)
  if (!['.jsx','.js','.ts','.tsx'].includes(ext)) return 0

  // Read as buffer to detect/strip BOM
  let buf = fs.readFileSync(filePath)
  // Strip UTF-8 BOM if present
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3)
  }
  const content = buf.toString('utf8')

  const nonAscii = content.match(/[^\x00-\x7F]/g)
  if (!nonAscii) {
    // Still write back to ensure no BOM
    fs.writeFileSync(filePath, content, { encoding: 'utf8' })
    return 0
  }

  const fixed = content.replace(/[^\x00-\x7F]/g, c => {
    const code = c.codePointAt(0)
    return code > 0xFFFF
      ? `\\u{${code.toString(16)}}`
      : `\\u${code.toString(16).toUpperCase().padStart(4,'0')}`
  })

  // Write as UTF-8 WITHOUT BOM
  fs.writeFileSync(filePath, fixed, { encoding: 'utf8' })
  return nonAscii.length
}

function walk(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !['node_modules','.git','dist'].includes(entry.name)) {
      total += walk(full)
    } else if (entry.isFile()) {
      const n = processFile(full)
      if (n) console.log(`  ${path.relative(SRC, full)}: ${n} chars`)
      total += n
    }
  }
  return total
}

console.log('Converting all non-ASCII to \\uXXXX escapes (no BOM)...\n')
const total = walk(SRC)
console.log(`\nDone: ${total} characters converted`)
