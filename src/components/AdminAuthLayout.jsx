import { Outlet } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'

/**
 * Pathless layout route that mounts AuthProvider for the admin routes only.
 * Lazy-loaded from App.jsx so visiting a public page never even downloads —
 * let alone constructs — the auth client.
 */
export default function AdminAuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
