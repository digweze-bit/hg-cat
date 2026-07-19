import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes('CONSIGNMENT BY ARTIST')) {
  console.log('Already patched')
  process.exit(0)
}

const lines = src.split('\n')
// Find "// \u2500\u2500 PRINT" line
const printLineIdx = lines.findIndex(l => l.includes('PRINT') && l.includes('//'))
if (printLineIdx < 0) { console.error('Print comment line not found'); process.exit(1) }
console.log('Found print comment at line', printLineIdx + 1)

// Walk backward to find the closing "}" of the component (should be a few lines above, standalone "}")
let closeIdx = -1
for (let i = printLineIdx - 1; i >= 0; i--) {
  if (lines[i].trim() === '}') { closeIdx = i; break }
}
if (closeIdx < 0) { console.error('Closing brace not found'); process.exit(1) }
console.log('Found component closing at line', closeIdx + 1)
console.log('Context:')
console.log(lines.slice(closeIdx - 6, closeIdx + 1).join('\n'))

// Find the ")}" that closes the receivable block (should be right before "    </div>\n  )\n}")
let recvCloseIdx = -1
for (let i = closeIdx - 1; i >= 0; i--) {
  if (lines[i].trim() === ')}') { recvCloseIdx = i; break }
  if (i < closeIdx - 10) break
}
if (recvCloseIdx < 0) { console.error('Receivable )} not found'); process.exit(1) }
console.log('Found receivable-block close at line', recvCloseIdx + 1)

const newPanels = `
      {/* CONSIGNMENT BY ARTIST */}
      {activeReport === 'consignment_artist' && (
        <div>
          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{consignmentByArtist.reduce((s,g)=>s+g.count,0)}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Consigned works</div>
            </div>
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{consignmentByArtist.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Artists</div>
            </div>
          </div>
          {consignmentByArtist.length === 0
            ? <div className="card" style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>No consigned works on record</div>
            : consignmentByArtist.map(group => (
              <div key={group.name} className="card" style={{ marginBottom:14 }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th colSpan={6} style={{ background:'var(--parchment)', fontFamily:'var(--font-serif)', fontSize:14, padding:'10px 14px' }}>{group.name} \u2014 {group.count} work{group.count!==1?'s':''}</th></tr>
                      <tr><th>Title</th><th>Year</th><th>Medium</th><th>Location</th><th>Status</th><th>Value</th></tr>
                    </thead>
                    <tbody>
                      {group.works.map(w => (
                        <tr key={w.id}>
                          <td style={{ fontWeight:500 }}>{w.title}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{w.year || '\\u2014'}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{w.medium || '\\u2014'}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{w.location || '\\u2014'}</td>
                          <td><span className="badge">{w.availability}</span></td>
                          <td>{formatAmount(w.consignment_price || w.price || w.retail_price || 0, 'NGN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* CONSIGNMENT BY CLIENT */}
      {activeReport === 'consignment_client' && (
        <div>
          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{consignmentByClient.reduce((s,g)=>s+g.count,0)}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Consigned works</div>
            </div>
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{consignmentByClient.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Consignors</div>
            </div>
          </div>
          {consignmentByClient.length === 0
            ? <div className="card" style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>No consigned works on record</div>
            : consignmentByClient.map(group => (
              <div key={group.name} className="card" style={{ marginBottom:14 }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th colSpan={6} style={{ background:'var(--parchment)', fontFamily:'var(--font-serif)', fontSize:14, padding:'10px 14px' }}>{group.name} \u2014 {group.count} work{group.count!==1?'s':''}</th></tr>
                      <tr><th>Title</th><th>Artist</th><th>Year</th><th>Location</th><th>Status</th><th>Value</th></tr>
                    </thead>
                    <tbody>
                      {group.works.map(w => (
                        <tr key={w.id}>
                          <td style={{ fontWeight:500 }}>{w.title}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name || '\\u2014'}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{w.year || '\\u2014'}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{w.location || '\\u2014'}</td>
                          <td><span className="badge">{w.availability}</span></td>
                          <td>{formatAmount(w.consignment_price || w.price || w.retail_price || 0, 'NGN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* PENDING COLLECTION */}
      {activeReport === 'pending' && (
        <div>
          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{pendingData.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Awaiting collection</div>
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Artwork</th><th>Artist</th><th>Client</th><th>Invoice</th><th>Invoice date</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {pendingData.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>All artworks collected</td></tr>
                    : pendingData.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight:500 }}>{item.title}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{item.artist_name}</td>
                        <td style={{ fontSize:13 }}>{item.client_name}</td>
                        <td style={{ fontFamily:'var(--font-serif)', fontSize:13 }}>{item.invoice_number}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{item.invoice_date}</td>
                        <td>{formatAmount(item.line_total, item.currency)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* COLLECTION REPORT */}
      {activeReport === 'collection' && (
        <div>
          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <div className="card" style={{ padding:'16px 18px', minWidth:140 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{collectionData.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Collected in period</div>
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Artwork</th><th>Artist</th><th>Client</th><th>Invoice</th><th>Collected by</th><th>Collection date</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {collectionData.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No collections recorded in this period</td></tr>
                    : collectionData.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight:500 }}>{item.title}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{item.artist_name}</td>
                        <td style={{ fontSize:13 }}>{item.client_name}</td>
                        <td style={{ fontFamily:'var(--font-serif)', fontSize:13 }}>{item.invoice_number}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{item.collected_by || '\\u2014'}</td>
                        <td style={{ fontSize:12, color:'var(--muted)' }}>{new Date(item.delivered_at).toLocaleDateString('en-GB')}</td>
                        <td>{formatAmount(item.line_total, item.currency)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}`

// Insert new panels right after recvCloseIdx line (the ")}" that closes receivable block)
const before = lines.slice(0, recvCloseIdx + 1)
const after = lines.slice(recvCloseIdx + 1)
const result = [...before, newPanels, ...after].join('\n')

const final = usesCRLF ? result.replace(/\n/g, '\r\n') : result
fs.writeFileSync(file, final, 'utf8')
console.log('Part 2 (UI) patched successfully')
