import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Archive.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.error('ANCHOR NOT FOUND: ' + label)
    console.error('Looking for: ' + oldStr.slice(0, 120))
    process.exit(1)
  }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// First restore the three broken lines by replacing whatever is there now
// Find each by unique surrounding context

// 1. Card thumbnail — find the line between the onClick div and the padding div
const cardCtx = "                          >\n"
const cardEnd = "\n                            <div style={{ padding:'8px 10px 10px' }}>"
const cardStart = src.indexOf(cardCtx, src.indexOf("breakInside:'avoid'"))
const cardEndIdx = src.indexOf(cardEnd, cardStart)
if (cardStart < 0 || cardEndIdx < 0) { console.error('Card context not found'); process.exit(1) }

const oldCardLine = src.slice(cardStart + cardCtx.length, cardEndIdx)
console.log('Found card line: ' + oldCardLine.trim().slice(0, 80) + '...')

const newCardLine = `                            {e.image_url && (e.image_url.toLowerCase().includes('.pdf')
                              ? <a href={e.image_url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', aspectRatio:'4/3', background:'#f5f2ee', color:'var(--ink)', fontSize:32, textDecoration:'none' }} onClick={ev=>ev.stopPropagation()}>{'\u{1F4C4}'}<span style={{ fontSize:10, marginLeft:6, textTransform:'uppercase', letterSpacing:'.06em' }}>PDF</span></a>
                              : <img src={e.image_url} alt="" style={{ width:'100%', aspectRatio:'4/3', objectFit:'cover', display:'block' }} />)}`

src = src.slice(0, cardStart + cardCtx.length) + newCardLine + src.slice(cardEndIdx)
console.log('OK: 1. Card thumbnail')

// 2. Drawer detail — find the image_url line in the drawer section
const drawerCtx = "                  padding:13 }}>\n"
const drawerEnd = "\n                  <div style={{ fontSize:11, color:'var(--muted)'"
const drawerStart = src.indexOf(drawerCtx)
const drawerEndIdx = src.indexOf(drawerEnd, drawerStart)
if (drawerStart < 0 || drawerEndIdx < 0) { console.error('Drawer context not found'); process.exit(1) }

const newDrawerLine = `                  {drawnEntry.image_url && (drawnEntry.image_url.toLowerCase().includes('.pdf')
                    ? <div style={{ marginBottom:10 }}>
                        <iframe src={drawnEntry.image_url} style={{ width:'100%', height:400, border:'1px solid var(--line)', borderRadius:3 }} title="PDF" />
                        <a href={drawnEntry.image_url} target="_blank" rel="noopener noreferrer" style={{ display:'block', fontSize:11, marginTop:6, color:'var(--ink)' }}>Open PDF in new tab</a>
                      </div>
                    : <img src={drawnEntry.image_url} alt="" style={{ width:'100%', borderRadius:3, marginBottom:10, border:'1px solid var(--line)' }} />)}`

src = src.slice(0, drawerStart + drawerCtx.length) + newDrawerLine + src.slice(drawerEndIdx)
console.log('OK: 2. Drawer detail')

// 3. Form preview — find the image preview in the add/edit modal
const formAnchor = '{uploading && <div style={{ fontSize:11, color:\'var(--muted)\', marginTop:4 }}>Uploading\u2026</div>}'
const formIdx = src.indexOf(formAnchor)
if (formIdx < 0) { console.error('Form upload context not found'); process.exit(1) }

// Find the next line after the upload indicator
const afterUpload = src.indexOf('\n', formIdx + formAnchor.length)
const formLineEnd = src.indexOf('\n', afterUpload + 1)
const oldFormLine = src.slice(afterUpload + 1, formLineEnd)
console.log('Found form line: ' + oldFormLine.trim().slice(0, 80) + '...')

const newFormLine = `                {form.image_url && (form.image_url.toLowerCase().includes('.pdf')
                  ? <div style={{ marginTop:8, padding:'10px 12px', background:'var(--parchment)', borderRadius:3, fontSize:12 }}>{'\u{1F4C4}'} <a href={form.image_url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--ink)' }}>View uploaded PDF</a></div>
                  : <img src={form.image_url} alt="" style={{ marginTop:8, maxHeight:120, borderRadius:3, border:'1px solid var(--line)' }} />)}`

src = src.slice(0, afterUpload + 1) + newFormLine + src.slice(formLineEnd)
console.log('OK: 3. Form preview')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
