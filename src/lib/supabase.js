import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from './cache'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

/**
 * Fetch all rows with stale-while-revalidate caching.
 *
 * cache: true  (default) — return cached data immediately if available,
 *                          then fetch fresh in background and call onUpdate(fresh)
 * cache: false           — always fetch fresh, skip cache entirely
 * onUpdate(data)         — optional callback when background refresh completes
 */
export async function fetchAll(table, query = {}) {
  const {
    select = '*',
    filters = [],
    order = 'created_at',
    ascending = true,
    cache = true,
    onUpdate = null,
  } = query

  const cacheKey = `${table}:${select}:${JSON.stringify(filters)}:${order}:${ascending}`

  async function fetchFresh() {
    let q = supabase.from(table).select(select).range(0, 4999)
    filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
    q = q.order(order, { ascending })
    const { data, error } = await q
    if (error) throw error
    return data || []
  }

  if (!cache) return fetchFresh()

  const cached = cacheGet(cacheKey)

  if (cached) {
    // Return cached data immediately, revalidate in background
    fetchFresh().then(fresh => {
      cacheSet(cacheKey, fresh)
      if (onUpdate) onUpdate(fresh)
    }).catch(() => {}) // silently ignore background fetch errors
    return cached
  }

  // No cache — must fetch and wait
  const fresh = await fetchFresh()
  cacheSet(cacheKey, fresh)
  return fresh
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  return { ...user, profile }
}
