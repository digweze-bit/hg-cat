import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Event notices: a message plus the list of clients/prospects it goes to.
// Each recipient carries a Sent and a Replied tickbox. WhatsApp opens a
// pre-filled chat (wa.me); staff tick Sent once they've pressed send.

const EMPTY_NOTICE = { title:'', event_date:'', message:'Hi {first_name}, ', notes:'' }

// wa.me needs the full international number with no '+', spaces or leading 0.
export function waNumber(phone) {
  let d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0')) d = '234' + d.slice(1)       // 0803… → 234803…
  else if (d.length === 10 && /^[789]/.test(d)) d = '234' + d             // 803… → 234803…
  return d
}

function fillMessage(template, notice, name) {
  const dateStr = notice.event_date
    ? new Date(notice.event_date + 'T00:00').toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : ''
  return (template || '')
    .replaceAll('{first_name}', (name || '').trim().split(/\s+/)[0] || '')
    .replaceAll('{name}', name || '')
    .replaceAll('{event}', notice.title || '')
    .replaceAll('{date}', dateStr)
}

const chip = (active) => ({
  padding:'5px 12px', fontSize:11, borderRadius:14, cursor:'pointer', fontFamily:'inherit',
  border: active ? '1px solid var(--ink)' : '1px solid var(--line)',
  background: active ? 'var(--ink)' : 'transparent',
  color: active ? '#fff' : 'var(--muted)',
})
const waBtn = { background:'#25D366', color:'#fff', border:'none', borderRadius:3, padding:'3px 10px', fontSize:11, cursor:'pointer' }

export default function CrmNotices({ clients, prospects }) {
  const [notices, setNotices] = useState([])
  const [counts, setCounts] = useState({})       // notice_id → { total, sent, replied }
  const [activeId, setActiveId] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)        // 'notice' | 'add'
  const [form, setForm] = useState(EMPTY_NOTICE)
  const [saving, setSaving] = useState(false)
  const [rFilter, setRFilter] = useState('all')
  const [rSearch, setRSearch] = useState('')

  const active = notices.find(n => n.id === activeId) || null

  useEffect(() => { loadNotices() }, [])
  useEffect(() => { if (activeId) loadRecipients(activeId); else setRecipients([]) }, [activeId])

  async function loadNotices() {
    const [{ data: n }, { data: r }] = await Promise.all([
      supabase.from('crm_notices').select('*').order('created_at', { ascending:false }),
      supabase.from('crm_notice_recipients').select('notice_id,sent,replied'),
    ])
    const c = {}
    ;(r || []).forEach(x => {
      const k = c[x.notice_id] = c[x.notice_id] || { total:0, sent:0, replied:0 }
      k.total++; if (x.sent) k.sent++; if (x.replied) k.replied++
    })
    setNotices(n || []); setCounts(c); setLoading(false)
  }

  async function loadRecipients(id) {
    const { data } = await supabase.from('crm_notice_recipients').select('*').eq('notice_id', id).order('name')
    setRecipients(data || [])
  }

  // Keep the sidebar counts in step with local edits.
  useEffect(() => {
    if (!activeId) return
    setCounts(c => ({ ...c, [activeId]: {
      total: recipients.length,
      sent: recipients.filter(r => r.sent).length,
      replied: recipients.filter(r => r.replied).length,
    }}))
  }, [recipients, activeId])

  // ── Notice CRUD ──
  function openNew() { setForm(EMPTY_NOTICE); setModal('notice') }
  function openEdit() {
    setForm({ id: active.id, title: active.title, event_date: active.event_date || '', message: active.message || '', notes: active.notes || '' })
    setModal('notice')
  }
  async function saveNotice() {
    if (!form.title.trim()) return alert('Give the notice a title')
    setSaving(true)
    try {
      const row = { title: form.title.trim(), event_date: form.event_date || null, message: form.message, notes: form.notes || null, updated_at: new Date().toISOString() }
      if (form.id) {
        const { error } = await supabase.from('crm_notices').update(row).eq('id', form.id)
        if (error) throw error
        setNotices(prev => prev.map(n => n.id === form.id ? { ...n, ...row } : n))
      } else {
        const { data, error } = await supabase.from('crm_notices').insert(row).select('*').single()
        if (error) throw error
        setNotices(prev => [data, ...prev]); setActiveId(data.id)
      }
      setModal(null)
    } catch (e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }
  async function deleteNotice() {
    if (!confirm(`Delete "${active.title}" and its list of ${recipients.length} recipients?`)) return
    const { error } = await supabase.from('crm_notices').delete().eq('id', active.id)
    if (error) return alert('Failed: ' + error.message)
    setNotices(prev => prev.filter(n => n.id !== active.id)); setActiveId(null)
  }
  async function duplicateNotice() {
    const title = prompt('Title for the copy', active.title + ' (copy)')
    if (!title) return
    const { data, error } = await supabase.from('crm_notices')
      .insert({ title, event_date: active.event_date, message: active.message, notes: active.notes }).select('*').single()
    if (error) return alert('Failed: ' + error.message)
    if (recipients.length) {
      const rows = recipients.map(r => ({ notice_id: data.id, client_id: r.client_id, prospect_id: r.prospect_id, name: r.name, phone: r.phone }))
      const { error: e2 } = await supabase.from('crm_notice_recipients').insert(rows)
      if (e2) alert('Notice copied, but the list failed: ' + e2.message)
    }
    await loadNotices(); setActiveId(data.id)
  }

  // ── Recipient updates ──
  async function patchRecipient(id, patch) {
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('crm_notice_recipients').update(patch).eq('id', id)
    if (error) { alert('Failed to save: ' + error.message); loadRecipients(activeId) }
  }
  const toggleSent = (r) => patchRecipient(r.id, { sent: !r.sent, sent_at: !r.sent ? new Date().toISOString() : null })
  const toggleReplied = (r) => patchRecipient(r.id, { replied: !r.replied, replied_at: !r.replied ? new Date().toISOString() : null })
  async function removeRecipient(r) {
    if (!confirm(`Remove ${r.name} from this list?`)) return
    setRecipients(prev => prev.filter(x => x.id !== r.id))
    await supabase.from('crm_notice_recipients').delete().eq('id', r.id)
  }

  function sendWhatsApp(r) {
    const num = waNumber(r.phone)
    if (!num) return alert(`${r.name} has no phone number`)
    // Open the window synchronously so the popup isn't blocked.
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(fillMessage(active.message, active, r.name))}`, '_blank')
    patchRecipient(r.id, { wa_opened_at: new Date().toISOString() })
  }

  const nextUnsent = recipients.find(r => !r.sent && !r.wa_opened_at && waNumber(r.phone))

  async function addRecipients(people) {
    if (!people.length) return setModal(null)
    setSaving(true)
    try {
      const rows = people.map(p => ({
        notice_id: activeId,
        client_id: p.type === 'client' ? p.id : null,
        prospect_id: p.type === 'prospect' ? p.id : null,
        name: p.name, phone: p.phone || null,
      }))
      const { error } = await supabase.from('crm_notice_recipients').insert(rows)
      if (error) throw error
      await loadRecipients(activeId); setModal(null)
    } catch (e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  function exportCsv() {
    const esc = v => `"${String(v ?? '').replaceAll('"', '""')}"`
    const lines = [['Name','Phone','Sent','Sent at','Replied','Replied at','Note'].map(esc).join(',')]
    recipients.forEach(r => lines.push([r.name, r.phone, r.sent ? 'Yes' : 'No', r.sent_at?.slice(0,16).replace('T',' '), r.replied ? 'Yes' : 'No', r.replied_at?.slice(0,16).replace('T',' '), r.note].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type:'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${active.title.replace(/[^\w-]+/g, '_')}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const shownRecipients = useMemo(() => {
    let list = recipients
    if (rFilter === 'unsent') list = list.filter(r => !r.sent)
    if (rFilter === 'sent') list = list.filter(r => r.sent)
    if (rFilter === 'replied') list = list.filter(r => r.replied)
    if (rFilter === 'noreply') list = list.filter(r => r.sent && !r.replied)
    if (rFilter === 'nophone') list = list.filter(r => !waNumber(r.phone))
    if (rSearch) { const q = rSearch.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(q) || (r.phone || '').includes(q)) }
    return list
  }, [recipients, rFilter, rSearch])

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  const stat = counts[activeId] || { total:0, sent:0, replied:0 }

  return (
    <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap' }}>
      {/* ── Notice list ── */}
      <div style={{ width:260, flexShrink:0, flexGrow: active ? 0 : 1, maxWidth:'100%' }}>
        <button className="btn btn-primary btn-sm" style={{ width:'100%', marginBottom:10 }} onClick={openNew}>+ New notice</button>
        <div className="card">
          {notices.length === 0 && <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No notices yet. Create one for your next event, then add the clients to invite.</div>}
          {notices.map(n => {
            const c = counts[n.id] || { total:0, sent:0, replied:0 }
            return (
              <div key={n.id} onClick={() => setActiveId(n.id)}
                style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid var(--line-soft)', background: n.id === activeId ? 'var(--parchment)' : 'transparent' }}>
                <div style={{ fontSize:13, fontWeight:500 }}>{n.title}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {n.event_date || 'No date'} · {c.sent}/{c.total} sent · {c.replied} replied
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Active notice ── */}
      {active && (
        <div style={{ flex:1, minWidth:300 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:17, fontWeight:600 }}>{active.title}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{active.event_date ? fillMessage('{date}', active, '') : 'No event date'}</div>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={openEdit}>Edit</button>
              <button className="btn btn-outline btn-sm" onClick={duplicateNotice}>Duplicate</button>
              <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!recipients.length}>Export CSV</button>
              <button className="btn btn-ghost btn-sm" style={{ color:'#c0392b' }} onClick={deleteNotice}>Delete</button>
            </div>
          </div>

          {/* Message preview */}
          <div style={{ border:'1px solid var(--line)', borderRadius:4, padding:'10px 12px', marginBottom:12, fontSize:12, whiteSpace:'pre-wrap', background:'var(--white)' }}>
            <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:6 }}>Message</div>
            {active.message || <span style={{ color:'var(--muted)' }}>No message yet — click Edit.</span>}
          </div>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:1, background:'var(--line)', borderRadius:4, overflow:'hidden', marginBottom:12 }}>
            {[['On list', stat.total, 'var(--ink)'], ['Sent', stat.sent, '#2d6a4f'], ['Replied', stat.replied, '#3a6a9a']].map(([l, v, col]) => (
              <div key={l} style={{ background:'var(--white)', padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:600, color:col }}>{v}</div>
                <div style={{ fontSize:9, textTransform:'uppercase', color:'var(--muted)', letterSpacing:'.06em' }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
            {[['all','All'],['unsent','Not sent'],['sent','Sent'],['noreply','No reply'],['replied','Replied'],['nophone','No phone']].map(([k, l]) => (
              <button key={k} style={chip(rFilter === k)} onClick={() => setRFilter(k)}>{l}</button>
            ))}
            <input className="form-input" style={{ width:150, fontSize:12 }} placeholder="Search list..." value={rSearch} onChange={e => setRSearch(e.target.value)} />
            <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
              {nextUnsent && <button style={waBtn} onClick={() => sendWhatsApp(nextUnsent)} title={`Open WhatsApp for ${nextUnsent.name}`}>Send next on WhatsApp</button>}
              <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}>+ Add people</button>
            </div>
          </div>

          {/* Recipient list */}
          <div className="card" style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ textAlign:'left', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em', color:'var(--muted)' }}>
                  <th style={{ padding:'8px 12px' }}>Name</th>
                  <th style={{ padding:'8px 6px' }}>Phone</th>
                  <th style={{ padding:'8px 6px' }}></th>
                  <th style={{ padding:'8px 6px', textAlign:'center' }}>Sent</th>
                  <th style={{ padding:'8px 6px', textAlign:'center' }}>Replied</th>
                  <th style={{ padding:'8px 6px' }}>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shownRecipients.length === 0 && (
                  <tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'var(--muted)' }}>
                    {recipients.length ? 'Nobody matches this filter' : 'No one on this list yet — click + Add people.'}
                  </td></tr>
                )}
                {shownRecipients.map(r => {
                  const hasPhone = !!waNumber(r.phone)
                  return (
                    <tr key={r.id} style={{ borderTop:'1px solid var(--line-soft)', background: r.replied ? '#eef3f8' : r.sent ? '#f0f7f0' : 'transparent' }}>
                      <td style={{ padding:'8px 12px', fontWeight:500 }}>
                        {r.name}
                        {r.prospect_id && <span style={{ fontSize:10, color:'var(--muted)', marginLeft:6, fontWeight:400 }}>prospect</span>}
                      </td>
                      <td style={{ padding:'8px 6px', color: hasPhone ? 'var(--ink)' : '#c0392b', whiteSpace:'nowrap' }}>{r.phone || 'none'}</td>
                      <td style={{ padding:'8px 6px', whiteSpace:'nowrap' }}>
                        {hasPhone && <button style={waBtn} onClick={() => sendWhatsApp(r)}>WhatsApp</button>}
                        {r.wa_opened_at && !r.sent && <div style={{ fontSize:10, color:'#b8862a', marginTop:2 }}>opened — tick Sent</div>}
                      </td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <input type="checkbox" checked={r.sent} onChange={() => toggleSent(r)} style={{ width:16, height:16, cursor:'pointer' }}
                          title={r.sent_at ? 'Sent ' + new Date(r.sent_at).toLocaleString() : 'Mark as sent'} />
                      </td>
                      <td style={{ padding:'8px 6px', textAlign:'center' }}>
                        <input type="checkbox" checked={r.replied} onChange={() => toggleReplied(r)} style={{ width:16, height:16, cursor:'pointer' }}
                          title={r.replied_at ? 'Replied ' + new Date(r.replied_at).toLocaleString() : 'Mark as replied'} />
                      </td>
                      <td style={{ padding:'8px 6px' }}>
                        <input className="form-input" style={{ fontSize:11, padding:'3px 6px', minWidth:120 }} defaultValue={r.note || ''} placeholder="e.g. attending +1"
                          onBlur={e => e.target.value !== (r.note || '') && patchRecipient(r.id, { note: e.target.value || null })} />
                      </td>
                      <td style={{ padding:'8px 12px 8px 6px', textAlign:'right' }}>
                        <button onClick={() => removeRecipient(r)} style={{ background:'none', border:'none', cursor:'pointer', color:'#c0392b', fontSize:10 }}>Remove</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── NOTICE MODAL ── */}
      {modal === 'notice' && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">{form.id ? 'Edit notice' : 'New notice'}</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Title *</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} placeholder="e.g. Solo show opening" /></div>
                <div className="form-group"><label className="form-label">Event date</label><input className="form-input" type="date" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date:e.target.value }))} /></div>
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-textarea" rows={6} value={form.message} onChange={e => setForm(f => ({ ...f, message:e.target.value }))} />
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  Placeholders: <code>{'{first_name}'}</code> <code>{'{name}'}</code> <code>{'{event}'}</code> <code>{'{date}'}</code> — filled in for each person.
                </div>
              </div>
              {form.message && (
                <div style={{ fontSize:12, background:'var(--parchment)', padding:'8px 10px', borderRadius:4, whiteSpace:'pre-wrap' }}>
                  <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:4 }}>Preview</div>
                  {fillMessage(form.message, form, 'Adaeze Okafor')}
                </div>
              )}
              <div className="form-group"><label className="form-label">Internal notes</label><textarea className="form-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes:e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveNotice} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'add' && (
        <AddPeopleModal clients={clients} prospects={prospects} existing={recipients}
          saving={saving} onCancel={() => setModal(null)} onAdd={addRecipients} />
      )}
    </div>
  )
}

function AddPeopleModal({ clients, prospects, existing, saving, onCancel, onAdd }) {
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState('')
  const [who, setWho] = useState('clients')       // clients | prospects | both
  const [phoneOnly, setPhoneOnly] = useState(true)
  const [picked, setPicked] = useState({})        // key → person

  const onList = useMemo(() => new Set(existing.map(r => r.client_id ? 'c' + r.client_id : 'p' + r.prospect_id)), [existing])

  const people = useMemo(() => [
    ...clients.map(c => ({ key:'c' + c.id, id:c.id, type:'client', name:c.name, phone:c.phone_mobile || c.phone, company:c.company, tags:c.tags || [] })),
    ...prospects.map(p => ({ key:'p' + p.id, id:p.id, type:'prospect', name:p.name, phone:p.phone, company:p.company, tags:p.tags || [] })),
  ], [clients, prospects])

  const allTags = useMemo(() => [...new Set(people.flatMap(p => p.tags))].sort((a, b) => a.localeCompare(b)), [people])

  const shown = useMemo(() => {
    const q = search.toLowerCase()
    return people.filter(p =>
      (who === 'both' || (who === 'clients') === (p.type === 'client')) &&
      (!tag || p.tags.includes(tag)) &&
      (!phoneOnly || waNumber(p.phone)) &&
      (!q || p.name?.toLowerCase().includes(q) || p.company?.toLowerCase().includes(q) || (p.phone || '').includes(q)))
  }, [people, who, tag, phoneOnly, search])

  const selectable = shown.filter(p => !onList.has(p.key))
  const pickedCount = Object.keys(picked).length
  const allShownPicked = selectable.length > 0 && selectable.every(p => picked[p.key])

  function toggle(p) {
    setPicked(prev => { const n = { ...prev }; if (n[p.key]) delete n[p.key]; else n[p.key] = p; return n })
  }
  function toggleAll() {
    setPicked(prev => {
      const n = { ...prev }
      selectable.forEach(p => { if (allShownPicked) delete n[p.key]; else n[p.key] = p })
      return n
    })
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header"><div className="modal-title">Add people to the list</div><button className="btn btn-ghost btn-icon" onClick={onCancel}>&times;</button></div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[['clients','Clients'],['prospects','Prospects'],['both','Both']].map(([k, l]) => (
              <button key={k} style={chip(who === k)} onClick={() => setWho(k)}>{l}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <input className="form-input" style={{ flex:1, minWidth:160 }} placeholder="Search name, company, phone..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{ width:'auto' }} value={tag} onChange={e => setTag(e.target.value)}>
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
            <label style={{ display:'flex', gap:6, alignItems:'center', cursor:'pointer' }}>
              <input type="checkbox" checked={phoneOnly} onChange={e => setPhoneOnly(e.target.checked)} /> Only people with a phone number
            </label>
            <button className="btn btn-ghost btn-sm" onClick={toggleAll} disabled={!selectable.length}>
              {allShownPicked ? 'Clear these' : `Select all ${selectable.length}`}
            </button>
          </div>
          <div style={{ maxHeight:340, overflowY:'auto', border:'1px solid var(--line)', borderRadius:3 }}>
            {shown.length === 0 && <div style={{ padding:16, textAlign:'center', fontSize:12, color:'var(--muted)' }}>No matches</div>}
            {shown.slice(0, 500).map(p => {
              const already = onList.has(p.key)
              return (
                <label key={p.key} style={{ display:'flex', gap:10, alignItems:'center', padding:'7px 12px', borderBottom:'1px solid var(--line-soft)', fontSize:13, cursor: already ? 'default' : 'pointer', opacity: already ? .5 : 1 }}>
                  <input type="checkbox" disabled={already} checked={already || !!picked[p.key]} onChange={() => toggle(p)} />
                  <div style={{ flex:1 }}>
                    <div>{p.name} {p.type === 'prospect' && <span style={{ fontSize:10, color:'var(--muted)' }}>(prospect)</span>}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{[p.company, p.phone || 'no phone'].filter(Boolean).join(' · ')}{already ? ' · already on list' : ''}</div>
                  </div>
                </label>
              )
            })}
            {shown.length > 500 && <div style={{ padding:10, fontSize:11, color:'var(--muted)' }}>Showing 500 of {shown.length} — narrow the search or tag to see the rest.</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onAdd(Object.values(picked))} disabled={saving || !pickedCount}>
            {saving ? 'Adding...' : `Add ${pickedCount || ''} ${pickedCount === 1 ? 'person' : 'people'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
