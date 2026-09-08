import { createContext, useContext } from 'react'

/**
 * Context only — deliberately imports nothing from lib/supabase, so components
 * that merely *read* auth state (RequireAuth, AdminLayout, admin pages) don't
 * pull the auth client into the bundle that public routes load.
 */
export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}
