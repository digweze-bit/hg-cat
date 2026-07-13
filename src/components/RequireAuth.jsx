import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export default function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth()

  // Still checking session \u2014 show minimal spinner
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ width:24, height:24, border:'2px solid #e0dbd4', borderTopColor:'#1a1714', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  // Not logged in
  if (!user) return <Navigate to="/admin/login" replace />

  // Logged in but profile not yet loaded \u2014 render children anyway
  // Profile check happens below once loaded
  if (!profile) return children

  // Profile loaded but not approved
  if (!profile.approved) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'24px' }}>
      <div style={{ maxWidth:400, textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.5rem', marginBottom:12 }}>Access Pending</div>
        <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.7 }}>
          Your account is awaiting approval by an administrator.
        </p>
        <button className="btn btn-outline mt-4"
          onClick={() => { import('../lib/supabase').then(m => m.supabase.auth.signOut()) }}>
          Sign out
        </button>
      </div>
    </div>
  )

  return children
}
