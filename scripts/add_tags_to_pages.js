import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── 1. Wire tags into Artworks.jsx ──
const artworksFile = path.join(__dirname, '../src/pages/Artworks.jsx')
let artworks = fs.readFileSync(artworksFile, 'utf8')
const artCRLF = artworks.includes('\r\n')
artworks = artworks.replace(/\r\n/g, '\n')

if (!artworks.includes("TagInput")) {
  // Add import
  artworks = artworks.replace(
    "import { useState, useEffect, useMemo, useCallback, useRef } from 'react'",
    "import { useState, useEffect, useMemo, useCallback, useRef } from 'react'\nimport TagInput, { ARTWORK_TAG_SUGGESTIONS } from '../components/TagInput'"
  )

  // Add tags to EMPTY
  artworks = artworks.replace(
    "const EMPTY = {",
    "const EMPTY = { tags: [],"
  )

  // Add tags to openEdit
  artworks = artworks.replace(
    "      consignor_name: artwork.consignor_name || '',",
    "      consignor_name: artwork.consignor_name || '',\n      tags: artwork.tags || [],"
  )

  // Add tags to save payload
  artworks = artworks.replace(
    "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,",
    "        consignor_name:    form.ownership === 'consignment' ? form.consignor_name || null : null,\n        tags:              form.tags || [],"
  )

  // Add tags field in form — find the Notes field and add Tags after it
  artworks = artworks.replace(
    `                      <label className="form-label">Notes <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--muted)', fontSize:10 }}>— internal only</span></label>
                      <textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />`,
    `                      <label className="form-label">Notes <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, color:'var(--muted)', fontSize:10 }}>— internal only</span></label>
                      <textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                  </div>
                  <div className="form-group">
                      <label className="form-label">Tags</label>
                      <TagInput tags={form.tags||[]} onChange={t=>setForm(f=>({...f,tags:t}))} suggestions={ARTWORK_TAG_SUGGESTIONS} placeholder="e.g. modernist, sculpture, Enwonwu..." />`
  )

  console.log('Artworks.jsx patched')
} else {
  console.log('Artworks.jsx already patched')
}

fs.writeFileSync(artworksFile, artCRLF ? artworks.replace(/\n/g, '\r\n') : artworks, 'utf8')

// ── 2. Wire tags into Sales.jsx (client form) ──
const salesFile = path.join(__dirname, '../src/pages/Sales.jsx')
let sales = fs.readFileSync(salesFile, 'utf8')
const salesCRLF = sales.includes('\r\n')
sales = sales.replace(/\r\n/g, '\n')

if (!sales.includes("TagInput")) {
  // Add import
  sales = sales.replace(
    "import { useState, useEffect, useMemo } from 'react'",
    "import { useState, useEffect, useMemo } from 'react'\nimport TagInput, { CLIENT_TAG_SUGGESTIONS } from '../components/TagInput'"
  )
  console.log('Sales.jsx import added')
} else {
  console.log('Sales.jsx already has TagInput')
}

fs.writeFileSync(salesFile, salesCRLF ? sales.replace(/\n/g, '\r\n') : sales, 'utf8')

