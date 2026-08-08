import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, fetchAll } from '../lib/supabase'

const VISIT_TYPES = ['in-person', 'call', 'email', 'whatsapp', 'event', 'other']

export default function CRM() {
  const [clients, setClients] = useState([])
  const [prospects, setProspects] = useState([])
  const [visits, setVisits] = useState([])
  const [interests, setInterests] = useState([])
  const [invoices, setInvoices] = useState([])
  const [artworks, setArtworks] = useState([])
  const [artists, setArtists] = useState([])
  const [loading, setLoading] = useState(true)

  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [activeClient, setActiveClient] = useState(null) // for timeline
  const [matchResults, setMatchResults] = useState([])
  const [saving, setSaving] = useState(false)

  const [visitForm, setVisitForm] = useState({ who:'', whoType:'client', visit_type:'in-person', visit_date:new Date().toISOString().split('T')[0], staff_name:'', notes:'' })
  const [interestForm, setInterestForm] = useState({ who:'', whoType:'client', artist_name:'', medium:'', budget_range:'', follow_up_date:'', notes:'' })
  const [prospectForm, setProspectForm] = useState({ name:'', email:'', phone:'', company:'', source:'', notes:'' })
  const [matchSearch, setMatchSearch] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const location = useLocation()

  useEffect(() => { load() }, [])

  // Handle voice commands
  useEffect(() => {
    const vc = location.state?.voiceCommand
    if (!vc) return
    window.history.replaceState({}, '')
    if (vc.type === 'visit') {
      const who = vc.client?.id || vc.prospect?.id || ''
      const whoType = vc.client ? 'client' : vc.prospect ? 'prospect' : 'client'
      setVisitForm(f => ({...f, who, whoType}))
      setModal('visit')
    }
    if (vc.type === 'interest') {
      const who = vc.client?.id || vc.prospect?.id || ''
      const whoType = vc.client ? 'client' : vc.prospect ? 'prospect' : 'client'
      setInterestForm(f => ({...f, who, whoType, artist_name: vc.artist?.name || '', medium: vc.medium || ''}))
      setModal('interest')
    }
    if (vc.type === 'new-prospect') {
      setProspectForm(f => ({...f, name: vc.name || '', phone: vc.phone || '', company: vc.company || ''}))
      setModal('prospect')
    }
  }, [location.state])

  async function load() {
    const [c, p, v, i, inv, aw, ar] = await Promise.all([
      fetchAll('clients', { select:'id,name,email,phone,phone_mobile,company,tags,notes,created_at', order:'name' }),
      supabase.from('prospects').select('*').neq('status','converted').order('created_at',{ascending:false}).then(r=>r.data||[]),
      supabase.from('client_visits').select('*, clients(name), prospects(name)').order('visit_date',{ascending:false}).limit(500).then(r=>r.data||[]),
      supabase.from('client_interests').select('*, clients(name, phone, phone_mobile), prospects(name, phone)').order('created_at',{ascending:false}).then(r=>r.data||[]),
      supabase.from('invoices').select('id,invoice_number,client_id,total,currency,status,issue_date,amount_paid,balance_due').order('issue_date',{ascending:false}).limit(500).then(r=>r.data||[]),
      supabase.from('artworks').select('id,title,artist_id,medium,price,tags,availability').eq('availability','Available').limit(500).then(r=>r.data||[]),
      supabase.from('artists').select('id,name').order('name').then(r=>r.data||[]),
    ])
    setClients(c); setProspects(p); setVisits(v); setInterests(i)
    setInvoices(inv); setArtworks(aw); setArtists(ar)
    setLoading(false)
  }

  const artistMap = useMemo(() => {
    const m = {}; artists.forEach(a => { m[a.id] = a.name }); return m
  }, [artists])

  // ── Engagement scoring ──
  const engagementScores = useMemo(() => {
    const scores = {}
    const now = Date.now()
    const dayMs = 86400000

    clients.forEach(c => {
      let score = 0
      // Recent visits (last 6 months = high, last year = medium)
      const cVisits = visits.filter(v => v.client_id === c.id)
      cVisits.forEach(v => {
        const age = (now - new Date(v.visit_date).getTime()) / dayMs
        if (age < 30) score += 20
        else if (age < 90) score += 12
        else if (age < 180) score += 6
        else if (age < 365) score += 2
      })
      // Active interests
      const cInterests = interests.filter(i => i.client_id === c.id && i.status === 'active')
      score += cInterests.length * 10
      // Purchases
      const cInvoices = invoices.filter(i => i.client_id === c.id)
      score += cInvoices.length * 8
      const totalSpend = cInvoices.reduce((s, i) => s + Number(i.total || 0), 0)
      if (totalSpend > 10000000) score += 20
      else if (totalSpend > 5000000) score += 12
      else if (totalSpend > 1000000) score += 6
      // Recency bonus
      const lastVisit = cVisits[0]?.visit_date
      if (lastVisit) {
        const daysAgo = (now - new Date(lastVisit).getTime()) / dayMs
        if (daysAgo > 180) score -= 10
      } else {
        score -= 5
      }

      scores[c.id] = {
        score: Math.max(0, Math.min(100, score)),
        visits: cVisits.length,
        interests: cInterests.length,
        purchases: cInvoices.length,
        totalSpend,
        lastVisit: cVisits[0]?.visit_date || null,
        daysSinceVisit: cVisits[0] ? Math.round((now - new Date(cVisits[0].visit_date).getTime()) / dayMs) : null,
      }
    })
    return scores
  }, [clients, visits, interests, invoices])

  // ── Unified feed ──
  const feed = useMemo(() => {
    const items = []
    visits.forEach(v => items.push({
      kind: 'visit', id: 'v-' + v.id, rawId: v.id, date: v.visit_date,
      who: v.clients?.name || v.prospects?.name || 'Unknown',
      whoId: v.client_id, whoType: v.client_id ? 'client' : 'prospect',
      title: v.visit_type, detail: v.notes, staff: v.staff_name,
    }))
    interests.forEach(i => items.push({
      kind: 'interest', id: 'i-' + i.id, rawId: i.id, date: i.created_at?.slice(0,10),
      who: i.clients?.name || i.prospects?.name || 'Unknown',
      whoId: i.client_id, whoType: i.client_id ? 'client' : 'prospect',
      title: i.artist_name,
      detail: [i.medium, i.budget_range, i.notes].filter(Boolean).join(' · '),
      followUp: i.follow_up_date, status: i.status,
      phone: i.clients?.phone_mobile || i.clients?.phone || i.prospects?.phone,
      artist_name: i.artist_name,
    }))
    prospects.forEach(p => items.push({
      kind: 'prospect', id: 'p-' + p.id, rawId: p.id, date: p.created_at?.slice(0,10),
      who: p.name, whoType: 'prospect',
      title: 'New prospect',
      detail: [p.company, p.source, p.notes].filter(Boolean).join(' · '),
      prospect: p,
    }))
    return items.sort((a,b) => (b.date||'').localeCompare(a.date||''))
  }, [visits, interests, prospects])

  // ── Follow-up reminders ──
  const overdueFollowUps = useMemo(() =>
    interests.filter(i => i.follow_up_date && i.follow_up_date < today && i.status === 'active')
      .sort((a,b) => a.follow_up_date.localeCompare(b.follow_up_date)), [interests, today])
  const todayFollowUps = useMemo(() =>
    interests.filter(i => i.follow_up_date === today && i.status === 'active'), [interests, today])
  const upcomingFollowUps = useMemo(() =>
    interests.filter(i => i.follow_up_date && i.follow_up_date > today && i.follow_up_date <= new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0] && i.status === 'active')
      .sort((a,b) => a.follow_up_date.localeCompare(b.follow_up_date)), [interests, today])

  const filtered = useMemo(() => {
    let list = feed
    if (filter === 'followups') list = list.filter(x => x.kind==='interest' && x.followUp && x.status==='active')
    if (filter === 'overdue') list = list.filter(x => x.kind==='interest' && x.followUp && x.followUp < today && x.status==='active')
    if (filter === 'visits') list = list.filter(x => x.kind==='visit')
    if (filter === 'interests') list = list.filter(x => x.kind==='interest')
    if (filter === 'prospects') list = list.filter(x => x.whoType==='prospect')
    if (filter === 'cold') list = feed.filter(x => x.whoType==='client' && engagementScores[x.whoId]?.daysSinceVisit > 180)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(x => x.who?.toLowerCase().includes(q) || x.title?.toLowerCase().includes(q) || x.detail?.toLowerCase().includes(q))
    }
    return list
  }, [feed, filter, search, today, engagementScores])

  const counts = useMemo(() => ({
    all: feed.length,
    overdue: overdueFollowUps.length,
    followups: interests.filter(i => i.followUp || i.follow_up_date && i.status === 'active').length,
    prospects: prospects.length,
    cold: clients.filter(c => engagementScores[c.id]?.daysSinceVisit > 180).length,
  }), [feed, overdueFollowUps, interests, prospects, clients, engagementScores])

  // ── Client timeline ──
  const timeline = useMemo(() => {
    if (!activeClient) return []
    const items = []
    visits.filter(v => v.client_id === activeClient.id).forEach(v =>
      items.push({ kind:'visit', date:v.visit_date, title:v.visit_type, detail:v.notes, staff:v.staff_name }))
    interests.filter(i => i.client_id === activeClient.id).forEach(i =>
      items.push({ kind:'interest', date:i.created_at?.slice(0,10), title:i.artist_name, detail:[i.medium,i.budget_range,i.notes].filter(Boolean).join(' · '), followUp:i.follow_up_date, status:i.status }))
    invoices.filter(i => i.client_id === activeClient.id).forEach(i =>
      items.push({ kind:'invoice', date:i.issue_date, title:i.invoice_number, detail:`${i.currency} ${Number(i.total||0).toLocaleString()} · ${i.status}`, status:i.status }))
    return items.sort((a,b) => (b.date||'').localeCompare(a.date||''))
  }, [activeClient, visits, interests, invoices])

  // ── Client matching ──
  function findMatches(artworkId) {
    const aw = artworks.find(w => w.id === artworkId)
    if (!aw) return
    const artistName = artistMap[aw.artist_id] || ''
    const awTags = (aw.tags || []).map(t => t.toLowerCase())
    const awMedium = (aw.medium || '').toLowerCase()

    const scored = clients.map(c => {
      let score = 0
      const cTags = (c.tags || []).map(t => t.toLowerCase())
      // Tag overlap
      const tagOverlap = cTags.filter(t => awTags.includes(t)).length
      score += tagOverlap * 15
      // Artist interest match
      const cInterests = interests.filter(i => i.client_id === c.id && i.status === 'active')
      if (cInterests.some(i => i.artist_name?.toLowerCase() === artistName.toLowerCase())) score += 30
      // Medium match
      if (cInterests.some(i => i.medium?.toLowerCase() === awMedium)) score += 10
      // Previous purchases of same artist
      const cInvs = invoices.filter(i => i.client_id === c.id)
      if (cInvs.length > 0) score += 5
      // Engagement bonus
      score += Math.round((engagementScores[c.id]?.score || 0) / 5)

      return { client: c, score, tagOverlap, hasArtistInterest: cInterests.some(i => i.artist_name?.toLowerCase() === artistName.toLowerCase()) }
    }).filter(m => m.score > 0).sort((a,b) => b.score - a.score).slice(0, 10)

    setMatchResults(scored)
    setModal('matches')
  }

  // ── Actions ──
  async function saveVisit() {
    if (!visitForm.who) return alert('Select who this visit is with')
    setSaving(true)
    try {
      await supabase.from('client_visits').insert({
        visit_type: visitForm.visit_type, visit_date: visitForm.visit_date,
        staff_name: visitForm.staff_name || null, notes: visitForm.notes || null,
        [visitForm.whoType === 'client' ? 'client_id' : 'prospect_id']: visitForm.who,
      })
      await load(); setModal(null)
      setVisitForm({ who:'', whoType:'client', visit_type:'in-person', visit_date:today, staff_name:'', notes:'' })
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function saveInterest() {
    if (!interestForm.who) return alert('Select who')
    if (!interestForm.artist_name) return alert('Enter an artist name')
    setSaving(true)
    try {
      await supabase.from('client_interests').insert({
        artist_name: interestForm.artist_name, medium: interestForm.medium || null,
        budget_range: interestForm.budget_range || null, follow_up_date: interestForm.follow_up_date || null,
        notes: interestForm.notes || null,
        [interestForm.whoType === 'client' ? 'client_id' : 'prospect_id']: interestForm.who,
      })
      await load(); setModal(null)
      setInterestForm({ who:'', whoType:'client', artist_name:'', medium:'', budget_range:'', follow_up_date:'', notes:'' })
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function saveProspect() {
    if (!prospectForm.name) return alert('Enter a name')
    setSaving(true)
    try {
      await supabase.from('prospects').insert(prospectForm)
      await load(); setModal(null)
      setProspectForm({ name:'', email:'', phone:'', company:'', source:'', notes:'' })
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function convertProspect(p) {
    if (!confirm(`Convert ${p.name} to a client?`)) return
    setSaving(true)
    try {
      const { data: nc, error } = await supabase.from('clients').insert({
        name: p.name, email: p.email || null, phone: p.phone || null, phone_mobile: p.phone || null,
        company: p.company || null, notes: [p.notes, p.source ? 'Source: ' + p.source : null].filter(Boolean).join('\n') || null,
        tags: p.tags || [],
      }).select('id').single()
      if (error) throw error
      await supabase.from('client_visits').update({ client_id: nc.id }).eq('prospect_id', p.id)
      await supabase.from('client_interests').update({ client_id: nc.id }).eq('prospect_id', p.id)
      await supabase.from('prospects').update({ status:'converted', converted_client_id: nc.id, updated_at: new Date().toISOString() }).eq('id', p.id)
      await load(); alert(`${p.name} is now a client.`)
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function updateFollowUp(id, date) {
    await supabase.from('client_interests').update({ follow_up_date: date || null }).eq('id', id)
    setInterests(prev => prev.map(i => i.id===id ? {...i, follow_up_date: date||null} : i))
  }
  async function markFulfilled(id) {
    await supabase.from('client_interests').update({ status:'fulfilled' }).eq('id', id)
    setInterests(prev => prev.map(i => i.id===id ? {...i, status:'fulfilled'} : i))
  }
  async function deleteItem(item) {
    if (!confirm('Delete this record?')) return
    const table = item.kind === 'visit' ? 'client_visits' : item.kind === 'interest' ? 'client_interests' : 'prospects'
    await supabase.from(table).delete().eq('id', item.rawId)
    await load()
  }
  function whatsapp(phone, name, artistName) {
    const p = (phone || '').replace(/\D/g,'')
    const msg = `Hi ${name}, following up on your interest in ${artistName || 'our gallery'} — do you have a moment to chat?`
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank')
  }
  function shareArtwork(phone, name, artworkTitle, artworkId) {
    const p = (phone || '').replace(/\D/g,'')
    const url = `${window.location.origin}/artwork/${artworkId}`
    const msg = `Hi ${name}, I thought you might be interested in "${artworkTitle}" — ${url}`
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  const CHIPS = [
    ['all', `All (${counts.all})`],
    ['overdue', `Overdue (${counts.overdue})`],
    ['followups', `Follow-ups`],
    ['visits', 'Visits'],
    ['interests', 'Interests'],
    ['prospects', `Prospects (${counts.prospects})`],
    ['cold', `Cold (${counts.cold})`],
  ]

  const engLabel = (s) => s >= 60 ? 'Hot' : s >= 30 ? 'Warm' : s > 0 ? 'Cool' : 'Cold'
  const engColor = (s) => s >= 60 ? '#2d6a4f' : s >= 30 ? '#b8862a' : s > 0 ? '#6b6760' : '#c0392b'

  return (
    <div style={{ display:'grid', gridTemplateColumns: activeClient ? '1fr 360px' : '1fr', gap:0, minHeight:'calc(100vh - 120px)' }}>
      <div style={{ padding: activeClient ? '0 20px 0 0' : 0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div className="page-title">CRM</div>
            <div className="page-subtitle">
              {counts.overdue > 0 && <span style={{ color:'var(--red,#c0392b)' }}>{counts.overdue} overdue · </span>}
              {counts.prospects} prospects · {clients.length} clients
              {counts.cold > 0 && <span style={{ color:'#c0392b' }}> · {counts.cold} cold</span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setModal('prospect')}>+ Prospect</button>
            <button className="btn btn-outline btn-sm" onClick={() => setModal('visit')}>+ Log visit</button>
            <button className="btn btn-outline btn-sm" onClick={() => { setMatchSearch(''); setModal('match-artwork') }}>Match clients</button>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('interest')}>+ Interest</button>
          </div>
        </div>

        {/* ── Follow-up reminders banner ── */}
        {(overdueFollowUps.length > 0 || todayFollowUps.length > 0 || upcomingFollowUps.length > 0) && (
          <div style={{ marginBottom:16, border:'1px solid #f0c040', borderLeft:'4px solid #b8862a', borderRadius:'0 4px 4px 0', background:'#fef9ec', padding:'12px 16px' }}>
            <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'#92600a', fontWeight:600, marginBottom:8 }}>Follow-up reminders</div>
            {overdueFollowUps.map(i => (
              <div key={i.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 0', fontSize:12 }}>
                <span style={{ color:'#c0392b', fontWeight:600, width:60 }}>{i.follow_up_date}</span>
                <span style={{ fontWeight:500 }}>{i.clients?.name || i.prospects?.name}</span>
                <span style={{ color:'var(--muted)' }}>{i.artist_name}</span>
                <span style={{ color:'#c0392b', fontSize:10, fontWeight:600 }}>OVERDUE</span>
                {(i.clients?.phone_mobile || i.clients?.phone || i.prospects?.phone) && (
                  <button onClick={() => whatsapp(i.clients?.phone_mobile||i.clients?.phone||i.prospects?.phone, i.clients?.name||i.prospects?.name, i.artist_name)}
                    style={{ background:'#25D366', color:'#fff', border:'none', borderRadius:3, padding:'2px 8px', fontSize:10, cursor:'pointer', marginLeft:'auto' }}>WhatsApp</button>
                )}
                <button onClick={() => markFulfilled(i.id)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:10 }}>Done</button>
              </div>
            ))}
            {todayFollowUps.map(i => (
              <div key={i.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 0', fontSize:12 }}>
                <span style={{ color:'#b8862a', fontWeight:600, width:60 }}>TODAY</span>
                <span style={{ fontWeight:500 }}>{i.clients?.name || i.prospects?.name}</span>
                <span style={{ color:'var(--muted)' }}>{i.artist_name}</span>
                {(i.clients?.phone_mobile || i.clients?.phone) && (
                  <button onClick={() => whatsapp(i.clients?.phone_mobile||i.clients?.phone, i.clients?.name, i.artist_name)}
                    style={{ background:'#25D366', color:'#fff', border:'none', borderRadius:3, padding:'2px 8px', fontSize:10, cursor:'pointer', marginLeft:'auto' }}>WhatsApp</button>
                )}
                <button onClick={() => markFulfilled(i.id)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:10 }}>Done</button>
              </div>
            ))}
            {upcomingFollowUps.length > 0 && (
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{upcomingFollowUps.length} more follow-up{upcomingFollowUps.length>1?'s':''} this week</div>
            )}
          </div>
        )}

        {/* Filter chips */}
        <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          {CHIPS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{ padding:'5px 12px', fontSize:11, borderRadius:14, cursor:'pointer', fontFamily:'inherit',
                border: filter===key ? '1px solid var(--ink)' : '1px solid var(--line)',
                background: filter===key ? 'var(--ink)' : 'transparent',
                color: filter===key ? '#fff' : 'var(--muted)' }}>
              {label}
            </button>
          ))}
          <input className="form-input" style={{ width:180, marginLeft:'auto', fontSize:12 }} placeholder="Search..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Feed */}
        <div className="card">
          {filtered.length === 0 && <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Nothing to show</div>}
          {filtered.map(item => {
            const isOverdue = item.followUp && item.followUp < today && item.status === 'active'
            const eng = item.whoType === 'client' && item.whoId ? engagementScores[item.whoId] : null
            return (
              <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'10px 14px', borderBottom:'1px solid var(--line-soft)' }}>
                <div style={{ display:'flex', gap:10, flex:1 }}>
                  <div style={{ width:60, flexShrink:0 }}>
                    <span style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'.06em', padding:'2px 6px', borderRadius:2, fontWeight:600,
                      background: item.kind==='visit' ? '#eef3f8' : item.kind==='interest' ? '#fef9ec' : '#f0f7f0',
                      color: item.kind==='visit' ? '#3a6a9a' : item.kind==='interest' ? '#b8862a' : '#2d6a4f' }}>
                      {item.kind}
                    </span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>
                      <span style={{ cursor: item.whoType==='client' ? 'pointer' : 'default', textDecoration: item.whoType==='client' ? 'underline dotted' : 'none' }}
                        onClick={() => item.whoType==='client' && setActiveClient(clients.find(c=>c.id===item.whoId))}>
                        {item.who}
                      </span>
                      {item.whoType === 'prospect' && <span style={{ fontSize:10, color:'var(--muted)', marginLeft:6 }}>prospect</span>}
                      {eng && <span style={{ fontSize:9, marginLeft:8, padding:'1px 5px', borderRadius:8, background: engColor(eng.score) + '18', color: engColor(eng.score), fontWeight:600 }}>{engLabel(eng.score)}</span>}
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)', textTransform: item.kind==='visit' ? 'capitalize' : 'none' }}>
                      {item.title}{item.staff ? ` · ${item.staff}` : ''}
                    </div>
                    {item.detail && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{item.detail}</div>}
                    {item.followUp && (
                      <div style={{ fontSize:11, marginTop:3, fontWeight:500, color: isOverdue ? '#c0392b' : '#b8862a' }}>
                        Follow up: {item.followUp}{isOverdue ? ' — overdue' : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{item.date}</span>
                  {item.kind === 'interest' && item.status === 'active' && (
                    <>
                      <input type="date" className="form-input" style={{ width:120, fontSize:10, padding:'2px 5px' }}
                        value={item.followUp || ''} onChange={e => updateFollowUp(item.rawId, e.target.value)} />
                      {item.phone && <button style={{ background:'#25D366', color:'#fff', border:'none', borderRadius:3, padding:'2px 8px', fontSize:10, cursor:'pointer' }}
                        onClick={() => whatsapp(item.phone, item.who, item.artist_name)}>WA</button>}
                      <button className="btn btn-ghost btn-sm" style={{ fontSize:10 }} onClick={() => markFulfilled(item.rawId)}>Done</button>
                    </>
                  )}
                  {item.kind === 'prospect' && <button className="btn btn-outline btn-sm" style={{ fontSize:10 }} onClick={() => convertProspect(item.prospect)} disabled={saving}>Convert</button>}
                  <button onClick={() => deleteItem(item)} style={{ background:'none', border:'none', cursor:'pointer', color:'#c0392b', fontSize:10 }}>Del</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── CLIENT TIMELINE PANEL ── */}
      {activeClient && (
        <div style={{ borderLeft:'1px solid var(--line)', paddingLeft:20, overflowY:'auto', maxHeight:'calc(100vh - 120px)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:15 }}>{activeClient.name}</div>
              {activeClient.company && <div style={{ fontSize:12, color:'var(--muted)' }}>{activeClient.company}</div>}
              {activeClient.email && <div style={{ fontSize:11, color:'var(--muted)' }}>{activeClient.email}</div>}
            </div>
            <button onClick={() => setActiveClient(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'var(--muted)' }}>&times;</button>
          </div>

          {/* Engagement score */}
          {engagementScores[activeClient.id] && (() => {
            const e = engagementScores[activeClient.id]
            return (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'var(--line)', borderRadius:4, overflow:'hidden', marginBottom:14 }}>
                <div style={{ background:'var(--white)', padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:600, color:engColor(e.score) }}>{e.score}</div>
                  <div style={{ fontSize:9, textTransform:'uppercase', color:'var(--muted)', letterSpacing:'.06em' }}>Score</div>
                </div>
                <div style={{ background:'var(--white)', padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:600 }}>{e.purchases}</div>
                  <div style={{ fontSize:9, textTransform:'uppercase', color:'var(--muted)', letterSpacing:'.06em' }}>Purchases</div>
                </div>
                <div style={{ background:'var(--white)', padding:'8px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:600 }}>{e.visits}</div>
                  <div style={{ fontSize:9, textTransform:'uppercase', color:'var(--muted)', letterSpacing:'.06em' }}>Visits</div>
                </div>
              </div>
            )
          })()}

          {/* Quick actions */}
          <div style={{ display:'flex', gap:6, marginBottom:14 }}>
            {(activeClient.phone_mobile || activeClient.phone) && (
              <button onClick={() => whatsapp(activeClient.phone_mobile||activeClient.phone, activeClient.name, '')}
                style={{ background:'#25D366', color:'#fff', border:'none', borderRadius:3, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>WhatsApp</button>
            )}
            <button className="btn btn-outline btn-sm" style={{ fontSize:11 }}
              onClick={() => { setVisitForm(f => ({...f, who:activeClient.id, whoType:'client'})); setModal('visit') }}>
              Log visit
            </button>
            <button className="btn btn-outline btn-sm" style={{ fontSize:11 }}
              onClick={() => { setInterestForm(f => ({...f, who:activeClient.id, whoType:'client'})); setModal('interest') }}>
              + Interest
            </button>
          </div>

          {/* Tags */}
          {(activeClient.tags || []).length > 0 && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 }}>
              {activeClient.tags.map(t => <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'var(--parchment)', color:'var(--muted)' }}>{t}</span>)}
            </div>
          )}

          {/* Timeline */}
          <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:8 }}>Timeline ({timeline.length})</div>
          {timeline.length === 0 && <div style={{ fontSize:12, color:'var(--muted)' }}>No activity recorded yet</div>}
          {timeline.map((t, i) => (
            <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--line-soft)' }}>
              <div style={{ width:50, flexShrink:0 }}>
                <span style={{ fontSize:9, padding:'2px 5px', borderRadius:2, fontWeight:600,
                  background: t.kind==='visit' ? '#eef3f8' : t.kind==='interest' ? '#fef9ec' : '#e8f5e9',
                  color: t.kind==='visit' ? '#3a6a9a' : t.kind==='interest' ? '#b8862a' : '#2d6a4f' }}>
                  {t.kind === 'invoice' ? 'sale' : t.kind}
                </span>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500 }}>{t.title}</div>
                {t.detail && <div style={{ fontSize:11, color:'var(--muted)' }}>{t.detail}</div>}
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{t.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── VISIT MODAL ── */}
      {modal === 'visit' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">Log a visit</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <WhoPicker clients={clients} prospects={prospects} value={visitForm.who} type={visitForm.whoType}
                onChange={(who, whoType) => setVisitForm(f => ({...f, who, whoType}))} />
              <div className="form-row">
                <div className="form-group"><label className="form-label">Type</label>
                  <select className="form-select" value={visitForm.visit_type} onChange={e=>setVisitForm(f=>({...f,visit_type:e.target.value}))}>
                    {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Date</label>
                  <input className="form-input" type="date" value={visitForm.visit_date} onChange={e=>setVisitForm(f=>({...f,visit_date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group"><label className="form-label">Staff member</label><input className="form-input" value={visitForm.staff_name} onChange={e=>setVisitForm(f=>({...f,staff_name:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={3} value={visitForm.notes} onChange={e=>setVisitForm(f=>({...f,notes:e.target.value}))} placeholder="What was discussed, works shown, follow-up needed..." /></div>
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
            <div className="modal-header"><div className="modal-title">Record an interest</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <WhoPicker clients={clients} prospects={prospects} value={interestForm.who} type={interestForm.whoType}
                onChange={(who, whoType) => setInterestForm(f => ({...f, who, whoType}))} />
              <div className="form-row">
                <div className="form-group"><label className="form-label">Artist *</label><input className="form-input" value={interestForm.artist_name} onChange={e=>setInterestForm(f=>({...f,artist_name:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Medium</label><input className="form-input" value={interestForm.medium} onChange={e=>setInterestForm(f=>({...f,medium:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Budget range</label><input className="form-input" value={interestForm.budget_range} onChange={e=>setInterestForm(f=>({...f,budget_range:e.target.value}))} placeholder="e.g. 2m - 5m" /></div>
                <div className="form-group"><label className="form-label">Follow up by</label><input className="form-input" type="date" value={interestForm.follow_up_date} onChange={e=>setInterestForm(f=>({...f,follow_up_date:e.target.value}))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={interestForm.notes} onChange={e=>setInterestForm(f=>({...f,notes:e.target.value}))} /></div>
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
            <div className="modal-header"><div className="modal-title">Add prospect</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Prospects live only in the CRM until you convert them to a client.</div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={prospectForm.name} onChange={e=>setProspectForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Company</label><input className="form-input" value={prospectForm.company} onChange={e=>setProspectForm(f=>({...f,company:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={prospectForm.email} onChange={e=>setProspectForm(f=>({...f,email:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={prospectForm.phone} onChange={e=>setProspectForm(f=>({...f,phone:e.target.value}))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Source</label><input className="form-input" value={prospectForm.source} onChange={e=>setProspectForm(f=>({...f,source:e.target.value}))} placeholder="e.g. Walk-in, referral, art fair" /></div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows={2} value={prospectForm.notes} onChange={e=>setProspectForm(f=>({...f,notes:e.target.value}))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveProspect} disabled={saving}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MATCH ARTWORK MODAL ── */}
      {modal === 'match-artwork' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">Match clients to artwork</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Select an artwork to find clients who might be interested based on their tags, interests, and purchase history.</div>
              <input className="form-input" placeholder="Search artworks..." value={matchSearch} onChange={e=>setMatchSearch(e.target.value)} />
              <div style={{ maxHeight:300, overflowY:'auto', border:'1px solid var(--line)', borderRadius:3 }}>
                {artworks.filter(w => !matchSearch || w.title?.toLowerCase().includes(matchSearch.toLowerCase()) || (artistMap[w.artist_id]||'').toLowerCase().includes(matchSearch.toLowerCase()))
                  .slice(0,30).map(w => (
                  <div key={w.id} onClick={() => findMatches(w.id)}
                    style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', fontSize:13 }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--parchment)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ fontWeight:500 }}>{w.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{artistMap[w.artist_id]} · {w.medium}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MATCH RESULTS MODAL ── */}
      {modal === 'matches' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">Matching clients</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body">
              {matchResults.length === 0 && <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>No matching clients found. Try adding more tags to clients and artworks.</div>}
              {matchResults.map(m => (
                <div key={m.client.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--line-soft)' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:engColor(engagementScores[m.client.id]?.score||0)+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, color:engColor(engagementScores[m.client.id]?.score||0) }}>
                    {m.score}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>{m.client.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>
                      {m.hasArtistInterest && <span style={{ color:'#2d6a4f' }}>Active interest · </span>}
                      {m.tagOverlap > 0 && `${m.tagOverlap} tag match · `}
                      {engagementScores[m.client.id]?.purchases || 0} purchases
                    </div>
                  </div>
                  {(m.client.phone_mobile || m.client.phone) && (
                    <button onClick={() => shareArtwork(m.client.phone_mobile||m.client.phone, m.client.name, '', '')}
                      style={{ background:'#25D366', color:'#fff', border:'none', borderRadius:3, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>
                      Share via WA
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── WhoPicker subcomponent ──
function WhoPicker({ clients, prospects, value, type, onChange }) {
  const [search, setSearch] = useState('')
  const all = [
    ...clients.map(c => ({ id: c.id, name: c.name, type: 'client' })),
    ...prospects.map(p => ({ id: p.id, name: p.name, type: 'prospect' })),
  ]
  const selected = all.find(x => x.id === value)
  const filtered = search ? all.filter(x => x.name.toLowerCase().includes(search.toLowerCase())) : all

  if (selected) {
    return (
      <div className="form-group">
        <label className="form-label">Who</label>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ flex:1, padding:'8px 10px', border:'1px solid var(--line)', borderRadius:4, fontSize:13 }}>
            {selected.name} <span style={{ fontSize:10, color:'var(--muted)' }}>({selected.type})</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { onChange('', type); setSearch('') }}>&times;</button>
        </div>
      </div>
    )
  }

  return (
    <div className="form-group" style={{ position:'relative' }}>
      <label className="form-label">Who</label>
      <input className="form-input" placeholder="Search clients or prospects..."
        value={search} onChange={e => setSearch(e.target.value)} />
      {search && (
        <div style={{ position:'absolute', zIndex:50, top:'100%', left:0, right:0, background:'var(--white)', border:'1px solid var(--line)', borderTop:'none', borderRadius:'0 0 4px 4px', maxHeight:200, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,.08)' }}>
          {filtered.slice(0,10).map(x => (
            <div key={x.id+x.type} style={{ padding:'8px 12px', cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--line-soft)' }}
              onMouseDown={() => { onChange(x.id, x.type); setSearch('') }}>
              {x.name} <span style={{ fontSize:10, color:'var(--muted)' }}>({x.type})</span>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding:10, fontSize:12, color:'var(--muted)' }}>No results</div>}
        </div>
      )}
    </div>
  )
}
