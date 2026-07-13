import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

export default function Users() {
  const { profile: myProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(id) {
    await supabase.from('profiles').update({ approved: true }).eq('id', id)
    load()
  }

  async function revoke(id) {
    if (!confirm('Revoke access for this user?')) return
    await supabase.from('profiles').update({ approved: false }).eq('id', id)
    load()
  }

  async function setRole(id, role) {
    await supabase.from('profiles').update({ role }).eq('id', id)
    load()
  }

  if (myProfile?.role !== 'admin') return (
    <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)' }}>
      <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.3rem', marginBottom:8 }}>Admin only</div>
      <p style={{ fontSize:13 }}>Only gallery admins can manage staff accounts.</p>
    </div>
  )

  if (loading) return <div style={{ color:'var(--muted)' }}>Loading users{'\u2026'}</div>

  const pending = users.filter(u => !u.approved)
  const active = users.filter(u => u.approved)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Staff Users</div>
        <div className="page-subtitle">{active.length} active \u00B7 {pending.length} pending approval</div>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--amber)', marginBottom:12 }}>
            \u26A0 Pending approval ({pending.length})
          </div>
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Email</th><th>Name</th><th>Requested</th><th>Actions</th></tr></thead>
                <tbody>
                  {pending.map(u => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td style={{ color:'var(--muted)' }}>{u.full_name || '\u2014'}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{u.created_at?.slice(0,10)}</td>
                      <td>
                        <div style={{ display:'flex', gap:6 }}>
                          <button className="btn btn-sm" style={{ background:'var(--green)', color:'#fff', border:'none' }} onClick={() => approve(u.id)}>Approve</button>
                          <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => revoke(u.id)}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12 }}>Active staff</div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {active.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        {u.email}
                        {u.id === myProfile?.id && <span className="badge badge-blue">You</span>}
                      </div>
                    </td>
                    <td style={{ color:'var(--muted)' }}>{u.full_name || '\u2014'}</td>
                    <td>
                      {u.id === myProfile?.id ? (
                        <span className="badge badge-blue">{u.role}</span>
                      ) : (
                        <select
                          className="form-select"
                          style={{ width:110, padding:'4px 8px', fontSize:12 }}
                          value={u.role}
                          onChange={e => setRole(u.id, e.target.value)}
                        >
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{u.created_at?.slice(0,10)}</td>
                    <td>
                      {u.id !== myProfile?.id && (
                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--red)' }} onClick={() => revoke(u.id)}>Revoke access</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop:28, padding:'16px 20px', background:'var(--parchment)', borderRadius:3, fontSize:13, color:'var(--muted)', lineHeight:1.7 }}>
        <strong style={{ color:'var(--ink)' }}>How to add staff:</strong> New staff members sign up at <code style={{ background:'var(--white)', padding:'1px 5px', borderRadius:2 }}>/admin/login</code> using their own email and a password they choose. Their account appears here as "pending" {'\u2014'} you approve it to grant access. Admins can approve others, change roles, and revoke access. Staff can manage artists, artworks, archive, sales, and certificates.
      </div>
    </div>
  )
}
