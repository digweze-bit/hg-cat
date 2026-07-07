import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Fetch all rows in parallel batches instead of sequential
export async function fetchAll(table, query = {}) {
  const { select = '*', filters = [], order = 'created_at', ascending = true } = query
  const BATCH = 1000

  // First get the count
  let countQ = supabase.from(table).select('*', { count: 'exact', head: true })
  filters.forEach(([col, op, val]) => { countQ = countQ.filter(col, op, val) })
  const { count, error: countErr } = await countQ
  if (countErr) throw countErr
  if (!count || count === 0) return []

  // If fits in one batch, just fetch directly
  if (count <= BATCH) {
    let q = supabase.from(table).select(select).range(0, BATCH - 1)
    filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
    q = q.order(order, { ascending })
    const { data, error } = await q
    if (error) throw error
    return data || []
  }

  // Multiple batches — fire them all in parallel
  const batches = []
  for (let from = 0; from < count; from += BATCH) {
    let q = supabase.from(table).select(select).range(from, Math.min(from + BATCH - 1, count - 1))
    filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
    q = q.order(order, { ascending })
    batches.push(q)
  }
  const results = await Promise.all(batches)
  const all = []
  for (const { data, error } of results) {
    if (error) throw error
    if (data) all.push(...data)
  }
  return all
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  return { ...user, profile }
}
