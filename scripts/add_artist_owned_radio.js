import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Remove any broken artist_owned label that was partially inserted
const brokenPattern = /\n\s*<label[^>]*artist_owned[\s\S]*?<\/label>/
src = src.replace(brokenPattern, '')

// Find the closing </label> of the Gallery owned radio (after "Purchased by Hourglass")
const insertAfter = `                    </label>\n                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:\`1px solid \${form.ownership==='consignment'?'var(--amber)':'var(--line)'}\`, borderRadius:3, background: form.ownership==='consignment'?'#fdf3e0':'var(--white)' }}>`

if (!src.includes(insertAfter)) {
  console.error('Consignment label anchor not found')
  process.exit(1)
}

const artistOwnedLabel = `                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:\`1px solid \${form.ownership==='artist_owned'?'var(--green,#2d6a4f)':'var(--line)'}\`, borderRadius:3, background: form.ownership==='artist_owned'?'#edf7f0':'var(--white)' }}>
                      <input type="radio" name="ownership" value="artist_owned" checked={form.ownership==='artist_owned'} onChange={()=>setForm(f=>({...f,ownership:'artist_owned'}))} style={{ width:'auto', accentColor:'var(--green,#2d6a4f)' }} />
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, color: form.ownership==='artist_owned'?'var(--green,#2d6a4f)':'var(--ink)' }}>Artist owned</div>
                        <div style={{ fontSize:10, color: form.ownership==='artist_owned'?'#2d6a4f':'var(--muted)' }}>Consigned directly by artist</div>
                      </div>
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', padding:'9px 12px', border:\`1px solid \${form.ownership==='consignment'?'var(--amber)':'var(--line)'}\`, borderRadius:3, background: form.ownership==='consignment'?'#fdf3e0':'var(--white)' }}>`

src = src.replace(insertAfter, artistOwnedLabel)

// Fix consignment fields to show for artist_owned too
src = src.replace(
  /\{form\.ownership === 'consignment' && \(/g,
  "{(form.ownership === 'consignment' || form.ownership === 'artist_owned') && ("
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully')
