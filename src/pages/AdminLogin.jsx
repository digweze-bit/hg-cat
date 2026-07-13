import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'

export default function AdminLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--parchment)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'2rem', marginBottom:4 }}>Hourglass Gallery</div>
          <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em' }}>Staff Portal</div>
        </div>

        <div className="card" style={{ padding:'28px 32px' }}>
          <h2 style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', fontWeight:400, marginBottom:22 }}>Sign in</h2>

          {error && (
            <div style={{ background:'#fce8e8', border:'1px solid #f5c0c0', borderRadius:3, padding:'10px 14px', fontSize:13, color:'var(--red)', marginBottom:18 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@hourglassgallery.com"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="********"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop:4, padding:'11px' }}>
              {loading ? 'Signing in\u2026' : 'Sign in'}
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:20 }}>
          <a href="/" style={{ fontSize:12, color:'var(--muted)' }}>{'\u2190'} Back to gallery</a>
        </div>
      </div>
    </div>
  )
}
