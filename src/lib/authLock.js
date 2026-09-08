/**
 * Cross-tab exclusive lock for Supabase auth, backed by the Web Locks API.
 *
 * auth-js only dedupes token refreshes *within* a single client instance, so
 * every open tab runs its own auto-refresh ticker and fires its own
 * POST /token with the same refresh token. Supabase rate-limits that endpoint,
 * and a 429 that lands once the access token has already expired makes auth-js
 * drop the session and broadcast SIGNED_OUT to every tab — that's the
 * "opened an artwork in a new tab, came back logged out" report.
 *
 * Web Locks are scoped to the origin, so one tab holds the lock while the
 * others wait and then read the freshly stored session instead of asking the
 * server for their own.
 */
export async function crossTabAuthLock(name, acquireTimeout, fn) {
  if (typeof navigator === 'undefined' || !navigator.locks) return await fn()

  // acquireTimeout === 0 is auth-js's auto-refresh tick: it wants to skip this
  // round entirely if the lock is held rather than queue behind it. Returning
  // without running fn is the skip — the ticker fires again in 30s.
  if (acquireTimeout === 0) {
    return await navigator.locks.request(
      name,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => (lock ? await fn() : undefined),
    )
  }

  return await navigator.locks.request(name, { mode: 'exclusive' }, async () => await fn())
}
