import { supabase } from './supabase'

export const CURRENCIES = [
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
]

export const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map(c => [c.code, c]))

export function formatAmount(amount, currencyCode = 'NGN') {
  const c = CURRENCY_MAP[currencyCode] || { symbol: currencyCode + ' ' }
  const n = Number(amount) || 0
  return c.symbol + n.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Fetch live rates from ExchangeRate-API (free, no key needed)
// Returns rates as: 1 foreign currency = X NGN
export async function fetchLiveRates() {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/NGN', { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error('Rate fetch failed')
    const json = await res.json()
    // json.rates gives: 1 NGN = X foreign
    // We want: 1 foreign = X NGN, so invert
    const ratesInNGN = {}
    Object.entries(json.rates).forEach(([code, rate]) => {
      if (rate > 0) ratesInNGN[code] = 1 / rate
    })
    ratesInNGN['NGN'] = 1
    // Cache in Supabase
    const rows = Object.entries(ratesInNGN)
      .filter(([code]) => CURRENCIES.map(c => c.code).includes(code))
      .map(([currency, rate]) => ({
        base: 'NGN', currency, rate,
        fetched_at: new Date().toISOString(),
      }))
    await supabase.from('exchange_rates').upsert(rows, { onConflict: 'base,currency' })
    return ratesInNGN
  } catch (e) {
    // Fall back to cached rates
    const { data } = await supabase.from('exchange_rates').select('*').eq('base', 'NGN')
    if (data?.length) {
      return Object.fromEntries(data.map(r => [r.currency, r.rate]))
    }
    // Hard fallback approximate rates
    return {
      NGN: 1, USD: 1600, GBP: 2050, EUR: 1720,
      GHS: 110, ZAR: 85, KES: 12, AED: 435, CHF: 1800, CNY: 220,
    }
  }
}

// Convert amount in fromCurrency to NGN
export function toNGN(amount, fromCurrency, rates) {
  if (fromCurrency === 'NGN') return Number(amount)
  const rate = rates[fromCurrency] || 1
  return Number(amount) * rate
}

// Convert NGN amount to target currency
export function fromNGN(amountNGN, toCurrency, rates) {
  if (toCurrency === 'NGN') return Number(amountNGN)
  const rate = rates[toCurrency] || 1
  return Number(amountNGN) / rate
}

export function getRateLabel(fromCurrency, rates) {
  if (fromCurrency === 'NGN') return null
  const rate = rates[fromCurrency]
  if (!rate) return null
  return `1 ${fromCurrency} = ₦${rate.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
}
