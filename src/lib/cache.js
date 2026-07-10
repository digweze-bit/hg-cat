/**
 * Two-layer cache for Supabase data:
 * 1. In-memory (Map) — instant, per session
 * 2. localStorage — survives page refresh, cleared when stale
 *
 * On slow connections: data loads from localStorage instantly on refresh,
 * then updates in background when the network request completes.
 */

const memory = new Map()

const TTL = {
  artists:    60 * 60 * 1000,  // 1 hour — invalidated on write
  artworks:   30 * 60 * 1000,  // 30 min — invalidated on write
  clients:    15 * 60 * 1000,  // 15 min
  invoices:    5 * 60 * 1000,  // 5 min — changes more often
  books:      30 * 60 * 1000,
  consignors: 60 * 60 * 1000,
  default:    10 * 60 * 1000,
}

const CACHE_VERSION = 'v2'
const LS_PREFIX = `hgcat_cache_${CACHE_VERSION}_`
const LS_MAX_SIZE = 2 * 1024 * 1024 // 2MB per key — localStorage limit is ~5MB total

export function cacheGet(key) {
  // 1. Check memory first — fastest
  const mem = memory.get(key)
  if (mem) {
    if (Date.now() < mem.expires) return mem.data
    memory.delete(key)
  }

  // 2. Check localStorage
  try {
    const raw = localStorage.getItem(LS_PREFIX + key)
    if (raw) {
      const entry = JSON.parse(raw)
      if (Date.now() < entry.expires) {
        // Warm memory cache from localStorage
        memory.set(key, entry)
        return entry.data
      }
      localStorage.removeItem(LS_PREFIX + key)
    }
  } catch(_) {}

  return null
}

export function cacheSet(key, data, ttlMs) {
  const table = key.split(':')[0]
  const ms = ttlMs || TTL[table] || TTL.default
  const entry = { data, expires: Date.now() + ms }

  // Always set memory
  memory.set(key, entry)

  // Persist to localStorage if data isn't too large
  try {
    const str = JSON.stringify(entry)
    if (str.length < LS_MAX_SIZE) {
      localStorage.setItem(LS_PREFIX + key, str)
    }
  } catch(e) {
    // localStorage full — clear old entries and try again
    clearOldLocalStorage()
    try {
      const str = JSON.stringify(entry)
      if (str.length < LS_MAX_SIZE) localStorage.setItem(LS_PREFIX + key, str)
    } catch(_) {}
  }
}

export function cacheInvalidate(table) {
  // Clear memory
  for (const key of memory.keys()) {
    if (key.startsWith(table + ':') || key === table) memory.delete(key)
  }
  // Clear localStorage
  try {
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(LS_PREFIX + table)) toRemove.push(key)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch(_) {}
}

export function cacheClear() {
  memory.clear()
  try {
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(LS_PREFIX)) toRemove.push(key)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch(_) {}
}

function clearOldLocalStorage() {
  try {
    const now = Date.now()
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(LS_PREFIX)) continue
      try {
        const entry = JSON.parse(localStorage.getItem(key))
        if (now > entry.expires) toRemove.push(key)
      } catch(_) { toRemove.push(key) }
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch(_) {}
}
