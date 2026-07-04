import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export default function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.2rem', color:'var(--muted)' }}>Loading…</div>
    </div>
  )

  if (!user) return <Navigate to="/admin/login" replace />

  if (profile && !profile.approved) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px' }}>
      <div style={{ maxWidth:400, textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', marginBottom:12 }}>Access Pending</div>
        <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.7 }}>
          Your account is awaiting approval by an administrator. You will receive access once approved.
        </p>
        <button
          className="btn btn-outline mt-4"
          onClick={() => { import('../lib/supabase').then(m => m.supabase.auth.signOut()) }}
        >Sign out</button>
      </div>
    </div>
  )

  return children
}
