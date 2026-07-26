import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Artworks.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes("auditLog('artwork.created'")) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Add import
const importAnchor = "import { useState, useEffect, useMemo, useCallback, useRef } from 'react'"
src = src.replace(importAnchor, importAnchor + "\nimport { auditLog } from '../lib/audit'")

// 2. Log artwork update — add AFTER the update call, before setArtworks
const updateAnchor = "        const { error: updateErr } = await supabase.from('artworks').update(payload).eq('id', editId)\n        if (updateErr) throw updateErr"
if (!src.includes(updateAnchor)) { console.error('update anchor not found'); process.exit(1) }
src = src.replace(updateAnchor,
  updateAnchor + "\n        auditLog('artwork.updated', { entityType:'artwork', entityId:editId, entityLabel:payload.title, metadata:{ artist: artistMap[payload.artist_id]?.name } })")

// 3. Log artwork create — add AFTER insert, before cacheInvalidate
const insertAnchor = "        const { error: insertErr } = await supabase.from('artworks').insert({ ...payload, visible: true, hg_code: hgCode })\n        if (insertErr) throw insertErr"
if (!src.includes(insertAnchor)) { console.error('insert anchor not found'); process.exit(1) }
src = src.replace(insertAnchor,
  insertAnchor + "\n        auditLog('artwork.created', { entityType:'artwork', entityId:null, entityLabel:payload.title, metadata:{ artist: artistMap[payload.artist_id]?.name } })")

// 4. Log artwork delete — add BEFORE the delete call (get title first)
const deleteAnchor = "    if (!confirm('Delete this artwork?')) return\n    await supabase.from('artworks').delete().eq('id', id)"
if (!src.includes(deleteAnchor)) { console.error('delete anchor not found'); process.exit(1) }
src = src.replace(deleteAnchor,
  "    if (!confirm('Delete this artwork?')) return\n    const toDelete = artworks.find(w => w.id === id)\n    await supabase.from('artworks').delete().eq('id', id)\n    auditLog('artwork.deleted', { entityType:'artwork', entityId:id, entityLabel:toDelete?.title, metadata:{ artist: artistMap[toDelete?.artist_id]?.name } })")

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Artworks audit logging added successfully')
