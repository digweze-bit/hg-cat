import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/pages/Reports.jsx')

let raw = fs.readFileSync(file, 'utf8')
const usesCRLF = raw.includes('\r\n')
let src = raw.replace(/\r\n/g, '\n')  // normalize to LF for matching

if (src.includes('consignment_artist')) {
  console.log('Already patched')
  process.exit(0)
}

const oldReports = `const REPORTS = [
  { id: 'sold',       label: 'Artworks sold',         desc: 'Works sold within a date range, with sale values' },
  { id: 'loaned',     label: 'Artworks on loan',       desc: 'Works currently marked as loaned out' },
  { id: 'received',   label: 'Artworks received',      desc: 'Works acquired or consigned within a date range' },
  { id: 'receivable', label: 'Accounts receivable',    desc: 'Outstanding balances on sent and partially paid invoices' },
]`

const newReports = `const REPORTS = [
  { id: 'sold',       label: 'Artworks sold',         desc: 'Works sold within a date range, with sale values' },
  { id: 'loaned',     label: 'Artworks on loan',       desc: 'Works currently marked as loaned out' },
  { id: 'received',   label: 'Artworks received',      desc: 'Works acquired or consigned within a date range' },
  { id: 'receivable', label: 'Accounts receivable',    desc: 'Outstanding balances on sent and partially paid invoices' },
  { id: 'consignment_artist', label: 'Artist consignment', desc: 'Consigned works grouped by artist' },
  { id: 'consignment_client', label: 'Client consignment', desc: 'Consigned works grouped by secondary-market consignor' },
  { id: 'pending',    label: 'Pending collection',     desc: 'Invoiced artworks not yet marked as collected' },
  { id: 'collection', label: 'Collection report',      desc: 'Collected artworks for a period or invoice, with details' },
]`

if (!src.includes(oldReports)) {
  console.error('REPORTS anchor still not found after normalization')
  process.exit(1)
}
src = src.replace(oldReports, newReports)

const memoAnchor = `  const receivableByCurrency = useMemo(() => {
    const groups = {}
    receivableData.forEach(inv => {
      const cur = inv.currency || 'NGN'
      if (!groups[cur]) groups[cur] = { currency: cur, total: 0, count: 0, invoices: [] }
      groups[cur].total += Number(inv.balance_due || 0)
      groups[cur].count += 1
      groups[cur].invoices.push(inv)
    })
    return Object.values(groups).sort((a,b) => b.total - a.total)
  }, [receivableData])`

const newMemos = `  const receivableByCurrency = useMemo(() => {
    const groups = {}
    receivableData.forEach(inv => {
      const cur = inv.currency || 'NGN'
      if (!groups[cur]) groups[cur] = { currency: cur, total: 0, count: 0, invoices: [] }
      groups[cur].total += Number(inv.balance_due || 0)
      groups[cur].count += 1
      groups[cur].invoices.push(inv)
    })
    return Object.values(groups).sort((a,b) => b.total - a.total)
  }, [receivableData])

  const consignmentByArtist = useMemo(() => {
    const consigned = artworks.filter(w => w.ownership === 'consignment')
    const groups = {}
    consigned.forEach(w => {
      const name = artistMap[w.artist_id]?.name || 'Unknown artist'
      if (!groups[name]) groups[name] = { name, works: [], count: 0, totalValue: 0 }
      groups[name].works.push(w)
      groups[name].count += 1
      groups[name].totalValue += Number(w.consignment_price || w.price || w.retail_price || 0)
    })
    return Object.values(groups).sort((a,b) => b.count - a.count)
  }, [artworks, artistMap])

  const consignmentByClient = useMemo(() => {
    const consigned = artworks.filter(w => w.ownership === 'consignment')
    const groups = {}
    consigned.forEach(w => {
      const name = w.consignor_name || 'Unspecified consignor'
      if (!groups[name]) groups[name] = { name, works: [], count: 0, totalValue: 0 }
      groups[name].works.push(w)
      groups[name].count += 1
      groups[name].totalValue += Number(w.consignment_price || w.price || w.retail_price || 0)
    })
    return Object.values(groups).sort((a,b) => b.count - a.count)
  }, [artworks])

  const pendingData = useMemo(() => {
    return invoices
      .filter(inv => inv.status === 'paid')
      .flatMap(inv => (inv.invoice_items || [])
        .filter(item => (item.item_type === 'artwork' || !item.item_type) && !item.delivered)
        .map(item => ({
          ...item,
          invoice_number: inv.invoice_number,
          client_name: inv.clients?.name || '\\u2014',
          invoice_date: inv.issue_date,
          currency: inv.currency,
          invoice_id: inv.id,
        })))
  }, [invoices])

  const collectionData = useMemo(() => {
    return invoices
      .flatMap(inv => (inv.invoice_items || [])
        .filter(item => item.delivered && item.delivered_at &&
          item.delivered_at.slice(0,10) >= dateFrom && item.delivered_at.slice(0,10) <= dateTo)
        .map(item => ({
          ...item,
          invoice_number: inv.invoice_number,
          client_name: inv.clients?.name || '\\u2014',
          invoice_date: inv.issue_date,
          currency: inv.currency,
          invoice_id: inv.id,
        })))
      .sort((a,b) => (b.delivered_at||'').localeCompare(a.delivered_at||''))
  }, [invoices, dateFrom, dateTo])`

if (!src.includes(memoAnchor)) { console.error('Memo anchor not found'); process.exit(1) }
src = src.replace(memoAnchor, newMemos)

if (usesCRLF) src = src.replace(/\n/g, '\r\n')
fs.writeFileSync(file, src, 'utf8')
console.log('Part 1 (data) patched successfully')
