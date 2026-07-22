import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('thumbnail_url')) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Update handleImageUpload to generate 3 sizes: thumb (150px), display (600px), full (1600px)
const oldUpload = `  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const resized = await resizeImage(file, 1200)
      const path = \`works/\${Date.now()}_\${file.name.replace(/\\s+/g, '_')}\`
      const { error } = await supabase.storage.from('artwork-images').upload(path, resized)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('artwork-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }`

const newUpload = `  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const base = \`works/\${Date.now()}_\${file.name.replace(/\\s+/g, '_')}\`

      const [thumbBlob, displayBlob, fullBlob] = await Promise.all([
        resizeImage(file, 150),
        resizeImage(file, 600),
        resizeImage(file, 1600),
      ])

      const thumbPath = base.replace(/(\\.\\w+)?$/, '_thumb.jpg')
      const displayPath = base.replace(/(\\.\\w+)?$/, '_display.jpg')
      const fullPath = base.replace(/(\\.\\w+)?$/, '_full.jpg')

      const [r1, r2, r3] = await Promise.all([
        supabase.storage.from('artwork-images').upload(thumbPath, thumbBlob),
        supabase.storage.from('artwork-images').upload(displayPath, displayBlob),
        supabase.storage.from('artwork-images').upload(fullPath, fullBlob),
      ])
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      if (r3.error) throw r3.error

      const thumbUrl = supabase.storage.from('artwork-images').getPublicUrl(thumbPath).data.publicUrl
      const displayUrl = supabase.storage.from('artwork-images').getPublicUrl(displayPath).data.publicUrl
      const fullUrl = supabase.storage.from('artwork-images').getPublicUrl(fullPath).data.publicUrl

      setForm(f => ({ ...f, image_url: displayUrl, thumbnail_url: thumbUrl, full_image_url: fullUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }`

if (!src.includes(oldUpload)) { console.error('handleImageUpload anchor not found'); process.exit(1) }
src = src.replace(oldUpload, newUpload)

// 2. Add thumbnail_url and full_image_url to EMPTY
src = src.replace(
  "const EMPTY = { title:'', artist_id:'', year:'', medium:'', category:'', dimensions:'', dimension_unit:'in', series:''",
  "const EMPTY = { title:'', artist_id:'', year:'', medium:'', category:'', dimensions:'', dimension_unit:'in', thumbnail_url:'', full_image_url:'', series:''"
)

// 3. Add to select query
src = src.replace(
  "select:'id,title,artist_id,year,medium,category,dimensions,dimension_unit,availability,ownership",
  "select:'id,title,artist_id,year,medium,category,dimensions,dimension_unit,thumbnail_url,full_image_url,availability,ownership"
)

// 4. Add to save payload
src = src.replace(
  "        dimension_unit:    form.dimension_unit || 'in',",
  "        dimension_unit:    form.dimension_unit || 'in',\n        thumbnail_url:     form.thumbnail_url || null,\n        full_image_url:    form.full_image_url || null,"
)

// 5. Update the list thumbnail img tag to prefer thumbnail_url
src = src.replace(
  '? <img src={w.image_url} alt="" loading="lazy" decoding="async" style={{ width:44,',
  '? <img src={w.thumbnail_url || w.image_url} alt="" loading="lazy" decoding="async" style={{ width:44,'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Artworks.jsx patched successfully')
