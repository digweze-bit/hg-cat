import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('auditLog')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Import auditLog
mustReplace(
  "import { supabase, fetchAll } from '../lib/supabase'",
  "import { supabase, fetchAll } from '../lib/supabase'\nimport { auditLog } from '../lib/audit'",
  '1. Import auditLog'
)

// 2. Find the artwork update/save and add audit logging after successful save
// Find the edit save path - look for "await supabase.from('artworks').update"
const updateIdx = src.indexOf("await supabase.from('artworks').update(payload)")
if (updateIdx < 0) { console.error('NOT FOUND: artwork update call'); process.exit(1) }

// Find the line after update that checks for error
const afterUpdate = src.indexOf('\n', updateIdx)
const nextLines = src.slice(afterUpdate, afterUpdate + 500)

// Add audit log after successful edit
mustReplace(
  "        toast('Artwork updated')\n        closeModal()",
  `        // Log availability changes to audit trail
        if (editId && form.availability) {
          const oldArt = artworks.find(a => a.id === editId)
          if (oldArt && oldArt.availability !== form.availability) {
            auditLog('artwork.status_changed', {
              entityType: 'artwork', entityId: editId, entityLabel: form.title,
              metadata: { from: oldArt.availability, to: form.availability, consignor: form.consignor_name || null }
            })
          }
        }
        toast('Artwork updated')
        closeModal()`,
  '2. Audit log on edit'
)

// 3. Add audit log for new artwork creation
mustReplace(
  "        toast('Artwork created')\n        closeModal()",
  `        auditLog('artwork.created', { entityType: 'artwork', entityId: data?.[0]?.id, entityLabel: form.title })
        toast('Artwork created')
        closeModal()`,
  '3. Audit log on create'
)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
