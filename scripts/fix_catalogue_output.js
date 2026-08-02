import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/CatalogueBuilder.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('previewHtml')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) {
    console.error('ANCHOR NOT FOUND: ' + label)
    console.error('--- Looking for ---')
    console.error(oldStr.slice(0, 200))
    process.exit(1)
  }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add previewHtml state after generating
mustReplace(
  `  const [generating, setGenerating] = useState(false)`,
  `  const [generating, setGenerating] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const previewRef = useRef(null)`,
  '1. Add preview state'
)

// 2. Replace the entire generate function and its artworkCard/pages logic
const genStart = `  // ── Generate catalogue ──
  async function generate() {`
const genEnd = `    setGenerating(false)
  }`

if (!src.includes(genStart)) { console.error('generate start not found'); process.exit(1) }
if (!src.includes(genEnd)) { console.error('generate end not found'); process.exit(1) }

const genIdx = src.indexOf(genStart)
const genEndIdx = src.indexOf(genEnd, genIdx) + genEnd.length

const newGen = `  // ── Generate catalogue ──
  async function generate() {
    if (selected.length === 0) return alert('Select at least one artwork')
    setGenerating(true)

    async function toB64(url) {
      if (!url) return null
      try {
        const r = await fetch(url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now(), { cache: 'no-store' })
        const blob = await r.blob()
        return await new Promise((res, rej) => { const reader = new FileReader(); reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(blob) })
      } catch { return null }
    }

    const imgMap = {}
    await Promise.all(selected.map(async w => { imgMap[w.id] = await toB64(w.image_url) }))

    const du = (w) => w.dimension_unit === 'cm' ? 'cm' : 'in'

    function card(w, size) {
      const img = imgMap[w.id]
      const details = [w.medium, w.dimensions ? w.dimensions + ' ' + du(w) : null, w.year ? String(w.year) : null].filter(Boolean).join(' \\u00b7 ')
      const price = showPrice && (w.price || w.retail_price)
        ? (w.price || ('\\u20a6' + Number(w.retail_price).toLocaleString()))
        : null
      const bio = showBio && bioPlacement === 'inline' ? bios[w.artist_name] : null
      const note = showNotes && notes[w.id] ? notes[w.id] : null
      const fs = size === 'full' ? 12 : size === 'half' ? 11 : 10

      return \`<div class="card card-\${size}">
        \${img ? \`<div class="img-wrap"><img src="\${img}" /></div>\` : '<div class="img-ph"></div>'}
        <div class="meta">
          <div class="t" style="font-size:\${fs}px">\${esc(w.title || 'Untitled')}</div>
          <div class="a" style="font-size:\${fs}px">\${esc(w.artist_name)}</div>
          \${details ? \`<div class="d" style="font-size:\${fs}px">\${esc(details)}</div>\` : ''}
          \${price ? \`<div class="pr" style="font-size:\${fs}px">\${esc(price)}</div>\` : ''}
          \${note ? \`<div class="nt" style="font-size:\${fs}px">\${esc(note)}</div>\` : ''}
          \${bio ? \`<div class="ib">\${bio.split('\\n\\n').map(p => '<p>' + esc(p) + '</p>').join('')}</div>\` : ''}
        </div>
      </div>\`
    }

    let pages = []

    if (showLogo && LOGO_B64) {
      pages.push(\`<div class="pg logo-pg"><img src="\${LOGO_B64}" class="logo" /></div>\`)
    }

    if (layout === 'single') {
      selected.forEach(w => pages.push(\`<div class="pg">\${card(w,'full')}</div>\`))
    } else if (layout === 'double') {
      for (let i = 0; i < selected.length; i += 2) {
        const c = [card(selected[i],'half')]
        if (selected[i+1]) c.push(card(selected[i+1],'half'))
        pages.push(\`<div class="pg dbl">\${c.join('')}</div>\`)
      }
    } else {
      for (let i = 0; i < selected.length; i += 4) {
        const c = selected.slice(i,i+4).map(w => card(w,'quarter'))
        pages.push(\`<div class="pg quad">\${c.join('')}</div>\`)
      }
    }

    if (showBio && bioPlacement === 'end') {
      const used = [...new Set(selected.map(w => w.artist_name))].filter(Boolean).sort()
      used.filter(n => bios[n]).forEach(n => {
        pages.push(\`<div class="pg bio-pg"><div class="bn">\${esc(n)}</div><div class="bt">\${bios[n].split('\\n\\n').map(p=>'<p>'+esc(p)+'</p>').join('')}</div></div>\`)
      })
    }

    const html = \`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalogue</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Helvetica,sans-serif;background:#f5f3f0;color:#1a1714}
.pg{width:100%;max-width:420px;margin:12px auto;background:#fff;aspect-ratio:3/4;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:28px 24px;box-shadow:0 1px 6px rgba(0,0,0,.08);border-radius:2px;overflow:hidden;page-break-after:always;position:relative}
.pg.dbl{gap:16px}
.pg.quad{flex-wrap:wrap;flex-direction:row;gap:10px;justify-content:center;align-content:center}
.logo-pg{justify-content:center}
.logo{max-width:180px;max-height:100px;object-fit:contain}
.card{display:flex;flex-direction:column;align-items:center;width:100%}
.card-half{max-width:100%}
.card-quarter{max-width:48%;flex:0 0 48%}
.img-wrap{width:100%;display:flex;justify-content:center;margin-bottom:12px}
.img-wrap img{max-width:100%;max-height:55vh;object-fit:contain;display:block}
.card-half .img-wrap img{max-height:28vh}
.card-quarter .img-wrap img{max-height:16vh}
.img-ph{width:100%;height:180px;background:#f0ece7;border-radius:2px;margin-bottom:12px}
.meta{text-align:center;max-width:380px}
.t{font-weight:600;letter-spacing:.01em;margin-bottom:1px}
.a{color:#6b6760;margin-bottom:1px}
.d{color:#9a9490;margin-bottom:1px}
.pr{color:#92600a;margin-top:3px}
.nt{color:#3d3a36;font-style:italic;margin-top:5px;line-height:1.5}
.ib{margin-top:8px;text-align:left;color:#3d3a36;line-height:1.6;font-size:10px}
.ib p{margin-bottom:.6em}
.bio-pg{align-items:flex-start;padding:32px 28px}
.bn{font-size:16px;font-weight:600;margin-bottom:12px;letter-spacing:.02em}
.bt{font-size:12px;line-height:1.8;color:#3d3a36}
.bt p{margin-bottom:.8em}
.dl-bar{position:fixed;bottom:0;left:0;right:0;background:#1a1714;padding:10px 20px;display:flex;justify-content:center;gap:12px;z-index:10}
.dl-bar button{padding:8px 20px;border:none;border-radius:3px;font-size:13px;cursor:pointer;font-weight:500}
.dl-btn{background:#E05C2A;color:#fff}
.bk-btn{background:transparent;color:#aaa;border:1px solid #555}
@media(max-width:440px){.pg{margin:8px auto;padding:20px 16px;border-radius:0;box-shadow:none}}
@media print{body{background:#fff}.pg{box-shadow:none;margin:0;max-width:100%;border-radius:0;aspect-ratio:auto;min-height:100vh}.dl-bar{display:none}@page{margin:0;size:A4 portrait}}
</style></head><body>
\${pages.join('\\n')}
<div class="dl-bar">
  <button class="bk-btn" onclick="window.close()">Close</button>
  <button class="dl-btn" onclick="window.print()">Download PDF</button>
</div>
</body></html>\`

    setPreviewHtml(html)
    setShowPreview(true)
    setGenerating(false)
  }`

src = src.slice(0, genIdx) + newGen + src.slice(genEndIdx)
console.log('OK: 2. Replace generate function')

// 3. Add preview overlay in the return JSX — insert right before the closing </div>\n  )\n}
const closingAnchor = `      </div>
    </div>
  )
}`

if (!src.includes(closingAnchor)) { console.error('Closing anchor not found'); process.exit(1) }

src = src.replace(closingAnchor, `      </div>

      {/* Preview overlay */}
      {showPreview && (
        <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,.85)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#1a1714' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:500 }}>Catalogue preview</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowPreview(false)}
                style={{ padding:'6px 14px', background:'transparent', border:'1px solid #555', color:'#aaa', borderRadius:3, cursor:'pointer', fontSize:12 }}>
                Back to editor
              </button>
              <button onClick={() => {
                const w = window.open('', '_blank')
                if (!w) { alert('Allow popups to generate PDF'); return }
                w.document.open(); w.document.write(previewHtml); w.document.close(); w.focus()
              }}
                style={{ padding:'6px 14px', background:'#E05C2A', border:'none', color:'#fff', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:500 }}>
                Open & Download PDF
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center' }}>
            <iframe ref={previewRef} srcDoc={previewHtml}
              style={{ width:'100%', maxWidth:480, height:'100%', border:'none', background:'#f5f3f0' }}
              title="Catalogue preview" />
          </div>
        </div>
      )}
    </div>
  )
}`)

console.log('OK: 3. Add preview overlay')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL PATCHES APPLIED SUCCESSFULLY')
