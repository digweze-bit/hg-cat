import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')

if (src.includes("reportId === 'pending'")) {
  console.log('Already patched')
  process.exit(0)
}

// 1. Update the print button call to pass the new data sets
const oldCall = `onClick={() => printReport(activeReport, { soldData, loanedData, receivedData, receivableData, artistMap, dateFrom, dateTo, soldTotal, totalReceivable })}`
if (!src.includes(oldCall)) { console.error('Print button call not found'); process.exit(1) }
const newCall = `onClick={() => printReport(activeReport, { soldData, loanedData, receivedData, receivableData, artistMap, dateFrom, dateTo, soldTotal, totalReceivable, pendingData, collectionData, consignmentByArtist, consignmentByClient })}`
src = src.replace(oldCall, newCall)

// 2. Update printReport function signature to destructure the new fields
const oldSig = `function printReport(reportId, { soldData, loanedData, receivedData, receivableData, artistMap, dateFrom, dateTo, soldTotal, totalReceivable }) {`
if (!src.includes(oldSig)) { console.error('printReport signature not found'); process.exit(1) }
const newSig = `function printReport(reportId, { soldData, loanedData, receivedData, receivableData, artistMap, dateFrom, dateTo, soldTotal, totalReceivable, pendingData, collectionData, consignmentByArtist, consignmentByClient }) {`
src = src.replace(oldSig, newSig)

// 3. Insert new report handlers after the receivable block, before the closing of that section
// Find anchor: end of receivable block (the })).join('')}</tbody>\n      </table>` right after receivable stat-row)
const anchor = `  if (reportId === 'receivable') {`
const anchorIdx = src.indexOf(anchor)
if (anchorIdx < 0) { console.error('receivable anchor not found'); process.exit(1) }

// Find the closing of the receivable if-block: look for the next "  }" after anchorIdx at same indent
// We know structure: ends with `</table>\`\n  }`
const closeMarker = "</table>`\n  }"
const closeIdx = src.indexOf(closeMarker, anchorIdx)
if (closeIdx < 0) { console.error('receivable close marker not found'); process.exit(1) }
const insertPoint = closeIdx + closeMarker.length

const newHandlers = `

  if (reportId === 'pending') {
    body = \`
      <div class="stat-row">
        <div class="stat"><div class="stat-n">\${pendingData.length}</div><div class="stat-l">Awaiting collection</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Client</th><th>Invoice</th><th>Invoice date</th><th>Value</th></tr></thead>
        <tbody>\${pendingData.map((item,i)=>\`<tr><td>\${i+1}</td><td><strong>\${e(item.title)}</strong></td><td>\${e(item.artist_name||'\u2014')}</td><td>\${e(item.client_name)}</td><td>\${e(item.invoice_number)}</td><td>\${e(item.invoice_date)}</td><td>\${formatAmount(item.line_total,item.currency)}</td></tr>\`).join('')}</tbody>
      </table>\`
  }

  if (reportId === 'collection') {
    body = \`
      <div class="stat-row">
        <div class="stat"><div class="stat-n">\${collectionData.length}</div><div class="stat-l">Collected in period</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Client</th><th>Invoice</th><th>Collected by</th><th>Collection date</th><th>Value</th></tr></thead>
        <tbody>\${collectionData.map((item,i)=>\`<tr><td>\${i+1}</td><td><strong>\${e(item.title)}</strong></td><td>\${e(item.artist_name||'\u2014')}</td><td>\${e(item.client_name)}</td><td>\${e(item.invoice_number)}</td><td>\${e(item.collected_by||'\u2014')}</td><td>\${e(item.delivered_at ? new Date(item.delivered_at).toLocaleDateString('en-GB') : '\u2014')}</td><td>\${formatAmount(item.line_total,item.currency)}</td></tr>\`).join('')}</tbody>
      </table>\`
  }

  if (reportId === 'consignment_artist') {
    body = \`
      <div class="stat-row">
        <div class="stat"><div class="stat-n">\${consignmentByArtist.reduce((s,g)=>s+g.count,0)}</div><div class="stat-l">Consigned works</div></div>
        <div class="stat"><div class="stat-n">\${consignmentByArtist.length}</div><div class="stat-l">Artists</div></div>
      </div>
      \${consignmentByArtist.map(group => \`
        <table style="margin-top:16px">
          <thead><tr><th colspan="5" style="background:#f0ece4;font-size:12px;padding:8px 10px">\${e(group.name)} \u2014 \${group.count} work\${group.count!==1?'s':''}</th></tr>
          <tr><th>Title</th><th>Year</th><th>Medium</th><th>Location</th><th>Value</th></tr></thead>
          <tbody>\${group.works.map(w=>\`<tr><td><strong>\${e(w.title)}</strong></td><td>\${e(w.year||'\u2014')}</td><td>\${e(w.medium||'\u2014')}</td><td>\${e(w.location||'\u2014')}</td><td>\${formatAmount(w.consignment_price||w.price||w.retail_price||0,'NGN')}</td></tr>\`).join('')}</tbody>
        </table>\`).join('')}\`
  }

  if (reportId === 'consignment_client') {
    body = \`
      <div class="stat-row">
        <div class="stat"><div class="stat-n">\${consignmentByClient.reduce((s,g)=>s+g.count,0)}</div><div class="stat-l">Consigned works</div></div>
        <div class="stat"><div class="stat-n">\${consignmentByClient.length}</div><div class="stat-l">Consignors</div></div>
      </div>
      \${consignmentByClient.map(group => \`
        <table style="margin-top:16px">
          <thead><tr><th colspan="5" style="background:#f0ece4;font-size:12px;padding:8px 10px">\${e(group.name)} \u2014 \${group.count} work\${group.count!==1?'s':''}</th></tr>
          <tr><th>Title</th><th>Artist</th><th>Year</th><th>Location</th><th>Value</th></tr></thead>
          <tbody>\${group.works.map(w=>\`<tr><td><strong>\${e(w.title)}</strong></td><td>\${e(artistMap[w.artist_id]?.name||'\u2014')}</td><td>\${e(w.year||'\u2014')}</td><td>\${e(w.location||'\u2014')}</td><td>\${formatAmount(w.consignment_price||w.price||w.retail_price||0,'NGN')}</td></tr>\`).join('')}</tbody>
        </table>\`).join('')}\`
  }`

src = src.slice(0, insertPoint) + newHandlers + src.slice(insertPoint)

const final = usesCRLF ? src.replace(/\n/g, '\r\n') : src
fs.writeFileSync(file, final, 'utf8')
console.log('Patched successfully - added pending, collection, consignment_artist, consignment_client print handlers')
