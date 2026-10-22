import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { fetchLiveRates } from '../lib/currencies'
import { auditLog } from '../lib/audit'
import {
  formatMoney, listingUrl, orderUrl, whatsappLink, errorText,
  ORDER_STATUS, LISTING_STATUS, dimensionsText,
} from '../lib/shop'

const TABS = ['Requests', 'Listings', 'Questions', 'Settings']

// Tell the sidebar badge to recount.
const changed = () => window.dispatchEvent(new Event('shop:changed'))

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

/**
 * Online Shop — the separate sales channel. Listings, buy requests,
 * payments and questions all live in shop_* tables; the only thing here that
 * writes to HG Cat is "Post to HG Cat" on a paid order.
 */
export default function Shop() {
  const [tab, setTab] = useState('Requests')
  const [counts, setCounts] = useState({})

  const loadCounts = useCallback(async () => {
    const [req, rec, paid, q] = await Promise.all([
      supabase.from('shop_orders').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
      supabase.from('shop_payments').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('shop_orders').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      supabase.from('shop_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ])
    setCounts({ Requests: (req.count || 0) + (rec.count || 0) + (paid.count || 0), Questions: q.count || 0 })
  }, [])

  useEffect(() => {
    loadCounts()
    window.addEventListener('shop:changed', loadCounts)
    return () => window.removeEventListener('shop:changed', loadCounts)
  }, [loadCounts])

  return (
    <div>
      <div className="page-header">
        <div className="page-subtitle">
          Online listings, buy requests and payments. Nothing here touches HG Cat until you post a paid order.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '9px 20px', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', whiteSpace: 'nowrap',
                     borderBottom: tab === t ? '2px solid var(--ink)' : '2px solid transparent',
                     color: tab === t ? 'var(--ink)' : 'var(--muted)', fontFamily: 'var(--font-sans)' }}>
            {t}
            {counts[t] > 0 && <span className="badge badge-amber" style={{ marginLeft: 6 }}>{counts[t]}</span>}
          </button>
        ))}
      </div>
      {tab === 'Requests' && <Requests />}
      {tab === 'Listings' && <Listings />}
      {tab === 'Questions' && <Questions />}
      {tab === 'Settings' && <ShopSettings />}
    </div>
  )
}

// ── REQUESTS ─────────────────────────────────────────────────────────

const ORDER_FILTERS = [
  ['action', 'Needs action'],
  ['approved', 'Awaiting payment'],
  ['posted', 'Posted'],
  ['closed', 'Declined / expired'],
  ['all', 'All'],
]

function needsAction(o) {
  return o.status === 'requested' || o.status === 'paid' ||
    (o.status === 'approved' && o.shop_payments.some(p => p.status === 'pending_review'))
}

function Requests() {
  const [orders, setOrders] = useState(null)
  const [filter, setFilter] = useState('action')
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('shop_orders').select('*, shop_payments(*)')
      .order('created_at', { ascending: false }).limit(500)
    if (error) { alert(errorText(error)); return }
    setOrders(data)
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (orders || []).filter(o => {
    if (filter === 'action') return needsAction(o)
    if (filter === 'approved') return o.status === 'approved'
    if (filter === 'posted') return o.status === 'posted'
    if (filter === 'closed') return o.status === 'declined' || o.status === 'expired'
    return true
  }), [orders, filter])

  const open = orders?.find(o => o.id === openId)

  if (!orders) return <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {ORDER_FILTERS.map(([k, label]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {filter === 'action' ? 'Nothing waiting on you.' : 'No orders here.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order</th><th>Artwork</th><th>Buyer</th><th>Amount</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>
              {shown.map(o => {
                const receipt = o.shop_payments.some(p => p.status === 'pending_review')
                return (
                  <tr key={o.id} onClick={() => setOpenId(o.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{o.ref}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {o.image_url && <img src={o.image_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 2 }} />}
                        <div><div>{o.title}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.artist_name}</div></div>
                      </div>
                    </td>
                    <td><div>{o.buyer_name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.buyer_email}</div></td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(o.amount, o.currency)}</td>
                    <td>
                      <span className={`badge ${ORDER_STATUS[o.status]?.badge}`}>{ORDER_STATUS[o.status]?.label}</span>
                      {receipt && <div><span className="badge badge-amber" style={{ marginTop: 4 }}>Receipt to check</span></div>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(o.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <OrderModal order={open} onClose={() => setOpenId(null)} onChanged={() => { load(); changed() }} />}
    </div>
  )
}

function OrderModal({ order: o, onClose, onChanged }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [receiptUrls, setReceiptUrls] = useState({})
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    const paths = o.shop_payments.filter(p => p.receipt_path).map(p => p.receipt_path)
    if (paths.length === 0) return
    supabase.storage.from('shop-receipts').createSignedUrls(paths, 3600).then(({ data }) => {
      setReceiptUrls(Object.fromEntries((data || []).map(d => [d.path, d.signedUrl])))
    })
  }, [o.shop_payments])

  async function run(fn, args, label) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { alert(errorText(error)); return false }
    auditLog(`shop.${label}`, { entityType: 'shop_order', entityId: o.id, entityLabel: o.ref, metadata: { artwork: o.title, buyer: o.buyer_email } })
    onChanged()
    return true
  }

  const approve = () => confirm(`Approve ${o.ref} and hold "${o.title}" for ${o.buyer_name}? They'll be emailed payment options.`)
    && run('shop_approve_order', { p_order_id: o.id }, 'order_approved')
  const decline = () => {
    const reason = prompt('Reason to give the buyer (optional):', '')
    if (reason === null) return
    run('shop_decline_order', { p_order_id: o.id, p_reason: reason }, 'order_declined')
  }
  const extend = () => {
    const h = prompt('Extend the hold by how many hours?', '24')
    if (!h || !(Number(h) > 0)) return
    run('shop_extend_hold', { p_order_id: o.id, p_hours: Math.round(Number(h)) }, 'hold_extended')
  }
  const confirmTransfer = (p) => {
    const amt = prompt(`Amount received in the account (${o.currency}):`, String(p.amount ?? o.amount))
    if (amt === null) return
    run('shop_confirm_transfer', { p_payment_id: p.id, p_amount: Number(amt) || null }, 'transfer_confirmed')
  }
  const rejectTransfer = (p) => {
    const reason = prompt('Why is the receipt being rejected? (sent to the buyer)', 'We could not find this transfer in our account.')
    if (reason === null) return
    run('shop_reject_transfer', { p_payment_id: p.id, p_reason: reason }, 'transfer_rejected')
  }

  const payments = o.shop_payments.filter(p => p.status !== 'initiated').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const expired = o.status === 'approved' && o.hold_expires_at && new Date(o.hold_expires_at) < new Date()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} role="dialog" aria-label={`Order ${o.ref}`}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{o.ref}</div>
            <span className={`badge ${ORDER_STATUS[o.status]?.badge}`}>{ORDER_STATUS[o.status]?.label}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">{'✕'}</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {o.image_url && <img src={o.image_url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 2 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{o.title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[o.artist_name, o.year, o.medium, o.dimensions].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{formatMoney(o.amount, o.currency)}</div>
          </div>

          <div className="grid-2" style={{ gap: 14, fontSize: 13 }}>
            <div>
              <div className="form-label">Buyer</div>
              <div>{o.buyer_name}</div>
              <div><a href={`mailto:${o.buyer_email}?subject=${encodeURIComponent(`${o.title} — ${o.ref}`)}`} style={{ textDecoration: 'underline' }}>{o.buyer_email}</a></div>
              {o.buyer_phone && <div><a href={whatsappLink(o.buyer_phone, `Hello ${o.buyer_name}, this is Hourglass Gallery about ${o.title} (${o.ref}).`)} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{o.buyer_phone}</a> (WhatsApp)</div>}
              {o.message && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--ink-soft)' }}>"{o.message}"</div>}
            </div>
            <div>
              <div className="form-label">Timeline</div>
              <div>Requested {fmt(o.created_at)}</div>
              {o.approved_at && <div>Approved {fmt(o.approved_at)}</div>}
              {o.status === 'approved' && o.hold_expires_at && <div style={{ color: expired ? 'var(--red)' : 'var(--amber)' }}>Hold {expired ? 'ended' : 'until'} {fmt(o.hold_expires_at)}</div>}
              {o.paid_at && <div>Paid {fmt(o.paid_at)} {o.payment_method && `by ${o.payment_method}`}</div>}
              {o.posted_at && <div>Posted {fmt(o.posted_at)}</div>}
              {o.decline_reason && <div style={{ color: 'var(--red)' }}>Declined: {o.decline_reason}</div>}
              <div style={{ marginTop: 6 }}>
                <a href={orderUrl(o.access_token)} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: 'underline', color: 'var(--muted)' }}>Buyer's order page {'↗'}</a>
              </div>
            </div>
          </div>

          {payments.length > 0 && (
            <div>
              <div className="form-label" style={{ marginBottom: 8 }}>Payments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {payments.map(p => (
                  <div key={p.id} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {p.receipt_path && receiptUrls[p.receipt_path] && (
                      /\.pdf$/i.test(p.receipt_path)
                        ? <a href={receiptUrls[p.receipt_path]} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open PDF receipt</a>
                        : <a href={receiptUrls[p.receipt_path]} target="_blank" rel="noreferrer"><img src={receiptUrls[p.receipt_path]} alt="Transfer receipt" style={{ width: 120, maxHeight: 160, objectFit: 'contain', background: 'var(--parchment-2)', borderRadius: 2 }} /></a>
                    )}
                    <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                      <div style={{ fontWeight: 500 }}>
                        {p.method === 'card' ? 'Card (Paystack)' : 'Bank transfer'} {'·'} {p.amount != null ? formatMoney(p.amount, p.currency) : 'amount not stated'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {[p.bank_name, p.transfer_date && `sent ${p.transfer_date}`, p.reference && `ref ${p.reference}`].filter(Boolean).join(' · ')}
                      </div>
                      {p.note && <div style={{ fontSize: 12 }}>{p.note}</div>}
                      {p.reject_reason && <div style={{ fontSize: 12, color: 'var(--red)' }}>Rejected: {p.reject_reason}</div>}
                      <div style={{ marginTop: 4 }}>
                        <span className={`badge ${{ success: 'badge-green', confirmed: 'badge-green', pending_review: 'badge-amber', failed: 'badge-red', rejected: 'badge-red' }[p.status] || 'badge-gray'}`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {p.status === 'pending_review' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => confirmTransfer(p)}>Confirm received</button>
                        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => rejectTransfer(p)}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {o.status === 'posted' && o.invoice_id && (
            <div style={{ fontSize: 13 }}>
              Posted to HG Cat as an invoice. <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin/sales')}>Open Sales</button>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          {o.status === 'requested' && <>
            <button className="btn btn-outline" disabled={busy} onClick={decline}>Decline</button>
            <button className="btn btn-primary" disabled={busy} onClick={approve}>Approve &amp; hold</button>
          </>}
          {o.status === 'approved' && <>
            <button className="btn btn-outline" disabled={busy} onClick={decline}>Cancel &amp; release</button>
            <button className="btn btn-outline" disabled={busy} onClick={extend}>Extend hold</button>
          </>}
          {o.status === 'expired' && <button className="btn btn-outline" disabled={busy} onClick={decline}>Close</button>}
          {o.status === 'paid' && <button className="btn btn-gold" disabled={busy} onClick={() => setPosting(true)}>Post to HG Cat</button>}
        </div>
      </div>
      {posting && <PostModal order={o} onClose={() => setPosting(false)} onPosted={() => { setPosting(false); onChanged() }} />}
    </div>
  )
}

function PostModal({ order: o, onClose, onPosted }) {
  const [rate, setRate] = useState(o.currency === 'NGN' ? '1' : '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (o.currency === 'NGN') return
    fetchLiveRates().then(r => { if (r?.[o.currency]) setRate(String(Math.round(r[o.currency] * 100) / 100)) })
  }, [o.currency])

  async function post() {
    if (!(Number(rate) > 0)) { alert('Enter the exchange rate to NGN'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('shop_post_to_hgcat', { p_order_id: o.id, p_exchange_rate: Number(rate) })
    if (error) { setBusy(false); alert(errorText(error)); return }
    const { data: inv } = await supabase.from('invoices').select('invoice_number').eq('id', data).single()
    setBusy(false)
    setResult(inv?.invoice_number || 'created')
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()} role="dialog" aria-label="Post to HG Cat">
        <div className="modal-header"><div className="modal-title">Post to HG Cat</div></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
          {result ? (
            <div>Invoice <strong>{result}</strong> created and paid. {o.title} is now Sold in HG Cat.</div>
          ) : <>
            <div>This creates, in HG Cat:</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>the client {o.buyer_name} (matched by email, or new)</li>
              <li>an invoice for {formatMoney(o.amount, o.currency)}, with the payment recorded</li>
              <li>{o.title} marked <strong>Sold</strong></li>
            </ul>
            {o.currency !== 'NGN' && (
              <div className="form-group">
                <label className="form-label">1 {o.currency} = ? NGN</label>
                <input className="form-input" type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} />
              </div>
            )}
          </>}
        </div>
        <div className="modal-footer">
          {result
            ? <button className="btn btn-primary" onClick={onPosted}>Done</button>
            : <>
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-gold" disabled={busy} onClick={post}>{busy ? 'Posting…' : 'Post invoice'}</button>
            </>}
        </div>
      </div>
    </div>
  )
}

// ── LISTINGS ─────────────────────────────────────────────────────────

function Listings() {
  const [listings, setListings] = useState(null)
  const [showClosed, setShowClosed] = useState(false)
  const [editing, setEditing] = useState(null) // listing or 'new'
  const [qrFor, setQrFor] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('shop_listings')
      .select('*, artworks(id, title, year, medium, dimensions, dimension_unit, thumbnail_url, image_url, availability, hg_code, artists(name))')
      .order('created_at', { ascending: false })
    if (error) { alert(errorText(error)); return }
    setListings(data)
  }, [])
  useEffect(() => { load() }, [load])

  async function setStatus(l, status) {
    const verb = status === 'withdrawn' ? 'Take this work offline' : 'Put this work back online'
    if (!confirm(`${verb}?`)) return
    const { error } = await supabase.from('shop_listings').update({ status, updated_at: new Date().toISOString() }).eq('id', l.id)
    if (error) { alert(errorText(error)); return }
    auditLog(`shop.listing_${status}`, { entityType: 'shop_listing', entityId: l.id, entityLabel: l.artworks?.title })
    load()
  }

  if (!listings) return <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div>
  const shown = listings.filter(l => showClosed || l.status === 'live' || l.status === 'on_hold')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Show sold and withdrawn
        </label>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Online listing</button>
      </div>
      {shown.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          No works online yet. Create a listing for a work on the wall to get its QR code.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Artwork</th><th>NGN</th><th>USD</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shown.map(l => {
                const a = l.artworks || {}
                const drift = a.availability && a.availability !== 'Available' && (l.status === 'live' || l.status === 'on_hold')
                return (
                  <tr key={l.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {(a.thumbnail_url || a.image_url) && <img src={a.thumbnail_url || a.image_url} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 2 }} />}
                        <div>
                          <div>{a.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.artists?.name}{a.hg_code ? ` · ${a.hg_code}` : ''}</div>
                          {drift && <div style={{ fontSize: 11, color: 'var(--red)' }}>HG Cat says {a.availability} — take offline?</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.price_ngn ? formatMoney(l.price_ngn, 'NGN') : '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.price_usd ? formatMoney(l.price_usd, 'USD') : '—'}</td>
                    <td><span className={`badge ${LISTING_STATUS[l.status].badge}`}>{LISTING_STATUS[l.status].label}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setQrFor(l)}>QR</button>{' '}
                      <a className="btn btn-ghost btn-sm" href={listingUrl(l.id)} target="_blank" rel="noreferrer">View</a>{' '}
                      {(l.status === 'live' || l.status === 'on_hold') && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l)}>Edit</button>}{' '}
                      {l.status === 'live' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(l, 'withdrawn')}>Take offline</button>}
                      {l.status === 'withdrawn' && <button className="btn btn-ghost btn-sm" onClick={() => setStatus(l, 'live')}>Relist</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ListingModal listing={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSaved={(l) => { setEditing(null); load(); if (l) setQrFor(l) }} />}
      {qrFor && <QrModal listing={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  )
}

function ListingModal({ listing, onClose, onSaved }) {
  const isNew = !listing
  const [artwork, setArtwork] = useState(listing?.artworks || null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [form, setForm] = useState({
    price_ngn: listing?.price_ngn ?? '', price_usd: listing?.price_usd ?? '', description: listing?.description ?? '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isNew || search.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const q = search.trim().replace(/[%,()]/g, ' ')
      const { data: artists } = await supabase.from('artists').select('id').ilike('name', `%${q}%`).limit(20)
      const artistIds = (artists || []).map(a => a.id)
      let query = supabase.from('artworks')
        .select('id, title, year, medium, dimensions, dimension_unit, thumbnail_url, image_url, retail_price, price_currency, hg_code, availability, artists(name)')
        .eq('availability', 'Available').limit(30)
      query = artistIds.length
        ? query.or(`title.ilike.%${q}%,hg_code.ilike.%${q}%,artist_id.in.(${artistIds.join(',')})`)
        : query.or(`title.ilike.%${q}%,hg_code.ilike.%${q}%`)
      const { data } = await query
      setResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [search, isNew])

  function pick(a) {
    setArtwork(a)
    setForm(f => ({
      ...f,
      price_ngn: f.price_ngn || ((a.price_currency || 'NGN') === 'NGN' && a.retail_price ? a.retail_price : ''),
      price_usd: f.price_usd || (a.price_currency === 'USD' && a.retail_price ? a.retail_price : ''),
    }))
  }

  async function save() {
    const ngn = form.price_ngn === '' ? null : Number(form.price_ngn)
    const usd = form.price_usd === '' ? null : Number(form.price_usd)
    if (!artwork) { alert('Choose an artwork'); return }
    if (!ngn && !usd) { alert('Set a price in NGN, USD or both'); return }
    setBusy(true)
    const row = { price_ngn: ngn || null, price_usd: usd || null, description: form.description.trim() || null, updated_at: new Date().toISOString() }
    const { data: { user } } = await supabase.auth.getUser()
    const res = isNew
      ? await supabase.from('shop_listings').insert({ ...row, artwork_id: artwork.id, created_by: user?.id }).select('*, artworks(id, title, hg_code, artists(name))').single()
      : await supabase.from('shop_listings').update(row).eq('id', listing.id).select('*, artworks(id, title, hg_code, artists(name))').single()
    setBusy(false)
    if (res.error) {
      alert(res.error.code === '23505' ? 'This work already has an open online listing.' : errorText(res.error))
      return
    }
    auditLog(isNew ? 'shop.listing_created' : 'shop.listing_updated', { entityType: 'shop_listing', entityId: res.data.id, entityLabel: artwork.title, metadata: { price_ngn: ngn, price_usd: usd } })
    onSaved(isNew ? res.data : null)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()} role="dialog" aria-label={isNew ? 'New online listing' : 'Edit listing'}>
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'New online listing' : 'Edit listing'}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">{'✕'}</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {artwork ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {(artwork.thumbnail_url || artwork.image_url) && <img src={artwork.thumbnail_url || artwork.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 2 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{artwork.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{[artwork.artists?.name, artwork.year, artwork.medium, dimensionsText(artwork.dimensions, artwork.dimension_unit)].filter(Boolean).join(' · ')}</div>
                {artwork.retail_price && <div style={{ fontSize: 12, color: 'var(--muted)' }}>HG Cat retail price: {formatMoney(artwork.retail_price, artwork.price_currency || 'NGN')}</div>}
              </div>
              {isNew && <button className="btn btn-ghost btn-sm" onClick={() => setArtwork(null)}>Change</button>}
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Artwork (Available works only)</label>
              <input className="form-input" autoFocus placeholder="Search title, artist or HG code" value={search} onChange={e => setSearch(e.target.value)} />
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                {results.map(a => (
                  <button key={a.id} onClick={() => pick(a)} className="btn btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', padding: 6, whiteSpace: 'normal' }}>
                    {(a.thumbnail_url || a.image_url) && <img src={a.thumbnail_url || a.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 2 }} />}
                    <span><span style={{ color: 'var(--ink)' }}>{a.title}</span><br /><span style={{ fontSize: 11 }}>{a.artists?.name}{a.hg_code ? ` · ${a.hg_code}` : ''}</span></span>
                  </button>
                ))}
                {search.trim().length >= 2 && results.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 6 }}>No Available works match.</div>}
              </div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Price in NGN</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.price_ngn} onChange={e => setForm(f => ({ ...f, price_ngn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Price in USD</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.price_usd} onChange={e => setForm(f => ({ ...f, price_usd: e.target.value }))} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6 }}>Set one or both. Buyers choose the currency; Paystack takes NGN and USD.</div>
          <div className="form-group">
            <label className="form-label">Online description (optional)</label>
            <textarea className="form-textarea" rows={3} placeholder="Leave blank to use the artwork's HG Cat write-up" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create & get QR' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function QrModal({ listing, onClose }) {
  const [qr, setQr] = useState(null)
  const url = listingUrl(listing.id)
  const a = listing.artworks || {}

  useEffect(() => {
    QRCode.toDataURL(url, { width: 600, margin: 1, color: { dark: '#1a1714', light: '#ffffff' } }).then(setQr)
  }, [url])

  function printLabel() {
    const w = window.open('', '_blank', 'width=480,height=640')
    if (!w) return
    const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    w.document.write(`<!doctype html><html><head><title>${esc(a.title)}</title>
      <style>body{font-family:Inter,Arial,sans-serif;color:#1a1714;margin:0;display:flex;justify-content:center}
      .l{width:90mm;padding:8mm;text-align:center}.t{font-size:14pt;font-weight:600;margin:4mm 0 1mm}
      .a{font-size:11pt;color:#5a5550}.c{font-size:9pt;letter-spacing:.12em;text-transform:uppercase;color:#9a9490;margin-top:3mm}
      img{width:55mm;height:55mm}</style></head><body><div class="l">
      <img src="${qr}" alt=""><div class="t">${esc(a.title)}</div><div class="a">${esc(a.artists?.name)}</div>
      <div class="c">Scan to ask or buy</div></div>
      <script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()} role="dialog" aria-label="Listing QR code">
        <div className="modal-header">
          <div className="modal-title">QR code</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">{'✕'}</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {qr ? <img src={qr} alt={`QR code for ${a.title}`} style={{ width: 220, height: 220 }} /> : <div style={{ height: 220 }} />}
          <div style={{ fontWeight: 500 }}>{a.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>{url}</div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(url)}>Copy link</button>
          {qr && <a className="btn btn-outline btn-sm" href={qr} download={`QR-${a.hg_code || a.title || listing.id}.png`}>Download PNG</a>}
          <button className="btn btn-primary btn-sm" disabled={!qr} onClick={printLabel}>Print label</button>
        </div>
      </div>
    </div>
  )
}

// ── QUESTIONS ────────────────────────────────────────────────────────

function Questions() {
  const [items, setItems] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('shop_inquiries').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) { alert(errorText(error)); return }
    setItems(data)
  }, [])
  useEffect(() => { load() }, [load])

  async function mark(q, status) {
    await supabase.from('shop_inquiries').update({ status }).eq('id', q.id)
    load(); changed()
  }

  if (!items) return <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div>
  const shown = items.filter(q => showAll || q.status === 'new')

  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14 }}>
        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show answered and closed
      </label>
      {shown.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No new questions.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map(q => {
            const subject = `Re: ${q.title || 'your question'} — Hourglass Gallery`
            return (
              <div key={q.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <div style={{ fontSize: 13 }}>
                    <strong>{q.name}</strong> about <strong>{q.title || 'an artwork'}</strong>{q.artist_name ? ` by ${q.artist_name}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(q.created_at)} {q.status !== 'new' && <span className="badge badge-gray">{q.status}</span>}</div>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{q.message}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {q.email && <a className="btn btn-outline btn-sm" href={`mailto:${q.email}?subject=${encodeURIComponent(subject)}`}>Email {q.email}</a>}
                  {q.phone && <a className="btn btn-outline btn-sm" href={whatsappLink(q.phone, `Hello ${q.name}, thank you for asking about ${q.title || 'the artwork'} at Hourglass Gallery.`)} target="_blank" rel="noreferrer">WhatsApp {q.phone}</a>}
                  {q.listing_id && <a className="btn btn-ghost btn-sm" href={listingUrl(q.listing_id)} target="_blank" rel="noreferrer">View listing</a>}
                  <span style={{ flex: 1 }} />
                  {q.status === 'new' && <button className="btn btn-primary btn-sm" onClick={() => mark(q, 'answered')}>Mark answered</button>}
                  {q.status !== 'closed' && <button className="btn btn-ghost btn-sm" onClick={() => mark(q, 'closed')}>Close</button>}
                  {q.status !== 'new' && <button className="btn btn-ghost btn-sm" onClick={() => mark(q, 'new')}>Reopen</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── SETTINGS ─────────────────────────────────────────────────────────

function ShopSettings() {
  const [s, setS] = useState(null)
  const [banks, setBanks] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('shop_settings').select('*').single().then(({ data }) => setS(data))
    supabase.from('bank_accounts').select('id, bank_name, account_name, account_number, currency').order('currency').then(({ data }) => setBanks(data || []))
  }, [])

  async function save() {
    const { error } = await supabase.from('shop_settings').update({
      bank_account_ngn: s.bank_account_ngn || null, bank_account_usd: s.bank_account_usd || null,
      hold_hours: Math.max(1, Number(s.hold_hours) || 72), transfer_instructions: s.transfer_instructions || null,
      site_url: (s.site_url || '').replace(/\/$/, '') || 'https://hgcat.vercel.app', updated_at: new Date().toISOString(),
    }).eq('id', true)
    if (error) { alert(errorText(error)); return }
    auditLog('shop.settings_updated', { entityType: 'shop_settings' })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!s) return <div style={{ color: 'var(--muted)' }}>Loading{'…'}</div>
  const set = (k) => (e) => setS(v => ({ ...v, [k]: e.target.value }))
  const bankOptions = (cur) => banks.filter(b => b.currency === cur).map(b => (
    <option key={b.id} value={b.id}>{b.bank_name} · {b.account_number} · {b.account_name}</option>
  ))

  return (
    <div className="card" style={{ padding: 20, maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">NGN transfers go to</label>
        <select className="form-input" value={s.bank_account_ngn || ''} onChange={set('bank_account_ngn')}>
          <option value="">— not set —</option>{bankOptions('NGN')}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">USD transfers go to</label>
        <select className="form-input" value={s.bank_account_usd || ''} onChange={set('bank_account_usd')}>
          <option value="">— not set —</option>{bankOptions('USD')}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Hold after approval (hours)</label>
        <input className="form-input" type="number" min="1" value={s.hold_hours} onChange={set('hold_hours')} style={{ maxWidth: 140 }} />
      </div>
      <div className="form-group">
        <label className="form-label">Extra transfer instructions (shown to buyers)</label>
        <textarea className="form-textarea" rows={3} value={s.transfer_instructions || ''} onChange={set('transfer_instructions')}
          placeholder="e.g. International transfers: please cover your bank's charges." />
      </div>
      <div className="form-group">
        <label className="form-label">Site address used in emails</label>
        <input className="form-input" value={s.site_url} onChange={set('site_url')} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={save}>Save settings</button>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
      </div>
    </div>
  )
}
