import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Sales.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Find and replace the broken modal section
const brokenBlock = `        <ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />
      )}
      {editingClient && (
      {editingClient && (() => { console.log('EDIT CLIENT RENDERING:', editingClient.name); return true })() && (`

if (src.includes(brokenBlock)) {
  src = src.replace(brokenBlock, `        <ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />
      )}
      {editingClient && (`)
  console.log('Fixed broken block')
} else {
  // Try alternate pattern
  const alt = `        <ClientModal onClose={() => setModal(null)} onSave={load} existingClients={clients} />
      )}
      {editingClient && (`
  if (src.includes(alt)) {
    console.log('Block already clean')
  } else {
    console.log('Looking for pattern...')
    // Print lines 128-142
    const lines = src.split('\n')
    for (let i = 127; i < 143 && i < lines.length; i++) {
      console.log(`${i+1}: ${lines[i]}`)
    }
  }
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
