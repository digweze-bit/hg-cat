import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Drawer detail
mustReplace(
  `{drawnEntry.image_url && <img src={drawnEntry.image_url} alt="" style={{ width:'100%', borderRadius:3, marginBottom:10, border:'1px solid var(--line)' }} />}`,
  `{drawnEntry.image_url && (drawnEntry.image_url.toLowerCase().includes('.pdf')
                    ? <div style={{ marginBottom:10 }}>
                        <iframe src={drawnEntry.image_url} style={{ width:'100%', height:400, border:'1px solid var(--line)', borderRadius:3 }} title="PDF" />
                        <a href={drawnEntry.image_url} target="_blank" rel="noopener noreferrer" style={{ display:'block', fontSize:11, marginTop:6, color:'var(--ink)' }}>Open PDF in new tab</a>
                      </div>
                    : <img src={drawnEntry.image_url} alt="" style={{ width:'100%', borderRadius:3, marginBottom:10, border:'1px solid var(--line)' }} />)}`,
  'Drawer PDF view'
)

// 2. Form preview
mustReplace(
  `{form.image_url && <img src={form.image_url} alt="" style={{ marginTop:8, maxHeight:120, borderRadius:3, border:'1px solid var(--line)' }} />}`,
  `{form.image_url && (form.image_url.toLowerCase().includes('.pdf')
                  ? <div style={{ marginTop:8, padding:'10px 12px', background:'var(--parchment)', borderRadius:3, fontSize:12 }}>{'\u{1F4C4}'} <a href={form.image_url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--ink)' }}>View uploaded PDF</a></div>
                  : <img src={form.image_url} alt="" style={{ marginTop:8, maxHeight:120, borderRadius:3, border:'1px solid var(--line)' }} />)}`,
  'Form PDF preview'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
