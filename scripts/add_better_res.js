import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/ArtworkPage.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('showFullRes')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add showFullRes state near other useState calls
const stateAnchor = "  const [qrDataUrl, setQrDataUrl] = useState(null)"
if (!src.includes(stateAnchor)) { console.error('State anchor not found'); process.exit(1) }
src = src.replace(stateAnchor, stateAnchor + "\n  const [showFullRes, setShowFullRes] = useState(false)")

// 2. Replace the image block to support full_image_url toggle
const oldImg = `            <div>
              {artwork.image_url ? (
                <img className="aw-img" src={artwork.image_url} alt={artwork.title}
                  style={{ width:'100%', display:'block', borderRadius:2, objectFit:'contain', background:'#f0ece6' }} />
              ) : (
                <div style={{ width:'100%', aspectRatio:'3/4', background:'#ede9e2', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:12, color:'#b0aa9f' }}>No image on file</span>
                </div>
              )}
            </div>`

const newImg = `            <div>
              {artwork.image_url ? (
                <>
                  <img className="aw-img" src={showFullRes && artwork.full_image_url ? artwork.full_image_url : artwork.image_url} alt={artwork.title}
                    style={{ width:'100%', display:'block', borderRadius:2, objectFit:'contain', background:'#f0ece6' }} />
                  {artwork.full_image_url && !showFullRes && (
                    <button onClick={() => setShowFullRes(true)}
                      style={{ marginTop:8, fontSize:11, color:'#9a9490', background:'none', border:'1px solid #e8e3db', borderRadius:3, padding:'5px 10px', cursor:'pointer', fontFamily:'inherit' }}>
                      View higher resolution
                    </button>
                  )}
                </>
              ) : (
                <div style={{ width:'100%', aspectRatio:'3/4', background:'#ede9e2', borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:12, color:'#b0aa9f' }}>No image on file</span>
                </div>
              )}
            </div>`

if (!src.includes(oldImg)) { console.error('Image block anchor not found'); process.exit(1) }
src = src.replace(oldImg, newImg)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ArtworkPage.jsx patched successfully')
