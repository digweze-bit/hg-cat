import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Catalogue.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('aw-detail-mobile')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add mobile CSS for the detail modal — inject a <style> at the start of ArtworkDetail return
mustReplace(
  "function ArtworkDetail({ artwork: w, artist, onClose }) {\n  return (",
  `function ArtworkDetail({ artwork: w, artist, onClose }) {
  return (
    <>
    <style>{\`
      @media (max-width: 699px) {
        .aw-detail-modal { flex-direction: column !important; max-height: 95vh !important; }
        .aw-detail-img { width: 100% !important; max-height: 45vh; }
        .aw-detail-img img { max-height: 45vh; object-fit: contain; }
        .aw-detail-text { padding: 18px !important; }
      }
    \`}</style>`,
  '1. Add mobile CSS'
)

// 2. Update the modal container
mustReplace(
  'className="aw-detail-modal" style={{ background:\'#fff\', borderRadius:3, maxWidth:860, width:\'100%\', maxHeight:\'90vh\', display:\'flex\', overflow:\'hidden\', boxShadow:\'0 8px 48px rgba(0,0,0,.25)\' }}',
  'className="aw-detail-modal" style={{ background:\'#fff\', borderRadius:3, maxWidth:860, width:\'100%\', maxHeight:\'90vh\', display:\'flex\', overflowY:\'auto\', boxShadow:\'0 8px 48px rgba(0,0,0,.25)\' }}',
  '2. Modal overflow'
)

// 3. Close the fragment at the end of ArtworkDetail
// Find the closing of ArtworkDetail - last </div> before the next function or end
const endMarker = "      </div>\n    </div>\n  )\n}"
const lastIdx = src.lastIndexOf(endMarker)
if (lastIdx < 0) { console.error('NOT FOUND: ArtworkDetail closing'); process.exit(1) }
src = src.slice(0, lastIdx) + "      </div>\n    </div>\n    </>\n  )\n}" + src.slice(lastIdx + endMarker.length)
console.log('OK: 3. Close fragment')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
