import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function mustReplace(src, oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  console.log('OK: ' + label)
  return src.replace(oldStr, newStr)
}

// ── 1. ArtworkPage.jsx ──
const apFile = path.join(__dirname, '../src/pages/ArtworkPage.jsx')
let ap = fs.readFileSync(apFile, 'utf8').replace(/\r\n/g, '\n')

if (!ap.includes('ArtworkInquiryEmbed')) {
  // Add import
  ap = mustReplace(ap,
    "import { supabase }",
    "import ArtworkInquiryEmbed from '../components/ArtworkInquiryEmbed'\nimport { supabase }",
    'ArtworkPage: import'
  )

  // Add embed after the artwork details, before closing divs
  // Find the print-only section or end of details
  ap = mustReplace(ap,
    "        {/* Print-only footer */}",
    `        {/* Inquiry form */}
        <div className="no-print" style={{ marginTop:32 }}>
          <ArtworkInquiryEmbed artworkTitle={artwork.title} artworkId={artwork.id} />
        </div>

        {/* Print-only footer */}`,
    'ArtworkPage: embed'
  )

  fs.writeFileSync(apFile, ap, 'utf8')
  console.log('ArtworkPage.jsx updated')
}

// ── 2. Catalogue.jsx ArtworkDetail ──
const catFile = path.join(__dirname, '../src/pages/Catalogue.jsx')
let cat = fs.readFileSync(catFile, 'utf8').replace(/\r\n/g, '\n')

if (!cat.includes('ArtworkInquiryEmbed')) {
  // Add import
  cat = mustReplace(cat,
    "import { useState, useEffect, useMemo }",
    "import ArtworkInquiryEmbed from '../components/ArtworkInquiryEmbed'\nimport { useState, useEffect, useMemo }",
    'Catalogue: import'
  )

  // Add embed inside ArtworkDetail, after the details grid/bio section
  // Find the close button or end of details in ArtworkDetail
  cat = mustReplace(cat,
    "          {w.writeup && (",
    `          {/* Inquiry form */}
          <ArtworkInquiryEmbed artworkTitle={w.title} artworkId={w.id} />

          {w.writeup && (`,
    'Catalogue: embed'
  )

  fs.writeFileSync(catFile, cat, 'utf8')
  console.log('Catalogue.jsx updated')
}

console.log('ALL DONE')
