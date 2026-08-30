import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { formatAmount } from '../lib/currencies'

const GROUPS = [
  {
    id: 'artist',
    label: 'Artist Reports',
    desc: 'Consignment, sales, collection and returns for a given artist',
    entity: 'artist',
    reports: [
      { id: 'consignment', label: 'Consignment', period: false },
      { id: 'sales',       label: 'Sales',       period: true  },
      { id: 'collection',  label: 'Collection',  period: true  },
      { id: 'returns',     label: 'Returns',     period: true  },
    ],
  },
  {
    id: 'consignor',
    label: 'Consignor Reports',
    desc: 'Consignment, sales, collection and returns for a given consignor',
    entity: 'consignor',
    reports: [
      { id: 'consignment', label: 'Consignment', period: false },
      { id: 'sales',       label: 'Sales',       period: true  },
      { id: 'collection',  label: 'Collection',  period: true  },
      { id: 'returns',     label: 'Returns',     period: true  },
    ],
  },
  {
    id: 'sales',
    label: 'Sales Reports',
    desc: 'Revenue and outstanding balances across all invoices',
    entity: null,
    reports: [
      { id: 'sales',      label: 'Sales',                period: true  },
      { id: 'receivable', label: 'Accounts receivable',  period: false },
    ],
  },
  {
    id: 'artwork',
    label: 'Artwork Reports',
    desc: 'Inventory movement — sold, collected, pending, received and on loan',
    entity: null,
    reports: [
      { id: 'sold',       label: 'Artworks sold',            period: true  },
      { id: 'collection', label: 'Collection report',        period: true  },
      { id: 'pending',    label: 'Pending collection',       period: false },
      { id: 'received',   label: 'Acquired / consigned',     period: true  },
      { id: 'loaned',     label: 'Works on loan',            period: false },
    ],
  },
]

const DASH = '—'

// Three receiving routes for artworks.
const OWNERSHIP_LABEL = {
  gallery:      'Gallery owned',
  artist_owned: 'Artist consignment',
  consignment:  'Client / estate consignment',
}

// The two consignment routes are reported strictly separately: works consigned
// directly by an artist belong to the artist reports, works consigned by a
// third party or estate belong to the consignor reports.
const CONSIGNMENT_OWNERSHIP = { artist: 'artist_owned', consignor: 'consignment' }

function workValue(w) {
  // price is a free-text field, so only trust the numeric columns
  return Number(w.consignment_price || w.retail_price || w.valuation || 0)
}

export default function Reports() {
  const [groupId, setGroupId]   = useState('artist')
  const [subId, setSubId]       = useState('consignment')
  const [entityId, setEntityId] = useState('')       // artist id, or consignor name
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists]   = useState([])
  const [invoices, setInvoices] = useState([])
  const [consignors, setConsignors] = useState([])
  const [loading, setLoading]   = useState(true)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    async function load() {
      const [a, w, inv, cons] = await Promise.all([
        fetchAll('artists', { order: 'name' }),
        fetchAll('artworks', { order: 'created_at' }),
        supabase.from('invoices')
          .select('*, clients(name, email, phone), invoice_items(id, artwork_id, title, artist_name, consignor_name, item_type, delivered, delivered_at, collected_by, line_total, sort_order)')
          .order('created_at', { ascending: false })
          .limit(2000)
          .then(r => r.data || []),
        supabase.from('consignors').select('*').order('name').then(r => r.data || []),
      ])
      setArtists(a); setArtworks(w); setInvoices(inv); setConsignors(cons)
      setLoading(false)
    }
    load()
  }, [])

  const group  = GROUPS.find(g => g.id === groupId)
  const sub    = group.reports.find(r => r.id === subId) || group.reports[0]

  const artistMap  = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])
  const artworkMap = useMemo(() => Object.fromEntries(artworks.map(w => [w.id, w])), [artworks])

  // Consignor names actually present on stock, merged with the consignors table
  const consignorNames = useMemo(() => {
    const set = new Set()
    artworks.forEach(w => {
      if (w.ownership === 'consignment' && w.consignor_name) set.add(w.consignor_name)
    })
    consignors.forEach(c => { if (c.name) set.add(c.name) })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [artworks, consignors])

  // Flatten invoice lines once, resolving artist/consignor from the linked artwork
  const items = useMemo(() => invoices.flatMap(inv =>
    (inv.invoice_items || []).map(it => {
      const aw = artworkMap[it.artwork_id]
      return {
        ...it,
        invoice_number: inv.invoice_number,
        invoice_status: inv.status,
        client_name: inv.clients?.name || DASH,
        issue_date: inv.issue_date,
        currency: inv.currency,
        artist_id: aw?.artist_id || null,
        artist_label: (aw && artistMap[aw.artist_id]?.name) || it.artist_name || DASH,
        // Only third-party/estate consignments carry a consignor
        consignor_label: it.consignor_name || aw?.consignor_name || null,
      }
    })), [invoices, artworkMap, artistMap])

  // Scope helpers — when no entity is picked, the report covers everything
  function matchesEntity(w) {
    if (!group.entity || !entityId) return true
    return group.entity === 'artist' ? w.artist_id === entityId : w.consignor_name === entityId
  }
  function itemMatchesEntity(it) {
    if (!group.entity || !entityId) return true
    return group.entity === 'artist' ? it.artist_id === entityId : it.consignor_label === entityId
  }

  const inPeriod    = d => d && d >= dateFrom && d <= dateTo
  const entityLabel = !entityId ? null
    : group.entity === 'artist' ? artistMap[entityId]?.name : entityId

  const report = useMemo(() => {
    if (loading) return null
    return buildReport({
      groupId, subId, group, sub, entityLabel,
      artworks, items, invoices, artistMap,
      matchesEntity, itemMatchesEntity, inPeriod, dateFrom, dateTo,
    })
  }, [loading, groupId, subId, entityId, artworks, items, invoices, artistMap, dateFrom, dateTo])

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading reports{'…'}</div>

  function pickGroup(g) {
    setGroupId(g.id)
    setSubId(g.reports[0].id)
    setEntityId('')
  }

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Gallery financial and inventory reports</div>
        </div>
        <button className="btn btn-outline" onClick={() => printReport(report)}>
          Print this report
        </button>
      </div>

      {/* Group selector */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {GROUPS.map(g => (
          <div key={g.id} onClick={() => pickGroup(g)}
            style={{ padding:'14px 16px', border:`1px solid ${groupId===g.id?'var(--ink)':'var(--line)'}`, borderRadius:3, cursor:'pointer', background: groupId===g.id?'var(--ink)':'var(--white)', transition:'all 150ms' }}>
            <div style={{ fontSize:13, fontWeight:500, color: groupId===g.id?'var(--white)':'var(--ink)', marginBottom:4 }}>{g.label}</div>
            <div style={{ fontSize:11, color: groupId===g.id?'rgba(255,255,255,.6)':'var(--muted)', lineHeight:1.45 }}>{g.desc}</div>
          </div>
        ))}
      </div>

      {/* Controls: sub-report dropdown, entity picker, date range */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:20, background:'var(--parchment)', padding:'12px 16px', borderRadius:3 }}>
        <span style={{ fontSize:13, color:'var(--muted)' }}>Report:</span>
        <select className="form-select" style={{ width:200 }} value={sub.id} onChange={e => setSubId(e.target.value)}>
          {group.reports.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>

        {group.entity === 'artist' && (
          <>
            <span style={{ fontSize:13, color:'var(--muted)' }}>Artist:</span>
            <select className="form-select" style={{ width:220 }} value={entityId} onChange={e => setEntityId(e.target.value)}>
              <option value="">All artists</option>
              {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>
        )}

        {group.entity === 'consignor' && (
          <>
            <span style={{ fontSize:13, color:'var(--muted)' }}>Consignor:</span>
            <select className="form-select" style={{ width:220 }} value={entityId} onChange={e => setEntityId(e.target.value)}>
              <option value="">All consignors</option>
              {consignorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </>
        )}

        {sub.period && (
          <>
            <span style={{ fontSize:13, color:'var(--muted)' }}>Period:</span>
            <input type="date" className="form-input" style={{ width:150 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
            <span style={{ fontSize:13, color:'var(--muted)' }}>to</span>
            <input type="date" className="form-input" style={{ width:150 }} value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </>
        )}
      </div>

      <ReportView report={report} />
    </div>
  )
}

// ── REPORT BUILDER ──────────────────────────────────────────────────────────
// Every report resolves to the same shape so the screen and print renderers
// can share one code path:
//   { title, subtitle, note, stats: [{n,l,color}], sections: [{heading, columns, rows, footer}] }

function buildReport(ctx) {
  const { groupId, subId } = ctx
  if (groupId === 'artist' || groupId === 'consignor') {
    if (subId === 'consignment') return consignmentReport(ctx)
    if (subId === 'sales')       return entitySalesReport(ctx)
    if (subId === 'collection')  return entityCollectionReport(ctx)
    if (subId === 'returns')     return returnsReport(ctx)
  }
  if (groupId === 'sales') {
    if (subId === 'sales')      return soldReport(ctx)
    if (subId === 'receivable') return receivableReport(ctx)
  }
  if (groupId === 'artwork') {
    if (subId === 'sold')       return soldReport(ctx)
    if (subId === 'collection') return collectionReport(ctx)
    if (subId === 'pending')    return pendingReport(ctx)
    if (subId === 'received')   return receivedReport(ctx)
    if (subId === 'loaned')     return loanedReport(ctx)
  }
  return { title: 'Report', sections: [] }
}

function scopeLine(ctx) {
  return ctx.entityLabel || (ctx.group.entity === 'artist' ? 'All artists' : ctx.group.entity === 'consignor' ? 'All consignors' : null)
}
function periodLine(ctx) {
  return ctx.sub.period ? `Period: ${ctx.dateFrom} to ${ctx.dateTo}` : null
}
function subtitleFor(ctx) {
  return [scopeLine(ctx), periodLine(ctx)].filter(Boolean).join('  ·  ') || null
}

function consignmentReport(ctx) {
  const { artworks, artistMap, matchesEntity, group } = ctx
  const byArtist = group.entity === 'artist'
  // Artist reports cover works consigned by the artist; consignor reports cover
  // works consigned by third parties and estates. Never both.
  const ownership = CONSIGNMENT_OWNERSHIP[group.entity]
  const works = artworks.filter(w => w.ownership === ownership && matchesEntity(w))

  const buckets = {}
  works.forEach(w => {
    const k = byArtist
      ? (artistMap[w.artist_id]?.name || 'Unknown artist')
      : (w.consignor_name || 'Unspecified consignor')
    if (!buckets[k]) buckets[k] = []
    buckets[k].push(w)
  })
  const total = works.reduce((s, w) => s + workValue(w), 0)

  return {
    title: byArtist ? 'Artist consignment' : 'Consignor consignment',
    subtitle: subtitleFor(ctx),
    note: byArtist
      ? 'Works consigned directly by the artist.'
      : 'Works consigned by third parties and estates. Consignments direct from artists are covered by the Artist Reports.',
    stats: [
      { n: works.length, l: 'Consigned works', color: 'var(--amber)' },
      { n: Object.keys(buckets).length, l: byArtist ? 'Artists' : 'Consignors' },
      { n: formatAmount(total, 'NGN'), l: 'Total value' },
    ],
    sections: Object.entries(buckets)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, ws]) => ({
        heading: `${name} — ${ws.length} work${ws.length !== 1 ? 's' : ''}`,
        columns: byArtist
          ? ['Title', 'Year', 'Medium', 'Location', 'Status', 'Value']
          : ['Title', 'Artist', 'Year', 'Medium', 'Location', 'Status', 'Value'],
        rows: ws.map(w => [
          { text: w.title, bold: true },
          ...(byArtist ? [] : [{ text: artistMap[w.artist_id]?.name || DASH, muted: true }]),
          { text: w.year || DASH, muted: true },
          { text: w.medium || DASH, muted: true },
          { text: w.location || DASH, muted: true },
          { text: w.availability || DASH },
          { text: formatAmount(workValue(w), w.consignment_currency || 'NGN') },
        ]),
      })),
    empty: byArtist
      ? 'No works consigned by this artist'
      : 'No third-party or estate consignments on record',
  }
}

function entitySalesReport(ctx) {
  const { items, itemMatchesEntity, inPeriod, group } = ctx
  const rows = items.filter(it => it.invoice_status === 'paid' && inPeriod(it.issue_date) && itemMatchesEntity(it))
  const total = rows.reduce((s, it) => s + Number(it.line_total || 0), 0)

  return {
    title: `${group.label.replace(' Reports','')} sales`,
    subtitle: subtitleFor(ctx),
    stats: [
      { n: rows.length, l: 'Works sold', color: 'var(--green)' },
      { n: formatAmount(total, 'NGN'), l: 'Total value' },
    ],
    sections: [{
      columns: ['#', 'Title', 'Artist', group.entity === 'consignor' ? 'Consignor' : 'Client', 'Invoice', 'Date', 'Sale price'],
      rows: rows.map((it, i) => [
        { text: String(i + 1), muted: true },
        { text: it.title, bold: true },
        { text: it.artist_label, muted: true },
        { text: (group.entity === 'consignor' ? it.consignor_label : it.client_name) || DASH },
        { text: it.invoice_number },
        { text: it.issue_date, muted: true },
        { text: formatAmount(it.line_total, it.currency), color: 'var(--green)', bold: true },
      ]),
    }],
    empty: 'No sales in this period',
  }
}

function entityCollectionReport(ctx) {
  const { items, itemMatchesEntity, inPeriod, group } = ctx
  const rows = items
    .filter(it => it.delivered && it.delivered_at && inPeriod(it.delivered_at.slice(0, 10)) && itemMatchesEntity(it))
    .sort((a, b) => (b.delivered_at || '').localeCompare(a.delivered_at || ''))

  return {
    title: `${group.label.replace(' Reports','')} collection`,
    subtitle: subtitleFor(ctx),
    stats: [{ n: rows.length, l: 'Collected in period', color: 'var(--amber)' }],
    sections: [{
      columns: ['Artwork', 'Artist', 'Client', 'Invoice', 'Collected by', 'Collection date', 'Value'],
      rows: rows.map(it => [
        { text: it.title, bold: true },
        { text: it.artist_label, muted: true },
        { text: it.client_name },
        { text: it.invoice_number },
        { text: it.collected_by || DASH, muted: true },
        { text: new Date(it.delivered_at).toLocaleDateString('en-GB'), muted: true },
        { text: formatAmount(it.line_total, it.currency) },
      ]),
    }],
    empty: 'No collections recorded in this period',
  }
}

function returnsReport(ctx) {
  const { artworks, artistMap, matchesEntity, inPeriod, group } = ctx
  const all = artworks.filter(w => w.availability === 'Returned' && matchesEntity(w))
  // Works returned before returned_at was introduced have no date — surface them
  // separately rather than silently dropping them from a period-filtered view.
  const dated   = all.filter(w => w.returned_at && inPeriod(w.returned_at))
    .sort((a, b) => (b.returned_at || '').localeCompare(a.returned_at || ''))
  const undated = all.filter(w => !w.returned_at)

  const row = w => [
    { text: w.title, bold: true },
    { text: artistMap[w.artist_id]?.name || DASH, muted: true },
    { text: w.consignor_name || DASH, muted: true },
    { text: w.year || DASH, muted: true },
    { text: w.medium || DASH, muted: true },
    { text: w.returned_at || DASH, muted: true },
    { text: formatAmount(workValue(w), w.consignment_currency || 'NGN') },
  ]
  const columns = ['Title', 'Artist', 'Consignor', 'Year', 'Medium', 'Returned', 'Value']

  return {
    title: `${group.label.replace(' Reports','')} returns`,
    subtitle: subtitleFor(ctx),
    note: undated.length
      ? `${undated.length} returned work${undated.length !== 1 ? 's have' : ' has'} no return date recorded, so ${undated.length !== 1 ? 'they fall' : 'it falls'} outside the period filter and ${undated.length !== 1 ? 'are' : 'is'} listed separately below. Set a return date on the artwork to bring ${undated.length !== 1 ? 'them' : 'it'} into the dated report.`
      : null,
    stats: [
      { n: dated.length, l: 'Returned in period', color: 'var(--amber)' },
      { n: all.length, l: 'Returned works (all time)' },
    ],
    sections: [
      { heading: undated.length ? 'Returned in period' : undefined, columns, rows: dated.map(row) },
      ...(undated.length ? [{ heading: 'No return date recorded', columns, rows: undated.map(row) }] : []),
    ],
    empty: 'No returned works on record',
  }
}

function soldReport(ctx) {
  const { items, inPeriod } = ctx
  const rows = items.filter(it => it.invoice_status === 'paid' && inPeriod(it.issue_date))
  const total = rows.reduce((s, it) => s + Number(it.line_total || 0), 0)

  return {
    title: 'Artworks sold',
    subtitle: periodLine(ctx),
    stats: [
      { n: rows.length, l: 'Works sold', color: 'var(--green)' },
      { n: formatAmount(total, 'NGN'), l: 'Total revenue' },
      { n: rows.length ? formatAmount(total / rows.length, 'NGN') : DASH, l: 'Average sale price' },
    ],
    sections: [{
      columns: ['#', 'Title', 'Artist', 'Client', 'Invoice', 'Date', 'Sale price'],
      rows: rows.map((it, i) => [
        { text: String(i + 1), muted: true },
        { text: it.title, bold: true },
        { text: it.artist_label, muted: true },
        { text: it.client_name },
        { text: it.invoice_number },
        { text: it.issue_date, muted: true },
        { text: formatAmount(it.line_total, it.currency), color: 'var(--green)', bold: true },
      ]),
      footer: ['', '', '', '', '', 'Total', { text: formatAmount(total, 'NGN'), color: 'var(--green)', bold: true }],
    }],
    empty: 'No sales in this period',
  }
}

function receivableReport(ctx) {
  const { invoices } = ctx
  const open = invoices.filter(inv => ['sent', 'partial'].includes(inv.status) && Number(inv.balance_due) > 0)
  const today = new Date().toISOString().split('T')[0]

  const byCurrency = {}
  open.forEach(inv => {
    const cur = inv.currency || 'NGN'
    if (!byCurrency[cur]) byCurrency[cur] = { currency: cur, total: 0, invoices: [] }
    byCurrency[cur].total += Number(inv.balance_due || 0)
    byCurrency[cur].invoices.push(inv)
  })
  const groups = Object.values(byCurrency).sort((a, b) => b.total - a.total)

  return {
    title: 'Accounts receivable',
    stats: [
      { n: open.length, l: 'Open invoices', color: 'var(--amber)' },
      { n: open.filter(i => i.status === 'partial').length, l: 'Partially paid' },
      ...groups.map(g => ({ n: formatAmount(g.total, g.currency), l: `${g.currency} outstanding (${g.invoices.length})`, color: 'var(--amber)' })),
    ],
    note: 'Balances are shown in the original invoice currency.',
    sections: groups.map(g => ({
      heading: `${g.currency} — ${formatAmount(g.total, g.currency)} outstanding`,
      columns: ['Invoice', 'Client', 'Invoice total', 'Paid', 'Balance due', 'Status', 'Due date'],
      rows: g.invoices.map(inv => {
        const overdue = inv.due_date && inv.due_date < today
        return [
          { text: inv.invoice_number, bold: true },
          { text: inv.clients?.name || DASH },
          { text: formatAmount(inv.total, inv.currency) },
          { text: formatAmount(inv.amount_paid || 0, inv.currency), color: 'var(--green)' },
          { text: formatAmount(inv.balance_due, inv.currency) + (overdue ? '  OVERDUE' : ''), color: overdue ? 'var(--red)' : 'var(--amber)', bold: true },
          { text: inv.status },
          { text: inv.due_date || DASH, color: overdue ? 'var(--red)' : undefined, muted: !overdue },
        ]
      }),
      footer: ['', '', '', 'Subtotal', { text: formatAmount(g.total, g.currency), color: 'var(--amber)', bold: true }, '', ''],
    })),
    empty: 'No outstanding balances',
  }
}

function collectionReport(ctx) {
  const { items, inPeriod } = ctx
  const rows = items
    .filter(it => it.delivered && it.delivered_at && inPeriod(it.delivered_at.slice(0, 10)))
    .sort((a, b) => (b.delivered_at || '').localeCompare(a.delivered_at || ''))

  return {
    title: 'Collection report',
    subtitle: periodLine(ctx),
    stats: [{ n: rows.length, l: 'Collected in period', color: 'var(--amber)' }],
    sections: [{
      columns: ['Artwork', 'Artist', 'Client', 'Invoice', 'Collected by', 'Collection date', 'Value'],
      rows: rows.map(it => [
        { text: it.title, bold: true },
        { text: it.artist_label, muted: true },
        { text: it.client_name },
        { text: it.invoice_number },
        { text: it.collected_by || DASH, muted: true },
        { text: new Date(it.delivered_at).toLocaleDateString('en-GB'), muted: true },
        { text: formatAmount(it.line_total, it.currency) },
      ]),
    }],
    empty: 'No collections recorded in this period',
  }
}

function pendingReport(ctx) {
  const { items } = ctx
  const rows = items.filter(it =>
    it.invoice_status === 'paid' && (it.item_type === 'artwork' || !it.item_type) && !it.delivered)

  return {
    title: 'Pending collection',
    stats: [{ n: rows.length, l: 'Awaiting collection', color: 'var(--amber)' }],
    sections: [{
      columns: ['Artwork', 'Artist', 'Client', 'Invoice', 'Invoice date', 'Value'],
      rows: rows.map(it => [
        { text: it.title, bold: true },
        { text: it.artist_label, muted: true },
        { text: it.client_name },
        { text: it.invoice_number },
        { text: it.issue_date, muted: true },
        { text: formatAmount(it.line_total, it.currency) },
      ]),
    }],
    empty: 'All artworks collected',
  }
}

function receivedReport(ctx) {
  const { artworks, artistMap, dateFrom, dateTo } = ctx
  const works = artworks.filter(w =>
    w.created_at >= dateFrom + 'T00:00:00' && w.created_at <= dateTo + 'T23:59:59')

  return {
    title: 'Works acquired or consigned',
    subtitle: periodLine(ctx),
    stats: [
      { n: works.length, l: 'Works received' },
      { n: works.filter(w => w.ownership === 'gallery').length, l: 'Gallery owned' },
      { n: works.filter(w => w.ownership === 'artist_owned').length, l: 'Artist consignment' },
      { n: works.filter(w => w.ownership === 'consignment').length, l: 'Client consignment' },
    ],
    sections: [{
      columns: ['#', 'Title', 'Artist', 'Medium', 'Received as', 'Consignor', 'Date added'],
      rows: works.map((w, i) => [
        { text: String(i + 1), muted: true },
        { text: w.title, bold: true },
        { text: artistMap[w.artist_id]?.name || DASH, muted: true },
        { text: w.medium || DASH, muted: true },
        { text: OWNERSHIP_LABEL[w.ownership] || OWNERSHIP_LABEL.gallery },
        { text: w.consignor_name || DASH },
        { text: w.created_at?.slice(0, 10) || DASH, muted: true },
      ]),
    }],
    empty: 'No works received in this period',
  }
}

function loanedReport(ctx) {
  const { artworks, artistMap } = ctx
  const works = artworks.filter(w =>
    w.loaned_to || w.availability === 'Reserved' || (w.location && w.location.toLowerCase().includes('loan')))
  const missingBorrower = works.filter(w => !w.loaned_to).length

  return {
    title: 'Works on loan',
    note: missingBorrower
      ? `${missingBorrower} of these ${missingBorrower !== 1 ? 'works have' : 'work has'} no borrower recorded — the location field is shown instead. Set "Loaned to" on the artwork to name the borrower properly.`
      : null,
    stats: [
      { n: works.length, l: 'Works on loan', color: 'var(--amber)' },
      { n: works.length - missingBorrower, l: 'Borrower recorded' },
    ],
    sections: [{
      columns: ['#', 'Title', 'Artist', 'Medium', 'Loaned to', 'Location', 'Status'],
      rows: works.map((w, i) => [
        { text: String(i + 1), muted: true },
        { text: w.title, bold: true },
        { text: artistMap[w.artist_id]?.name || DASH, muted: true },
        { text: w.medium || DASH, muted: true },
        { text: w.loaned_to || DASH, muted: !w.loaned_to },
        { text: w.location || DASH, muted: true },
        { text: w.availability || DASH },
      ]),
    }],
    empty: 'No works currently on loan',
  }
}

// ── SCREEN RENDERER ─────────────────────────────────────────────────────────

function cellStyle(c) {
  if (typeof c === 'string') return {}
  return {
    fontWeight: c.bold ? 600 : 400,
    color: c.color || (c.muted ? 'var(--muted)' : undefined),
    fontSize: c.muted ? 12 : 13,
  }
}
function cellText(c) { return typeof c === 'string' ? c : c.text }

function ReportView({ report }) {
  if (!report) return null
  const totalRows = report.sections.reduce((s, sec) => s + sec.rows.length, 0)

  return (
    <div>
      {report.stats?.length > 0 && (
        <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          {report.stats.map((s, i) => (
            <div key={i} className="card" style={{ padding:'16px 18px', minWidth:150 }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color: s.color || 'var(--ink)' }}>{s.n}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {totalRows === 0
        ? <div className="card" style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>{report.empty || 'Nothing to show'}</div>
        : report.sections.filter(sec => sec.rows.length > 0).map((sec, si) => (
            <div key={si} className="card" style={{ marginBottom:14 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    {sec.heading && (
                      <tr><th colSpan={sec.columns.length} style={{ background:'var(--parchment)', fontFamily:'var(--font-serif)', fontSize:14, padding:'10px 14px' }}>{sec.heading}</th></tr>
                    )}
                    <tr>{sec.columns.map(c => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sec.rows.map((row, ri) => (
                      <tr key={ri}>{row.map((c, ci) => <td key={ci} style={cellStyle(c)}>{cellText(c)}</td>)}</tr>
                    ))}
                  </tbody>
                  {sec.footer && (
                    <tfoot>
                      <tr>{sec.footer.map((c, ci) => (
                        <td key={ci} style={{ ...cellStyle(c), fontWeight:600, borderTop:'2px solid var(--line)', textAlign: cellText(c) === 'Total' || cellText(c) === 'Subtotal' ? 'right' : 'left' }}>{cellText(c)}</td>
                      ))}</tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ))
      }

      {report.note && (
        <div style={{ fontSize:12, color:'var(--muted)', padding:'10px 14px', background:'var(--parchment)', borderRadius:3, marginTop:12 }}>
          {report.note}
        </div>
      )}
    </div>
  )
}

// ── PRINT ───────────────────────────────────────────────────────────────────

function printReport(report) {
  if (!report) return
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })

  const style = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,sans-serif;color:#1a1714;padding:32px 40px;font-size:12px;}
    .header{margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1a1714;}
    .logo{font-family:Georgia,serif;font-size:18px;margin-bottom:2px;}
    .report-title{font-size:15px;font-weight:600;margin:6px 0 2px;}
    .meta{font-size:10px;color:#aaa;margin-top:4px;}
    .stat-row{display:flex;gap:24px;margin:16px 0;padding:12px 16px;background:#f9f8f6;border-radius:3px;}
    .stat{text-align:center;}
    .stat-n{font-family:Georgia,serif;font-size:20px;color:#1a1714;}
    .stat-l{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-top:3px;}
    h3{margin:18px 0 6px;font-size:12px;font-weight:600;}
    table{width:100%;border-collapse:collapse;margin-top:8px;page-break-inside:auto;}
    th{padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:2px solid #1a1714;background:#f0ece4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    td{padding:7px 10px;border-bottom:1px solid #ece8e1;font-size:11px;vertical-align:top;}
    tfoot td{font-weight:600;border-top:2px solid #1a1714;border-bottom:none;background:#f9f8f6;}
    tr{page-break-inside:avoid;}
    .note{margin-top:16px;padding:8px 12px;background:#f9f8f6;font-size:10px;color:#777;border-radius:3px;}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd9d1;font-size:10px;color:#aaa;text-align:center;}
    @media print{body{padding:16px 20px;}}
  `

  const printCell = c => {
    const t = e(cellText(c))
    if (typeof c === 'string') return t
    const col = c.color === 'var(--green)' ? '#2d6a4f'
      : c.color === 'var(--red)' ? '#8b1a1a'
      : c.color === 'var(--amber)' ? '#92600a'
      : c.muted ? '#888' : ''
    const css = [col && `color:${col}`, c.bold && 'font-weight:600'].filter(Boolean).join(';')
    return css ? `<span style="${css}">${t}</span>` : t
  }

  const totalRows = report.sections.reduce((s, sec) => s + sec.rows.length, 0)

  const body = totalRows === 0
    ? `<p style="padding:24px 0;color:#888;text-align:center">${e(report.empty || 'Nothing to show')}</p>`
    : report.sections.filter(sec => sec.rows.length > 0).map(sec => `
        ${sec.heading ? `<h3>${e(sec.heading)}</h3>` : ''}
        <table>
          <thead><tr>${sec.columns.map(c => `<th>${e(c)}</th>`).join('')}</tr></thead>
          <tbody>${sec.rows.map(row => `<tr>${row.map(c => `<td>${printCell(c)}</td>`).join('')}</tr>`).join('')}</tbody>
          ${sec.footer ? `<tfoot><tr>${sec.footer.map(c => `<td>${printCell(c)}</td>`).join('')}</tr></tfoot>` : ''}
        </table>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${e(report.title)} — Hourglass Gallery</title><style>${style}</style></head><body>
<div class="header">
  <div class="logo">Hourglass Gallery</div>
  <div class="report-title">${e(report.title)}</div>
  ${report.subtitle ? `<div class="meta">${e(report.subtitle)}</div>` : ''}
  <div class="meta">Generated ${today}</div>
</div>
${report.stats?.length ? `<div class="stat-row">${report.stats.map(s => `<div class="stat"><div class="stat-n">${e(s.n)}</div><div class="stat-l">${e(s.l)}</div></div>`).join('')}</div>` : ''}
${body}
${report.note ? `<div class="note">${e(report.note)}</div>` : ''}
<div class="footer">Hourglass Gallery · 298A Akin Olugbade Street, Victoria Island, Lagos</div>
</body></html>`

  const w = window.open('', '_blank', 'width=1100,height=750')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

function e(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
