import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabasePublic'
import { errorText, formatMoney } from '../lib/shop'
import {
  ShopFrame, ShopButton, Field, Notice, Centered,
  inputStyle, eyebrowStyle, INK, MUTED, LINE,
} from '../components/ShopChrome'

const STEPS = [
  ['requested', 'Requested'],
  ['approved', 'Approved'],
  ['paid', 'Paid'],
]

function stepIndex(status) {
  if (status === 'requested') return 0
  if (status === 'approved') return 1
  if (status === 'paid' || status === 'posted') return 2
  return -1
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * The buyer's private order page (/shop/order/:token). It is the only key to
 * the order, so it's what the emails link to. Refreshes itself while the
 * buyer waits for the gallery.
 */
export default function ShopOrder() {
  const { token } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [order, setOrder] = useState(undefined)
  const [method, setMethod] = useState(null) // 'card' | 'transfer'
  const [cardState, setCardState] = useState({ busy: false, error: null, note: null })
  const verifiedRef = useRef(false)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('shop_get_order', { p_token: token })
    setOrder(data || null)
    return data
  }, [token])

  useEffect(() => { load() }, [load])

  // Keep the page live while someone is waiting on the other side.
  useEffect(() => {
    if (!order) return
    const waiting = order.status === 'requested' ||
      (order.status === 'approved' && order.payments.some(p => p.status === 'pending_review'))
    if (!waiting) return
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [order, load])

  // Back from Paystack: ?reference=… (Paystack also adds trxref).
  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
    if (!reference || verifiedRef.current) return
    verifiedRef.current = true
    setCardState({ busy: true, error: null, note: 'Confirming your card payment…' })
    supabase.functions.invoke('shop-paystack', { body: { action: 'verify', reference } })
      .then(async ({ data, error }) => {
        const next = new URLSearchParams(searchParams)
        next.delete('reference'); next.delete('trxref')
        setSearchParams(next, { replace: true })
        await load()
        if (error || data?.error) {
          setCardState({ busy: false, error: 'We couldn’t confirm the payment yet. If you were charged, it will show here shortly.', note: null })
        } else if (data.result === 'paid' || data.result === 'already_recorded') {
          setCardState({ busy: false, error: null, note: null })
        } else {
          setCardState({ busy: false, error: data.paystackStatus === 'abandoned' ? 'The card payment was not completed.' : 'The card payment did not go through.', note: null })
        }
      })
  }, [searchParams, setSearchParams, load])

  async function payByCard() {
    setCardState({ busy: true, error: null, note: null })
    const { data, error } = await supabase.functions.invoke('shop-paystack', { body: { action: 'init', token } })
    if (error || data?.error || !data?.url) {
      let msg = data?.error
      if (!msg && error?.context) { try { msg = (await error.context.json()).error } catch (_) {} }
      setCardState({ busy: false, error: msg || 'Could not start the card payment. Please try again or pay by transfer.', note: null })
      return
    }
    window.location.href = data.url
  }

  if (order === undefined) return <Centered>Loading{'…'}</Centered>
  if (order === null) return (
    <Centered>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, color: INK }}>Order not found</div>
      <div>Check the link in your email, or contact the gallery.</div>
    </Centered>
  )

  const step = stepIndex(order.status)
  const pendingReceipt = order.payments.find(p => p.status === 'pending_review')
  const lastRejected = [...order.payments].reverse().find(p => p.method === 'transfer' && p.status === 'rejected')
  const price = formatMoney(order.amount, order.currency)

  return (
    <ShopFrame width={720}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={eyebrowStyle}>Order {order.ref}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{fmtDate(order.created_at)}</div>
      </div>
      <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, fontSize: 28, margin: '0 0 20px' }}>
        {{
          requested: 'Waiting for the gallery to confirm',
          approved: pendingReceipt ? 'Receipt received — being checked' : 'Approved — ready for payment',
          paid: 'Payment received — thank you',
          posted: 'Payment received — thank you',
          declined: 'This purchase wasn’t confirmed',
          expired: 'The hold on this work has ended',
        }[order.status]}
      </h1>

      {step >= 0 && (
        <ol aria-label="Progress" style={{ listStyle: 'none', display: 'flex', gap: 6, margin: '0 0 24px', padding: 0 }}>
          {STEPS.map(([key, label], i) => (
            <li key={key} style={{ flex: 1 }}>
              <div style={{ height: 3, borderRadius: 2, background: i <= step ? INK : LINE }} />
              <div style={{ fontSize: 11, marginTop: 6, color: i <= step ? INK : MUTED, fontWeight: i === step ? 600 : 400 }}>{label}</div>
            </li>
          ))}
        </ol>
      )}

      {/* Invoice summary */}
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {order.image_url && <img src={order.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{order.title}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{[order.artist_name, order.year, order.medium, order.dimensions].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>{price}</div>
        </div>
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 14, paddingTop: 12, fontSize: 12, color: MUTED, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>For {order.buyer_name} · {order.buyer_email}</span>
          <button className="no-print" onClick={() => window.print()}
            style={{ background: 'none', border: 'none', padding: 0, color: MUTED, textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            Print
          </button>
        </div>
      </div>

      {cardState.note && <div style={{ marginBottom: 14 }}><Notice>{cardState.note}</Notice></div>}
      {cardState.error && <div style={{ marginBottom: 14 }}><Notice tone="error">{cardState.error}</Notice></div>}

      {order.status === 'requested' && (
        <Notice>
          The gallery is confirming this work for you. You'll get an email at <strong>{order.buyer_email}</strong> once
          it's approved, and this page will update by itself. Nothing has been charged.
        </Notice>
      )}

      {order.status === 'approved' && pendingReceipt && (
        <Notice tone="success">
          Thank you — we've received your transfer receipt and are checking it against our account. We'll email you as soon as it's confirmed.
        </Notice>
      )}

      {order.status === 'approved' && !pendingReceipt && (
        <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {order.hold_expires_at && (
            <Notice tone="warning">This work is held for you until <strong>{fmtDate(order.hold_expires_at)}</strong>.</Notice>
          )}
          {lastRejected && (
            <Notice tone="error">
              We couldn't confirm your last receipt{lastRejected.reject_reason ? `: ${lastRejected.reject_reason}` : '.'} Please upload it again or contact the gallery.
            </Notice>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ShopButton variant={method === 'card' ? 'primary' : 'outline'} onClick={() => setMethod('card')} aria-pressed={method === 'card'}>
              Pay by card
            </ShopButton>
            <ShopButton variant={method === 'transfer' ? 'primary' : 'outline'} onClick={() => setMethod('transfer')} aria-pressed={method === 'transfer'}>
              Pay by bank transfer
            </ShopButton>
          </div>

          {method === 'card' && (
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#3d3a36', lineHeight: 1.6 }}>
                You'll be taken to Paystack's secure checkout to pay <strong>{price}</strong> by card, bank or USSD, then brought back here.
              </div>
              <ShopButton variant="accent" onClick={payByCard} disabled={cardState.busy}>
                {cardState.busy ? 'Opening Paystack…' : `Pay ${price} with Paystack`}
              </ShopButton>
            </div>
          )}

          {method === 'transfer' && <TransferPanel order={order} token={token} onUploaded={load} />}
        </div>
      )}

      {(order.status === 'paid' || order.status === 'posted') && (
        <Notice tone="success">
          We've received your payment of <strong>{price}</strong>{order.payment_method === 'card' ? ' by card' : order.payment_method === 'transfer' ? ' by bank transfer' : ''}.
          The gallery will contact you about collection or delivery.
        </Notice>
      )}

      {order.status === 'declined' && (
        <Notice tone="error">
          {order.decline_reason || 'The gallery wasn’t able to confirm this work for you.'} Reply to any of our emails and we'll gladly help.
        </Notice>
      )}

      {order.status === 'expired' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Notice>The time to pay for this work has passed and it has been released. If it's still available you can request it again.</Notice>
          <ShopButton variant="outline" onClick={() => { window.location.href = `/shop/${order.listing_id}` }}>View the work</ShopButton>
        </div>
      )}
    </ShopFrame>
  )
}

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${LINE}` }}>
      <div style={{ ...eyebrowStyle, width: 110, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
      <button type="button"
        onClick={() => { navigator.clipboard?.writeText(String(value)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
        style={{ fontSize: 11, padding: '4px 9px', border: `1px solid ${LINE}`, borderRadius: 3, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: INK }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function TransferPanel({ order, token, onUploaded }) {
  const b = order.bank
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({ amount: String(order.amount), bank: '', date: new Date().toISOString().slice(0, 10), note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function upload(e) {
    e.preventDefault()
    if (!file) { setError('Please attach your receipt'); return }
    if (file.size > 10 * 1024 * 1024) { setError('That file is over 10 MB — please attach a smaller screenshot or PDF'); return }
    setBusy(true); setError(null)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
    const path = `${token}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('shop-receipts').upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (upErr) { setBusy(false); setError(errorText(upErr)); return }
    const { error: rpcErr } = await supabase.rpc('shop_submit_receipt', {
      p_token: token, p_path: path, p_amount: Number(form.amount) || null,
      p_bank_name: form.bank || null, p_transfer_date: form.date || null, p_note: form.note || null,
    })
    setBusy(false)
    if (rpcErr) { setError(errorText(rpcErr)); return }
    onUploaded()
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, color: '#3d3a36', lineHeight: 1.6, marginBottom: 10 }}>
          Transfer <strong>{formatMoney(order.amount, order.currency)}</strong> to the account below and put <strong>{order.ref}</strong> in the narration.
        </div>
        {b ? (
          <div>
            <CopyRow label="Amount" value={formatMoney(order.amount, order.currency)} />
            <CopyRow label="Account name" value={b.account_name} />
            <CopyRow label="Bank" value={b.bank_name} />
            <CopyRow label="Account no." value={b.account_number} />
            <CopyRow label="Sort code" value={b.sort_code} />
            <CopyRow label="Routing no." value={b.routing_number} />
            <CopyRow label="SWIFT / BIC" value={b.swift_bic} />
            <CopyRow label="Bank address" value={b.bank_address} />
            <CopyRow label="Narration" value={order.ref} />
          </div>
        ) : (
          <Notice tone="warning">Bank details for {order.currency} aren't set up yet — please contact the gallery.</Notice>
        )}
        {order.transfer_instructions && (
          <div style={{ fontSize: 12, color: MUTED, marginTop: 10, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{order.transfer_instructions}</div>
        )}
      </div>

      <form onSubmit={upload} style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>After you've paid, send us the receipt</div>
        <Field label="Receipt (screenshot or PDF)">
          <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ ...inputStyle, padding: 9 }} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label={`Amount sent (${order.currency})`}>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={set('amount')} style={inputStyle} />
          </Field>
          <Field label="Date of transfer"><input type="date" value={form.date} onChange={set('date')} style={inputStyle} /></Field>
        </div>
        <Field label="Your bank (optional)"><input value={form.bank} onChange={set('bank')} style={inputStyle} /></Field>
        <Field label="Note (optional)"><input value={form.note} onChange={set('note')} style={inputStyle} /></Field>
        {error && <Notice tone="error">{error}</Notice>}
        <ShopButton variant="accent" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Send receipt to the gallery'}</ShopButton>
      </form>
    </div>
  )
}
