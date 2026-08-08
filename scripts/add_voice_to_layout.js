import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/AdminLayout.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('VoiceCommand')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add import
mustReplace(
  "import { useState } from 'react'",
  "import { useState } from 'react'\nimport VoiceCommand from '../components/VoiceCommand'",
  '1. Add VoiceCommand import'
)

// 2. Add VoiceCommand to topbar — before the "View public site" link
mustReplace(
  `          <a href="/" target="_blank" style={{ fontSize:12, color:'var(--muted)' }}>`,
  `          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <VoiceCommand />
            <a href="/" target="_blank" style={{ fontSize:12, color:'var(--muted)' }}>`,
  '2. Add VoiceCommand to topbar'
)

// Close the wrapping div after the link
mustReplace(
  `View public site {'\u2197'}
          </a>`,
  `View public site {'\u2197'}
            </a>
          </div>`,
  '3. Close wrapping div'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
