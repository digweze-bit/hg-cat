// Helpers shared by the public shop pages and the admin Online Shop tab.
// Deliberately free of any Supabase client import, so public pages can use it
// without pulling in the signed-in admin client.

export const SHOP_CURRENCIES = ['NGN', 'USD']
const SYMBOLS = { NGN: '₦', USD: '$' }

export function formatMoney(amount, currency = 'NGN') {
  const n = Number(amount) || 0
  const whole = Math.round(n * 100) % 100 === 0
  return (SYMBOLS[currency] || currency + ' ') + n.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function listingUrl(id, origin = window.location.origin) {
  return `${origin}/shop/${id}`
}

export function orderUrl(token, origin = window.location.origin) {
  return `${origin}/shop/order/${token}`
}

// wa.me wants digits only, in international format. Nigerian numbers are
// usually typed locally (0803…), so turn a leading 0 into 234.
export function normalisePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = '234' + d.slice(1)
  return d
}

export function whatsappLink(phone, text) {
  const to = normalisePhone(phone)
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}

export const ORDER_STATUS = {
  requested: { label: 'Awaiting confirmation', badge: 'badge-amber' },
  approved:  { label: 'Approved · awaiting payment', badge: 'badge-blue' },
  paid:      { label: 'Paid · post to HG Cat', badge: 'badge-green' },
  posted:    { label: 'Posted to HG Cat', badge: 'badge-gray' },
  declined:  { label: 'Declined', badge: 'badge-red' },
  expired:   { label: 'Hold expired', badge: 'badge-gray' },
}

export const LISTING_STATUS = {
  live:      { label: 'Live', badge: 'badge-green' },
  on_hold:   { label: 'On hold', badge: 'badge-amber' },
  sold:      { label: 'Sold', badge: 'badge-gray' },
  withdrawn: { label: 'Withdrawn', badge: 'badge-red' },
}

export function dimensionsText(d, unit) {
  if (!d) return null
  return `${d} ${unit === 'cm' ? 'cm' : 'in'}`
}

// Postgres raises plain-text exceptions; strip any "ERROR:" noise for display.
export function errorText(err) {
  const m = err?.message || String(err || 'Something went wrong')
  return m.replace(/^ERROR:\s*/i, '')
}
