import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Fetch all rows from a table, bypassing Supabase's 1000-row default limit
export async function fetchAll(table, query = {}) {
  const { select = '*', filters = [], order = 'created_at', ascending = true } = query
  const all = []
  const BATCH = 1000
  let from = 0
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + BATCH - 1)
    filters.forEach(([col, op, val]) => { q = q.filter(col, op, val) })
    q = q.order(order, { ascending })
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < BATCH) break
    from += BATCH
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
