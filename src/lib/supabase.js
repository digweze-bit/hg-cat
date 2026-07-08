import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from './cache'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

/**
 * Fetch all rows from a table with optional caching.
 * cache: true  = use session cache (default for read-heavy tables)
 * cache: false = always fetch fresh
 */
export async function fetchAll(table, query = {}) {
  const { select = '*', filters = [], order = 'created_at', ascending = true, cache = true } = query

  // Build cache key from query params
  const cacheKey = `${table}:${select}:${JSON.stringify(filters)}:${order}:${ascending}`

  if (cache) {
    const cached = cacheGet(cacheKey)
    if (cached) return cached
  }

  let q = supabase.from(table).select(select).range(0, 4999)
  filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
  q = q.order(order, { ascending })

  const { data, error } = await q
  if (error) throw error
  const result = data || []

  if (cache) cacheSet(cacheKey, result)
  return result
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  return { ...user, profile }
}
