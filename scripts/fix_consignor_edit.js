import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

// Replace the useEffect that handles editArtworkId with a ref-guarded version
src = src.replace(
  `  // Handle edit artwork from other pages (e.g. Consignors)
  useEffect(() => {
    const editId = location.state?.editArtworkId
    if (!editId || artworks.length === 0) return
    window.history.replaceState({}, '')
    const aw = artworks.find(w => w.id === editId)
    if (aw) openEdit(aw)
  }, [location.state, artworks])`,
  `  // Handle edit artwork from other pages (e.g. Consignors)
  const handledEditRef = useRef(null)
  useEffect(() => {
    const editId = location.state?.editArtworkId
    if (!editId || artworks.length === 0) return
    if (handledEditRef.current === editId) return // already handled
    handledEditRef.current = editId
    window.history.replaceState({}, '')
    const aw = artworks.find(w => w.id === editId)
    if (aw) openEdit(aw)
  }, [location.state, artworks])`
)

if (src.includes('handledEditRef')) {
  console.log('OK: Fixed with ref guard')
} else {
  console.error('Replace failed')
  process.exit(1)
}

// Also remove the debug alerts
src = src.replace(
  "onClick={() => { window.alert(\"Consignment currency: \" + code); setForm(f=>({...f,consignment_currency:code})) }}",
  "onClick={() => setForm(f=>({...f,consignment_currency:code}))}"
)
src = src.replace(
  "onClick={() => { window.alert(\"Price currency: \" + c); setInputCurrency(c) }}",
  "onClick={() => setInputCurrency(c)}"
)
console.log('OK: Removed debug alerts')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
