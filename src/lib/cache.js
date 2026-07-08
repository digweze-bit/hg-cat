/**
 * Simple in-memory cache for Supabase data
 * Persists for the browser session — cleared on page refresh
 * Dramatically reduces repeat Supabase calls when navigating between pages
 */

const store = new Map()
const TTL = {
  artists:   10 * 60 * 1000,   // 10 min — rarely changes
  artworks:   5 * 60 * 1000,   // 5 min
  clients:    5 * 60 * 1000,
  invoices:   2 * 60 * 1000,   // 2 min — changes more often
  books:      5 * 60 * 1000,
  consignors: 10 * 60 * 1000,
  default:    3 * 60 * 1000,
}

export function cacheGet(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { store.delete(key); return null }
  return entry.data
}

export function cacheSet(key, data, ttlMs) {
  const table = key.split(':')[0]
  const ms = ttlMs || TTL[table] || TTL.default
  store.set(key, { data, expires: Date.now() + ms })
}

export function cacheInvalidate(table) {
  for (const key of store.keys()) {
    if (key.startsWith(table + ':') || key === table) store.delete(key)
  }
}

export function cacheClear() { store.clear() }
