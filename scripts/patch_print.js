import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let src = fs.readFileSync(file, 'utf8')

// Add printMenu state
if (!src.includes('printMenu')) {
  src = src.replace(
    '  const [uploading, setUploading]   = useState(false)',
    '  const [uploading, setUploading]   = useState(false)\n  const [printMenu, setPrintMenu]     = useState(false)'
  )
}

// Replace any existing print button (handles all variants)
src = src.replace(
  /\s*<button[\s\S]*?printArtworkList[\s\S]*?Print list[\s\S]*?<\/button>/m,
  `
        <div style={{ position:'relative' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPrintMenu(m => !m)}>
            ⎙ Print ▾
          </button>
          {printMenu && (
            <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:200,
              background:'var(--bg,#fff)', border:'1px solid var(--line-soft)', borderRadius:4,
              boxShadow:'0 4px 16px rgba(0,0,0,.12)', minWidth:190, overflow:'hidden' }}
              onMouseLeave={() => setPrintMenu(false)}>
              <button style={{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left',
                fontSize:12, cursor:'pointer', border:'none', background:'none', borderBottom:'1px solid var(--line-soft)' }}
                onClick={() => { setPrintMenu(false); setTimeout(() => printArtworkList(sorted, artistMap, filters, 'thumbnail'), 50) }}>
                <strong>Thumbnail list</strong>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>Compact rows with images</div>
              </button>
              <button style={{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left',
                fontSize:12, cursor:'pointer', border:'none', background:'none' }}
                onClick={() => { setPrintMenu(false); setTimeout(() => printArtworkList(sorted, artistMap, filters, 'fullpage'), 50) }}>
                <strong>Full page</strong>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>One large artwork per page</div>
              </button>
            </div>
          )}
        </div>`
)

// Fix fullpage HTML - simpler, smaller text
const newFullpage = `  } else {
    body = artworks.map((w, i) => {
      const artist = artistMap[w.artist_id]
      const img = w.image_url
        ? \`<img src="\${w.image_url}" style="display:block;margin:24px auto 20px;max-width:480px;max-height:480px;object-fit:contain;">\`
        : \`<div style="width:480px;height:360px;background:#f0ece7;margin:24px auto 20px;"></div>\`
      const price = w.retail_price ? '\\u20a6' + Number(w.retail_price).toLocaleString() : (w.price || '')
      return \`<div style="page-break-after:\${i < artworks.length-1?'always':'auto'};padding:28px 40px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid #1a1714;margin-bottom:0;">
          <span style="font-family:Georgia,serif;font-size:14px;letter-spacing:.02em;">Hourglass Gallery</span>
          <span style="font-size:9px;color:#aaa;">\${escH(w.hg_code||'')}</span>
        </div>
        \${img}
        <div style="margin-top:0;">
          <div style="font-size:13px;color:#1a1714;margin-bottom:2px;">\${escH(w.title)}</div>
          <div style="font-size:13px;color:#555;margin-bottom:10px;">\${escH(artist?.name||'—')}</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div style="font-size:11px;color:#888;line-height:1.7;">
              \${[w.year,w.medium,w.dimensions].filter(Boolean).map(escH).join(' &middot; ')}
              \${w.location ? '<br>'+escH(w.location) : ''}
            </div>
            <div style="text-align:right;">
              \${price ? \`<div style="font-size:12px;font-weight:600;color:#1a1714;">\${escH(price)}</div>\` : ''}
              <div style="font-size:10px;color:\${w.availability==='Available'?'#2d6a4f':'#999'};margin-top:2px;">\${escH(w.availability||'')}</div>
            </div>
          </div>
        </div>
      </div>\`
    }).join('')
  }`

// Replace the fullpage else block
src = src.replace(/\s*} else \{[\s\S]*?\/\/ Full page[\s\S]*?}\s*}(\s*const html)/, newFullpage + '\n$1')

// Make async and fix print delay
if (!src.includes('await new Promise')) {
  src = src.replace(
    'async function printArtworkList',
    'async function printArtworkList'
  )
  src = src.replace(
    "function printArtworkList(artworks, artistMap, filters, mode = 'thumbnail') {",
    "async function printArtworkList(artworks, artistMap, filters, mode = 'thumbnail') {\n  await new Promise(r => setTimeout(r, 50))"
  )
}

src = src.replace(
  "  setTimeout(() => w.print(), 800)",
  "  setTimeout(() => w.print(), mode === 'fullpage' ? 2000 : 800)"
)
src = src.replace(
  "  setTimeout(() => w.print(), mode === 'fullpage' ? 2500 : 800)",
  "  setTimeout(() => w.print(), mode === 'fullpage' ? 2000 : 800)"
)

fs.writeFileSync(file, src, 'utf8')
console.log('Done')
console.log('printMenu found:', src.includes('printMenu'))
console.log('Thumbnail list found:', src.includes('Thumbnail list'))
