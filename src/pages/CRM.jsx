import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'

const VISIT_TYPES = ['in-person', 'call', 'email', 'whatsapp', 'event', 'other']

export default function CRM() {
  const [clients, setClients] = useState([])
  const [prospects, setProspects] = useState([])
  const [visits, setVisits] = useState([])
  const [interests, setInterests] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filter, setFilter] = useState('all') // all | followups | overdue | visits | interests | prospects
  const [search, setSearch] = useState('')

  // Modals
  const [modal, setModal] = useState(null) // 'visit' | 'interest' | 'prospect' | 'convert'
  const [activeProspect, setActiveProspect] = useState(null)
  const [saving, setSaving] = useState(false)

  const [visitForm, setVisitForm] = useState({ who:'', whoType:'client', visit_type:'in-person', visit_date:new Date().toISOString().split('T')[0], staff_name:'', notes:'' })
  const [interestForm, setInterestForm] = useState({ who:'', whoType:'client', artist_name:'', medium:'', budget_range:'', follow_up_date:'', notes:'' })
  const [prospectForm, setProspectForm] = useState({ name:'', email:'', phone:'', company:'', source:'', notes:'' })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { load() }, [])

  async function load() {
    const [c, p, v, i] = await Promise.all([
      fetchAll('clients', { select:'id,name,email,phone,phone_mobile', order:'name' }),
      supabase.from('prospects').select('*').neq('status','converted').order('created_at',{ascending:false}).then(r=>r.data||[]),
      supabase.from('client_visits').select('*, clients(name), prospects(name)').order('visit_date',{ascending:false}).limit(300).then(r=>r.data||[]),
      supabase.from('client_interests').select('*, clients(name, phone, phone_mobile), prospects(name, phone)').order('created_at',{ascending:false}).then(r=>r.data||[]),
    ])
    setClients(c); setProspects(p); setVisits(v); setInterests(i)
    setLoading(false)
  }

  // Build unified activity feed
  const feed = useMemo(() => {
    const items = []

    visits.forEach(v => items.push({
      kind: 'visit',
      id: 'v-' + v.id,
      rawId: v.id,
      date: v.visit_date,
      who: v.clients?.name || v.prospects?.name || 'Unknown',
      whoType: v.client_id ? 'client' : 'prospect',
      title: v.visit_type,
      detail: v.notes,
      staff: v.staff_name,
    }))

    interests.forEach(i => items.push({
      kind: 'interest',
      id: 'i-' + i.id,
      rawId: i.id,
      date: i.created_at?.slice(0,10),
      who: i.clients?.name || i.prospects?.name || 'Unknown',
      whoType: i.client_id ? 'client' : 'prospect',
      title: i.artist_name,
      detail: [i.medium, i.budget_range, i.notes].filter(Boolean).join(' · '),
      followUp: i.follow_up_date,
      status: i.status,
      phone: i.clients?.phone_mobile || i.clients?.phone || i.prospects?.phone,
      artist_name: i.artist_name,
    }))

    prospects.forEach(p => items.push({
      kind: 'prospect',
      id: 'p-' + p.id,
      rawId: p.id,
      date: p.created_at?.slice(0,10),
      who: p.name,
      whoType: 'prospect',
      title: 'New prospect',
      detail: [p.company, p.source, p.notes].filter(Boolean).join(' · '),
      prospect: p,
    }))

    return items.sort((a,b) => (b.date||'').localeCompare(a.date||''))
  }, [visits, interests, prospects])

  const filtered = useMemo(() => {
    let list = feed
    if (filter === 'followups') list = list.filter(x => x.kind==='interest' && x.followUp && x.status==='active')
    if (filter === 'overdue')   list = list.filter(x => x.kind==='interest' && x.followUp && x.followUp < today && x.status==='active')
    if (filter === 'visits')    list = list.filter(x => x.kind==='visit')
    if (filter === 'interests') list = list.filter(x => x.kind==='interest')
    if (filter === 'prospects') list = list.filter(x => x.whoType==='prospect')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(x => x.who?.toLowerCase().includes(q) || x.title?.toLowerCase().includes(q) || x.detail?.toLowerCase().includes(q))
    }
    return list
  }, [feed, filter, search, today])

  const counts = useMemo(() => ({
    all: feed.length,
    overdue: feed.filter(x => x.kind==='interest' && x.followUp && x.followUp < today && x.status==='active').length,
    followups: feed.filter(x => x.kind==='interest' && x.followUp && x.status==='active').length,
    prospects: prospects.length,
  }), [feed, prospects, today])

  // ── Actions ──
  async function saveVisit() {
    if (!visitForm.who) return alert('Select who this visit is with')
    setSaving(true)
    try {
      const payload = {
        visit_type: visitForm.visit_type,
        visit_date: visitForm.visit_date,
        staff_name: visitForm.staff_name || null,
        notes: visitForm.notes || null,
        [visitForm.whoType === 'client' ? 'client_id' : 'prospect_id']: visitForm.who,
      }
      const { error } = await supabase.from('client_visits').insert(payload)
      if (error) throw error
      await load()
      setModal(null)
      setVisitForm({ who:'', whoType:'client', visit_type:'in-person', visit_date:today, staff_name:'', notes:'' })
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function saveInterest() {
    if (!interestForm.who) return alert('Select who this interest belongs to')
    if (!interestForm.artist_name) return alert('Enter an artist name')
    setSaving(true)
    try {
      const payload = {
        artist_name: interestForm.artist_name,
        medium: interestForm.medium || null,
        budget_range: interestForm.budget_range || null,
        follow_up_date: interestForm.follow_up_date || null,
        notes: interestForm.notes || null,
        [interestForm.whoType === 'client' ? 'client_id' : 'prospect_id']: interestForm.who,
      }
      const { error } = await supabase.from('client_interests').insert(payload)
      if (error) throw error
      await load()
      setModal(null)
      setInterestForm({ who:'', whoType:'client', artist_name:'', medium:'', budget_range:'', follow_up_date:'', notes:'' })
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function saveProspect() {
    if (!prospectForm.name) return alert('Enter a name')
    setSaving(true)
    try {
      const { error } = await supabase.from('prospects').insert(prospectForm)
      if (error) throw error
      await load()
      setModal(null)
      setProspectForm({ name:'', email:'', phone:'', company:'', source:'', notes:'' })
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function convertProspect(p) {
    if (!confirm(`Convert ${p.name} to a client? Their visit and interest history will be preserved.`)) return
    setSaving(true)
    try {
      const { data: newClient, error: cErr } = await supabase.from('clients').insert({
        name: p.name, email: p.email || null, phone: p.phone || null,
        phone_mobile: p.phone || null, company: p.company || null, notes: p.notes || null,
      }).select('id').single()
      if (cErr) throw cErr

      await supabase.from('client_visits').update({ client_id: newClient.id, prospect_id: null }).eq('prospect_id', p.id)
      await supabase.from('client_interests').update({ client_id: newClient.id, prospect_id: null }).eq('prospect_id', p.id)
      await supabase.from('prospects').update({ status:'converted', converted_client_id: newClient.id, updated_at: new Date().toISOString() }).eq('id', p.id)

      await load()
      alert(`${p.name} is now a client.`)
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function updateFollowUp(id, date) {
    await supabase.from('client_interests').update({ follow_up_date: date || null, updated_at:new Date().toISOString() }).eq('id', id)
    setInterests(prev => prev.map(i => i.id===id ? {...i, follow_up_date: date||null} : i))
  }

  async function markFulfilled(id) {
    await supabase.from('client_interests').update({ status:'fulfilled', updated_at:new Date().toISOString() }).eq('id', id)
    setInterests(prev => prev.map(i => i.id===id ? {...i, status:'fulfilled'} : i))
  }

  async function deleteItem(item) {
    if (!confirm('Delete this record?')) return
    const table = item.kind === 'visit' ? 'client_visits' : item.kind === 'interest' ? 'client_interests' : 'prospects'
    await supabase.from(table).delete().eq('id', item.rawId)
    await load()
  }

  function whatsapp(item) {
    const phone = (item.phone || '').replace(/\D/g,'')
    const msg = `Hi ${item.who}, following up on your interest in ${item.artist_name || ''} — do you have a moment to chat?`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  const CHIPS = [
    ['all', `All activity (${counts.all})`],
    ['overdue', `Overdue (${counts.overdue})`],
    ['followups', `Follow-ups (${counts.followups})`],
    ['visits', 'Visits'],
    ['interests', 'Interests'],
    ['prospects', `Prospects (${counts.prospects})`],
  ]

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">CRM</div>
          <div className="page-subtitle">
            {counts.overdue > 0 && <span style={{ color:'var(--red,#c0392b)' }}>{counts.overdue} overdue · </span>}
            {counts.prospects} prospects · {clients.length} clients
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline" onClick={() => setModal('prospect')}>+ Prospect</button>
          <button className="btn btn-outline" onClick={() => setModal('visit')}>+ Log visit</button>
          <button className="btn btn-primary" onClick={() => setModal('interest')}>+ Interest</button>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        {CHIPS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{ padding:'5px 12px', fontSize:12, borderRadius:14, cursor:'pointer', fontFamily:'inherit',
              border: filter===key ? '1px solid var(--ink)' : '1px solid var(--line)',
              background: filter===key ? 'var(--ink)' : 'transparent',
              color: filter===key ? '#fff' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
        <input className="form-input" style={{ width:200, marginLeft:'auto' }} placeholder="Search..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Unified feed */}
      <div className="card">
        {filtered.length === 0 && (
          <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Nothing to show</div>
        )}
        {filtered.map(item => {
          const isOverdue = item.followUp && item.followUp < today && item.status === 'active'
          return (
            <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'12px 16px', borderBottom:'1px solid var(--line-soft)' }}>
              <div style={{ display:'flex', gap:12, flex:1 }}>
                <div style={{ width:70, flexShrink:0 }}>
                  <span style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.07em', padding:'2px 6px', borderRadius:2, fontWeight:600,
                    background: item.kind==='visit' ? '#eef3f8' : item.kind==='interest' ? '#fef9ec' : '#f0f7f0',
                    color: item.kind==='visit' ? '#3a6a9a' : item.kind==='interest' ? '#b8862a' : '#2d6a4f' }}>
                    {item.kind}
                  </span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>
                    {item.who}
                    {item.whoType === 'prospect' && <span style={{ fontSize:10, color:'var(--muted)', marginLeft:6, fontWeight:400 }}>prospect</span>}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', textTransform: item.kind==='visit' ? 'capitalize' : 'none' }}>
                    {item.title}{item.staff ? ` · ${item.staff}` : ''}
                  </div>
                  {item.detail && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{item.detail}</div>}
                  {item.followUp && (
                    <div style={{ fontSize:11, marginTop:3, fontWeight:500, color: isOverdue ? 'var(--red,#c0392b)' : 'var(--amber,#b8862a)' }}>
                      Follow up: {item.followUp}{isOverdue ? ' — overdue' : ''}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <span style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>{item.date}</span>
                {item.kind === 'interest' && item.status === 'active' && (
                  <>
                    <input type="date" className="form-input" style={{ width:130, fontSize:11, padding:'3px 6px' }}
                      value={item.followUp || ''} onChange={e => updateFollowUp(item.rawId, e.target.value)} />
                    {item.phone && (
                      <button className="btn btn-sm" style={{ background:'#25D366', color:'#fff', border:'none' }} onClick={() => whatsapp(item)}>WhatsApp</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => markFulfilled(item.rawId)}>Fulfilled</button>
                  </>
                )}
                {item.kind === 'prospect' && (
                  <button className="btn btn-outline btn-sm" onClick={() => convertProspect(item.prospect)} disabled={saving}>Convert to client</button>
                )}
                <button onClick={() => deleteItem(item)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red,#c0392b)', fontSize:11 }}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── VISIT MODAL ── */}
      {modal === 'visit' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Log a visit</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <WhoPicker clients={clients} prospects={prospects} value={visitForm.who} type={visitForm.whoType}
                onChange={(who, whoType) => setVisitForm(f => ({...f, who, whoType}))} />
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={visitForm.visit_type} onChange={e=>setVisitForm(f=>({...f,visit_type:e.target.value}))}>
                    {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={visitForm.visit_date} onChange={e=>setVisitForm(f=>({...f,visit_date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Staff member</label>
                <input className="form-input" value={visitForm.staff_name} onChange={e=>setVisitForm(f=>({...f,staff_name:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={3} value={visitForm.notes} onChange={e=>setVisitForm(f=>({...f,notes:e.target.value}))}
                  placeholder="What was discussed, works shown, follow-up needed..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveVisit} disabled={saving}>{saving?'Saving...':'Save visit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── INTEREST MODAL ── */}
      {modal === 'interest' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Record an interest</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <WhoPicker clients={clients} prospects={prospects} value={interestForm.who} type={interestForm.whoType}
                onChange={(who, whoType) => setInterestForm(f => ({...f, who, whoType}))} />
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Artist *</label>
                  <input className="form-input" value={interestForm.artist_name} onChange={e=>setInterestForm(f=>({...f,artist_name:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Medium</label>
                  <input className="form-input" value={interestForm.medium} onChange={e=>setInterestForm(f=>({...f,medium:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Budget range</label>
                  <input className="form-input" value={interestForm.budget_range} onChange={e=>setInterestForm(f=>({...f,budget_range:e.target.value}))} placeholder="e.g. 2m - 5m" />
                </div>
                <div className="form-group">
                  <label className="form-label">Follow up by</label>
                  <input className="form-input" type="date" value={interestForm.follow_up_date} onChange={e=>setInterestForm(f=>({...f,follow_up_date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={interestForm.notes} onChange={e=>setInterestForm(f=>({...f,notes:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveInterest} disabled={saving}>{saving?'Saving...':'Save interest'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PROSPECT MODAL ── */}
      {modal === 'prospect' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Add prospect</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:12, color:'var(--muted)' }}>
                Prospects live only in the CRM. They stay out of Sales, invoicing, and reports until you convert them to a client.
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={prospectForm.name} onChange={e=>setProspectForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Company</label>
                  <input className="form-input" value={prospectForm.company} onChange={e=>setProspectForm(f=>({...f,company:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={prospectForm.email} onChange={e=>setProspectForm(f=>({...f,email:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={prospectForm.phone} onChange={e=>setProspectForm(f=>({...f,phone:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Source</label>
                <input className="form-input" value={prospectForm.source} onChange={e=>setProspectForm(f=>({...f,source:e.target.value}))} placeholder="e.g. Walk-in, referral, art fair" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={prospectForm.notes} onChange={e=>setProspectForm(f=>({...f,notes:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProspect} disabled={saving}>{saving?'Saving...':'Add prospect'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WhoPicker({ clients, prospects, value, type, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">Who *</label>
      <div style={{ display:'flex', gap:12, marginBottom:6 }}>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}>
          <input type="radio" checked={type==='client'} onChange={() => onChange('', 'client')} /> Client
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}>
          <input type="radio" checked={type==='prospect'} onChange={() => onChange('', 'prospect')} /> Prospect
        </label>
      </div>
      <select className="form-select" value={value} onChange={e => onChange(e.target.value, type)}>
        <option value="">— select —</option>
        {(type==='client' ? clients : prospects).map(x => (
          <option key={x.id} value={x.id}>{x.name}</option>
        ))}
      </select>
    </div>
  )
}
