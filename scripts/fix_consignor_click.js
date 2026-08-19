import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── 1. Add navigate + clickable rows to Consignors.jsx ──
const cFile = path.join(__dirname, '../src/pages/Consignors.jsx')
let csrc = fs.readFileSync(cFile, 'utf8').replace(/\r\n/g, '\n')

if (!csrc.includes('useNavigate')) {
  // Add import
  csrc = csrc.replace(
    "import { useState, useEffect",
    "import { useState, useEffect"
  )
  // Find first import line and add useNavigate
  csrc = csrc.replace(
    "import { supabase",
    "import { useNavigate } from 'react-router-dom'\nimport { supabase"
  )
  console.log('OK: 1a. Added useNavigate import')

  // Add navigate hook after component opening
  csrc = csrc.replace(
    "  const [consignors, setConsignors]",
    "  const navigate = useNavigate()\n  const [consignors, setConsignors]"
  )
  console.log('OK: 1b. Added navigate hook')

  // Make artwork rows clickable
  csrc = csrc.replace(
    "                {consignorArtworks.map(w => (\n                  <tr key={w.id} style={{borderBottom:'1px solid var(--line-soft)'}}>",
    "                {consignorArtworks.map(w => (\n                  <tr key={w.id} onClick={() => navigate('/admin/artworks', { state: { editArtworkId: w.id } })} style={{borderBottom:'1px solid var(--line-soft)', cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--parchment)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>"
  )
  console.log('OK: 1c. Made rows clickable')

  fs.writeFileSync(cFile, csrc, 'utf8')
}

// ── 2. Add handler in Artworks.jsx to open edit from state ──
const aFile = path.join(__dirname, '../src/pages/Artworks.jsx')
let asrc = fs.readFileSync(aFile, 'utf8').replace(/\r\n/g, '\n')

if (!asrc.includes('editArtworkId')) {
  // Add useLocation import if not present
  if (!asrc.includes('useLocation')) {
    asrc = asrc.replace(
      "import { useNavigate } from 'react-router-dom'",
      "import { useNavigate, useLocation } from 'react-router-dom'"
    )
    console.log('OK: 2a. Added useLocation import')
  }

  // Add location hook
  asrc = asrc.replace(
    '  const navigate = useNavigate()',
    '  const navigate = useNavigate()\n  const location = useLocation()'
  )
  console.log('OK: 2b. Added location hook')

  // Add useEffect to handle incoming editArtworkId
  asrc = asrc.replace(
    "  const [subView, setSubView] = useState('artworks')",
    `  const [subView, setSubView] = useState('artworks')

  // Handle edit artwork from other pages (e.g. Consignors)
  useEffect(() => {
    const editId = location.state?.editArtworkId
    if (!editId || artworks.length === 0) return
    window.history.replaceState({}, '')
    const aw = artworks.find(w => w.id === editId)
    if (aw) openEdit(aw)
  }, [location.state, artworks])`
  )
  console.log('OK: 2c. Added editArtworkId handler')

  fs.writeFileSync(aFile, asrc, 'utf8')
}

console.log('ALL DONE')
