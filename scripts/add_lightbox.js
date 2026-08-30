import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/ArtworkPage.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('lightbox')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add lightbox state
mustReplace(
  '  const [showFullRes, setShowFullRes] = useState(false)',
  '  const [showFullRes, setShowFullRes] = useState(false)\n  const [lightbox, setLightbox] = useState(false)',
  '1. Add lightbox state'
)

// 2. Make image clickable
mustReplace(
  "                  <img className=\"aw-img\" src={showFullRes && artwork.full_image_url ? artwork.full_image_url : artwork.image_url} alt={artwork.title}",
  "                  <img className=\"aw-img\" onClick={() => setLightbox(true)} src={showFullRes && artwork.full_image_url ? artwork.full_image_url : artwork.image_url} alt={artwork.title}",
  '2. Make image clickable'
)

// 3. Add cursor pointer to image style
mustReplace(
  "style={{ width:'100%', display:'block', borderRadius:2, objectFit:'contain', background:'#f0ece6' }}",
  "style={{ width:'100%', display:'block', borderRadius:2, objectFit:'contain', background:'#f0ece6', cursor:'zoom-in' }}",
  '3. Cursor pointer'
)

// 4. Add lightbox overlay before the footer
mustReplace(
  "          {/* Footer */}",
  `          {/* Lightbox */}
          {lightbox && (
            <div className="no-print" onClick={() => setLightbox(false)}
              style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.92)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out', padding:16 }}>
              <img src={artwork.full_image_url || artwork.image_url} alt={artwork.title}
                style={{ maxWidth:'95vw', maxHeight:'95vh', objectFit:'contain', borderRadius:2 }} />
              <button onClick={() => setLightbox(false)}
                style={{ position:'absolute', top:16, right:20, background:'none', border:'none', color:'#fff', fontSize:28, cursor:'pointer', opacity:.7 }}>
                {'\u2715'}
              </button>
            </div>
          )}

          {/* Footer */}`,
  '4. Lightbox overlay'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
