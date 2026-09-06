import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { CURRENCY_MAP, formatAmount } from '../lib/currencies'
import ClientModal from '../components/ClientModal'

// Invoices that count against a client's account. Drafts aren't owed yet and
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

// Totals are kept per currency — a client invoiced in both naira and dollars
// has two separate accounts, not one blended figure.
function sumByCurrency(invoices) {
  const out = {}
  invoices.forEach(i => {
    const cur = i.currency || 'NGN'
    const e = out[cur] = out[cur] || { currency: cur, invoiced: 0, collected: 0, outstanding: 0, count: 0, paid: 0, open: 0 }
    if (LIVE_STATUSES.includes(i.status)) {
      e.invoiced  += Number(i.total) || 0
      e.collected += Number(i.amount_paid) || 0
      e.count     += 1
      if (i.status === 'paid') e.paid += 1
    }
    if (OPEN_STATUSES.includes(i.status)) {
      e.outstanding += Number(i.balance_due) || 0
      if (Number(i.balance_due) > 0) e.open += 1
    }
  })
  return Object.values(out).sort((a, b) => b.invoiced - a.invoiced)
}

function mergeTotals(target, rows) {
  rows.forEach(r => {
    const e = target[r.currency] = target[r.currency] || { currency: r.currency, invoiced: 0, collected: 0, outstanding: 0, count: 0 }
    e.invoiced    += r.invoiced
    e.collected   += r.collected
    e.outstanding += r.outstanding
    e.count       += r.count
  })
  return target
}

// Only used to put the list in order — the figures on screen are never blended.
// Most foreign-currency invoices never recorded an exchange_rate, so fall back
// to the rate implied by total_ngn, then to the cached NGN rates.
function rateFor(inv, rates) {
  if (!inv || inv.currency === 'NGN') return 1
  const stored = Number(inv.exchange_rate)
  if (stored > 0) return stored
  const total = Number(inv.total), totalNgn = Number(inv.total_ngn)
  if (total > 0 && totalNgn > 0) return totalNgn / total
  return Number(rates?.[inv.currency]) || 0
}

function money(amount, currency = 'NGN') {
  const sym = (CURRENCY_MAP[currency] || {}).symbol || (currency + ' ')
  return sym + Math.round(Number(amount) || 0).toLocaleString('en-NG')
}

function periodStart(period) {
  const now = new Date()
  if (period === 'ytd')  return new Date(now.getFullYear(), 0, 1)
  if (period === '12m')  return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  if (period === '90d')  return new Date(now.getTime() - 90 * 86400000)
  return null
}

export default function Clients() {
  const [clients, setClients]         = useState([])
  const [rawInvoices, setRawInvoices] = useState([])
  const [rates, setRates]             = useState({})
  const [visits, setVisits]           = useState([])
  const [loading, setLoading]         = useState(true)

  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState('name')
  const [selectedId, setSelectedId] = useState(null)
  const [modalClient, setModalClient] = useState(null)   // null | 'new' | client row

  const CLIENT_COLUMNS = 'id,name,prefix,company,job_title,email,phone,phone_mobile,phone_work,city,state,country,street,address,suburb,postcode,notes,tags'

  async function load() {
    const [c, inv, v, r] = await Promise.all([
      fetchAll('clients', { select: CLIENT_COLUMNS, order: 'name' }),
      fetchAll('invoices', {
        select: 'id,invoice_number,client_id,status,currency,exchange_rate,total,total_ngn,amount_paid,balance_due,issue_date,due_date',
        order: 'issue_date', ascending: false,
      }),
      supabase.from('client_visits')
        .select('id,client_id,visit_date,visit_type,notes,staff_name')
        .order('visit_date', { ascending: false })
        .then(r => r.data || []),
      // Last-resort rates, for ordering invoices that never recorded one
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

  async function refreshClients() {
    const c = await fetchAll('clients', { select: CLIENT_COLUMNS, order: 'name', cache: false })
    setClients(c)
  }

  async function refreshVisits() {
    const { data } = await supabase.from('client_visits')
      .select('id,client_id,visit_date,visit_type,notes,staff_name')
      .order('visit_date', { ascending: false })
    setVisits(data || [])
  }

  async function deleteClient(client) {
    if (!confirm(`Delete ${client.name}? This cannot be undone.`)) return
    const { error } = await supabase.from('clients').delete().eq('id', client.id)
    if (error) return alert('Cannot delete: ' + error.message)
    setSelectedId(null)
    await refreshClients()
  }

  // Rate is only needed for sorting, but resolve it once here
  const invoices = useMemo(
    () => rawInvoices.map(inv => ({ ...inv, _rate: rateFor(inv, rates) })),
    [rawInvoices, rates]
  )

  const byClient = useMemo(() => {
    const map = {}
    const ensure = id => (map[id] = map[id] || { invoices: [], visits: [] })
    invoices.forEach(inv => { if (inv.client_id) ensure(inv.client_id).invoices.push(inv) })
    visits.forEach(v => { if (v.client_id) ensure(v.client_id).visits.push(v) })

    Object.values(map).forEach(entry => {
      entry.totals      = sumByCurrency(entry.invoices)
      entry.owing       = entry.totals.filter(t => t.outstanding > 0.5)
      entry.paidCount   = entry.invoices.filter(i => i.status === 'paid').length
      entry.openCount   = entry.invoices.filter(i => OPEN_STATUSES.includes(i.status) && Number(i.balance_due) > 0).length
      entry.draftCount  = entry.invoices.filter(i => i.status === 'draft').length
      entry.lastVisit   = entry.visits[0]?.visit_date || null
      entry.lastInvoice = entry.invoices.filter(i => LIVE_STATUSES.includes(i.status))[0]?.issue_date || null
      // Ordering only
      entry.rankOutstanding = entry.invoices
        .filter(i => OPEN_STATUSES.includes(i.status))
        .reduce((s, i) => s + (Number(i.balance_due) || 0) * (i._rate || 0), 0)
      entry.rankInvoiced = entry.invoices
        .filter(i => LIVE_STATUSES.includes(i.status))
        .reduce((s, i) => s + (Number(i.total_ngn) || (Number(i.total) || 0) * (i._rate || 0)), 0)
    })
    return map
  }, [invoices, visits])

  const houseTotals = useMemo(() => {
    const merged = {}
    Object.values(byClient).forEach(e => mergeTotals(merged, e.totals || []))
    return Object.values(merged).sort((a, b) => b.invoiced - a.invoiced)
  }, [byClient])

  const owingCount = useMemo(
    () => Object.values(byClient).filter(e => (e.owing || []).length > 0).length,
    [byClient]
  )

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
      case 'outstanding': sorted.sort((a, b) => (val(b).rankOutstanding || 0) - (val(a).rankOutstanding || 0)); break
      case 'invoiced':    sorted.sort((a, b) => (val(b).rankInvoiced || 0) - (val(a).rankInvoiced || 0)); break
      case 'recent':      sorted.sort((a, b) => (val(b).lastInvoice || '').localeCompare(val(a).lastInvoice || '')); break
      case 'visit':       sorted.sort((a, b) => (val(b).lastVisit || '').localeCompare(val(a).lastVisit || '')); break
      default:            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    }
    return sorted
  }, [clients, search, sortBy, byClient])

  const selected = clients.find(c => c.id === selectedId) || null

  if (loading) return <div style={{ color:'var(--muted)', fontSize:14 }}>Loading{'…'}</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Clients</div>
          <div className="page-subtitle">
            {clients.length} clients {'·'} {owingCount} with an outstanding balance
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setModalClient('new')}>+ Add client</button>
      </div>

      {/* Gallery-wide totals, one column per currency */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px,1fr))', gap:14, marginBottom:24 }}>
        <div className="card" style={{ padding:'16px 18px' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', lineHeight:1.1 }}>{clients.length.toLocaleString()}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Clients</div>
        </div>
        {[['Collected', 'collected', 'var(--green)'], ['Outstanding', 'outstanding', 'var(--amber)']].map(([label, key, color]) => (
          <div key={key} className="card" style={{ padding:'16px 18px' }}>
            {houseTotals.filter(t => t[key] > 0.5).map(t => (
              <div key={t.currency} style={{ fontFamily:'var(--font-serif)', fontSize:'1.35rem', color, lineHeight:1.25 }}>
                {money(t[key], t.currency)}
              </div>
            ))}
            {houseTotals.every(t => t[key] <= 0.5) && (
              <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', color:'var(--muted)', lineHeight:1.1 }}>—</div>
            )}
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
          </div>
        ))}
        <div className="card" style={{ padding:'16px 18px' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', lineHeight:1.1 }}>{owingCount.toLocaleString()}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:6, textTransform:'uppercase', letterSpacing:'.06em' }}>Owing clients</div>
        </div>
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
              const owing = e.owing || []
              const totals = e.totals || []
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
                    {owing.length > 0
                      ? owing.map(t => (
                          <div key={t.currency} style={{ fontSize:12, color:'var(--amber)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
                            {money(t.outstanding, t.currency)}
                          </div>
                        ))
                      : totals.length > 0
                        ? totals.filter(t => t.invoiced > 0).map(t => (
                            <div key={t.currency} style={{ fontSize:12, color:'var(--muted)', fontVariantNumeric:'tabular-nums' }}>
                              {money(t.invoiced, t.currency)}
                            </div>
                          ))
                        : <div style={{ fontSize:12, color:'var(--muted)' }}>—</div>}
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
            entry={byClient[selected.id] || { invoices: [], visits: [], totals: [] }}
            onClose={() => setSelectedId(null)}
            onEdit={() => setModalClient(selected)}
            onDelete={() => deleteClient(selected)}
            onVisitAdded={refreshVisits}
          />
        )}
      </div>

      {modalClient && (
        <ClientModal
          existingClients={clients}
          editClient={modalClient === 'new' ? null : modalClient}
          onClose={() => setModalClient(null)}
          onSave={refreshClients}
        />
      )}
    </div>
  )
}


// ── CLIENT DETAIL ─────────────────────────────────────────────
function ClientDetail({ client, entry, onClose, onEdit, onDelete, onVisitAdded }) {
  const [period, setPeriod] = useState('all')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
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

  const periodTotals = useMemo(() => sumByCurrency(inPeriod), [inPeriod])

  // Break the window down — by month when it's a year or less, by year otherwise,
  // and keep each currency on its own scale
  const breakdown = useMemo(() => {
    const monthly = period === 'ytd' || period === '12m' || period === '90d'
    const perCurrency = {}
    inPeriod.forEach(i => {
      const d = i.issue_date || ''
      if (!d || !LIVE_STATUSES.includes(i.status)) return
      const cur = i.currency || 'NGN'
      const key = monthly ? d.slice(0, 7) : d.slice(0, 4)
      const bucket = perCurrency[cur] = perCurrency[cur] || {}
      bucket[key] = bucket[key] || { key, invoiced: 0, count: 0 }
      bucket[key].invoiced += Number(i.total) || 0
      bucket[key].count    += 1
    })
    return Object.entries(perCurrency).map(([currency, buckets]) => {
      const rows = Object.values(buckets).sort((a, b) => b.key.localeCompare(a.key))
      const peak = Math.max(1, ...rows.map(r => r.invoiced))
      return { currency, rows: rows.map(r => ({ ...r, share: r.invoiced / peak })) }
    })
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
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <button className="btn btn-outline btn-sm" onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red,#c0392b)' }} onClick={onDelete}>Delete</button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
        </div>
      </div>

      {/* Account — one line per currency the client has been invoiced in */}
      <CurrencyTotals
        title="Account (all time)"
        totals={entry.totals || []}
        note={`${entry.paidCount || 0} paid · ${entry.openCount || 0} open · ${entry.visits.length} visit${entry.visits.length === 1 ? '' : 's'}`}
        empty="No invoices raised for this client yet."
      />

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

        {periodTotals.length === 0
          ? <div style={{ fontSize:12, color:'var(--muted)' }}>No invoices in this period.</div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th style={{ textAlign:'right' }}>Invoiced</th>
                    <th style={{ textAlign:'right' }}>Collected</th>
                    <th style={{ textAlign:'right' }}>Still due</th>
                    <th style={{ textAlign:'right' }}>Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {periodTotals.map(t => (
                    <tr key={t.currency}>
                      <td style={{ fontSize:12, fontWeight:600 }}>{t.currency}</td>
                      <td style={{ fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{money(t.invoiced, t.currency)}</td>
                      <td style={{ fontSize:12, textAlign:'right', color:'var(--green)', fontVariantNumeric:'tabular-nums' }}>{money(t.collected, t.currency)}</td>
                      <td style={{ fontSize:12, textAlign:'right', fontVariantNumeric:'tabular-nums',
                        color: t.outstanding > 0.5 ? 'var(--amber)' : 'var(--muted)', fontWeight: t.outstanding > 0.5 ? 600 : 400 }}>
                        {t.outstanding > 0.5 ? money(t.outstanding, t.currency) : '—'}
                      </td>
                      <td style={{ fontSize:12, textAlign:'right', color:'var(--muted)' }}>{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        {breakdown.map(group => (
          <div key={group.currency} style={{ borderTop:'1px solid var(--line-soft)', marginTop:12, paddingTop:10 }}>
            {breakdown.length > 1 && (
              <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:6 }}>{group.currency}</div>
            )}
            {group.rows.map(row => (
              <div key={row.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 0' }}>
                <div style={{ width:64, fontSize:11, color:'var(--muted)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{row.key}</div>
                <div style={{ flex:1, height:6, background:'var(--surface-1,#f2efe9)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${Math.max(2, row.share * 100)}%`, height:'100%', background:'var(--ink)', opacity:.7 }} />
                </div>
                <div style={{ width:110, textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{money(row.invoiced, group.currency)}</div>
                <div style={{ width:34, textAlign:'right', fontSize:11, color:'var(--muted)' }}>{row.count}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <InvoiceTable
        title={`Outstanding invoices (${open.length})`}
        invoices={open}
        empty="Nothing outstanding — this client is fully settled."
        highlightOverdue
        footer={(entry.owing || []).map(t => money(t.outstanding, t.currency)).join(' · ')}
      />

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


function CurrencyTotals({ title, totals, note, empty }) {
  return (
    <div className="card" style={{ padding:'16px 18px', marginBottom:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom: totals.length ? 12 : 0 }}>
        <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)' }}>{title}</div>
        {note && <div style={{ fontSize:11, color:'var(--muted)' }}>{note}</div>}
      </div>
      {totals.length === 0
        ? <div style={{ fontSize:12, color:'var(--muted)' }}>{empty}</div>
        : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {totals.map(t => (
              <div key={t.currency}>
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', color:'var(--muted)', marginBottom:5 }}>
                  {t.currency} {'·'} {t.count} invoice{t.count === 1 ? '' : 's'}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px,1fr))', gap:12 }}>
                  {[
                    ['Invoiced', money(t.invoiced, t.currency), 'var(--ink)'],
                    ['Collected', money(t.collected, t.currency), 'var(--green)'],
                    ['Outstanding', t.outstanding > 0.5 ? money(t.outstanding, t.currency) : '—',
                      t.outstanding > 0.5 ? 'var(--amber)' : 'var(--muted)'],
                  ].map(([label, value, color]) => (
                    <div key={label}>
                      <div style={{ fontSize:16, fontWeight:600, color, fontVariantNumeric:'tabular-nums' }}>{value}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:3, textTransform:'uppercase', letterSpacing:'.07em' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}


function InvoiceTable({ title, invoices, empty, highlightOverdue = false, footer = null }) {
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
                  const overdue = highlightOverdue && inv.due_date && inv.due_date < new Date().toISOString().split('T')[0]
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontSize:12, fontWeight:500 }}>
                        {inv.invoice_number}
                        {inv.currency !== 'NGN' && (
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{inv.currency}</div>
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
