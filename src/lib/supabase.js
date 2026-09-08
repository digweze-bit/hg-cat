import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig'
import { crossTabAuthLock } from './authLock'
import { makeFetchAll } from './fetchAll'

/**
 * The admin client: signed-in, persists its session and auto-refreshes it.
 *
 * Importing this module creates the client, which starts the auto-refresh
 * ticker — so only admin code may import it. Public pages use
 * ./supabasePublic instead, which never touches /token.
 */

const AUTH_STORAGE_KEY = 'hgcat-auth'

// auth-js's default key is `sb-<project-ref>-auth-token`. Carry an existing
// session across to the new key once, so renaming it doesn't sign everyone out.
try {
  if (!localStorage.getItem(AUTH_STORAGE_KEY)) {
    const legacyKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
    const legacy = localStorage.getItem(legacyKey)
    if (legacy) localStorage.setItem(AUTH_STORAGE_KEY, legacy)
  }
} catch (_) {}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    // Serialises refreshes across tabs. See ./authLock for why this is needed:
    // without it each tab races the others to POST /token, and the 429 that
    // follows tears down the session for all of them.
    lock: crossTabAuthLock,
  },
})

export const fetchAll = makeFetchAll(supabase)
