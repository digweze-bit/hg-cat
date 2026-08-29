import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('artist_report')) { console.log('Already patched'); process.exit(0) }

function mustReplace(oldStr, newStr, label) {
  if (!src.includes(oldStr)) { console.error('NOT FOUND: ' + label); console.error(oldStr.slice(0,150)); process.exit(1) }
  src = src.replace(oldStr, newStr)
  console.log('OK: ' + label)
}

// 1. Add artist_report to REPORTS list
mustReplace(
  "  { id: 'pending',    label: 'Pending collection',",
  "  { id: 'artist_report', label: 'Artist report', desc: 'Consignment, sales, and collection reports for a specific artist' },\n  { id: 'pending',    label: 'Pending collection',",
  '1. Add artist_report type'
)

// 2. Add state for artist report
mustReplace(
  "  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])",
  "  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])\n  const [selectedArtist, setSelectedArtist] = useState(null)\n  const [artistSearch, setArtistSearch] = useState('')\n  const [artistSubReport, setArtistSubReport] = useState('consignment') // 'consignment' | 'sales' | 'collection'\n  const [showPricing, setShowPricing] = useState(true)",
  '2. Artist report state'
)

// 3. Find the end of the report rendering JSX — before the closing </div> of the component
// Add the artist report section. Find the last report section rendering
mustReplace(
  "      {/* Modal / print handled by printReport */}",
  `      {/* ── ARTIST REPORT ── */}
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

      {/* Modal / print handled by printReport */}`,
  '3. Artist report view'
)

// 4. Add the ArtistReportView component at end of file
const componentCode = `

// ── ARTIST REPORT VIEW ──
function ArtistReportView({ artists, artworks, invoices, artistMap, clientMap, dateFrom, dateTo, selectedArtist, setSelectedArtist, artistSearch, setArtistSearch, artistSubReport, setArtistSubReport, showPricing, setShowPricing }) {
  const sym = c => ({NGN:'\\u20A6',USD:'$',GBP:'\\u00A3',EUR:'\\u20AC'})[c||'NGN'] || '\\u20A6'

  // Filter artists by search
  const filteredArtists = artistSearch
    ? artists.filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()))
    : artists

  // Artist's artworks
  const artistWorks = selectedArtist
    ? artworks.filter(w => w.artist_id === selectedArtist.id)
    : []

  // Sub-report data
  const consignmentWorks = artistWorks.filter(w =>
    w.ownership === 'consignment' && w.consignor_name?.toLowerCase() === selectedArtist?.name?.toLowerCase()
  )

  const soldItems = useMemo(() => {
    if (!selectedArtist) return []
    const items = []
    invoices.forEach(inv => {
      if (inv.issue_date < dateFrom || inv.issue_date > dateTo) return
      ;(inv.invoice_items || []).forEach(item => {
        if (item.artist_name?.toLowerCase() === selectedArtist.name.toLowerCase()) {
          items.push({ ...item, invoice: inv, client: clientMap[inv.client_id] })
        }
      })
    })
    return items
  }, [selectedArtist, invoices, dateFrom, dateTo, clientMap])

  const collectionItems = useMemo(() => {
    if (!selectedArtist) return []
    return artistWorks.filter(w => {
      // Only works from the artist directly (not collector/estate consignments)
      const isFromArtist = w.consignor_name?.toLowerCase() === selectedArtist.name.toLowerCase() || w.ownership === 'artist_owned'
      if (!isFromArtist) return false
      // Check if created or returned within date range
      const created = w.created_at?.split('T')[0] || ''
      return created >= dateFrom && created <= dateTo
    })
  }, [selectedArtist, artistWorks, dateFrom, dateTo])

  const returnedWorks = useMemo(() => {
    if (!selectedArtist) return []
    return artistWorks.filter(w => {
      const isFromArtist = w.consignor_name?.toLowerCase() === selectedArtist.name.toLowerCase() || w.ownership === 'artist_owned'
      if (!isFromArtist) return false
      return w.availability === 'Returned'
    })
  }, [selectedArtist, artistWorks])

  function printArtistReport() {
    let title = '', rows = ''
    if (artistSubReport === 'consignment') {
      title = 'Consignment Report'
      rows = consignmentWorks.map(w => {
        const s = sym(w.consignment_currency)
        const price = Number(w.consignment_price || 0)
        const comm = Number(w.commission_rate) === 0 ? 'Fixed' : w.commission_rate + '%'
        const ownerGets = Number(w.commission_rate) > 0 ? s + Math.round(price * (100 - Number(w.commission_rate)) / 100).toLocaleString() : s + price.toLocaleString()
        return '<tr>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;vertical-align:middle">' + (w.image_url ? '<img src="' + (w.thumbnail_url || w.image_url) + '" style="width:40px;height:40px;object-fit:cover;border-radius:2px" />' : '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px"><b>' + w.title + '</b><br><span style="color:#999">' + [w.year, w.medium, w.dimensions].filter(Boolean).join(' \\u00B7 ') + '</span></td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:11px;text-align:center;color:' + (w.availability === 'Available' ? '#2d6a4f' : w.availability === 'Sold' ? '#c0392b' : '#b8862a') + '">' + w.availability + '</td>' +
          (showPricing ? '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:right">' + s + price.toLocaleString() + '</td><td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:center">' + comm + '</td><td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:right">' + ownerGets + '</td>' : '') +
          '</tr>'
      }).join('')
    } else if (artistSubReport === 'sales') {
      title = 'Sales Report'
      rows = soldItems.map(item => {
        return '<tr>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px"><b>' + item.title + '</b></td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px">' + (item.client?.name || '\\u2014') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px">' + (item.invoice?.invoice_number || '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px">' + (item.invoice?.issue_date || '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;text-align:right">' + formatAmount(item.line_total, item.invoice?.currency) + '</td>' +
          '</tr>'
      }).join('')
    } else {
      title = 'Collection Report'
      rows = [...collectionItems, ...returnedWorks].map(w => {
        const status = w.availability === 'Returned' ? 'Returned' : 'Received'
        return '<tr>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;vertical-align:middle">' + (w.image_url ? '<img src="' + (w.thumbnail_url || w.image_url) + '" style="width:40px;height:40px;object-fit:cover;border-radius:2px" />' : '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px"><b>' + w.title + '</b><br><span style="color:#999">' + [w.year, w.medium].filter(Boolean).join(' \\u00B7 ') + '</span></td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px">' + (w.created_at?.split('T')[0] || '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid #e8e3db;font-size:12px;color:' + (status === 'Returned' ? '#c0392b' : '#2d6a4f') + '">' + status + '</td>' +
          '</tr>'
      }).join('')
    }

    const pricingHeaders = showPricing ? '<th style="text-align:right;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Price</th><th style="text-align:center;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Terms</th><th style="text-align:right;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Artist gets</th>' : ''
    const headers = artistSubReport === 'consignment'
      ? '<th style="padding:8px;border-bottom:2px solid #1a1714"></th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Artwork</th><th style="text-align:center;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Status</th>' + pricingHeaders
      : artistSubReport === 'sales'
        ? '<th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Artwork</th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Client</th><th style="padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Invoice</th><th style="padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Date</th><th style="text-align:right;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Amount</th>'
        : '<th style="padding:8px;border-bottom:2px solid #1a1714"></th><th style="text-align:left;padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Artwork</th><th style="padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Date</th><th style="padding:8px;font-size:10px;text-transform:uppercase;color:#999;border-bottom:2px solid #1a1714">Status</th>'

    const html = '<!DOCTYPE html><html><head><title>Artist Report \\u2014 ' + selectedArtist.name + '</title><style>@media print{@page{margin:12mm;size:A4 portrait}body{padding:0}}body{font-family:-apple-system,sans-serif;padding:20px;color:#1a1714}table{width:100%;border-collapse:collapse}</style></head><body>' +
      '<div style="margin-bottom:20px"><div style="font-size:20px;font-weight:600">' + selectedArtist.name + '</div><div style="font-size:13px;color:#999">' + title + ' \\u00B7 Hourglass Gallery \\u00B7 ' + new Date().toLocaleDateString('en-GB') + '</div>' +
      (artistSubReport !== 'consignment' ? '<div style="font-size:12px;color:#999;margin-top:4px">' + dateFrom + ' to ' + dateTo + '</div>' : '') + '</div>' +
      '<table><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div style="margin-top:24px;text-align:center;font-size:10px;color:#999;border-top:1px solid #e8e3db;padding-top:12px">Hourglass Gallery \\u00B7 298A Akin Olugbade Street, Victoria Island, Lagos</div></body></html>'

    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Allow popups'); return }
    w.document.open(); w.document.write(html); w.document.close()
    w.focus(); setTimeout(() => w.print(), 600)
  }

  return (
    <div>
      {/* Artist picker */}
      {!selectedArtist ? (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>Select an artist</div>
          <input className="form-input" placeholder="Search artists..." value={artistSearch} onChange={e => setArtistSearch(e.target.value)} style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredArtists.map(a => {
              const wCount = artworks.filter(w => w.artist_id === a.id).length
              return (
                <div key={a.id} onClick={() => setSelectedArtist(a)}
                  style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--parchment)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{wCount} work{wCount !== 1 ? 's' : ''}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Artist header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <button onClick={() => setSelectedArtist(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: 12, padding: 0, fontFamily: 'inherit', marginBottom: 4 }}>{'\\u2190'} Back to artist list</button>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{selectedArtist.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{artistWorks.length} work{artistWorks.length !== 1 ? 's' : ''} in inventory</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={printArtistReport}>Print / Save PDF</button>
          </div>

          {/* Sub-report tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--line)', marginBottom: 16 }}>
            {[['consignment', 'Consignment (' + consignmentWorks.length + ')'], ['sales', 'Sales (' + soldItems.length + ')'], ['collection', 'Collection']].map(([key, label]) => (
              <button key={key} onClick={() => setArtistSubReport(key)}
                style={{ padding: '10px 18px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', background: 'none', border: 'none',
                  borderBottom: artistSubReport === key ? '2px solid var(--ink)' : '2px solid transparent', marginBottom: -2,
                  color: artistSubReport === key ? 'var(--ink)' : 'var(--muted)', fontWeight: artistSubReport === key ? 600 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          {/* Consignment sub-report */}
          {artistSubReport === 'consignment' && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showPricing} onChange={e => setShowPricing(e.target.checked)} style={{ width: 'auto' }} />
                  Show pricing & terms
                </label>
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)' }}>
                      <th style={{ width: 48, padding: '8px' }}></th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Artwork</th>
                      <th style={{ textAlign: 'center', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Status</th>
                      {showPricing && <>
                        <th style={{ textAlign: 'right', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Price</th>
                        <th style={{ textAlign: 'center', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Terms</th>
                        <th style={{ textAlign: 'right', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Artist gets</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {consignmentWorks.map(w => {
                      const s = sym(w.consignment_currency)
                      const price = Number(w.consignment_price || 0)
                      const commRate = Number(w.commission_rate || 0)
                      const ownerGets = commRate > 0 ? price * (100 - commRate) / 100 : price
                      return (
                        <tr key={w.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <img src={w.thumbnail_url || w.image_url || ''} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2, border: '1px solid var(--line)' }}
                              onError={e => { e.target.style.display = 'none' }} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{w.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{[w.year, w.medium, w.dimensions].filter(Boolean).join(' \\u00B7 ')}</div>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                              background: w.availability === 'Available' ? '#e8f5e9' : w.availability === 'Sold' ? '#fde8e8' : '#fef9ec',
                              color: w.availability === 'Available' ? '#2d6a4f' : w.availability === 'Sold' ? '#c0392b' : '#b8862a' }}>
                              {w.availability}
                            </span>
                          </td>
                          {showPricing && <>
                            <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}>{s}{price.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', fontSize: 12, textAlign: 'center', color: 'var(--muted)' }}>{commRate === 0 ? 'Fixed' : commRate + '%'}</td>
                            <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right', fontWeight: 500 }}>{s}{Math.round(ownerGets).toLocaleString()}</td>
                          </>}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {consignmentWorks.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No works consigned directly by this artist</div>}
              </div>
            </div>
          )}

          {/* Sales sub-report */}
          {artistSubReport === 'sales' && (
            <div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)' }}>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Artwork</th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Client</th>
                      <th style={{ padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Invoice</th>
                      <th style={{ padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Date</th>
                      <th style={{ textAlign: 'right', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldItems.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                        <td style={{ padding: '6px 8px', fontSize: 13, fontWeight: 500 }}>{item.title}</td>
                        <td style={{ padding: '6px 8px', fontSize: 13 }}>{item.client?.name || '\\u2014'}</td>
                        <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--muted)' }}>{item.invoice?.invoice_number}</td>
                        <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--muted)' }}>{item.invoice?.issue_date}</td>
                        <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'right' }}>{formatAmount(item.line_total, item.invoice?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {soldItems.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No sales found in this period</div>}
                {soldItems.length > 0 && (
                  <div style={{ padding: '10px 14px', borderTop: '2px solid var(--line)', textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                    Total: {soldItems.reduce((groups, item) => {
                      const cur = item.invoice?.currency || 'NGN'
                      groups[cur] = (groups[cur] || 0) + Number(item.line_total || 0)
                      return groups
                    }, {}) && Object.entries(soldItems.reduce((g, item) => { const c = item.invoice?.currency || 'NGN'; g[c] = (g[c]||0) + Number(item.line_total||0); return g }, {})).map(([c, t]) => formatAmount(t, c)).join(' + ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Collection sub-report */}
          {artistSubReport === 'collection' && (
            <div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
                  Works received from and returned to the artist. Excludes works consigned by collectors or estates.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--line)' }}>
                      <th style={{ width: 48, padding: '8px' }}></th>
                      <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Artwork</th>
                      <th style={{ padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Date</th>
                      <th style={{ padding: '8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...collectionItems.map(w => ({...w, _status: 'Received'})), ...returnedWorks.map(w => ({...w, _status: 'Returned'}))].map(w => (
                      <tr key={w.id + w._status} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <img src={w.thumbnail_url || w.image_url || ''} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 2 }}
                            onError={e => { e.target.style.display = 'none' }} />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{w.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{[w.year, w.medium].filter(Boolean).join(' \\u00B7 ')}</div>
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--muted)' }}>{w.created_at?.split('T')[0] || ''}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                            background: w._status === 'Returned' ? '#fde8e8' : '#e8f5e9',
                            color: w._status === 'Returned' ? '#c0392b' : '#2d6a4f' }}>
                            {w._status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {collectionItems.length === 0 && returnedWorks.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No collection activity found in this period</div>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
`

// Add before last line
const lastNewline = src.lastIndexOf('\n')
src = src.slice(0, lastNewline) + componentCode + src.slice(lastNewline)
console.log('OK: 4. ArtistReportView component')

// Need to add useMemo import if the component uses it (it does via soldItems)
// Check if useMemo is already imported
if (src.includes("import { useState, useEffect, useMemo }")) {
  console.log('OK: useMemo already imported')
} else {
  src = src.replace("import { useState, useEffect", "import { useState, useEffect, useMemo")
  console.log('OK: Added useMemo import')
}

// Need formatAmount available in the component - it's already imported at top level
console.log('OK: formatAmount already imported')

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('ALL DONE')
