import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { formatAmount } from '../lib/currencies'

// Invoices that count against a client's balance. Drafts aren't owed yet and
// cancelled invoices never will be.
const LIVE_STATUSES = ['sent', 'partial', 'paid']
const OPEN_STATUSES = ['sent', 'partial']

const PERIODS = [
  ['all',    'All time'],
  ['ytd',    'This year'],
  ['12m',    'Last 12 months'],
  ['90d',    'Last 90 days'],
  ['custom', 'Custom range'],
]

// Same vocabulary the CRM logs visits with, so the two pages agree
const VISIT_TYPES = ['in-person', 'call', 'email', 'whatsapp', 'event', 'other']

// Invoice amounts are held in the invoice's own currency. Most foreign-currency
// invoices never had exchange_rate filled in, so fall back to the rate implied
// by total_ngn, then to the cached NGN rates. A rate of 0 means "can't convert"
// — those are left out of naira totals rather than counted as if they were naira.
function rateFor(inv, rates) {
  if (!inv || inv.currency === 'NGN') return 1
  const stored = Number(inv.exchange_rate)
  if (stored > 0) return stored
  const total = Number(inv.total), totalNgn = Number(inv.total_ngn)
  if (total > 0 && totalNgn > 0) return totalNgn / total
  return Number(rates?.[inv.currency]) || 0
}

function ngnOf(amount, inv) {
  const n = Number(amount) || 0
  if (!n) return 0
  return n * (inv?._rate || 0)
}

function invoiceTotalNgn(inv) {
  const stored = Number(inv.total_ngn) || 0
  return stored > 0 ? stored : ngnOf(inv.total, inv)
}

function ngnLabel(amount) {
  return '₦' + Math.round(Number(amount) || 0).toLocaleString('en-NG')
}

function periodStart(period) {
  const now = new Date()
  if (period === 'ytd')  return new Date(now.getFullYear(), 0, 1)
  if (period === '12m')  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  if (period === '90d')  return new Date(now.getTime() - 90 * 86400000)
  return null
}

export default function Clients() {
  const [clients, setClients]   = useState([])
  const [rawInvoices, setRawInvoices] = useState([])
  const [rates, setRates]       = useState({})
  const [visits, setVisits]     = useState([])
  const [loading, setLoading]   = useState(true)

  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState('name')
  const [selectedId, setSelectedId] = useState(null)

  async function load() {
    const [c, inv, v, r] = await Promise.all([
      fetchAll('clients', {
        select: 'id,name,prefix,company,job_title,email,phone,phone_mobile,phone_work,city,state,country,street,address,notes,tags',
        order: 'name',
      }),
      fetchAll('invoices', {
        select: 'id,invoice_number,client_id,status,currency,exchange_rate,total,total_ngn,amount_paid,balance_due,issue_date,due_date',
        order: 'issue_date', ascending: false,
      }),
      supabase.from('client_visits')
        .select('id,client_id,visit_date,visit_type,notes,staff_name')
        .order('visit_date', { ascending: false })
        .then(r => r.data || []),
      // Last-resort rates for invoices that never recorded one
      supabase.from('exchange_rates').select('currency,rate').eq('base', 'NGN')
        .then(r => Object.fromEntries((r.data || []).map(x => [x.currency, Number(x.rate)]))),
    ])
    setClients(c)
    setRawInvoices(inv)
    setVisits(v)
    setRates(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Resolve each invoice's NGN rate once, up front
  const invoices = useMemo(
    () => rawInvoices.map(inv => ({ ...inv, _rate: rateFor(inv, rates) })),
    [rawInvoices, rates]
  )

  // Per-client rollups — invoices and visits grouped once, then reused
  const byClient = useMemo(() => {
    const map = {}
    const ensure = id => (map[id] = map[id] || { invoices: [], visits: [] })
    invoices.forEach(inv => { if (inv.client_id) ensure(inv.client_id).invoices.push(inv) })
    visits.forEach(v => { if (v.client_id) ensure(v.client_id).visits.push(v) })

    Object.values(map).forEach(entry => {
      const live = entry.invoices.filter(i => LIVE_STATUSES.includes(i.status))
      entry.invoiced    = live.reduce((s, i) => s + invoiceTotalNgn(i), 0)
      entry.collected   = live.reduce((s, i) => s + ngnOf(i.amount_paid, i), 0)
      entry.outstanding = entry.invoices
        .filter(i => OPEN_STATUSES.includes(i.status))
        .reduce((s, i) => s + ngnOf(i.balance_due, i), 0)
      entry.openCount   = entry.invoices.filter(i => OPEN_STATUSES.includes(i.status) && Number(i.balance_due) > 0).length
      entry.paidCount   = entry.invoices.filter(i => i.status === 'paid').length
      entry.draftCount  = entry.invoices.filter(i => i.status === 'draft').length
      entry.lastVisit   = entry.visits[0]?.visit_date || null
      entry.lastInvoice = live[0]?.issue_date || null
      // Foreign-currency invoices with no usable rate — excluded from the naira totals
      entry.unconverted = entry.invoices.filter(i => i.currency !== 'NGN' && !i._rate).length
    })
    return map
  }, [invoices, visits])

  const stats = useMemo(() => {
    const all = Object.values(byClient)
    return {
      clients:     clients.length,
      withBalance: all.filter(e => e.outstanding > 0.5).length,
      outstanding: all.reduce((s, e) => s + e.outstanding, 0),
      collected:   all.reduce((s, e) => s + e.collected, 0),
    }
  }, [byClient, clients])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = clients
    if (q) {
      list = list.filter(c => [c.name, c.company, c.email, c.phone, c.phone_mobile, c.city]
        .some(f => f && String(f).toLowerCase().includes(q)))
    }
    const val = c => byClient[c.id] || {}
    const sorted = [...list]
    switch (sortBy) {
      case 'outstanding': sorted.sort((a, b) => (val(b).outstanding || 0) - (val(a).outstanding || 0)); break
      case 'invoiced':    sorted.sort((a, b) => (val(b).invoiced || 0) - (val(a).invoiced || 0)); break
      case 'recent':      sorted.sort((a, b) => (val(b).lastInvoice || '').localeCompare(val(a).lastInvoice || '')); break
      case 'visit':       sorted.sort((a, b) => (val(b).lastVisit || '').localeCompare(val(a).lastVisit || '')); break
      default:            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return sorted
  }, [clients, search, sortBy, byClient])

  const selected = clients.find(c => c.id === selectedId) || null

  async function refreshVisits() {
    const { data } = await supabase.from('client_visits')
      .select('id,client_id,visit_date,visit_type,notes,staff_name')
      .order('visit_date', { ascending: false })
    setVisits(data || [])
  }

  if (loading) return <div style={{ color:'var(--muted)', fontSize:14 }}>Loading{'…'}</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Clients</div>
        <div className="page-subtitle">
          {stats.clients} clients {'·'} {stats.withBalance} with an outstanding balance {'·'} {ngnLabel(stats.outstanding)} owed
        </div>
      </div>

      {/* Gallery-wide summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px,1fr))', gap:14, marginBottom:24 }}>
        {[
          ['Clients', stats.clients.toLocaleString(), 'var(--ink)'],
          ['Collected', ngnLabel(stats.collected), 'var(--green)'],
          ['Outstanding', ngnLabel(stats.outstanding), stats.outstanding > 0 ? 'var(--amber)' : 'var(--muted)'],
          ['Owing clients', stats.withBalance.toLocaleString(), 'var(--ink)'],
        ].map(([label, value, color]) => (
          <div key={label} className="card" style={{ padding:'16px 18px' }}>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', color, lineHeight:1.1 }}>{value}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selected ? 'minmax(300px, 380px) 1fr' : '1fr', gap:20, alignItems:'start' }}>
        {/* ── List ─────────────────────────────────────────── */}
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            <input className="form-input" style={{ flex:1, minWidth:180 }}
              placeholder="Search name, company, email, phone, city…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width:150 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name">A – Z</option>
              <option value="outstanding">Outstanding ↓</option>
              <option value="invoiced">Total invoiced ↓</option>
              <option value="recent">Recent invoice</option>
              <option value="visit">Recent visit</option>
            </select>
          </div>

          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>{filtered.length} of {clients.length} shown</div>

          <div className="card" style={{ padding:0, maxHeight: selected ? '70vh' : 'none', overflowY:'auto' }}>
            {filtered.map(c => {
              const e = byClient[c.id] || {}
              const active = selectedId === c.id
              return (
                <div key={c.id}
                  onClick={() => setSelectedId(active ? null : c.id)}
                  style={{ padding:'11px 15px', borderBottom:'1px solid var(--line-soft)', cursor:'pointer',
                    background: active ? 'var(--surface-1,#f5f3f0)' : 'transparent',
                    display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:500, fontSize:13 }}>
                      {c.prefix ? <span style={{ color:'var(--muted)', fontSize:12 }}>{c.prefix} </span> : null}
                      {(c.name || '').split(/[\r\n]/)[0]}
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                      {[c.company, c.city].filter(Boolean).join(' · ') || c.email || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {e.outstanding > 0.5
                      ? <div style={{ fontSize:12, color:'var(--amber)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{ngnLabel(e.outstanding)}</div>
                      : <div style={{ fontSize:12, color:'var(--muted)', fontVariantNumeric:'tabular-nums' }}>{e.invoiced ? ngnLabel(e.invoiced) : '—'}</div>}
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                      {(e.invoices?.length || 0)} inv {e.visits?.length ? `· ${e.visits.length} visit${e.visits.length === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No clients match “{search}”</div>
            )}
          </div>
        </div>

        {/* ── Detail ───────────────────────────────────────── */}
        {selected && (
          <ClientDetail
            client={selected}
            entry={byClient[selected.id] || { invoices: [], visits: [] }}
            onClose={() => setSelectedId(null)}
            onVisitAdded={refreshVisits}
          />
        )}
      </div>
    </div>
  )
}


// ── CLIENT DETAIL ─────────────────────────────────────────────
function ClientDetail({ client, entry, onClose, onVisitAdded }) {
  const [period, setPeriod]     = useState('all')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [savingVisit, setSavingVisit]     = useState(false)
  const [visitForm, setVisitForm] = useState({
    visit_date: new Date().toISOString().split('T')[0],
    visit_type: 'in-person', staff_name: '', notes: '',
  })

  useEffect(() => { setPeriod('all'); setFrom(''); setTo(''); setShowVisitForm(false) }, [client.id])

  const live = entry.invoices.filter(i => LIVE_STATUSES.includes(i.status))
  const open = entry.invoices
    .filter(i => OPEN_STATUSES.includes(i.status) && Number(i.balance_due) > 0)
    .sort((a, b) => (a.due_date || a.issue_date || '').localeCompare(b.due_date || b.issue_date || ''))
  const settled = entry.invoices.filter(i => i.status === 'paid')
  const drafts  = entry.invoices.filter(i => i.status === 'draft')

  // Sales figures for the chosen window
  const inPeriod = useMemo(() => {
    if (period === 'all') return live
    if (period === 'custom') {
      if (!from && !to) return live
      return live.filter(i => {
        const d = i.issue_date || ''
        return (!from || d >= from) && (!to || d <= to)
      })
    }
    const start = periodStart(period)
    if (!start) return live
    const iso = start.toISOString().split('T')[0]
    return live.filter(i => (i.issue_date || '') >= iso)
  }, [live, period, from, to])

  const figures = useMemo(() => ({
    invoiced:  inPeriod.reduce((s, i) => s + invoiceTotalNgn(i), 0),
    collected: inPeriod.reduce((s, i) => s + ngnOf(i.amount_paid, i), 0),
    balance:   inPeriod.reduce((s, i) => s + ngnOf(i.balance_due, i), 0),
    count:     inPeriod.length,
  }), [inPeriod])

  // Break the window down — by month when it's a year or less, by year otherwise
  const breakdown = useMemo(() => {
    const monthly = period === 'ytd' || period === '12m' || period === '90d'
    const buckets = {}
    inPeriod.forEach(i => {
      const d = i.issue_date || ''
      if (!d) return
      const key = monthly ? d.slice(0, 7) : d.slice(0, 4)
      buckets[key] = buckets[key] || { key, invoiced: 0, collected: 0, count: 0 }
      buckets[key].invoiced  += invoiceTotalNgn(i)
      buckets[key].collected += ngnOf(i.amount_paid, i)
      buckets[key].count     += 1
    })
    const rows = Object.values(buckets).sort((a, b) => b.key.localeCompare(a.key))
    const peak = Math.max(1, ...rows.map(r => r.invoiced))
    return rows.map(r => ({ ...r, share: r.invoiced / peak }))
  }, [inPeriod, period])

  async function saveVisit() {
    setSavingVisit(true)
    try {
      const { error } = await supabase.from('client_visits').insert({ ...visitForm, client_id: client.id })
      if (error) throw error
      setVisitForm({ visit_date: new Date().toISOString().split('T')[0], visit_type:'in-person', staff_name:'', notes:'' })
      setShowVisitForm(false)
      await onVisitAdded()
    } catch (err) {
      alert('Could not log the visit: ' + err.message)
    } finally { setSavingVisit(false) }
  }

  const contact = [
    ['Email', client.email],
    ['Mobile', client.phone_mobile || client.phone],
    ['Work', client.phone_work],
    ['City', [client.city, client.state].filter(Boolean).join(', ')],
    ['Country', client.country],
    ['Address', client.street || client.address],
  ].filter(([, v]) => v)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, gap:10 }}>
        <div>
          <div style={{ fontWeight:600, fontSize:17 }}>{client.prefix ? `${client.prefix} ` : ''}{client.name}</div>
          {(client.company || client.job_title) && (
            <div style={{ fontSize:13, color:'var(--muted)' }}>
              {[client.company, client.job_title].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
      </div>

      {/* Headline numbers — always lifetime, a balance is a balance */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:12, marginBottom:16 }}>
        {[
          ['Invoiced', ngnLabel(entry.invoiced || 0), 'var(--ink)'],
          ['Collected', ngnLabel(entry.collected || 0), 'var(--green)'],
          ['Outstanding', ngnLabel(entry.outstanding || 0), (entry.outstanding || 0) > 0.5 ? 'var(--amber)' : 'var(--muted)'],
          ['Invoices', `${entry.paidCount || 0} paid · ${entry.openCount || 0} open`, 'var(--ink)'],
          ['Visits', String(entry.visits.length), 'var(--ink)'],
        ].map(([label, value, color]) => (
          <div key={label} className="card" style={{ padding:'13px 15px' }}>
            <div style={{ fontSize:15, color, fontWeight:600, lineHeight:1.2 }}>{value}</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:5, textTransform:'uppercase', letterSpacing:'.07em' }}>{label}</div>
          </div>
        ))}
      </div>

      {contact.length > 0 && (
        <div className="card" style={{ padding:'14px 16px', marginBottom:16, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:12 }}>
          {contact.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:13 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sales figures by period ────────────────────────── */}
      <div className="card" style={{ padding:'16px 18px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, marginBottom:12 }}>
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>Sales figures</div>
          <div style={{ display:'flex', gap:0, border:'1px solid var(--line)', borderRadius:3, overflow:'hidden' }}>
            {PERIODS.map(([key, label]) => (
              <button key={key} onClick={() => setPeriod(key)}
                style={{ padding:'5px 11px', fontSize:11, cursor:'pointer', fontFamily:'inherit', border:'none',
                  borderRight:'1px solid var(--line)', whiteSpace:'nowrap',
                  background: period === key ? 'var(--ink)' : 'var(--white)',
                  color: period === key ? 'var(--white)' : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
            <div>
              <label className="form-label">From</label>
              <input type="date" className="form-input" style={{ width:150 }} value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="form-label">To</label>
              <input type="date" className="form-input" style={{ width:150 }} value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', gap:12, marginBottom: breakdown.length ? 16 : 0 }}>
          {[
            ['Invoiced', ngnLabel(figures.invoiced), 'var(--ink)'],
            ['Collected', ngnLabel(figures.collected), 'var(--green)'],
            ['Still due', ngnLabel(figures.balance), figures.balance > 0.5 ? 'var(--amber)' : 'var(--muted)'],
            ['Invoices', String(figures.count), 'var(--ink)'],
          ].map(([label, value, color]) => (
            <div key={label}>
              <div style={{ fontSize:16, fontWeight:600, color, fontVariantNumeric:'tabular-nums' }}>{value}</div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3, textTransform:'uppercase', letterSpacing:'.07em' }}>{label}</div>
            </div>
          ))}
        </div>

        {breakdown.length > 0 && (
          <div style={{ borderTop:'1px solid var(--line-soft)', paddingTop:12 }}>
            {breakdown.map(row => (
              <div key={row.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0' }}>
                <div style={{ width:64, fontSize:11, color:'var(--muted)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{row.key}</div>
                <div style={{ flex:1, height:6, background:'var(--surface-1,#f2efe9)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${Math.max(2, row.share * 100)}%`, height:'100%', background:'var(--ink)', opacity:.7 }} />
                </div>
                <div style={{ width:110, textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{ngnLabel(row.invoiced)}</div>
                <div style={{ width:34, textAlign:'right', fontSize:11, color:'var(--muted)' }}>{row.count}</div>
              </div>
            ))}
          </div>
        )}

        {figures.count === 0 && (
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>No invoices in this period.</div>
        )}
        {entry.unconverted > 0 && (
          <div style={{ fontSize:11, color:'var(--amber)', marginTop:10 }}>
            {entry.unconverted} foreign-currency invoice{entry.unconverted === 1 ? '' : 's'} has no exchange rate on record and is left out of these naira totals.
          </div>
        )}
      </div>

      {/* ── Outstanding invoices ───────────────────────────── */}
      <InvoiceTable
        title={`Outstanding invoices (${open.length})`}
        invoices={open}
        empty="Nothing outstanding — this client is fully settled."
        highlightBalance
        footer={open.length > 0 ? `Balance ${ngnLabel(entry.outstanding || 0)}` : null}
      />

      {/* ── Paid invoices ──────────────────────────────────── */}
      <InvoiceTable
        title={`Paid invoices (${settled.length})`}
        invoices={settled}
        empty="No settled invoices yet."
      />

      {drafts.length > 0 && (
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>
          {drafts.length} draft invoice{drafts.length === 1 ? '' : 's'} not counted in the figures above.
        </div>
      )}

      {/* ── Visits ─────────────────────────────────────────── */}
      <div className="card" style={{ padding:'16px 18px', marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>
            Visits ({entry.visits.length}){entry.lastVisit ? ` · last ${entry.lastVisit}` : ''}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowVisitForm(s => !s)}>
            {showVisitForm ? 'Cancel' : '+ Log visit'}
          </button>
        </div>

        {showVisitForm && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12, padding:'12px 14px', background:'var(--surface-1,#f8f7f5)', borderRadius:3 }}>
            <div className="form-row">
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={visitForm.visit_date}
                  onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={visitForm.visit_type}
                  onChange={e => setVisitForm(f => ({ ...f, visit_type: e.target.value }))}>
                  {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Staff</label>
              <input className="form-input" value={visitForm.staff_name}
                onChange={e => setVisitForm(f => ({ ...f, staff_name: e.target.value }))} placeholder="Who received them" />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Notes</label>
              <textarea className="form-textarea" rows={2} value={visitForm.notes}
                onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <button className="btn btn-primary btn-sm" onClick={saveVisit} disabled={savingVisit}>
                {savingVisit ? 'Saving…' : 'Save visit'}
              </button>
            </div>
          </div>
        )}

        {entry.visits.length === 0 && !showVisitForm && (
          <div style={{ fontSize:12, color:'var(--muted)' }}>No visits recorded.</div>
        )}
        {entry.visits.map(v => (
          <div key={v.id} style={{ padding:'8px 0', borderBottom:'1px solid var(--line-soft)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <div style={{ fontSize:13, fontWeight:500 }}>{v.visit_type || 'visit'}</div>
              <div style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{v.visit_date}</div>
            </div>
            {v.staff_name && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Seen by {v.staff_name}</div>}
            {v.notes && <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>{v.notes}</div>}
          </div>
        ))}
      </div>

      {client.notes && (
        <div className="card" style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:4 }}>Notes</div>
          <div style={{ fontSize:13, whiteSpace:'pre-wrap' }}>{client.notes}</div>
        </div>
      )}
    </div>
  )
}


function InvoiceTable({ title, invoices, empty, highlightBalance = false, footer = null }) {
  return (
    <div className="card" style={{ padding:0, marginBottom:16 }}>
      <div style={{ padding:'14px 18px', borderBottom: invoices.length ? '1px solid var(--line)' : 'none',
        display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>{title}</div>
        {footer && <div style={{ fontSize:12, color:'var(--amber)', fontWeight:600 }}>{footer}</div>}
      </div>
      {invoices.length === 0
        ? <div style={{ padding:'14px 18px', fontSize:12, color:'var(--muted)' }}>{empty}</div>
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th><th>Issued</th><th>Due</th>
                  <th style={{ textAlign:'right' }}>Total</th>
                  <th style={{ textAlign:'right' }}>Paid</th>
                  <th style={{ textAlign:'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const overdue = highlightBalance && inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontSize:12, fontWeight:500 }}>
                        {inv.invoice_number}
                        {inv.currency !== 'NGN' && (
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{'≈'} {ngnLabel(invoiceTotalNgn(inv))}</div>
                        )}
                      </td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{inv.issue_date || '—'}</td>
                      <td style={{ fontSize:12, color: overdue ? 'var(--red,#c0392b)' : 'var(--muted)' }}>
                        {inv.due_date || '—'}{overdue ? ' · overdue' : ''}
                      </td>
                      <td style={{ fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{formatAmount(inv.total || 0, inv.currency)}</td>
                      <td style={{ fontSize:12, textAlign:'right', color:'var(--green)', fontVariantNumeric:'tabular-nums' }}>{formatAmount(inv.amount_paid || 0, inv.currency)}</td>
                      <td style={{ fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums',
                        color: Number(inv.balance_due) > 0 ? 'var(--amber)' : 'var(--muted)',
                        fontWeight: Number(inv.balance_due) > 0 ? 600 : 400 }}>
                        {Number(inv.balance_due) > 0 ? formatAmount(inv.balance_due, inv.currency) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
