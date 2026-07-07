import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
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
  const [activeInvoice, setActiveInvoice] = useState(null) // invoice being viewed/edited

  async function load() {
    const [c, inv, bks, w, a] = await Promise.all([
      fetchAll('clients', { select:'id,name,email,phone,phone_mobile,company,city,prefix', order: 'name' }),
      supabase.from('invoices').select('*, clients(name), invoice_items(*)').order('created_at', { ascending: false }).limit(200).then(r => r.data || []),
      supabase.from('books').select('id,title,author,price,stock_count,cover_url').eq('visible',true).order('title').then(r => r.data || []),
      fetchAll('artworks', { select:'id,title,artist_id,medium,dimensions,year,image_url,price,retail_price,hg_code,availability,category,ownership,consignment_price,consignor_name,commission_rate', filters:[['availability','neq','Sold']], order:'title' }),
      fetchAll('artists', { order:'name' }),
    ])
    const r = await fetchLiveRates()
    setClients(c); setInvoices(inv); setBooks(bks); setArtworks(w); setArtists(a); setRates(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const artistMap = useMemo(() => Object.fromEntries(artists.map(a => [a.id, a])), [artists])

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading sales data…</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Sales & Invoices</div>
          <div className="page-subtitle">
            {invoices.filter(i=>i.status==='paid').length} paid ·
            {' '}{invoices.filter(i=>['sent','partial'].includes(i.status)).length} outstanding ·
            {' '}{clients.length} clients
            {invoices.filter(i=>i.status==='paid'&&i.invoice_items?.some(it=>it.item_type==='artwork'&&!it.delivered)).length > 0 && <span style={{color:'#b8862a',marginLeft:8}}>· {invoices.filter(i=>i.status==='paid'&&i.invoice_items?.some(it=>it.item_type==='artwork'&&!it.delivered)).length} pending collection</span>}
            {rates['USD'] && <span style={{ marginLeft:8, fontSize:11, color:'var(--muted)' }}>1 USD = ₦{rates['USD']?.toLocaleString()}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline" onClick={() => setModal('client')}>+ Client</button>
          <button className="btn btn-primary" onClick={() => setModal('invoice')}>+ Invoice</button>
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
      {modal === 'invoice' && (
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

// ── INVOICE LIST ─────────────────────────────────────────────
// ── PENDING COLLECTION TAB ───────────────────────────────────
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
    if (!dateStr) return '—'
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

  if (loading) return <div style={{ color:'var(--muted)', padding:20 }}>Loading…</div>

  return (
    <div>
      <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:13, color:'var(--muted)' }}>
          {items.length === 0 ? 'No artworks pending collection' : `${items.length} artwork${items.length !== 1 ? 's' : ''} awaiting collection`}
        </div>
        {items.length > 0 && <div style={{ fontSize:11, color:'var(--muted)' }}>· Click an item to open the invoice and mark as collected</div>}
      </div>
      {items.length === 0 ? (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>✓</div>
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
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{it.artist_name}{it.year ? ` · ${it.year}` : ''}</div>
                      </td>
                      <td style={{ fontSize:13 }}>{inv?.clients?.name || '—'}</td>
                      <td style={{ fontSize:12, fontFamily:'monospace', color:'var(--muted)' }}>{inv?.invoice_number}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{inv?.issue_date ? new Date(inv.issue_date).toLocaleDateString('en-GB') : '—'}</td>
                      <td>
                        <span style={{ fontSize:12, fontWeight:600, color: waitColor }}>
                          {daysSince(inv?.issue_date)}
                        </span>
                      </td>
                      <td style={{ fontSize:13 }}>{formatAmount(it.line_total, 'NGN')}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const fullInv = invoices.find(i => i.id === it.invoice_id)
                          if (fullInv) onOpen(fullInv)
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = invoices.filter(i => {
    if (statusFilter && i.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return i.invoice_number?.toLowerCase().includes(q) || i.clients?.name?.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <input className="form-input" style={{ width:220 }} placeholder="Search invoices…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="form-select" style={{ width:160 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">All status</option>
          {['draft','sent','partial','paid','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Client</th><th>Currency</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} style={{ cursor:'pointer' }} onClick={() => onOpen(inv)}>
                  <td style={{ fontFamily:'var(--font-serif)', fontWeight:500 }}>{inv.invoice_number}</td>
                  <td>{inv.clients?.name || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.currency}</td>
                  <td>{formatAmount(inv.total, inv.currency)}</td>
                  <td style={{ color:'var(--green)' }}>{formatAmount(inv.amount_paid || 0, inv.currency)}</td>
                  <td style={{ color: inv.balance_due > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatAmount(inv.balance_due || 0, inv.currency)}</td>
                  <td><span className="badge" style={{ background: STATUS_COLORS[inv.status]+'22', color: STATUS_COLORS[inv.status] }}>{inv.status}</span></td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.issue_date}</td>
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

// ── CLIENT LIST ──────────────────────────────────────────────
function ClientList({ clients, invoices, onRefresh }) {
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })
  const [saving, setSaving] = useState(false)

  const clientInvoiceCount = useMemo(() => {
    const counts = {}
    invoices.forEach(inv => { counts[inv.client_id] = (counts[inv.client_id]||0)+1 })
    return counts
  }, [invoices])

  async function save() {
    if (!form.name) return alert('Name required')
    setSaving(true)
    try {
      await supabase.from('clients').insert(form)
      onRefresh(); setModal(false); setForm({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Add client</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>City</th><th>Invoices</th></tr></thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight:500 }}>{c.name}{c.prefix ? <span style={{fontWeight:400,color:'var(--muted)',fontSize:12}}> ({c.prefix})</span> : null}</td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>{c.company||'—'}</td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>{c.email||'—'}</td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>{c.phone||c.phone_mobile||'—'}</td>
                  <td style={{ fontSize:13, color:'var(--muted)' }}>{c.city||'—'}</td>
                  <td style={{ fontSize:13 }}>{clientInvoiceCount[c.id]||0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">Add client</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-row">
                <div className="form-group" style={{maxWidth:90}}>
                  <label className="form-label">Prefix</label>
                  <select className="form-select" value={form.prefix||''} onChange={e=>setForm(f=>({...f,prefix:e.target.value}))}>
                    <option value="">—</option>
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
                  <label className="form-label">Full name * <span style={{fontWeight:400,color:'var(--muted)',textTransform:'none',letterSpacing:0}}>— auto-fills from above</span></label>
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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Street address</label>
                  <input className="form-input" value={form.street||''} onChange={e=>setForm(f=>({...f,street:e.target.value,address:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-input" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input className="form-input" value={form.state||''} onChange={e=>setForm(f=>({...f,state:e.target.value}))} />
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
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save client'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PAYMENT LIST ─────────────────────────────────────────────
function PaymentList({ invoices, rates }) {
  const payments = useMemo(() => {
    const all = []
    invoices.forEach(inv => {
      // payments come from the invoice detail load — for now show invoice-level summary
    })
    return all
  }, [invoices])

  const paidInvoices = invoices.filter(i => ['paid','partial'].includes(i.status))
  const totalNGN = paidInvoices.reduce((s,i) => s + Number(i.amount_paid||0) * (i.currency==='NGN'?1:(rates[i.currency]||1)), 0)

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.8rem' }}>₦{totalNGN.toLocaleString('en-NG',{maximumFractionDigits:0})}</div>
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

// ── CLIENT MODAL ─────────────────────────────────────────────
function ClientModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'', email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'', suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'' })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.name) return alert('Name required')
    setSaving(true)
    await supabase.from('clients').insert(form)
    onSave(); onClose()
    setSaving(false)
  }
  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header"><div className="modal-title">Add client</div><button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button></div>
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
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── INVOICE MODAL (create new) ───────────────────────────────
function InvoiceModal({ clients, artworks, artistMap, books, rates, userId, onClose, onSave }) {
  const [form, setForm] = useState({
    client_id:'', currency:'NGN', discount_type:'none', discount_value:0,
    vat_rate:0, issue_date: new Date().toISOString().split('T')[0],
    due_date:'', notes:'', terms:'Payment due within 30 days of invoice date.'
  })
  const [items, setItems] = useState([]) // { artwork_id, title, artist_name, year, medium, dimensions, unit_price, quantity:1, discount:0 }
  const [artworkSearch, setArtworkSearch] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const rateLabel = getRateLabel(form.currency, rates)
  const exchangeRate = rates[form.currency] || 1

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
        exchange_rate: exchangeRate,
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
        // Ownership snapshot — recorded permanently at time of invoice
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

  const filteredArtworks = artworks.filter(w =>
    !artworkSearch || w.title?.toLowerCase().includes(artworkSearch.toLowerCase()) ||
    artistMap[w.artist_id]?.name?.toLowerCase().includes(artworkSearch.toLowerCase())
  ).slice(0, 10)

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" style={{ maxHeight:'94vh' }}>
        <div className="modal-header">
          <div className="modal-title">New invoice</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24 }}>
          {/* Left: items */}
          <div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>Add items</div>
              {/* Book search */}
              <input
                className="form-input"
                placeholder="Search books by title or author…"
                value={bookSearch}
                onChange={e=>setBookSearch(e.target.value)}
                style={{ marginBottom:6 }}
              />
              {bookSearch && (books||[]).filter(b => b.title?.toLowerCase().includes(bookSearch.toLowerCase()) || b.author?.toLowerCase().includes(bookSearch.toLowerCase())).slice(0,6).map(b => (
                <div key={b.id} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 12px', cursor:'pointer', border:'1px solid var(--line)', borderRadius:3, marginBottom:4, background:'var(--white)' }}
                  onClick={()=>addBook(b)}>
                  {b.cover_url ? <img src={b.cover_url} alt="" style={{width:28,height:36,objectFit:'cover',borderRadius:2}}/> : <div style={{width:28,height:36,background:'var(--parchment-2)',borderRadius:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>📖</div>}
                  <div>
                    <div style={{ fontSize:13, fontWeight:500 }}>{b.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{b.author} · ₦{Number(b.price||0).toLocaleString()} · {b.stock_count} in stock</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginTop:10, marginBottom:8 }}>Artworks</div>
              <input
                className="form-input"
                placeholder="Search artworks by title or artist…"
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
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]?.name} · {w.year}</div>
                      </div>
                      <div style={{ marginLeft:'auto', textAlign:'right' }}>
                      {w.price && <div style={{ fontSize:12, color:'var(--green)' }}>{w.price}</div>}
                      {w.ownership === 'consignment' && <div style={{ fontSize:10, color:'var(--amber)' }}>Consignment · {w.commission_rate||40}% comm.</div>}
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
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{it.artist_name} · {it.year}</div>
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
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setForm(f=>({...f,client_id:''}));setClientSearch('')}}>✕</button>
                </div>
              ) : (
                <>
                  <input className="form-input" placeholder="Search clients…" value={clientSearch}
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
                          {c.name}
                          {c.email && <span style={{fontSize:11, color:'var(--muted)', marginLeft:8}}>{c.email}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="form-select" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
              {rateLabel && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{rateLabel}</div>}
            </div>
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
                  <span>Discount</span><span>−{formatAmount(discountAmt, form.currency)}</span>
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
                  ≈ ₦{totalNGN.toLocaleString('en-NG',{maximumFractionDigits:0})} NGN
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Creating…':'Create invoice'}</button>
        </div>
      </div>
    </div>
  )
}

// ── INVOICE DETAIL (view, add payment, print) ────────────────
function InvoiceDetail({ invoice: inv, clients, rates, userId, onClose, onSave }) {
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
        supabase.from('invoice_items').select('*').eq('invoice_id', inv.id).order('sort_order'),
      ])
      setPayments(p || [])
      setItems(it || [])
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
    onSave(); onClose()
  }

  function printInvoice() {
    const w = window.open('', '_blank')
    w.document.write(buildInvoiceHTML(inv, client, items, payments))
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" style={{ maxHeight:'94vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{inv.invoice_number}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
              {client?.name} · {inv.issue_date} ·{' '}
              <span style={{ color: STATUS_COLORS[inv.status] }}>{inv.status}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-outline btn-sm" onClick={printInvoice}>Print / PDF</button>
            <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
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
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{it.artist_name} · {it.year} · {it.medium}</div>
                  {it.ownership === 'consignment' && it.commission_rate && (
                    <div style={{ fontSize:11, color:'var(--amber)', marginTop:2 }}>
                      Consignment — gallery: {it.commission_rate}% (₦{Math.round(it.line_total * it.commission_rate / 100).toLocaleString()}) · owner: {100 - it.commission_rate}% (₦{Math.round(it.line_total * (100 - it.commission_rate) / 100).toLocaleString()})
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
                          {it.delivered ? `✓ Collected${it.delivered_at ? ' · ' + new Date(it.delivered_at).toLocaleDateString('en-GB') : ''}` : '⏳ Pending collection'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:500 }}>{formatAmount(it.line_total, inv.currency)}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{it.quantity} × {formatAmount(it.unit_price, inv.currency)}</div>
                </div>
              </div>
            ))}

            {/* Totals */}
            <div style={{ marginTop:14, padding:'12px 0', fontSize:13 }}>
              {inv.discount_value > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', color:'var(--green)', marginBottom:5 }}>
                  <span>Discount</span><span>−{formatAmount(inv.discount_value, inv.currency)}</span>
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
                  ≈ ₦{Number(inv.total_ngn).toLocaleString('en-NG',{maximumFractionDigits:0})} at invoice rate
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
                      <span style={{ color:'var(--muted)', marginLeft:8 }}>{p.method} · {p.paid_at}</span>
                      {p.reference && <span style={{ color:'var(--muted)', marginLeft:8, fontSize:11 }}>ref: {p.reference}</span>}
                    </div>
                    <div style={{ color:'var(--muted)', fontSize:11 }}>
                      {p.currency !== 'NGN' && `≈ ₦${Number(p.amount_ngn).toLocaleString('en-NG',{maximumFractionDigits:0})}`}
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
                    onClick={() => updateStatus(s)} style={{ textTransform:'capitalize' }}>{s}</button>
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
                      1 {payForm.currency} = ₦{rates[payForm.currency]?.toLocaleString()}
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
                  {saving ? 'Recording…' : 'Record payment'}
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

function buildInvoiceHTML(inv, client, items, payments) {
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
  const bal = Number(inv.balance_due||0)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoice_number}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,sans-serif;color:#1a1714;padding:48px;max-width:760px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;}
.logo{font-family:Georgia,serif;font-size:22px;}
.inv-no{font-size:20px;font-family:Georgia,serif;}
table{width:100%;border-collapse:collapse;}
th{padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;border-bottom:2px solid #1a1714;}
td{padding:10px 12px;border-bottom:1px solid #ece8e1;}
.total-row td{font-weight:600;font-size:15px;border-top:2px solid #1a1714;border-bottom:none;}
.footer{margin-top:48px;padding-top:20px;border-top:1px solid #ddd9d1;font-size:11px;color:#6b6760;}
@media print{body{padding:24px;}}
</style></head><body>
<div class="header">
  <div><div class="logo">Hourglass Gallery</div><div style="font-size:11px;color:#6b6760;margin-top:4px">298A Akin Olugbade Street, Victoria Island, Lagos</div></div>
  <div style="text-align:right"><div class="inv-no">${inv.invoice_number}</div><div style="color:#6b6760;font-size:12px;margin-top:4px">Issued: ${inv.issue_date}${inv.due_date?'  ·  Due: '+inv.due_date:''}</div></div>
</div>
${client ? `<div style="margin-bottom:28px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;margin-bottom:5px">Invoice to</div><div style="font-weight:500">${client.name}</div>${client.email?'<div>'+client.email+'</div>':''}${client.phone?'<div>'+client.phone+'</div>':''}${client.city?'<div>'+client.city+(client.country?', '+client.country:'')+'</div>':''}</div>` : ''}
<table>
  <thead><tr><th>Artwork</th><th>Artist</th><th>Year</th><th style="text-align:right">Price (${inv.currency})</th></tr></thead>
  <tbody>
    ${items.map(it => `<tr><td><strong>${it.title}</strong>${it.medium?'<br><span style="font-size:11px;color:#6b6760">'+it.medium+'</span>':''}</td><td>${it.artist_name||'—'}</td><td>${it.year||'—'}</td><td style="text-align:right">${formatAmount(it.line_total,inv.currency)}</td></tr>`).join('')}
    ${Number(inv.vat_amount)>0?`<tr><td colspan="3" style="text-align:right;color:#6b6760">VAT (${inv.vat_rate}%)</td><td style="text-align:right">${formatAmount(inv.vat_amount,inv.currency)}</td></tr>`:''}
    <tr class="total-row"><td colspan="3" style="text-align:right">Total</td><td style="text-align:right">${formatAmount(inv.total,inv.currency)}</td></tr>
    ${payments.length>0?`<tr><td colspan="3" style="text-align:right;color:#2d6a4f">Amount paid</td><td style="text-align:right;color:#2d6a4f">${formatAmount(inv.amount_paid,inv.currency)}</td></tr>`:''}
    ${bal>0?`<tr><td colspan="3" style="text-align:right;font-weight:600">Balance due</td><td style="text-align:right;font-weight:600;color:#92600a">${formatAmount(bal,inv.currency)}</td></tr>`:''}
  </tbody>
</table>
${inv.terms?`<div style="margin-top:24px;font-size:12px;color:#6b6760">${inv.terms}</div>`:''}
${payments.length>0?`<div style="margin-top:24px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b6760;margin-bottom:8px">Payment history</div>${payments.map(p=>`<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ece8e1;font-size:12px"><span>${p.paid_at} · ${p.method}${p.reference?' · ref: '+p.reference:''}</span><span>${formatAmount(p.amount,p.currency)}</span></div>`).join('')}</div>`:''}
<div class="footer"><div>Hourglass Gallery · info@hourglassgallery.com</div><div style="margin-top:3px">Generated ${today}</div></div>
</body></html>`
}
