import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { CURRENCIES, formatAmount, fetchLiveRates, toNGN, getRateLabel } from '../lib/currencies'
import { useAuth } from '../components/AuthProvider'

const TABS = ['Invoices', 'Pending Collection', 'Clients', 'Payments']
const STATUS_COLORS = { draft:'var(--muted)', sent:'var(--blue)', partial:'var(--amber)', paid:'var(--green)', cancelled:'var(--red)' }
const METHODS = ['transfer','cash','card','cheque','crypto','other']

export default function Sales() {
  const { user } = useAuth()
  const [tab, setTab] = useState('Invoices')
  const [clients, setClients] = useState([])
  const [invoices, setInvoices] = useState([])
  const [artworks, setArtworks] = useState([])
  const [books, setBooks] = useState([])
  const [artists, setArtists] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [activeInvoice, setActiveInvoice] = useState(null)
  const [editingInvoice, setEditingInvoice] = useState(null) // invoice being viewed/edited

  async function load() {
    // Load core data and exchange rates in parallel \u2014 rates won't block the page
    const [[c, inv, bks], r] = await Promise.all([
      Promise.all([
        fetchAll('clients', { select:'id,name,email,phone,phone_mobile,company,city,prefix', order: 'name' }),
        (async () => {
        const PAGE = 500; let all = [], offset = 0
        while (true) {
          const { data } = await supabase.from('invoices').select('*, clients(name), invoice_items(id,delivered)').order('created_at', { ascending: false }).range(offset, offset + PAGE - 1)
          if (!data || data.length === 0) break
          all = all.concat(data)
          if (data.length < PAGE) break
          offset += PAGE
        }
        return all
      })(),
        supabase.from('books').select('id,title,author,price,stock_count,cover_url').eq('visible',true).order('title').then(r => r.data || []),
      ]),
      fetchLiveRates(),
    ])
    setClients(c); setInvoices(inv); setBooks(bks); setRates(r)
    // Artworks loaded lazily when invoice modal opens
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading sales data{'\u2026'}</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-subtitle">
            {invoices.filter(i=>i.status==='paid').length} paid {'\u00B7'}
            {' '}{invoices.filter(i=>['sent','partial'].includes(i.status)).length} outstanding {'\u00B7'}

            {' '}{clients.length} clients
            {invoices.filter(i=>i.status==='paid'&&i.invoice_items?.some(it=>it.item_type==='artwork'&&!it.delivered)).length > 0 && <span style={{color:'#b8862a',marginLeft:8}}>{'\u00B7'} {invoices.filter(i=>i.status==='paid'&&i.invoice_items?.some(it=>it.item_type==='artwork'&&!it.delivered)).length} pending collection</span>}
            {rates['USD'] && <span style={{ marginLeft:8, fontSize:11, color:'var(--muted)' }}>1 USD = {'\u20A6'}{rates['USD']?.toLocaleString()}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline" onClick={() => setModal('client')}>+ Client</button>
          <button className="btn btn-primary" onClick={() => {
          // Open modal immediately \u2014 load artworks in background
          setModal('invoice')
          Promise.all([
            fetchAll('artworks', { select:'id,title,artist_id,medium,dimensions,year,image_url,price,retail_price,hg_code,availability,category,ownership,consignment_price,consignor_name,commission_rate', order:'title', cache:false }),
            fetchAll('artists', { order:'name' }),
          ]).then(([w, a]) => { setArtworks(w); setArtists(a) })
        }}>+ Invoice</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--line)', marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            style={{ padding:'9px 20px', fontSize:13, cursor:'pointer', background:'none', border:'none',
                     borderBottom: tab===t ? '2px solid var(--ink)' : '2px solid transparent',
                     color: tab===t ? 'var(--ink)' : 'var(--muted)', fontFamily:'var(--font-sans)' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Invoices' && (
        <InvoiceList
          invoices={invoices}
          onOpen={inv => { setActiveInvoice(inv); setModal('invoice-detail') }}
          onRefresh={load}
        />
      )}
      {tab === 'Pending Collection' && (
        <PendingCollection invoices={invoices} onOpen={inv => { setActiveInvoice(inv); setModal('invoice-detail') }} onRefresh={load} />
      )}
      {tab === 'Clients' && (
        <ClientList
          clients={clients}
          invoices={invoices}
          onRefresh={load}
        />
      )}
      {tab === 'Payments' && (
        <PaymentList invoices={invoices} rates={rates} />
      )}

      {/* Modals */}
      {modal === 'client' && (
        <ClientModal onClose={() => setModal(null)} onSave={load} />
      )}
      {(modal === 'invoice' || editingInvoice) && (
        <InvoiceModal
          clients={clients}
          artworks={artworks}
            books={books}
          artistMap={artistMap}
          rates={rates}
          userId={user?.id}
          onClose={() => setModal(null)}
          onSave={load}
        />
      )}
      {editingInvoice && (
        <InvoiceModal
          clients={clients} artworks={artworks} artistMap={artistMap}
          books={books} rates={rates} userId={userId}
          editInvoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSave={() => { load(); setEditingInvoice(null) }}
        />
      )}
      {modal === 'invoice-detail' && activeInvoice && (
        <InvoiceDetail
          invoice={activeInvoice}
          clients={clients}
          rates={rates}
          userId={user?.id}
          onClose={() => { setModal(null); setActiveInvoice(null) }}
          onSave={load}
        />
      )}
    </div>
  )
}

// \u2500\u2500 INVOICE LIST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// \u2500\u2500 PENDING COLLECTION TAB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function PendingCollection({ invoices, onOpen, onRefresh }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Get all undelivered artwork items on paid invoices
      const paidIds = invoices.filter(i => i.status === 'paid').map(i => i.id)
      if (paidIds.length === 0) { setItems([]); setLoading(false); return }
      const { data } = await supabase
        .from('invoice_items')
        .select('*, invoices(invoice_number, issue_date, client_id, clients(name))')
        .in('invoice_id', paidIds)
        .in('item_type', ['artwork', null])
        .eq('delivered', false)
        .order('created_at', { ascending: true })
      setItems(data || [])
      setLoading(false)
    }
    load()
  }, [invoices])

  function daysSince(dateStr) {
    if (!dateStr) return '\u2014'
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
    return diff === 0 ? 'Today' : diff === 1 ? '1 day' : `${diff} days`
  }

  function urgencyColor(dateStr) {
    if (!dateStr) return 'var(--muted)'
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000)
    if (diff > 30) return '#c0392b'
    if (diff > 14) return '#b8862a'
    return 'var(--muted)'
  }

  if (loading) return <div style={{ color:'var(--muted)', padding:20 }}>Loading{'\u2026'}</div>

  return (
    <div>
      <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:13, color:'var(--muted)' }}>
          {items.length === 0 ? 'No artworks pending collection' : `${items.length} artwork${items.length !== 1 ? 's' : ''} awaiting collection`}
        </div>
        {items.length > 0 && <div style={{ fontSize:11, color:'var(--muted)' }}>{'\u00B7'} Click an item to open the invoice and mark as collected</div>}
      </div>
      {items.length === 0 ? (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>{'\u2713'}</div>
          <div style={{ fontWeight:500 }}>All artworks collected</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:4 }}>No paid invoices with uncollected works</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Artwork</th>
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Invoice date</th>
                  <th>Waiting</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const inv = it.invoices
                  const waitColor = urgencyColor(inv?.issue_date)
                  return (
                    <tr key={it.id}>
                      <td>
                        <div style={{ fontWeight:500, fontSize:13 }}>{it.title}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{it.artist_name}{it.year ? ` \u00B7 ${it.year}` : ''}</div>
                      </td>
                      <td style={{ fontSize:13 }}>{inv?.clients?.name || '\u2014'}</td>
                      <td style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)' }}>{inv?.invoice_number}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{inv?.issue_date ? new Date(inv.issue_date).toLocaleDateString('en-GB') : '\u2014'}</td>
                      <td>
                        <span style={{ fontSize:12, fontWeight:600, color: waitColor }}>
                          {daysSince(inv?.issue_date)}
                        </span>
                      </td>
                      <td style={{ fontSize:13 }}>{formatAmount(it.line_total, 'NGN')}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const fullInv = invoices.find(i => i.id === it.invoice_id)
                          if (fullInv) { requestAnimationFrame(() => onOpen(fullInv)) }
                        }}>Open invoice</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceList({ invoices, onOpen, onRefresh }) {
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey]         = useState('date_desc')

  const SORTS = [
    { key:'date_desc',    label:'Date \u2193' },
    { key:'date_asc',     label:'Date \u2191' },
    { key:'amount_desc',  label:'Amount \u2193' },
    { key:'amount_asc',   label:'Amount \u2191' },
    { key:'balance_desc', label:'Balance \u2193' },
    { key:'client_az',    label:'Client A\u2013Z' },
    { key:'status',       label:'Status' },
  ]

  const filtered = useMemo(() => {
    let list = invoices.filter(i => {
      if (statusFilter && i.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return i.invoice_number?.toLowerCase().includes(q) ||
          i.clients?.name?.toLowerCase().includes(q)
      }
      return true
    })

    switch (sortKey) {
      case 'date_desc':    list = [...list].sort((a,b) => (b.issue_date||'').localeCompare(a.issue_date||'')); break
      case 'date_asc':     list = [...list].sort((a,b) => (a.issue_date||'').localeCompare(b.issue_date||'')); break
      case 'amount_desc':  list = [...list].sort((a,b) => (b.total_ngn||b.total||0) - (a.total_ngn||a.total||0)); break
      case 'amount_asc':   list = [...list].sort((a,b) => (a.total_ngn||a.total||0) - (b.total_ngn||b.total||0)); break
      case 'balance_desc': list = [...list].sort((a,b) => (b.balance_due||0) - (a.balance_due||0)); break
      case 'client_az':    list = [...list].sort((a,b) => (a.clients?.name||'').localeCompare(b.clients?.name||'')); break
      case 'status':       list = [...list].sort((a,b) => (a.status||'').localeCompare(b.status||'')); break
    }
    return list
  }, [invoices, search, statusFilter, sortKey])

  // Summary stats for filtered set
  const stats = useMemo(() => ({
    total:   filtered.reduce((s,i) => s + (i.total_ngn||i.total||0), 0),
    paid:    filtered.reduce((s,i) => s + (i.amount_paid||0), 0),
    balance: filtered.reduce((s,i) => s + (i.balance_due||0), 0),
    count:   filtered.length,
  }), [filtered])

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input className="form-input" style={{ width:220 }} placeholder="Search invoices..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="form-select" style={{ width:140 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All status</option>
          {['draft','sent','partial','paid','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="form-select" style={{ width:140 }} value={sortKey} onChange={e=>setSortKey(e.target.value)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.key === sortKey ? '\u2713 ' : ''}{s.label}</option>)}
        </select>
        <span style={{ fontSize:12, color:'var(--muted)', marginLeft:4 }}>{filtered.length} invoices</span>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ cursor:'pointer' }} onClick={() => setSortKey(s => s==='date_desc'?'date_asc':'date_desc')}>
                  Date {sortKey==='date_desc'?'\u2193':sortKey==='date_asc'?'\u2191':''}
                </th>
                <th>Invoice</th>
                <th style={{ cursor:'pointer' }} onClick={() => setSortKey(s => s==='client_az'?'date_desc':'client_az')}>
                  Client {sortKey==='client_az'?'\u2191':''}
                </th>
                <th style={{ cursor:'pointer' }} onClick={() => setSortKey(s => s==='amount_desc'?'amount_asc':'amount_desc')}>
                  Total {sortKey==='amount_desc'?'\u2193':sortKey==='amount_asc'?'\u2191':''}
                </th>
                <th>Paid</th>
                <th style={{ cursor:'pointer' }} onClick={() => setSortKey(s => s==='balance_desc'?'date_desc':'balance_desc')}>
                  Balance {sortKey==='balance_desc'?'\u2193':''}
                </th>
                <th style={{ cursor:'pointer' }} onClick={() => setSortKey(s => s==='status'?'date_desc':'status')}>
                  Status {sortKey==='status'?'\u2191':''}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} style={{ cursor:'pointer' }} onClick={() => requestAnimationFrame(() => onOpen(inv))}>
                  <td style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>{inv.issue_date}</td>
                  <td style={{ fontFamily:'var(--font-serif)', fontWeight:500, whiteSpace:'nowrap' }}>
                    {inv.invoice_number}
                    {inv.status==='paid' && inv.invoice_items?.some(it=>it.item_type==='artwork'&&!it.delivered) &&
                      <span title="Pending collection" style={{ marginLeft:6, color:'var(--amber)' }}>{'\u25CF'}</span>}
                  </td>
                  <td>{inv.clients?.name || '\u2014'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums' }}>{formatAmount(inv.total, inv.currency)}</td>
                  <td style={{ color:'var(--green)', fontVariantNumeric:'tabular-nums' }}>{formatAmount(inv.amount_paid || 0, inv.currency)}</td>
                  <td style={{ color: inv.balance_due > 0 ? 'var(--amber)' : 'var(--muted)', fontVariantNumeric:'tabular-nums' }}>
                    {inv.balance_due > 0 ? formatAmount(inv.balance_due, inv.currency) : '\u2014'}
                  </td>
                  <td><span className="badge" style={{ background: STATUS_COLORS[inv.status]+'22', color: STATUS_COLORS[inv.status] }}>{inv.status}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();onOpen(inv)}}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// \u2500\u2500 CLIENT LIST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function generateClientReport(client, invoices, logoB64, opts = {}) {
  const { dateFrom, dateTo, showOutstanding, showAll } = opts
  function e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  function fmt(n, cur) { return (cur && cur !== 'NGN' ? cur + ' ' : '₦') + Number(n||0).toLocaleString('en-NG', {maximumFractionDigits:2}) }

  // Filter invoices
  let filtered = invoices.filter(i => i.client_id === client.id)
  if (dateFrom) filtered = filtered.filter(i => i.issue_date >= dateFrom)
  if (dateTo) filtered = filtered.filter(i => i.issue_date <= dateTo)
  if (showOutstanding && !showAll) filtered = filtered.filter(i => Number(i.balance_due) > 0)

  const totalInvoiced = filtered.reduce((s,i) => s + Number(i.total_ngn||i.total||0), 0)
  const totalPaid = filtered.reduce((s,i) => s + Number(i.amount_paid||0), 0)
  const totalOutstanding = filtered.reduce((s,i) => s + Number(i.balance_due||0), 0)

  const logoHtml = logoB64
    ? `<img src='${logoB64}' style='height:28px;object-fit:contain;display:block;'>`
    : `<div style='font-size:16px;font-weight:300;letter-spacing:.04em;'>HOURGLASS GALLERY</div>`

  const periodLine = dateFrom || dateTo
    ? `${dateFrom || ''} to ${dateTo || new Date().toISOString().slice(0,10)}`
    : 'All periods'

  const rows = filtered.map(inv => `
    <tr>
      <td>${e(inv.invoice_number)}</td>
      <td>${e(inv.issue_date||'')}</td>
      <td>${e(inv.status)}</td>
      <td style='text-align:right'>${fmt(inv.total_ngn||inv.total, inv.currency)}</td>
      <td style='text-align:right;color:#2d6a4f'>${fmt(inv.amount_paid, inv.currency)}</td>
      <td style='text-align:right;${Number(inv.balance_due)>0?'color:#92600a;font-weight:600;':'color:#aaa;'}'>${Number(inv.balance_due)>0 ? fmt(inv.balance_due, inv.currency) : 'NIL'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Account Statement</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:36px 44px;max-width:640px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a1714;margin-bottom:24px;}
.summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#e8e3db;border:1px solid #e8e3db;border-radius:4px;overflow:hidden;margin-bottom:28px;}
.stat{background:#fff;padding:14px 16px;}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:5px;}
.stat-value{font-size:18px;font-family:Georgia,serif;color:#1a1714;}
.stat-value.outstanding{color:#92600a;}
table{width:100%;border-collapse:collapse;}
th{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#999;padding:7px 8px;border-bottom:2px solid #1a1714;text-align:left;}
td{padding:9px 8px;border-bottom:1px solid #f0ece7;font-size:12px;vertical-align:top;}
.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e8e3db;font-size:10px;color:#999;line-height:1.8;}
@media print{@page{margin:10mm 12mm;size:A4 portrait;}body{padding:0;max-width:100%;}}
</style></head><body>
<div class="header">
  <div>${logoHtml}</div>
  <div style='text-align:right'>
    <div style='font-size:11px;color:#999;margin-bottom:3px'>Account Statement</div>
    <div style='font-size:9px;color:#bbb'>${e(periodLine)}</div>
  </div>
</div>

<div style='margin-bottom:20px'>
  <div style='font-weight:600;font-size:15px'>${e(client.name)}</div>
  ${client.company ? `<div style='font-size:12px;color:#666'>${e(client.company)}</div>` : ''}
  ${client.email ? `<div style='font-size:12px;color:#999'>${e(client.email)}</div>` : ''}
</div>

<div class="summary">
  <div class="stat"><div class="stat-label">Total invoiced</div><div class="stat-value">₦${totalInvoiced.toLocaleString('en-NG',{maximumFractionDigits:0})}</div></div>
  <div class="stat"><div class="stat-label">Total paid</div><div class="stat-value">₦${totalPaid.toLocaleString('en-NG',{maximumFractionDigits:0})}</div></div>
  <div class="stat"><div class="stat-label">Outstanding</div><div class="stat-value outstanding">₦${totalOutstanding.toLocaleString('en-NG',{maximumFractionDigits:0})}</div></div>
</div>

<table>
  <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th style='text-align:right'>Amount</th><th style='text-align:right'>Paid</th><th style='text-align:right'>Balance</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr style='font-weight:600;border-top:2px solid #1a1714'>
      <td colspan='3'>Total</td>
      <td style='text-align:right'>₦${totalInvoiced.toLocaleString('en-NG',{maximumFractionDigits:0})}</td>
      <td style='text-align:right;color:#2d6a4f'>₦${totalPaid.toLocaleString('en-NG',{maximumFractionDigits:0})}</td>
      <td style='text-align:right;color:#92600a'>₦${totalOutstanding.toLocaleString('en-NG',{maximumFractionDigits:0})}</td>
    </tr>
  </tfoot>
</table>

<div class="footer">
  <div>Hourglass Gallery &middot; 298A Akin Olugbade Street, Victoria Island, Lagos</div>
  <div>info@hourglassgallery.com</div>
</div>
</body></html>`

  const w = window.open('', '_blank', 'width=800,height=700')
  if (!w) { alert('Please allow popups'); return }
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 800)
}

function ClientList({ clients, invoices, onRefresh }) {
  const [modal, setModal] = useState(false)       // false | 'add' | 'edit'
  const [selected, setSelected] = useState(null)  // client being viewed/edited
  const [showReport, setShowReport] = useState(false)
  const [reportOpts, setReportOpts] = useState({ dateFrom:'', dateTo:'', showAll:true })
  const [form, setForm] = useState({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const clientInvoiceCount = useMemo(() => {
    const counts = {}
    invoices.forEach(inv => { counts[inv.client_id] = (counts[inv.client_id]||0)+1 })
    return counts
  }, [invoices])

  const clientInvoices = useMemo(() => {
    if (!selected) return []
    return invoices.filter(i => i.client_id === selected.id)
  }, [selected, invoices])

  const filtered = useMemo(() =>
    clients.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()))
  , [clients, search])

  function openAdd() {
    setForm({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })
    setModal('add')
  }

  function openEdit(c) {
    setForm({ ...c, phone_mobile: c.phone_mobile||c.phone||'', phone_work: c.phone_work||'', street: c.street||c.address||'', suburb: c.suburb||'', state: c.state||'', postcode: c.postcode||'' })
    setModal('edit')
  }

  async function save() {
    if (!form.name) return alert('Name required')
    setSaving(true)
    try {
      const payload = {
        name: form.name, email: form.email||null,
        phone: form.phone_mobile||form.phone||null,
        phone_mobile: form.phone_mobile||null, phone_work: form.phone_work||null,
        prefix: form.prefix||null, first_name: form.first_name||null, last_name: form.last_name||null,
        company: form.company||null, job_title: form.job_title||null,
        address: form.street||form.address||null, street: form.street||null,
        suburb: form.suburb||null, city: form.city||null,
        state: form.state||null, postcode: form.postcode||null,
        country: form.country||null, notes: form.notes||null,
        updated_at: new Date().toISOString(),
      }
      if (modal === 'edit' && selected) {
        const { error } = await supabase.from('clients').update(payload).eq('id', selected.id)
        if (error) throw error
        setSelected({ ...selected, ...payload })
      } else {
        const { error } = await supabase.from('clients').insert(payload)
        if (error) throw error
      }
      cacheInvalidate('clients')
      await onRefresh()
      setModal(false)
    } catch(err) {
      alert('Failed: ' + err.message)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap:20 }}>
      {/* Client list */}
      <div>
        <div style={{ display:'flex', gap:8, marginBottom:14 }}>
          <input className="form-input" placeholder="Search clients..." value={search} onChange={e=>setSearch(e.target.value)} style={{ flex:1 }}/>
          <button className="btn btn-primary" onClick={openAdd}>+ Add</button>
        </div>
        <div className="card" style={{ padding:0 }}>
          {filtered.map(c => (
            <div key={c.id}
              onClick={() => {
                if (selected?.id === c.id) { setSelected(null); return }
                setSelected(c)  // show immediately with basic data
                requestAnimationFrame(() => {
                  // Then fetch full record in background
                  supabase.from('clients').select('*').eq('id', c.id).single()
                    .then(({ data }) => { if (data) setSelected(data) })
                })
              }}
              style={{ padding:'12px 16px', borderBottom:'1px solid var(--line-soft)', cursor:'pointer',
                background: selected?.id === c.id ? 'var(--surface-1,#f5f3f0)' : 'transparent',
                display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:500, fontSize:13 }}>
                  {c.prefix ? <span style={{ color:'var(--muted)', fontSize:12 }}>{c.prefix} </span> : null}
                  {(c.name||'').split(/[\r\n]/)[0].slice(0,40)}{(c.name||'').length>40?'...':''}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {[c.company, c.city].filter(Boolean).join(' \u00B7 ') || c.email || '\u2014'}
                </div>
              </div>
              <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0, marginLeft:8 }}>
                {clientInvoiceCount[c.id]||0} inv
              </span>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No clients found</div>}
        </div>
      </div>

      {/* Client detail panel */}
      {selected && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:16 }}>{selected.prefix ? `${selected.prefix} ` : ''}{selected.name}</div>
              {selected.company && <div style={{ fontSize:13, color:'var(--muted)' }}>{selected.company}{selected.job_title ? ` \u00B7 ${selected.job_title}` : ''}</div>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(selected)}>Edit</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowReport(r => !r)}>Account report</button>
              <button className="btn btn-ghost btn-sm" style={{ color:'var(--red,#c0392b)' }}
                onClick={async () => {
                  if (!confirm(`Delete ${selected.name}? This cannot be undone.`)) return
                  const { error } = await supabase.from('clients').delete().eq('id', selected.id)
                  if (error) { alert('Cannot delete: ' + error.message); return }
                  setSelected(null)
                  await onRefresh()
                }}>Delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>{'\u2715'}</button>
            </div>
          </div>

          {/* Contact info */}
          <div className="card" style={{ padding:'16px 18px', marginBottom:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              ['Email', selected.email],
              ['Mobile', selected.phone_mobile||selected.phone],
              ['Work phone', selected.phone_work],
              ['City', selected.city],
              ['State', selected.state],
              ['Country', selected.country],
              ['Address', selected.street||selected.address],
              ['Notes', selected.notes],
            ].filter(([,v]) => v).map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:13 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Account Report */}
          {showReport && (
            <div className="card" style={{ padding:'16px 18px', marginBottom:14 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12 }}>Account Report</div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', display:'block', marginBottom:3 }}>From</label>
                  <input type="date" className="form-input" style={{ width:150 }} value={reportOpts.dateFrom} onChange={e => setReportOpts(o=>({...o,dateFrom:e.target.value}))} />
                </div>
                <div>
                  <label style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', display:'block', marginBottom:3 }}>To</label>
                  <input type="date" className="form-input" style={{ width:150 }} value={reportOpts.dateTo} onChange={e => setReportOpts(o=>({...o,dateTo:e.target.value}))} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <input type="radio" checked={reportOpts.showAll} onChange={() => setReportOpts(o=>({...o,showAll:true}))} /> All invoices
                  </label>
                  <label style={{ fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <input type="radio" checked={!reportOpts.showAll} onChange={() => setReportOpts(o=>({...o,showAll:false}))} /> Outstanding only
                  </label>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  let logoB64 = null
                  try { const a = await import('../lib/assets'); logoB64 = a.LOGO_SMALL_B64 || a.LOGO_B64 } catch(_) {}
                  generateClientReport(selected, clientInvoices, logoB64, reportOpts)
                }}>Generate & Print</button>
                <button className="btn btn-outline btn-sm" onClick={async () => {
                  const url = `https://wa.me/${(selected.phone_mobile||selected.phone||'').replace(/\D/g,'')}`
                  window.open(url, '_blank')
                }}>WhatsApp</button>
              </div>
            </div>
          )}

          {/* Invoice history */}
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>
            Invoice history ({clientInvoices.length})
          </div>
          <div className="card" style={{ padding:0 }}>
            {clientInvoices.length === 0
              ? <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No invoices yet</div>
              : clientInvoices.map(inv => (
                <div key={inv.id} style={{ padding:'11px 16px', borderBottom:'1px solid var(--line-soft)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{inv.invoice_number}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{inv.issue_date}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:13 }}>{'\u20A6'}{Number(inv.total_ngn||inv.total||0).toLocaleString()}</div>
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:2, fontWeight:600,
                      background: inv.status==='paid' ? '#edf7f0' : inv.status==='sent' ? '#fef9ec' : '#f0f0f0',
                      color: inv.status==='paid' ? '#27ae60' : inv.status==='sent' ? '#b8862a' : '#666'
                    }}>{inv.status}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">Add client</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}>{'\u2715'}</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-row">
                <div className="form-group" style={{maxWidth:90}}>
                  <label className="form-label">Prefix</label>
                  <select className="form-select" value={form.prefix||''} onChange={e=>setForm(f=>({...f,prefix:e.target.value}))}>
                    <option value="">{'\u2014'}</option>
                    {['Mr','Mrs','Ms','Dr','Prof','Chief','Alhaji','Alhaja','Sir'].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">First name</label>
                  <input className="form-input" value={form.first_name||''} onChange={e=>setForm(f=>({...f,first_name:e.target.value,name:[e.target.value,f.last_name].filter(Boolean).join(' ')}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last name</label>
                  <input className="form-input" value={form.last_name||''} onChange={e=>setForm(f=>({...f,last_name:e.target.value,name:[f.first_name,e.target.value].filter(Boolean).join(' ')}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Full name * <span style={{fontWeight:400,color:'var(--muted)',textTransform:'none',letterSpacing:0}}>{'\u2014'} auto-fills from above</span></label>
                  <input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Company / Organisation</label>
                  <input className="form-input" value={form.company||''} onChange={e=>setForm(f=>({...f,company:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Job title</label>
                  <input className="form-input" value={form.job_title||''} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Mobile</label>
                  <input className="form-input" value={form.phone_mobile||''} onChange={e=>setForm(f=>({...f,phone_mobile:e.target.value,phone:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Work phone</label>
                  <input className="form-input" value={form.phone_work||''} onChange={e=>setForm(f=>({...f,phone_work:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Street address</label>
                <input className="form-input" value={form.street||''} onChange={e=>setForm(f=>({...f,street:e.target.value,address:e.target.value}))} placeholder="House number, street name"/>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-input" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">State / Province</label>
                  <input className="form-input" value={form.state||''} onChange={e=>setForm(f=>({...f,state:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Postcode</label>
                  <input className="form-input" value={form.postcode||''} onChange={e=>setForm(f=>({...f,postcode:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Country</label>
                  <input className="form-input" value={form.country||''} onChange={e=>setForm(f=>({...f,country:e.target.value}))} />
                </div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving\u2026':'Save client'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// \u2500\u2500 PAYMENT LIST \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function PaymentList({ invoices, rates }) {
  const payments = useMemo(() => {
    const all = []
    invoices.forEach(inv => {
      // payments come from the invoice detail load \u2014 for now show invoice-level summary
    })
    return all
  }, [invoices])

  const paidInvoices = invoices.filter(i => ['paid','partial'].includes(i.status))
  const totalNGN = paidInvoices.reduce((s,i) => s + Number(i.amount_paid||0) * (i.currency==='NGN'?1:(rates[i.currency]||1)), 0)

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{'\u20A6'}{totalNGN.toLocaleString('en-NG',{maximumFractionDigits:0})}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Total received (NGN equiv.)</div>
        </div>
        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{invoices.filter(i=>i.status==='paid').length}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Fully paid invoices</div>
        </div>
        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>{invoices.filter(i=>i.status==='partial').length}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Partial payments</div>
        </div>
      </div>
      <div style={{ fontSize:13, color:'var(--muted)' }}>Open individual invoices to add or view payment records.</div>
    </div>
  )
}

// \u2500\u2500 CLIENT MODAL \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function ClientModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.name) return alert('Name required')
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone_mobile || form.phone || null,
        phone_mobile: form.phone_mobile || null,
        phone_work: form.phone_work || null,
        prefix: form.prefix || null,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        company: form.company || null,
        job_title: form.job_title || null,
        address: form.street || form.address || null,
        street: form.street || null,
        suburb: form.suburb || null,
        city: form.city || null,
        state: form.state || null,
        postcode: form.postcode || null,
        country: form.country || null,
        notes: form.notes || null,
      }
      const { error } = await supabase.from('clients').insert(payload)
      if (error) throw error
      onSave(); onClose()
    } catch(err) {
      alert('Failed to save client: ' + err.message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header"><div className="modal-title">Add client</div><button className="btn btn-ghost btn-icon" onClick={onClose}>{'\u2715'}</button></div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">City</label><input className="form-input" value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Country</label><input className="form-input" value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving\u2026':'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// \u2500\u2500 INVOICE MODAL (create new) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, onClose, onSave, editInvoice=null }) {
  const isEdit = !!editInvoice
  const [form, setForm] = useState(editInvoice ? {
    client_id:      editInvoice.client_id || '',
    currency:       editInvoice.currency || 'NGN',
    discount_type:  editInvoice.discount_type || 'none',
    discount_value: editInvoice.discount_value || 0,
    vat_rate:       editInvoice.vat_rate || 0,
    issue_date:     editInvoice.issue_date || new Date().toISOString().split('T')[0],
    due_date:       editInvoice.due_date || '',
    notes:          editInvoice.notes || '',
    terms:          editInvoice.terms || '',
    keep_currency:  editInvoice.keep_currency ?? (editInvoice.currency !== 'NGN'),
    fixed_rate:     editInvoice.exchange_rate || null,
  } : {
    client_id:'', currency:'NGN', discount_type:'none', discount_value:0,
    vat_rate:0, issue_date: new Date().toISOString().split('T')[0],
    due_date:'', notes:'', terms:'', keep_currency:false, fixed_rate:null,
  })
  const [items, setItems] = useState([]) // { artwork_id, title, artist_name, year, medium, dimensions, unit_price, quantity:1, discount:0 }
  const [artworkSearch, setArtworkSearch] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const rateLabel = getRateLabel(form.currency, rates)
  const exchangeRate = form.fixed_rate || rates[form.currency] || 1

  // Load existing items when editing
  useEffect(() => {
    if (!isEdit) return
    supabase.from('invoice_items').select('*').eq('invoice_id', editInvoice.id).order('sort_order')
      .then(({ data }) => {
        if (data) setItems(data.map(it => ({
          id: it.id,
          artwork_id: it.artwork_id,
          book_id: it.book_id,
          item_type: it.item_type || 'artwork',
          title: it.title,
          artist_name: it.artist_name,
          year: it.year,
          medium: it.medium,
          dimensions: it.dimensions,
          unit_price: it.unit_price,
          quantity: it.quantity || 1,
          discount: it.discount || 0,
          ownership: it.ownership || 'gallery',
          commission_rate: it.commission_rate,
        })))
      })
  }, [isEdit])

  function addArtwork(artwork) {
    if (items.find(i => i.artwork_id === artwork.id)) return
    const artist = artistMap[artwork.artist_id]
    const priceNum = parseFloat(artwork.price?.replace(/[^0-9.]/g,'')) || 0
    setItems(prev => [...prev, {
      artwork_id: artwork.id,
      title: artwork.title,
      artist_name: artist?.name || '',
      year: artwork.year || '',
      medium: artwork.medium || '',
      dimensions: artwork.dimensions || '',
      unit_price: priceNum,
      quantity: 1,
      discount: 0,
      ownership: artwork.ownership || 'gallery',
      commission_rate: artwork.commission_rate || 40,
      consignor_name: artwork.consignor_name || null,
    }])
    setArtworkSearch('')
  }

  function addBook(book) {
    if (items.find(i => i.book_id === book.id)) return
    setItems(prev => [...prev, {
      book_id: book.id,
      item_type: 'book',
      title: book.title,
      artist_name: book.author || '',
      year: '',
      medium: 'Book',
      dimensions: '',
      unit_price: Number(book.price) || 0,
      quantity: 1,
      discount: 0,
      ownership: 'gallery',
      commission_rate: null,
      consignor_name: null,
    }])
    setBookSearch('')
  }

  function removeItem(idx) { setItems(prev => prev.filter((_,i)=>i!==idx)) }
  function updateItem(idx, key, val) { setItems(prev => prev.map((it,i) => i===idx ? {...it,[key]:val} : it)) }

  const subtotal = items.reduce((s,it) => s + (Number(it.unit_price)||0)*Number(it.quantity||1) - Number(it.discount||0), 0)
  const discountAmt = form.discount_type==='percent' ? subtotal*(Number(form.discount_value)||0)/100 : Number(form.discount_value)||0
  const afterDiscount = subtotal - discountAmt
  const vatAmt = afterDiscount * (Number(form.vat_rate)||0) / 100
  const total = afterDiscount + vatAmt
  const totalNGN = total * exchangeRate

  async function save() {
    if (!form.client_id) return alert('Please select a client')
    if (items.length === 0) return alert('Please add at least one artwork')
    setSaving(true)
    try {
      // Get next invoice number
      const { data: numData } = await supabase.rpc('next_invoice_number')
      const invoiceNumber = numData

      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        client_id: form.client_id,
        currency: form.currency,
        exchange_rate: form.keep_currency ? null : (form.fixed_rate || exchangeRate),
        keep_currency: form.keep_currency || false,
        base_currency: 'NGN',
        subtotal,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value)||0,
        vat_rate: Number(form.vat_rate)||0,
        vat_amount: vatAmt,
        total,
        total_ngn: totalNGN,
        amount_paid: 0,
        balance_due: total,
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        notes: form.notes,
        terms: form.terms,
        status: 'draft',
        created_by: userId,
      }).select().single()
      if (invErr) throw invErr

      await supabase.from('invoice_items').insert(items.map((it,i) => ({
        invoice_id: inv.id,
        artwork_id: it.artwork_id || null,
        book_id: it.book_id || null,
        item_type: it.item_type || 'artwork',
        title: it.title,
        artist_name: it.artist_name,
        year: it.year,
        medium: it.medium,
        dimensions: it.dimensions,
        unit_price: Number(it.unit_price)||0,
        quantity: Number(it.quantity)||1,
        discount: Number(it.discount)||0,
        line_total: (Number(it.unit_price)||0)*(Number(it.quantity)||1) - (Number(it.discount)||0),
        sort_order: i,
        // Ownership snapshot \u2014 recorded permanently at time of invoice
        ownership: it.ownership || 'gallery',
        commission_rate: it.ownership === 'consignment' ? (it.commission_rate || 40) : null,
        consignor_name: it.consignor_name || null,
      })))

      onSave(); onClose()
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredArtworks = artworks.filter(w => {
    if (!artworkSearch) return false
    const q = artworkSearch.toLowerCase()
    const artistName = (artistMap[w.artist_id]?.name || '').toLowerCase()
    return w.title?.toLowerCase().includes(q) ||
      artistName.includes(q) ||
      w.hg_code?.toLowerCase().includes(q) ||
      w.medium?.toLowerCase().includes(q)
  }).slice(0, 100)

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" style={{ maxHeight:'94vh' }}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? `Edit ${editInvoice.invoice_number}` : 'New invoice'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24 }}>
          {/* Left: items */}
          <div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>Add items</div>
              {/* Book search */}
              <input
                className="form-input"
                placeholder="Search books by title or author..."
                value={bookSearch}
                onChange={e=>setBookSearch(e.target.value)}
                style={{ marginBottom:6 }}
              />
              {bookSearch && (books||[]).filter(b => b.title?.toLowerCase().includes(bookSearch.toLowerCase()) || b.author?.toLowerCase().includes(bookSearch.toLowerCase())).slice(0,6).map(b => (
                <div key={b.id} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 12px', cursor:'pointer', border:'1px solid var(--line)', borderRadius:3, marginBottom:4, background:'var(--white)' }}
                  onClick={()=>addBook(b)}>
                  {b.cover_url ? <img src={b.cover_url} alt="" style={{width:28,height:36,objectFit:'cover',borderRadius:2}}/> : <div style={{width:28,height:36,background:'var(--parchment-2)',borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>{'\uD83D'}{'\uDCD6'}</div>}
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{b.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{b.author} {'\u00B7'} {'\u20A6'}{Number(b.price||0).toLocaleString()} {'\u00B7'} {b.stock_count} in stock</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginTop:10, marginBottom:8 }}>Artworks</div>
              <input
                className="form-input"
                placeholder="Search artworks by title or artist..."
                value={artworkSearch}
                onChange={e=>setArtworkSearch(e.target.value)}
              />
              {artworkSearch && filteredArtworks.length > 0 && (
                <div style={{ border:'1px solid var(--line)', borderTop:'none', borderRadius:'0 0 3px 3px', background:'var(--white)', maxHeight:220, overflowY:'auto' }}>
                  {filteredArtworks.map(w => (
                    <div key={w.id}
                      style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', display:'flex', gap:10, alignItems:'center' }}
                      onClick={() => addArtwork(w)}
                    >
                      {w.image_url && <img src={w.image_url} alt="" style={{ width:36, height:36, objectFit:'cover', borderRadius:2 }} />}
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{w.title}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name} {'\u00B7'} {w.year}</div>
                      </div>
                      <div style={{ marginLeft:'auto', textAlign:'right' }}>
                      {w.price && <div style={{ fontSize:12, color:'var(--green)' }}>{w.price}</div>}
                      {w.ownership === 'consignment' && <div style={{ fontSize:10, color:'var(--amber)' }}>Consignment {'\u00B7'} {w.commission_rate||40}% comm.</div>}
                    </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Line items */}
            {items.length > 0 && (
              <div>
                <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>Line items</div>
                {items.map((it, idx) => (
                  <div key={idx} style={{ border:'1px solid var(--line)', borderRadius:3, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <div>
                        <div style={{ fontWeight:500, fontSize:13 }}>{it.title}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{it.artist_name} {'\u00B7'} {it.year}</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => removeItem(idx)}>Remove</button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px', gap:8 }}>
                      <div className="form-group">
                        <label className="form-label">Unit price ({form.currency})</label>
                        <input className="form-input" type="number" value={it.unit_price} onChange={e=>updateItem(idx,'unit_price',e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Qty</label>
                        <input className="form-input" type="number" min={1} value={it.quantity} onChange={e=>updateItem(idx,'quantity',e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Discount</label>
                        <input className="form-input" type="number" value={it.discount} onChange={e=>updateItem(idx,'discount',e.target.value)} />
                      </div>
                    </div>
                    <div style={{ textAlign:'right', fontSize:13, color:'var(--ink)' }}>
                      Line total: <strong>{formatAmount((Number(it.unit_price)||0)*(Number(it.quantity)||1)-(Number(it.discount)||0), form.currency)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: invoice settings + totals */}
          <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
            <div className="form-group" style={{position:'relative'}}>
              <label className="form-label">Client *</label>
              {form.client_id && !clientSearch ? (
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <div style={{flex:1, padding:'8px 10px', border:'1px solid var(--line)', borderRadius:4, fontSize:13, background:'var(--white)'}}>
                    {clients.find(c=>c.id===form.client_id)?.name}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setForm(f=>({...f,client_id:''}));setClientSearch('')}}>{'\u2715'}</button>
                </div>
              ) : (
                <>
                  <input className="form-input" placeholder="Search clients..." value={clientSearch}
                    onChange={e=>setClientSearch(e.target.value)}
                    onFocus={()=>{ if(form.client_id) setClientSearch('') }}
                  />
                  {clientSearch && (
                    <div style={{position:'absolute', zIndex:50, top:'100%', left:0, right:0, background:'var(--white)', border:'1px solid var(--line)', borderTop:'none', borderRadius:'0 0 4px 4px', maxHeight:200, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,.08)'}}>
                      {clients.filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                        <div style={{padding:'10px 12px', fontSize:13, color:'var(--muted)'}}>No clients found</div>
                      )}
                      {clients.filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c=>(
                        <div key={c.id} style={{padding:'9px 12px', cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--line-soft)'}}
                          onMouseDown={()=>{ setForm(f=>({...f,client_id:c.id})); setClientSearch('') }}>
                          <div>{c.name}</div>
                          <div style={{fontSize:11, color:'var(--muted)'}}>
                            {[c.company, c.email, c.city].filter(Boolean).join(' \u00B7 ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Invoice currency</label>
              <select className="form-select" value={form.currency} onChange={e=>setForm(f=>({...f, currency:e.target.value, keep_currency: e.target.value !== 'NGN', fixed_rate:null }))}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {'\u2014'} {c.name}</option>)}
              </select>
            </div>
            {form.currency !== 'NGN' && (
              <div className="form-group">
                <label className="form-label">NGN conversion</label>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                    <input type="radio" checked={!form.keep_currency} onChange={() => setForm(f=>({...f, keep_currency:false}))} />
                    Convert to NGN
                  </label>
                  {!form.keep_currency && (
                    <div style={{ marginLeft:20, display:'flex', gap:8, alignItems:'center' }}>
                      <div style={{ fontSize:12, color:'var(--muted)' }}>
                        {rates[form.currency] ? `Live: 1 ${form.currency} = \u20A6${Math.round(rates[form.currency]).toLocaleString()}` : 'No live rate'}
                      </div>
                      <span style={{ color:'var(--muted)', fontSize:12 }}>or fixed:</span>
                      <input className="form-input" type="number" style={{ width:100, padding:'4px 8px', fontSize:12 }}
                        placeholder="e.g. 1650" value={form.fixed_rate || ''}
                        onChange={e => setForm(f=>({...f, fixed_rate: e.target.value ? Number(e.target.value) : null}))} />
                      <span style={{ fontSize:12, color:'var(--muted)' }}>NGN</span>
                    </div>
                  )}
                  <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                    <input type="radio" checked={!!form.keep_currency} onChange={() => setForm(f=>({...f, keep_currency:true, fixed_rate:null}))} />
                    Keep in {form.currency} \u2014 create foreign currency receivable
                  </label>
                  {form.keep_currency && (
                    <div style={{ marginLeft:20, fontSize:11, color:'var(--amber,#b8862a)', padding:'6px 10px', background:'#fef9ec', borderRadius:3 }}>
                      Invoice and balance will remain in {form.currency}. Payments must be recorded in {form.currency}.
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Issue date</label>
                <input className="form-input" type="date" value={form.issue_date} onChange={e=>setForm(f=>({...f,issue_date:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Due date</label>
                <input className="form-input" type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Discount type</label>
                <select className="form-select" value={form.discount_type} onChange={e=>setForm(f=>({...f,discount_type:e.target.value}))}>
                  <option value="none">None</option>
                  <option value="percent">Percent %</option>
                  <option value="flat">Flat amount</option>
                </select>
              </div>
              {form.discount_type !== 'none' && (
                <div className="form-group">
                  <label className="form-label">Discount value</label>
                  <input className="form-input" type="number" value={form.discount_value} onChange={e=>setForm(f=>({...f,discount_value:e.target.value}))} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">VAT / Tax rate (%)</label>
              <input className="form-input" type="number" value={form.vat_rate} onChange={e=>setForm(f=>({...f,vat_rate:e.target.value}))} placeholder="0 = no VAT · 7.5 = Nigerian VAT" />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
            </div>

            {/* Totals */}
            <div style={{ background:'var(--parchment)', borderRadius:3, padding:'14px 16px', fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span>Subtotal</span><span>{formatAmount(subtotal, form.currency)}</span>
              </div>
              {discountAmt > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, color:'var(--green)' }}>
                  <span>Discount</span><span>{'\u2212'}{formatAmount(discountAmt, form.currency)}</span>
                </div>
              )}
              {vatAmt > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, color:'var(--muted)' }}>
                  <span>VAT ({form.vat_rate}%)</span><span>{formatAmount(vatAmt, form.currency)}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:600, fontSize:15, borderTop:'1px solid var(--line)', paddingTop:8, marginTop:8 }}>
                <span>Total</span><span>{formatAmount(total, form.currency)}</span>
              </div>
              {form.currency !== 'NGN' && (
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:5, textAlign:'right' }}>
                  \u2248 \u20A6{totalNGN.toLocaleString('en-NG',{maximumFractionDigits:0})} NGN
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? (isEdit?'Saving\u2026':'Creating\u2026') : (isEdit?'Save changes':'Create invoice')}</button>
        </div>
      </div>
    </div>
  )
}

// \u2500\u2500 INVOICE DETAIL (view, add payment, print) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave, onEdit }) {
  const [payments, setPayments] = useState([])
  const [items, setItems] = useState([])
  const [payForm, setPayForm] = useState({ amount:'', currency: inv.currency, method:'transfer', paid_at: new Date().toISOString().split('T')[0], reference:'', notes:'' })
  const [addingPay, setAddingPay] = useState(false)
  const [saving, setSaving] = useState(false)
  const client = clients.find(c => c.id === inv.client_id)
  const exchangeRate = rates[inv.currency] || 1

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: it }] = await Promise.all([
        supabase.from('payments').select('*').eq('invoice_id', inv.id).order('paid_at'),
        supabase.from('invoice_items').select('*, artworks(image_url)').eq('invoice_id', inv.id).order('sort_order'),
      ])
      setPayments(p || [])
      setItems((it || []).map(item => ({ ...item, image_url: item.image_url || item.artworks?.image_url || null })))
    }
    load()
  }, [inv.id])

  async function addPayment() {
    const amt = parseFloat(payForm.amount)
    if (!amt || amt <= 0) return alert('Enter a valid amount')
    setSaving(true)
    try {
      const payRate = rates[payForm.currency] || 1
      await supabase.from('payments').insert({
        invoice_id: inv.id,
        amount: amt,
        currency: payForm.currency,
        exchange_rate: payRate,
        amount_ngn: amt * payRate,
        method: payForm.method,
        paid_at: payForm.paid_at,
        reference: payForm.reference,
        notes: payForm.notes,
        recorded_by: userId,
      })
      onSave()
      onClose()
    } catch (err) {
      alert('Payment failed: ' + err.message)
    } finally { setSaving(false) }
  }

  async function updateStatus(status) {
    await supabase.from('invoices').update({ status, updated_at: new Date().toISOString() }).eq('id', inv.id)
    cacheInvalidate('invoices')
    onSave(); onClose()
  }

  async function saveNotes(notes) {
    await supabase.from('invoices').update({ notes, updated_at: new Date().toISOString() }).eq('id', inv.id)
    onSave()
  }

  async function printInvoice() {
    let logoB64 = null
    try { const assets = await import('../lib/assets'); logoB64 = assets.LOGO_SMALL_B64 || assets.LOGO_B64 } catch(_) {}
    const html = await buildInvoiceHTML(inv, client, items, payments, logoB64)
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) { alert('Please allow popups for this site to print invoices'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 800)
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" style={{ maxHeight:'94vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{inv.invoice_number}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
              {client?.name}
              {' \u00B7 '}<span style={{ color: STATUS_COLORS[inv.status], fontWeight:500 }}>{inv.status}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => requestAnimationFrame(printInvoice)}>Print / PDF</button>
            <button className="btn btn-outline btn-sm" style={{ background:'#25D366', color:'#fff', border:'none' }} onClick={() => { const url = window.location.origin + '/sign/' + inv.id; window.open('https://wa.me/?text=' + encodeURIComponent('Invoice ' + inv.invoice_number + ' from Hourglass Gallery: ' + url), '_blank') }}>WhatsApp</button>
            {(inv.status === 'cancelled' || inv.status === 'draft') && (
              <button className="btn btn-ghost btn-sm" style={{ color:'var(--red,#c0392b)' }}
                onClick={async () => {
                  if (!confirm('Permanently delete this invoice? This cannot be undone.')) return
                  await supabase.from('invoices').delete().eq('id', inv.id)
                  onSave(); onClose()
                }}>Delete</button>
            )}
            <button className="btn btn-ghost btn-icon" onClick={onClose}>{'\u2715'}</button>
          </div>
        </div>
        <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:24 }}>
          {/* Items */}
          <div>
            <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>Line items</div>
            {items.map(it => (
              <div key={it.id} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--line-soft)' }}>
                <div>
                  <div style={{ fontWeight:500 }}>{it.title}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{it.artist_name} {'\u00B7'} {it.year} {'\u00B7'} {it.medium}</div>
                  {it.ownership === 'consignment' && it.commission_rate && (
                    <div style={{ fontSize:11, color:'var(--amber)', marginTop:2 }}>
                      Consignment {'\u2014'} gallery: {it.commission_rate}% ({'\u20A6'}{Math.round(it.line_total * it.commission_rate / 100).toLocaleString()}) \u00B7 owner: {100 - it.commission_rate}% ({'\u20A6'}{Math.round(it.line_total * (100 - it.commission_rate) / 100).toLocaleString()})
                    </div>
                  )}
                  {(it.item_type === 'artwork' || !it.item_type) && (
                    <div style={{ marginTop:6 }}>
                      <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12 }}>
                        <input type="checkbox" style={{ width:'auto' }}
                          checked={it.delivered || false}
                          onChange={async e => {
                            const now = new Date().toISOString()
                            await supabase.from('invoice_items').update({
                              delivered: e.target.checked,
                              delivered_at: e.target.checked ? now : null,
                            }).eq('id', it.id)
                            setItems(prev => prev.map(i => i.id === it.id ? { ...i, delivered: e.target.checked, delivered_at: e.target.checked ? now : null } : i))
                            onSave()
                          }}
                        />
                        <span style={{ color: it.delivered ? 'var(--green,#27ae60)' : '#b8862a', fontWeight:500 }}>
                          {it.delivered ? `\u2713 Collected${it.delivered_at ? ' \u00B7 ' + new Date(it.delivered_at).toLocaleDateString('en-GB') : ''}` : '\u23F3 Pending collection'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:500 }}>{formatAmount(it.line_total, inv.currency)}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{it.quantity} {'\u00D7'} {formatAmount(it.unit_price, inv.currency)}</div>
                </div>
              </div>
            ))}

            {/* Totals */}
            <div style={{ marginTop:14, padding:'12px 0', fontSize:13 }}>
              {inv.discount_value > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', color:'var(--green)', marginBottom:5 }}>
                  <span>Discount</span><span>{'\u2212'}{formatAmount(inv.discount_value, inv.currency)}</span>
                </div>
              )}
              {inv.vat_amount > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', color:'var(--muted)', marginBottom:5 }}>
                  <span>VAT ({inv.vat_rate}%)</span><span>{formatAmount(inv.vat_amount, inv.currency)}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:600, fontSize:15, borderTop:'1px solid var(--line)', paddingTop:8 }}>
                <span>Total</span><span>{formatAmount(inv.total, inv.currency)}</span>
              </div>
              {inv.currency !== 'NGN' && (
                <div style={{ textAlign:'right', fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  \u2248 \u20A6{Number(inv.total_ngn).toLocaleString('en-NG',{maximumFractionDigits:0})} at invoice rate
                </div>
              )}
            </div>

            {/* Payment history */}
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>Payment history</div>
              {payments.length === 0
                ? <div style={{ fontSize:13, color:'var(--muted)' }}>No payments recorded</div>
                : payments.map(p => (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--line-soft)', fontSize:13 }}>
                    <div>
                      <span style={{ fontWeight:500 }}>{formatAmount(p.amount, p.currency)}</span>
                      <span style={{ color:'var(--muted)', marginLeft:8 }}>{p.method} {'\u00B7'} {p.paid_at}</span>
                      {p.reference && <span style={{ color:'var(--muted)', marginLeft:8, fontSize:11 }}>ref: {p.reference}</span>}
                    </div>
                    <div style={{ color:'var(--muted)', fontSize:11 }}>
                      {p.currency !== 'NGN' && `\u2248 \u20A6${Number(p.amount_ngn).toLocaleString('en-NG',{maximumFractionDigits:0})}`}
                    </div>
                  </div>
                ))
              }
              <div style={{ marginTop:12, display:'flex', justifyContent:'space-between', fontWeight:500 }}>
                <span>Balance due</span>
                <span style={{ color: Number(inv.balance_due) > 0 ? 'var(--amber)' : 'var(--green)' }}>
                  {formatAmount(inv.balance_due, inv.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: add payment + status */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>Invoice status</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {['draft','sent','partial','paid','cancelled'].map(s => (
                  <button key={s} className={`btn btn-sm ${inv.status === s ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => requestAnimationFrame(() => updateStatus(s))} style={{ textTransform:'capitalize' }}>{s}</button>
                ))}
              </div>
            </div>

            <div style={{ borderTop:'1px solid var(--line)', paddingTop:14 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>Record payment</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input className="form-input" type="number" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={payForm.currency} onChange={e=>setPayForm(f=>({...f,currency:e.target.value}))}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                  {payForm.currency !== 'NGN' && rates[payForm.currency] && (
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                      1 {payForm.currency} = \u20A6{rates[payForm.currency]?.toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Method</label>
                  <select className="form-select" value={payForm.method} onChange={e=>setPayForm(f=>({...f,method:e.target.value}))}>
                    {METHODS.map(m => <option key={m} value={m} style={{ textTransform:'capitalize' }}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={payForm.paid_at} onChange={e=>setPayForm(f=>({...f,paid_at:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Reference / transaction ID</label>
                  <input className="form-input" value={payForm.reference} onChange={e=>setPayForm(f=>({...f,reference:e.target.value}))} />
                </div>
                <button className="btn btn-gold" onClick={addPayment} disabled={saving}>
                  {saving ? 'Recording\u2026' : 'Record payment'}
                </button>
              </div>
            </div>

            {inv.notes && (
              <div style={{ background:'var(--parchment)', padding:'12px 14px', borderRadius:3, fontSize:12, color:'var(--muted)' }}>
                {inv.notes}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

async function buildInvoiceHTML(inv, client, items, payments, logoB64) {
  const bal = Number(inv.balance_due||0)
  function e(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const itemsWithImages = await Promise.all(items.map(async it => {
    if (!it.image_url) return it
    try {
      const resp = await fetch(it.image_url)
      const blob = await resp.blob()
      const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
      return { ...it, _imgData: dataUrl }
    } catch(_) { return it }
  }))
  const logoHtml = logoB64
    ? `<img src='${logoB64}' alt='Hourglass Gallery' style='height:25px;object-fit:contain;object-position:left center;display:block;'>`
    : `<div style="font-family:Georgia,serif;font-size:18px;color:#1a1714;font-weight:300;letter-spacing:.04em;">HOURGLASS GALLERY</div>`
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${e(inv.invoice_number)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,Helvetica,sans-serif;color:#1a1714;padding:32px 36px;max-width:600px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #1a1714;}
.inv-meta{text-align:right;}
.inv-no{font-size:12px;color:#6b6760;font-family:Georgia,serif;}
.status-badge{margin-top:5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
table{width:100%;border-collapse:collapse;margin-top:8px;}
th{padding:7px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;border-bottom:2px solid #1a1714;}
td{padding:10px 8px;border-bottom:1px solid #ece8e1;vertical-align:top;font-size:13px;}
.total-row td{font-weight:600;font-size:14px;border-top:2px solid #1a1714;border-bottom:none;padding-top:12px;}
.footer{margin-top:40px;padding-top:14px;border-top:1px solid #ddd9d1;font-size:11px;color:#6b6760;line-height:1.9;}
.art-img{width:46px;height:46px;object-fit:cover;border-radius:2px;display:block;}
@media print{@page{margin:10mm 12mm;size:A4 portrait;}body{padding:0;max-width:100%;}}
</style></head><body>
<div class="header">
  <div>${logoHtml}</div>
  <div class="inv-meta">
    <div class="inv-no">${e(inv.invoice_number)}</div>
    ${inv.issue_date?'<div style="font-size:10px;color:#aaa;margin-top:3px">'+e(inv.issue_date)+'</div>':''}
    ${inv.status==='paid'?'<div class="status-badge" style="color:#27ae60">Paid</div>':''}
    ${inv.status==='partial'?'<div class="status-badge" style="color:#b8862a">Partial payment</div>':''}
  </div>
</div>
${client?`<div style="margin-bottom:24px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#aaa;margin-bottom:5px">Invoice to</div><div style="font-weight:600;font-size:14px;">${e(client.name)}</div>${client.company?`<div style="font-size:12px;color:#6b6760">${e(client.company)}</div>`:''}${client.street||client.address?`<div style="font-size:12px;color:#6b6760">${e(client.street||client.address)}</div>`:''}${client.email?`<div style="font-size:12px;color:#6b6760">${e(client.email)}</div>`:''}${client.phone||client.phone_mobile?`<div style="font-size:12px;color:#6b6760">${e(client.phone||client.phone_mobile)}</div>`:''}</div>`:''}
<table><tbody>
${itemsWithImages.map(it=>`<tr><td>${it._imgData?`<img src="${it._imgData}" class="art-img" alt="">`:'<div style="width:46px;height:46px;background:#f0ece7;border-radius:2px;"></div>'}</td><td><strong>${e(it.title)}</strong><br><span style="font-size:11px;color:#6b6760">${e(it.artist_name||'')}${it.year?', '+e(it.year):''}</span>${it.medium?`<br><span style="font-size:11px;color:#aaa">${e(it.medium)}${it.dimensions?' &middot; '+e(it.dimensions):''}</span>`:''}</td><td style="text-align:right;white-space:nowrap;">${formatAmount(it.line_total,inv.currency)}</td></tr>`).join('')}
${Number(inv.vat_amount)>0?`<tr><td colspan="2" style="text-align:right;color:#6b6760;font-size:12px">VAT (${inv.vat_rate}%)</td><td style="text-align:right">${formatAmount(inv.vat_amount,inv.currency)}</td></tr>`:''}
<tr class="total-row"><td colspan="2" style="text-align:right">Total</td><td style="text-align:right;white-space:nowrap;">${formatAmount(inv.total,inv.currency)}</td></tr>
${payments.length>0?`<tr><td colspan="2" style="text-align:right;color:#2d6a4f;font-size:12px">Amount paid</td><td style="text-align:right;color:#2d6a4f;white-space:nowrap;">${formatAmount(inv.amount_paid,inv.currency)}</td></tr>`:''}
${bal>0?`<tr><td colspan="2" style="text-align:right;font-weight:600">Balance due</td><td style="text-align:right;font-weight:600;color:#92600a;white-space:nowrap;">${formatAmount(bal,inv.currency)}</td></tr>`:''}
</tbody></table>
${inv.notes?`<div style="margin-top:18px;font-size:12px;color:#6b6760;padding:10px 12px;background:#f8f7f5;border-radius:3px;">${e(inv.notes)}</div>`:''}
${payments.length>0?`<div style="margin-top:24px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#aaa;margin-bottom:8px">Payment history</div>${payments.map(p=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ece8e1;font-size:12px"><span style="color:#6b6760">${e(p.method)}${p.reference?' &middot; '+e(p.reference):''}</span><span style="white-space:nowrap;">${formatAmount(p.amount,p.currency)}</span></div>`).join('')}</div>`:''}
<div class="footer">
  <div>Hourglass Gallery</div>
  <div>298A Akin Olugbade Street, Victoria Island, Lagos</div>
  <div>info@hourglassgallery.com</div>
  
</div>
</body></html>`
}
