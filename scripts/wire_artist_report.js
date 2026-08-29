import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes("activeReport === 'artist_report'")) { console.log('Already wired'); process.exit(0) }

// Find the last report section closing before the main return close
// Pattern: the collection report closing )} followed by </div> ) }
src = src.replace(
  "      )}\n    </div>\n  )\n}\n\n// \u2500\u2500 PRINT",
  `      )}

      {/* ── ARTIST REPORT ── */}
      {activeReport === 'artist_report' && (
        <ArtistReportView
          artists={artists} artworks={artworks} invoices={invoices}
          artistMap={artistMap} clientMap={clientMap}
          dateFrom={dateFrom} dateTo={dateTo}
          selectedArtist={selectedArtist} setSelectedArtist={setSelectedArtist}
          artistSearch={artistSearch} setArtistSearch={setArtistSearch}
          artistSubReport={artistSubReport} setArtistSubReport={setArtistSubReport}
          showPricing={showPricing} setShowPricing={setShowPricing}
        />
      )}
    </div>
  )
}

// \u2500\u2500 PRINT`,
  )

if (src.includes("activeReport === 'artist_report'")) {
  console.log('OK: Wired artist report into JSX')
} else {
  console.error('Replace failed')
  process.exit(1)
}

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
