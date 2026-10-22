import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabasePublic'
import { dimensionsText, errorText, formatMoney, listingUrl, normalisePhone, whatsappLink } from '../lib/shop'
import {
  ShopFrame, ShopButton, Field, Notice, Centered, WhatsAppIcon,
  inputStyle, eyebrowStyle, INK, MUTED, LINE,
} from '../components/ShopChrome'

const PHONE_KEY = 'hgcat-shop-phone'

function remembered(key) {
  try { return localStorage.getItem(key) || '' } catch (_) { return '' }
}
function remember(key, value) {
  try { localStorage.setItem(key, value) } catch (_) {}
}

/**
 * The page a listing's QR code opens: the work, its price, and three ways
 * in — Buy (pro-forma + "Get Buy Confirmation"), Ask about the artwork, and
 * Send to my WhatsApp. Nothing here writes to HG Cat; it all goes through
 * the shop_* functions.
 */
export default function ShopListing() {
  const { listingId } = useParams()
  const navigate = useNavigate()
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState(null) // 'buy' | 'ask' | 'whatsapp'
  const [currency, setCurrency] = useState('NGN')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.rpc('shop_get_listing', { p_id: listingId }).then(({ data }) => {
      if (cancelled) return
      setListing(data || null)
      if (data) setCurrency(data.price_ngn ? 'NGN' : 'USD')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [listingId])

  if (loading) return <Centered>Loading{'…'}</Centered>
  if (!listing) return (
    <Centered>
      <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 24, color: INK }}>This work isn't listed online</div>
      <a href="/" style={{ textDecoration: 'underline' }}>Browse the catalogue</a>
    </Centered>
  )

  const prices = [['NGN', listing.price_ngn], ['USD', listing.price_usd]].filter(([, v]) => v)
  const price = currency === 'NGN' ? listing.price_ngn : listing.price_usd
  const buyable = listing.status === 'live' && listing.available
  const toggle = (p) => setPanel(v => (v === p ? null : p))

  return (
    <ShopFrame>
      <div className="shop-grid">
        <div>
          {listing.image_url ? (
            <img src={listing.image_url} alt={listing.title}
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', background: '#f0ece6', borderRadius: 2 }} />
          ) : (
            <div style={{ aspectRatio: '4/5', background: '#ede9e2', borderRadius: 2 }} />
          )}
        </div>

        <div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontWeight: 400, fontSize: 30, lineHeight: 1.15, margin: '0 0 6px' }}>
            {listing.title}
          </h1>
          {listing.artist_name && <div style={{ fontSize: 15, color: '#5a5550', marginBottom: 18 }}>{listing.artist_name}</div>}

          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {[['Year', listing.year], ['Medium', listing.medium], ['Dimensions', dimensionsText(listing.dimensions, listing.dimension_unit)]]
              .filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex' }}>
                  <div style={{ ...eyebrowStyle, width: 100, flexShrink: 0, paddingTop: 2 }}>{k}</div>
                  <div style={{ fontSize: 13 }}>{v}</div>
                </div>
              ))}
          </div>

          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{formatMoney(price, currency)}</div>
              {prices.length > 1 && (
                <div role="group" aria-label="Currency" style={{ display: 'flex', border: `1px solid ${LINE}`, borderRadius: 3, overflow: 'hidden' }}>
                  {prices.map(([c]) => (
                    <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c}
                      style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                               background: currency === c ? INK : '#fff', color: currency === c ? '#fff' : INK }}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {listing.status === 'on_hold' && <div style={{ marginTop: 10 }}><Notice tone="warning">This work is on hold for another buyer. You can still ask about it.</Notice></div>}
            {(listing.status === 'sold' || (!listing.available && listing.status !== 'on_hold')) &&
              <div style={{ marginTop: 10 }}><Notice tone="error">This work has been sold.</Notice></div>}
          </div>

          <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {buyable && (
              <ShopButton onClick={() => toggle('buy')} aria-expanded={panel === 'buy'}>Buy</ShopButton>
            )}
            {panel === 'buy' && buyable && (
              <BuyPanel listing={listing} currency={currency} amount={price}
                onDone={(token) => navigate(`/shop/order/${token}`)} />
            )}

            <ShopButton variant="outline" onClick={() => toggle('ask')} aria-expanded={panel === 'ask'}>Ask about the artwork</ShopButton>
            {panel === 'ask' && <AskPanel listing={listing} />}

            <ShopButton variant="whatsapp" onClick={() => toggle('whatsapp')} aria-expanded={panel === 'whatsapp'}>
              <WhatsAppIcon /> Send to my WhatsApp
            </ShopButton>
            {panel === 'whatsapp' && <WhatsAppPanel listing={listing} currency={currency} price={price} />}
          </div>

          {listing.description && (
            <div style={{ marginTop: 28, fontSize: 13, color: '#3d3a36', lineHeight: 1.75 }}>
              <div style={{ ...eyebrowStyle, marginBottom: 8 }}>About this work</div>
              {listing.description.split('\n\n').map((p, i) => <p key={i} style={{ marginBottom: '1em' }}>{p.trim()}</p>)}
            </div>
          )}
        </div>
      </div>
    </ShopFrame>
  )
}

function PanelBox({ children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 3, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
    </div>
  )
}

function BuyPanel({ listing, currency, amount, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', phone: remembered(PHONE_KEY), message: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('shop_request_purchase', {
      p_listing_id: listing.id, p_currency: currency, p_name: form.name, p_email: form.email,
      p_phone: form.phone || null, p_message: form.message || null,
    })
    setBusy(false)
    if (error) { setError(errorText(error)); return }
    if (form.phone) remember(PHONE_KEY, form.phone)
    onDone(data.token)
  }

  return (
    <PanelBox>
      {/* Pro-forma invoice */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 3, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <div style={{ ...eyebrowStyle, color: INK }}>Pro-forma invoice</div>
          <div style={{ fontSize: 11, color: MUTED }}>{today}</div>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
          Hourglass Gallery<br />298C Akin Olugbade Street, Victoria Island, Lagos
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, padding: '12px 0' }}>
          {listing.thumbnail_url && <img src={listing.thumbnail_url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{listing.title}</div>
            <div style={{ fontSize: 12, color: MUTED }}>{[listing.artist_name, listing.year, listing.medium].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(amount, currency)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontSize: 14, fontWeight: 600 }}>
          <span>Total</span><span>{formatMoney(amount, currency)}</span>
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
          Nothing is charged yet. The gallery confirms the work is yours first, then you choose card or bank transfer.
        </div>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Full name"><input required value={form.name} onChange={set('name')} autoComplete="name" style={inputStyle} /></Field>
        <Field label="Email" hint="We'll send the confirmation and payment options here.">
          <input required type="email" value={form.email} onChange={set('email')} autoComplete="email" style={inputStyle} />
        </Field>
        <Field label="Phone / WhatsApp"><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" style={inputStyle} /></Field>
        <Field label="Note to the gallery (optional)">
          <textarea value={form.message} onChange={set('message')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <ShopButton variant="accent" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Get Buy Confirmation'}</ShopButton>
      </form>
    </PanelBox>
  )
}

function AskPanel({ listing }) {
  const [form, setForm] = useState({ name: '', email: '', phone: remembered(PHONE_KEY), message: '' })
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setState('busy'); setError(null)
    const { error } = await supabase.rpc('shop_ask_question', {
      p_listing_id: listing.id, p_name: form.name, p_email: form.email || null,
      p_phone: form.phone || null, p_message: form.message,
    })
    if (error) { setState('idle'); setError(errorText(error)); return }
    setState('sent')
  }

  if (state === 'sent') return <PanelBox><Notice tone="success">Thank you — the gallery will get back to you shortly.</Notice></PanelBox>

  return (
    <PanelBox>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Your question">
          <textarea required value={form.message} onChange={set('message')} rows={3}
            placeholder="Framing, shipping, the artist, a viewing…" style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        <Field label="Name"><input required value={form.name} onChange={set('name')} autoComplete="name" style={inputStyle} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} autoComplete="email" style={inputStyle} /></Field>
        <Field label="Phone / WhatsApp"><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" style={inputStyle} /></Field>
        {error && <Notice tone="error">{error}</Notice>}
        <ShopButton type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Send question'}</ShopButton>
      </form>
    </PanelBox>
  )
}

function WhatsAppPanel({ listing, currency, price }) {
  const [phone, setPhone] = useState(remembered(PHONE_KEY))
  const digits = normalisePhone(phone)
  const valid = digits.length >= 10

  function send(e) {
    e.preventDefault()
    if (!valid) return
    remember(PHONE_KEY, phone)
    const text = [
      `*${listing.title}*`,
      listing.artist_name,
      [listing.year, listing.medium, dimensionsText(listing.dimensions, listing.dimension_unit)].filter(Boolean).join(' · '),
      formatMoney(price, currency),
      '',
      `Hourglass Gallery: ${listingUrl(listing.id)}`,
    ].filter(v => v !== null && v !== undefined).join('\n')
    window.open(whatsappLink(digits, text), '_blank', 'noopener')
  }

  return (
    <PanelBox>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Your WhatsApp number" hint="Opens WhatsApp with this work ready to send to yourself, so you can come back to it later.">
          <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="0803 123 4567 or +44 7700 900123"
            autoComplete="tel" style={inputStyle} />
        </Field>
        <ShopButton variant="whatsapp" type="submit" disabled={!valid}><WhatsAppIcon /> Open WhatsApp</ShopButton>
      </form>
    </PanelBox>
  )
}
