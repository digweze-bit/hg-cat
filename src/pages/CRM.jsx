import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'

export default function CRM() {
  const [interests, setInterests] = useState([])
  const [visits, setVisits] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('followups') // 'followups' | 'interests' | 'activity'

  useEffect(() => {
    async function load() {
      const [i, v, c] = await Promise.all([
        supabase.from('client_interests').select('*, clients(name, phone, phone_mobile, email)').order('follow_up_date', { ascending: true, nullsFirst: false }).then(r => r.data || []),
        supabase.from('client_visits').select('*, clients(name)').order('visit_date', { ascending: false }).limit(200).then(r => r.data || []),
        fetchAll('clients', { select:'id,name', order:'name' }),
      ])
      setInterests(i)
      setVisits(v)
      setClients(c)
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date().toISOString().split('T')[0]

  const followups = useMemo(() => {
    return interests.filter(i => i.status === 'active' && i.follow_up_date)
      .sort((a,b) => (a.follow_up_date||'').localeCompare(b.follow_up_date||''))
  }, [interests])

  const overdue = followups.filter(i => i.follow_up_date < today)
  const dueToday = followups.filter(i => i.follow_up_date === today)
  const upcoming = followups.filter(i => i.follow_up_date > today)

  const activeInterests = useMemo(() =>
    interests.filter(i => i.status === 'active').sort((a,b) => (b.created_at||'').localeCompare(a.created_at||'')),
    [interests])

  async function updateFollowUp(id, date) {
    await supabase.from('client_interests').update({ follow_up_date: date || null, updated_at: new Date().toISOString() }).eq('id', id)
    setInterests(prev => prev.map(i => i.id === id ? { ...i, follow_up_date: date || null } : i))
  }

  async function markFulfilled(id) {
    await supabase.from('client_interests').update({ status: 'fulfilled', updated_at: new Date().toISOString() }).eq('id', id)
    setInterests(prev => prev.map(i => i.id === id ? { ...i, status: 'fulfilled' } : i))
  }

  function whatsappClient(interest) {
    const phone = (interest.clients?.phone_mobile || interest.clients?.phone || '').replace(/\D/g, '')
    const msg = `Hi ${interest.clients?.name || ''}, following up on your interest in ${interest.artist_name}${interest.medium ? ' (' + interest.medium + ')' : ''} — do you have a moment to chat?`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">CRM</div>
        <div className="page-subtitle">
          {overdue.length > 0 && <span style={{ color:'var(--red,#c0392b)' }}>{overdue.length} overdue · </span>}
          {dueToday.length} due today · {activeInterests.length} active interests
        </div>
      </div>

      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--line)', marginBottom:20 }}>
        {[['followups','Follow-ups'],['interests','All interests'],['activity','Recent activity']].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding:'9px 20px', fontSize:13, cursor:'pointer', background:'none', border:'none',
                     borderBottom: tab===key ? '2px solid var(--ink)' : '2px solid transparent',
                     color: tab===key ? 'var(--ink)' : 'var(--muted)', fontFamily:'var(--font-sans)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* FOLLOW-UPS */}
      {tab === 'followups' && (
        <div>
          {overdue.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--red,#c0392b)', marginBottom:10, fontWeight:600 }}>
                Overdue ({overdue.length})
              </div>
              <div className="card">
                {overdue.map(i => (
                  <FollowUpRow key={i.id} interest={i} overdue onWhatsapp={() => whatsappClient(i)} onFulfilled={() => markFulfilled(i.id)} onDateChange={(d) => updateFollowUp(i.id, d)} />
                ))}
              </div>
            </div>
          )}
          {dueToday.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--amber,#b8862a)', marginBottom:10, fontWeight:600 }}>
                Due today ({dueToday.length})
              </div>
              <div className="card">
                {dueToday.map(i => (
                  <FollowUpRow key={i.id} interest={i} onWhatsapp={() => whatsappClient(i)} onFulfilled={() => markFulfilled(i.id)} onDateChange={(d) => updateFollowUp(i.id, d)} />
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:10 }}>
              Upcoming ({upcoming.length})
            </div>
            <div className="card">
              {upcoming.length === 0
                ? <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No upcoming follow-ups scheduled</div>
                : upcoming.map(i => (
                  <FollowUpRow key={i.id} interest={i} onWhatsapp={() => whatsappClient(i)} onFulfilled={() => markFulfilled(i.id)} onDateChange={(d) => updateFollowUp(i.id, d)} />
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ALL INTERESTS */}
      {tab === 'interests' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Client</th><th>Artist</th><th>Medium</th><th>Budget</th><th>Follow-up</th><th>Status</th></tr>
              </thead>
              <tbody>
                {activeInterests.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No active interests</td></tr>
                  : activeInterests.map(i => (
                    <tr key={i.id}>
                      <td style={{ fontWeight:500 }}>{i.clients?.name || '—'}</td>
                      <td>{i.artist_name}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{i.medium || '—'}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{i.budget_range || '—'}</td>
                      <td style={{ fontSize:12, color: i.follow_up_date && i.follow_up_date < today ? 'var(--red)' : 'var(--muted)' }}>{i.follow_up_date || '—'}</td>
                      <td><span className="badge">{i.status}</span></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECENT ACTIVITY */}
      {tab === 'activity' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Client</th><th>Type</th><th>Staff</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {visits.length === 0
                  ? <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--muted)', padding:32 }}>No activity logged yet</td></tr>
                  : visits.map(v => (
                    <tr key={v.id}>
                      <td style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>{v.visit_date}</td>
                      <td style={{ fontWeight:500 }}>{v.clients?.name || '—'}</td>
                      <td style={{ fontSize:12, textTransform:'capitalize' }}>{v.visit_type}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{v.staff_name || '—'}</td>
                      <td style={{ fontSize:12, color:'var(--muted)' }}>{v.notes || '—'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FollowUpRow({ interest, overdue, onWhatsapp, onFulfilled, onDateChange }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid var(--line-soft)' }}>
      <div>
        <div style={{ fontWeight:500, fontSize:13 }}>{interest.clients?.name || 'Unknown client'}</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>{interest.artist_name}{interest.medium ? ` · ${interest.medium}` : ''}{interest.budget_range ? ` · ${interest.budget_range}` : ''}</div>
        {interest.notes && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{interest.notes}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input type="date" className="form-input" style={{ width:140, fontSize:11, padding:'4px 8px' }}
          value={interest.follow_up_date || ''} onChange={e => onDateChange(e.target.value)} />
        <button className="btn btn-outline btn-sm" style={{ background:'#25D366', color:'#fff', border:'none' }} onClick={onWhatsapp}>WhatsApp</button>
        <button className="btn btn-ghost btn-sm" onClick={onFulfilled}>Mark fulfilled</button>
      </div>
    </div>
  )
}
