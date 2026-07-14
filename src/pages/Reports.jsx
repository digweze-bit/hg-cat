import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { formatAmount } from '../lib/currencies'

const REPORTS = [
  { id: 'sold',       label: 'Artworks sold',         desc: 'Works sold within a date range, with sale values' },
  { id: 'loaned',     label: 'Artworks on loan',       desc: 'Works currently marked as loaned out' },
  { id: 'received',   label: 'Artworks received',      desc: 'Works acquired or consigned within a date range' },
  { id: 'receivable', label: 'Accounts receivable',    desc: 'Outstanding balances on sent and partially paid invoices' },
]

export default function Reports() {
  const [activeReport, setActiveReport] = useState('sold')
  const [artworks, setArtworks]   = useState([])
  const [artists, setArtists]     = useState([])
  const [invoices, setInvoices]   = useState([])
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    async function load() {
      const [a, w, inv, c] = await Promise.all([
        fetchAll('artists', { order: 'name' }),
        fetchAll('artworks', { order: 'created_at' }),
        supabase.from('invoices')
          .select('*, clients(name, email, phone), invoice_items(*, artworks(title, artist_id))')
          .order('created_at', { ascending: false })
          .limit(500)
          .then(r => r.data || []),
        fetchAll('clients', { order: 'name' }),
      ])
      setArtists(a); setArtworks(w); setInvoices(inv); setClients(c)
      setLoading(false)
    }
    load()
  }, [])

  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])
  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients])

  // \u2500\u2500 REPORT DATA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const soldData = useMemo(() => {
    // Paid invoices within date range \u2014 extract sold artworks
    return invoices
      .filter(inv => inv.status === 'paid' && inv.issue_date >= dateFrom && inv.issue_date <= dateTo)
      .flatMap(inv => (inv.invoice_items || []).map(item => ({
        ...item,
        invoice_number: inv.invoice_number,
        client_name: inv.clients?.name || '\u2014',
        sale_date: inv.issue_date,
        currency: inv.currency,
        invoice_id: inv.id,
      })))
  }, [invoices, dateFrom, dateTo])

  const soldTotal = useMemo(() =>
    soldData.reduce((s, item) => s + Number(item.line_total || 0), 0), [soldData])

  const loanedData = useMemo(() =>
    artworks.filter(w => w.availability === 'Reserved' || (w.location && w.location.toLowerCase().includes('loan'))),
    [artworks])

  const receivedData = useMemo(() =>
    artworks.filter(w => w.created_at >= dateFrom + 'T00:00:00' && w.created_at <= dateTo + 'T23:59:59'),
    [artworks, dateFrom, dateTo])

  const receivableData = useMemo(() =>
    invoices.filter(inv => ['sent','partial'].includes(inv.status) && Number(inv.balance_due) > 0),
    [invoices])

  const totalReceivable = useMemo(() =>
    receivableData.reduce((s, inv) => s + Number(inv.balance_due || 0), 0), [receivableData])

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading reports{'\u2026'}</div>

  const report = REPORTS.find(r => r.id === activeReport)

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Gallery financial and inventory reports</div>
        </div>
        <button className="btn btn-outline" onClick={() => printReport(activeReport, { soldData, loanedData, receivedData, receivableData, artistMap, dateFrom, dateTo, soldTotal, totalReceivable })}>
          \uD83D\uDDA8 Print this report
        </button>
      </div>

      {/* Report selector */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:24 }}>
        {REPORTS.map(r => (
          <div key={r.id}
            onClick={() => setActiveReport(r.id)}
            style={{ padding:'14px 16px', border:`1px solid ${activeReport===r.id?'var(--ink)':'var(--line)'}`, borderRadius:3, cursor:'pointer', background: activeReport===r.id?'var(--ink)':'var(--white)', transition:'all 150ms' }}
          >
            <div style={{ fontSize:13, fontWeight:500, color: activeReport===r.id?'var(--white)':'var(--ink)', marginBottom:4 }}>{r.label}</div>
            <div style={{ fontSize:11, color: activeReport===r.id?'rgba(255,255,255,.6)':'var(--muted)', lineHeight:1.45 }}>{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Date range \u2014 shown for sold and received */}
      {['sold','received'].includes(activeReport) && (
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20, background:'var(--parchment)', padding:'12px 16px', borderRadius:3 }}>
          <span style={{ fontSize:13, color:'var(--muted)' }}>Period:</span>
          <input type="date" className="form-input" style={{ width:160 }} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          <span style={{ fontSize:13, color:'var(--muted)' }}>to</span>
          <input type="date" className="form-input" style={{ width:160 }} value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </div>
      )}

      {/* \u2500\u2500 SOLD REPORT \u2500\u2500 */}
      {activeReport === 'sold' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--green)' }}>{soldData.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Works sold</div>
            </div>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>
                {'\u20A6'}{soldTotal.toLocaleString('en-NG', { maximumFractionDigits:0 })}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Total revenue</div>
            </div>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>
                {soldData.length ? '\u20A6' + Math.round(soldTotal / soldData.length).toLocaleString('en-NG') : '\u2014'}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Average sale price</div>
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Client</th><th>Invoice</th><th>Date</th><th>Sale price</th></tr></thead>
                <tbody>
                  {soldData.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No sales in this period</td></tr>
                    : soldData.map((item, i) => {
                        const artist = artistMap[item.artworks?.artist_id]
                        return (
                          <tr key={item.id}>
                            <td style={{ color:'var(--muted)', fontSize:12 }}>{i+1}</td>
                            <td style={{ fontWeight:500 }}>{item.title}</td>
                            <td style={{ color:'var(--muted)', fontSize:13 }}>{artist?.name || item.artist_name || '\u2014'}</td>
                            <td style={{ fontSize:13 }}>{item.client_name}</td>
                            <td style={{ fontSize:12, color:'var(--muted)', fontFamily:'var(--font-serif)' }}>{item.invoice_number}</td>
                            <td style={{ fontSize:12, color:'var(--muted)' }}>{item.sale_date}</td>
                            <td style={{ fontWeight:500, color:'var(--green)' }}>{formatAmount(item.line_total, item.currency)}</td>
                          </tr>
                        )
                      })
                  }
                </tbody>
                {soldData.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ textAlign:'right', fontWeight:600, padding:'10px 14px', borderTop:'2px solid var(--line)' }}>Total</td>
                      <td style={{ fontWeight:600, color:'var(--green)', padding:'10px 14px', borderTop:'2px solid var(--line)' }}>
                        {'\u20A6'}{soldTotal.toLocaleString('en-NG', { maximumFractionDigits:0 })}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* \u2500\u2500 LOANED REPORT \u2500\u2500 */}
      {activeReport === 'loaned' && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1rem' }}>Works on loan / reserved</div>
              <span className="badge badge-amber">{loanedData.length} works</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Medium</th><th>Location</th><th>Status</th></tr></thead>
                <tbody>
                  {loanedData.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No works currently on loan</td></tr>
                    : loanedData.map((w, i) => (
                        <tr key={w.id}>
                          <td style={{ color:'var(--muted)', fontSize:12 }}>{i+1}</td>
                          <td style={{ fontWeight:500 }}>{w.title}</td>
                          <td style={{ color:'var(--muted)', fontSize:13 }}>{artistMap[w.artist_id]?.name || '\u2014'}</td>
                          <td style={{ color:'var(--muted)', fontSize:13 }}>{w.medium || '\u2014'}</td>
                          <td style={{ fontSize:13 }}>{w.location || '\u2014'}</td>
                          <td><span className="badge badge-amber">{w.availability}</span></td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', padding:'10px 14px', background:'var(--parchment)', borderRadius:3 }}>
            Shows all works with status "Reserved" or with "loan" in their location field. To track loans properly, set the artwork's location to include the borrower's name and set availability to Reserved.
          </div>
        </div>
      )}

      {/* \u2500\u2500 RECEIVED REPORT \u2500\u2500 */}
      {activeReport === 'received' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{receivedData.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Works received</div>
            </div>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{receivedData.filter(w=>w.ownership==='gallery').length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Gallery owned</div>
            </div>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{receivedData.filter(w=>w.ownership==='consignment').length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Consignment</div>
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Medium</th><th>Ownership</th><th>Consignor</th><th>Date added</th></tr></thead>
                <tbody>
                  {receivedData.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No works received in this period</td></tr>
                    : receivedData.map((w, i) => (
                        <tr key={w.id}>
                          <td style={{ color:'var(--muted)', fontSize:12 }}>{i+1}</td>
                          <td style={{ fontWeight:500 }}>{w.title}</td>
                          <td style={{ color:'var(--muted)', fontSize:13 }}>{artistMap[w.artist_id]?.name || '\u2014'}</td>
                          <td style={{ color:'var(--muted)', fontSize:13 }}>{w.medium || '\u2014'}</td>
                          <td>
                            {w.ownership === 'consignment'
                              ? <span className="badge badge-amber">Consignment</span>
                              : <span className="badge badge-blue">Gallery</span>}
                          </td>
                          <td style={{ fontSize:13 }}>{w.consignor_name || '\u2014'}</td>
                          <td style={{ fontSize:12, color:'var(--muted)' }}>{w.created_at?.slice(0,10)}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* \u2500\u2500 ACCOUNTS RECEIVABLE \u2500\u2500 */}
      {activeReport === 'receivable' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>{receivableData.length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Open invoices</div>
            </div>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem', color:'var(--amber)' }}>
                {'\u20A6'}{totalReceivable.toLocaleString('en-NG', { maximumFractionDigits:0 })}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Total outstanding (NGN equiv.)</div>
            </div>
            <div className="card" style={{ padding:'16px 18px' }}>
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{receivableData.filter(i=>i.status==='partial').length}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Partially paid</div>
            </div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Invoice</th><th>Client</th><th>Invoice total</th><th>Paid</th><th>Balance due</th><th>Currency</th><th>Status</th><th>Due date</th></tr>
                </thead>
                <tbody>
                  {receivableData.length === 0
                    ? <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No outstanding balances</td></tr>
                    : receivableData.map(inv => {
                        const overdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]
                        return (
                          <tr key={inv.id}>
                            <td style={{ fontFamily:'var(--font-serif)', fontWeight:500 }}>{inv.invoice_number}</td>
                            <td>{inv.clients?.name || '\u2014'}</td>
                            <td>{formatAmount(inv.total, inv.currency)}</td>
                            <td style={{ color:'var(--green)' }}>{formatAmount(inv.amount_paid || 0, inv.currency)}</td>
                            <td style={{ fontWeight:600, color: overdue ? 'var(--red)' : 'var(--amber)' }}>
                              {formatAmount(inv.balance_due, inv.currency)}
                              {overdue && <span style={{ fontSize:10, marginLeft:5, color:'var(--red)' }}>OVERDUE</span>}
                            </td>
                            <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.currency}</td>
                            <td><span className="badge badge-amber">{inv.status}</span></td>
                            <td style={{ fontSize:12, color: overdue ? 'var(--red)' : 'var(--muted)' }}>{inv.due_date || '\u2014'}</td>
                          </tr>
                        )
                      })
                  }
                </tbody>
                {receivableData.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ textAlign:'right', fontWeight:600, padding:'10px 14px', borderTop:'2px solid var(--line)' }}>Total outstanding</td>
                      <td style={{ fontWeight:600, color:'var(--amber)', padding:'10px 14px', borderTop:'2px solid var(--line)' }}>
                        {'\u20A6'}{totalReceivable.toLocaleString('en-NG', { maximumFractionDigits:0 })}
                      </td>
                      <td colSpan={3} style={{ borderTop:'2px solid var(--line)' }} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', padding:'10px 14px', background:'var(--parchment)', borderRadius:3, marginTop:12 }}>
            Balances shown in original invoice currency. NGN equivalent total uses exchange rates at time of invoicing.
          </div>
        </div>
      )}
    </div>
  )
}

// \u2500\u2500 PRINT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function printReport(reportId, { soldData, loanedData, receivedData, receivableData, artistMap, dateFrom, dateTo, soldTotal, totalReceivable }) {
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
  const period = `${dateFrom} to ${dateTo}`

  const baseStyle = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,sans-serif;color:#1a1714;padding:32px 40px;font-size:12px;}
    .header{margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1a1714;}
    .logo{font-family:Georgia,serif;font-size:18px;margin-bottom:2px;}
    .report-title{font-size:15px;font-weight:600;margin:6px 0 2px;}
    .meta{font-size:10px;color:#aaa;margin-top:4px;}
    .stat-row{display:flex;gap:24px;margin:16px 0;padding:12px 16px;background:#f9f8f6;border-radius:3px;}
    .stat{text-align:center;}
    .stat-n{font-family:Georgia,serif;font-size:22px;color:#1a1714;}
    .stat-l{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-top:3px;}
    table{width:100%;border-collapse:collapse;margin-top:12px;}
    th{padding:7px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:2px solid #1a1714;background:#f0ece4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    td{padding:7px 10px;border-bottom:1px solid #ece8e1;font-size:11px;vertical-align:top;}
    tfoot td{font-weight:600;border-top:2px solid #1a1714;border-bottom:none;background:#f9f8f6;}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #ddd9d1;font-size:10px;color:#aaa;text-align:center;}
    @media print{body{padding:16px 20px;}}
  `

  let body = ''

  if (reportId === 'sold') {
    body = `
      <div class="stat-row">
        <div class="stat"><div class="stat-n">${soldData.length}</div><div class="stat-l">Works sold</div></div>
        <div class="stat"><div class="stat-n">{'\u20A6'}${soldTotal.toLocaleString('en-NG',{maximumFractionDigits:0})}</div><div class="stat-l">Total revenue</div></div>
        <div class="stat"><div class="stat-n">${soldData.length ? '\u20A6'+Math.round(soldTotal/soldData.length).toLocaleString('en-NG') : '\u2014'}</div><div class="stat-l">Average price</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Client</th><th>Invoice</th><th>Date</th><th>Sale price</th></tr></thead>
        <tbody>${soldData.map((item,i)=>`<tr><td>${i+1}</td><td><strong>${e(item.title)}</strong></td><td>${e(item.artist_name||'\u2014')}</td><td>${e(item.client_name)}</td><td>${e(item.invoice_number)}</td><td>${e(item.sale_date)}</td><td style="color:#2d6a4f;font-weight:500">${formatAmount(item.line_total,item.currency)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="6" style="text-align:right">Total</td><td style="color:#2d6a4f">{'\u20A6'}${soldTotal.toLocaleString('en-NG',{maximumFractionDigits:0})}</td></tr></tfoot>
      </table>`
  }

  if (reportId === 'loaned') {
    body = `
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Medium</th><th>Location / borrower</th><th>Status</th></tr></thead>
        <tbody>${loanedData.map((w,i)=>`<tr><td>${i+1}</td><td><strong>${e(w.title)}</strong></td><td>${e(artistMap[w.artist_id]?.name||'\u2014')}</td><td>${e(w.medium||'\u2014')}</td><td>${e(w.location||'\u2014')}</td><td>${e(w.availability)}</td></tr>`).join('')}</tbody>
      </table>`
  }

  if (reportId === 'received') {
    body = `
      <div class="stat-row">
        <div class="stat"><div class="stat-n">${receivedData.length}</div><div class="stat-l">Works received</div></div>
        <div class="stat"><div class="stat-n">${receivedData.filter(w=>w.ownership==='gallery').length}</div><div class="stat-l">Gallery owned</div></div>
        <div class="stat"><div class="stat-n">${receivedData.filter(w=>w.ownership==='consignment').length}</div><div class="stat-l">Consignment</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Medium</th><th>Ownership</th><th>Consignor</th><th>Date added</th></tr></thead>
        <tbody>${receivedData.map((w,i)=>`<tr><td>${i+1}</td><td><strong>${e(w.title)}</strong></td><td>${e(artistMap[w.artist_id]?.name||'\u2014')}</td><td>${e(w.medium||'\u2014')}</td><td>${e(w.ownership||'gallery')}</td><td>${e(w.consignor_name||'\u2014')}</td><td>${e(w.created_at?.slice(0,10)||'\u2014')}</td></tr>`).join('')}</tbody>
      </table>`
  }

  if (reportId === 'receivable') {
    body = `
      <div class="stat-row">
        <div class="stat"><div class="stat-n">${receivableData.length}</div><div class="stat-l">Open invoices</div></div>
        <div class="stat"><div class="stat-n">{'\u20A6'}${totalReceivable.toLocaleString('en-NG',{maximumFractionDigits:0})}</div><div class="stat-l">Total outstanding</div></div>
        <div class="stat"><div class="stat-n">${receivableData.filter(i=>i.status==='partial').length}</div><div class="stat-l">Partial payments</div></div>
      </div>
      <table>
        <thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Paid</th><th>Balance due</th><th>Currency</th><th>Status</th><th>Due date</th></tr></thead>
        <tbody>${receivableData.map(inv=>{
          const overdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]
          return `<tr><td>${e(inv.invoice_number)}</td><td>${e(inv.clients?.name||'\u2014')}</td><td>${formatAmount(inv.total,inv.currency)}</td><td style="color:#2d6a4f">${formatAmount(inv.amount_paid||0,inv.currency)}</td><td style="color:${overdue?'#8b1a1a':'#92600a'};font-weight:600">${formatAmount(inv.balance_due,inv.currency)}${overdue?' \u26A0 OVERDUE':''}</td><td>${e(inv.currency)}</td><td>${e(inv.status)}</td><td style="color:${overdue?'#8b1a1a':'inherit'}">${e(inv.due_date||'\u2014')}</td></tr>`
        }).join('')}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right">Total outstanding</td><td style="color:#92600a">{'\u20A6'}${totalReceivable.toLocaleString('en-NG',{maximumFractionDigits:0})}</td><td colspan="3"></td></tr></tfoot>
      </table>`
  }

  const titles = { sold:'Artworks Sold', loaned:'Artworks on Loan', received:'Artworks Received', receivable:'Accounts Receivable' }
  const subtitles = { sold:`Period: ${period}`, received:`Period: ${period}` }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titles[reportId]} \u2014 Hourglass Gallery</title><style>${baseStyle}</style></head><body>
<div class="header">
  <div class="logo">Hourglass Gallery</div>
  <div class="report-title">${titles[reportId]}</div>
  ${subtitles[reportId] ? `<div class="meta">${subtitles[reportId]}</div>` : ''}
  <div class="meta">Generated ${today}</div>
</div>
${body}
<div class="footer">Hourglass Gallery {'\u00B7'} 298A Akin Olugbade Street, Victoria Island, Lagos</div>
</body></html>`

  const w = window.open('', '_blank', 'width=1100,height=750')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

function e(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
