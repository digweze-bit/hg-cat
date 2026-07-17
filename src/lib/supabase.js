import { createClient } from '@supabase/supabase-js'
import { cacheGet, cacheSet } from './cache'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://gmukkxnxyvmywgrbkwnr.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdWtreG54eXZteXdncmJrd25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTk1NzgsImV4cCI6MjA5ODY5NTU3OH0.zscg6b3jhsijnAEE9-yoMVSlQYwDHjO47j5-R_odP9g'
)

/**
 * Fetch rows with stale-while-revalidate caching.
 * Returns cache immediately if available, revalidates in background.
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
    // Single request \u2014 Supabase Pro allows up to 1000 rows by default
    // For larger tables we paginate, but only if needed
    let all = []
    let offset = 0
    const PAGE = 1000

    while (true) {
      let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1)
      filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
      q = q.order(order, { ascending })
      const { data, error } = await q
      if (error) throw error
      if (!data || data.length === 0) break
      all = all.concat(data)
      if (data.length < PAGE) break  // last page, stop
      offset += PAGE
      if (offset > 20000) break      // safety cap \u2014 no table should exceed 20k rows here
    }
    return all
  }

  if (!cache) return fetchFresh()

  const cached = cacheGet(cacheKey)
  if (cached) {
    // Return cache immediately, revalidate silently in background
    fetchFresh().then(fresh => {
      cacheSet(cacheKey, fresh)
      if (onUpdate) onUpdate(fresh)
    }).catch(() => {})
    return cached
  }

  // No cache \u2014 must wait
  const fresh = await fetchFresh()
  cacheSet(cacheKey, fresh)
  return fresh
}
