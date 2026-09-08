import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig'
import { makeFetchAll } from './fetchAll'

/**
 * The public client: anon key only, no stored session, no refresh ticker.
 *
 * Public routes (the catalogue and artwork pages) read nothing that RLS hides
 * from `anon`, so they have no reason to hold an auth session — and holding one
 * is what makes a newly opened tab race every other tab for a /token refresh.
 * This client never calls /token at all.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'hgcat-public',
  },
})

export const fetchAll = makeFetchAll(supabase, 'anon')
