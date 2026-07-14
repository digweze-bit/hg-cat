/**
 * Patches Forms.jsx with the new catalogue generator.
 * Run: node scripts/catalogue_patch.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Forms.jsx')

let src = fs.readFileSync(file, 'utf8')

// ── 1. Replace generateCatalogue function (lines 23 to the closing }) ──
const OLD_GEN_START = 'async function generateCatalogue('
const OLD_GEN_END = '\nexport default function Forms('

const genStart = src.indexOf(OLD_GEN_START)
const genEnd = src.indexOf(OLD_GEN_END)

if (genStart < 0 || genEnd < 0) {
  console.error('Could not find generateCatalogue boundaries')
  process.exit(1)
}

const NEW_GEN = `async function generateCatalogue(options, artworks, logoB64, previewOnly = false, artists = []) {
  const { format, showPricing, showBio, artworkBios } = options

  // Build artist bio map
  const artistBioMap = {}
  artists.forEach(a => { if (a.name && a.bio) artistBioMap[a.name] = a.bio })

  // Convert images to base64
  async function toBase64(url) {
    if (!url) return null
    try {
      const r = await fetch(url)
      const blob = await r.blob()
      return await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result)
        reader.onerror = rej
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const imgMap = {}
  await Promise.all(artworks.map(async w => {
    if (w.image_url) imgMap[w.artwork_id || w.id] = await toBase64(w.image_url)
  }))

  function artworkCaption(w) {
    const price = showPricing && (w.price || w.retail_price)
      ? (w.price || ('N' + Number(w.retail_price).toLocaleString()))
      : null
    const details = [w.medium, w.dimensions, w.year ? String(w.year) : null].filter(Boolean).join('  \u00B7  ')
    return \`
      <div class="caption">
        <div class="caption-title">\${escH(w.title || 'Untitled')}</div>
        <div class="caption-artist">\${escH(w.artist_name || '')}</div>
        \${details ? \`<div class="caption-details">\${escH(details)}</div>\` : ''}
        \${price ? \`<div class="caption-price">\${escH(price)}</div>\` : ''}
      </div>\`
  }

  let pages = ''

  // ── COVER PAGE (always) ──
  pages += \`
  <div class="page cover-page">
    \${logoB64 ? \`<img src="\${logoB64}" class="cover-logo">\` : \`<div class="cover-logo-text">HOURGLASS GALLERY</div>\`}
  </div>\`

  // ── ARTWORK PAGES ──
  if (format === 'single') {
    // One artwork per page
    artworks.forEach((w, i) => {
      const imgSrc = imgMap[w.artwork_id || w.id] || w.image_url
      pages += \`
      <div class="page artwork-page">
        <div class="img-wrap single">
          \${imgSrc ? \`<img src="\${imgSrc}" class="artwork-img">\` : '<div class="img-placeholder"></div>'}
        </div>
        \${artworkCaption(w)}
      </div>\`
    })
  } else {
    // Two artworks per page
    for (let i = 0; i < artworks.length; i += 2) {
      const w1 = artworks[i]
      const w2 = artworks[i + 1]
      const img1 = imgMap[w1.artwork_id || w1.id] || w1.image_url
      const img2 = w2 ? (imgMap[w2.artwork_id || w2.id] || w2.image_url) : null
      pages += \`
      <div class="page artwork-page two-up">
        <div class="two-up-item">
          <div class="img-wrap two">
            \${img1 ? \`<img src="\${img1}" class="artwork-img">\` : '<div class="img-placeholder"></div>'}
          </div>
          \${artworkCaption(w1)}
        </div>
        \${w2 ? \`<div class="two-up-item">
          <div class="img-wrap two">
            \${img2 ? \`<img src="\${img2}" class="artwork-img">\` : '<div class="img-placeholder"></div>'}
          </div>
          \${artworkCaption(w2)}
        </div>\` : '<div class="two-up-item"></div>'}
      </div>\`
    }
  }

  // ── BIO PAGES ──
  if (showBio) {
    const seenArtists = new Set()
    artworks.forEach(w => {
      if (!w.artist_name || seenArtists.has(w.artist_name)) return
      seenArtists.add(w.artist_name)
      // Use manually entered bio or pull from artists array
      const bio = (artworkBios && artworkBios[w.artist_name]) || artistBioMap[w.artist_name]
      if (!bio) return
      pages += \`
      <div class="page bio-page">
        <div class="bio-content">
          <div class="bio-name">\${escH(w.artist_name)}</div>
          <div class="bio-text">\${escH(bio)}</div>
        </div>
      </div>\`
    })
  }

  const html = \`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Hourglass Gallery Catalogue</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');

body { font-family: 'Cormorant Garamond', Georgia, serif; color: #1a1714; background: #fff; }

.page {
  width: 100%;
  min-height: 100vh;
  page-break-after: always;
  padding: 36px 48px 32px;
  display: flex;
  flex-direction: column;
}

/* Cover */
.cover-page {
  justify-content: center;
  align-items: center;
  background: #fff;
}
.cover-logo { height: 48px; object-fit: contain; opacity: .85; }
.cover-logo-text { font-size: 22px; font-weight: 300; letter-spacing: .18em; color: #1a1714; }

/* Artwork pages */
.artwork-page { justify-content: space-between; }

.img-wrap { display: flex; align-items: center; justify-content: center; }
.img-wrap.single { flex: 1; padding: 12px 0 20px; }
.img-wrap.two { height: 36vh; margin-bottom: 12px; }
.artwork-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.img-placeholder { width: 100%; height: 100%; background: #f5f2ee; }

.two-up { flex-direction: row; gap: 40px; }
.two-up-item { flex: 1; display: flex; flex-direction: column; }

/* Caption */
.caption { border-top: 1px solid #e8e3db; padding-top: 12px; }
.caption-title { font-size: 14px; font-weight: 600; letter-spacing: .01em; margin-bottom: 2px; }
.caption-artist { font-size: 13px; font-weight: 300; color: #444; margin-bottom: 3px; }
.caption-details { font-size: 11px; font-weight: 300; color: #999; letter-spacing: .03em; margin-bottom: 3px; }
.caption-price { font-size: 12px; font-weight: 400; color: #1a1714; margin-top: 4px; }

/* Bio pages */
.bio-page { justify-content: center; padding-top: 80px; }
.bio-content { max-width: 480px; }
.bio-name { font-size: 22px; font-weight: 300; letter-spacing: .03em; margin-bottom: 24px; }
.bio-text { font-size: 13px; font-weight: 300; line-height: 2; color: #444; }

@media print {
  .page { min-height: 100vh; }
  @page { margin: 0; size: A4 portrait; }
}
</style>
</head>
<body>
\${pages}
</body>
</html>\`

  const w = window.open('', '_blank', 'width=900,height=750')
  if (!w) { alert('Please allow popups'); return }
  w.document.write(html)
  w.document.close()
  if (!previewOnly) setTimeout(() => w.print(), 3000)
}

`

src = src.slice(0, genStart) + NEW_GEN + src.slice(genEnd)

// ── 2. Update catOptions state ──
src = src.replace(
  "  const [catOptions, setCatOptions] = useState({ showLogo:true, showPricing:true, showBio:false, title:'', intro:'' })",
  "  const [catOptions, setCatOptions] = useState({ format:'single', showPricing:false, showBio:false, artworkBios:{} })"
)

// ── 3. Replace the catalogue options step (step 3 for catalogue) ──
const OLD_OPTIONS = `              {/* ── STEP 2b: CATALOGUE OPTIONS (only for catalogue type) ── */}
              {step === 3 && bType === 'catalogue' && (`
const OLD_OPTIONS_END = `              )}`

// Find and replace the catalogue options block
const optStart = src.indexOf(OLD_OPTIONS)
if (optStart >= 0) {
  // Find the matching closing )}
  let depth = 0
  let pos = optStart + OLD_OPTIONS.length
  let found = -1
  while (pos < src.length) {
    if (src[pos] === '(' ) depth++
    if (src[pos] === ')' ) {
      if (depth === 0) { found = pos + 2; break }
      depth--
    }
    pos++
  }
  if (found > 0) {
    const NEW_OPTIONS = `              {/* ── CATALOGUE OPTIONS (step 3) ── */}
              {step === 3 && bType === 'catalogue' && (
                <div>
                  <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>
                    Configure your catalogue before generating.
                  </div>

                  {/* Format */}
                  <div className="form-group" style={{ marginBottom:20 }}>
                    <label className="form-label">Format</label>
                    <div style={{ display:'flex', gap:12, marginTop:6 }}>
                      {[['single','One artwork per page'],['double','Two artworks per page']].map(([val,label]) => (
                        <label key={val} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer',
                          padding:'10px 16px', border:\`2px solid \${catOptions.format===val?'var(--ink)':'var(--line)'}\`,
                          borderRadius:4, flex:1 }}>
                          <input type="radio" name="format" value={val} checked={catOptions.format===val}
                            onChange={() => setCatOptions(o=>({...o,format:val}))} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
                    {[
                      ['showPricing','Show pricing'],
                      ['showBio','Include artist biographies'],
                    ].map(([key,label]) => (
                      <label key={key} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, cursor:'pointer' }}>
                        <input type="checkbox" checked={catOptions[key]}
                          onChange={e => setCatOptions(o=>({...o,[key]:e.target.checked}))}
                          style={{ width:16, height:16 }} />
                        {label}
                      </label>
                    ))}
                  </div>

                  {/* Per-artist bio override */}
                  {catOptions.showBio && bArtworks.length > 0 && (
                    <div className="form-group">
                      <label className="form-label" style={{ marginBottom:10 }}>Artist biographies</label>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>
                        Bios are pulled from the Artists section automatically. You can override them here.
                      </div>
                      {[...new Set(bArtworks.map(w=>w.artist_name).filter(Boolean))].map(name => (
                        <div key={name} style={{ marginBottom:14 }}>
                          <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>{name}</div>
                          <textarea className="form-textarea" rows={3}
                            value={catOptions.artworkBios[name] || ''}
                            onChange={e => setCatOptions(o=>({...o, artworkBios:{...o.artworkBios,[name]:e.target.value}}))}
                            placeholder={'Bio will be pulled from Artists section automatically...'} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:10, marginTop:8 }}>
                    <button className="btn btn-outline" onClick={() => generateCatalogue(catOptions, bArtworks, LOGO_B64, true, artists)}>
                      Preview
                    </button>
                    <button className="btn btn-primary" onClick={() => generateCatalogue(catOptions, bArtworks, LOGO_B64, false, artists)}>
                      Generate & Print
                    </button>
                  </div>
                </div>
              )}`

    src = src.slice(0, optStart) + NEW_OPTIONS + src.slice(found)
  }
}

fs.writeFileSync(file, src, 'utf8')
console.log('Done')
console.log('generateCatalogue found:', src.includes('format === \'single\''))
console.log('Options step found:', src.includes('One artwork per page'))

// Note: drag-to-reorder uses HTML5 draggable API
// Add this to Forms.jsx after the bArtworks state declaration:
// const [dragIdx, setDragIdx] = useState(null)
