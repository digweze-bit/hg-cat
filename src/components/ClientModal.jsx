import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'
import { auditLog } from '../lib/audit'
import TagInput, { CLIENT_TAG_SUGGESTIONS } from './TagInput'

const PREFIXES = ['Mr','Mrs','Ms','Dr','Prof','Chief','Alhaji','Alhaja','Sir']

const BLANK = {
  name:'', prefix:'', first_name:'', last_name:'', company:'', job_title:'',
  email:'', phone:'', phone_mobile:'', phone_work:'', address:'', street:'',
  suburb:'', city:'', state:'', postcode:'', country:'Nigeria', notes:'', tags:[],
}

// Shared by the Clients page and the Clients tab in Sales & Invoices, so a
// client can be added or edited from either place.
export default function ClientModal({ onClose, onSave, existingClients = [], editClient = null }) {
  const [form, setForm] = useState(() => editClient
    ? {
        ...BLANK, ...editClient,
        phone_mobile: editClient.phone_mobile || editClient.phone || '',
        phone_work: editClient.phone_work || '',
        street: editClient.street || editClient.address || '',
        suburb: editClient.suburb || '',
        state: editClient.state || '',
        postcode: editClient.postcode || '',
        country: editClient.country || 'Nigeria',
        tags: editClient.tags || [],
      }
    : { ...BLANK })
  const [saving, setSaving] = useState(false)
  const [dupWarning, setDupWarning] = useState([])

  async function save() {
    if (!form.name) return alert('Name required')
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone_mobile || form.phone || null,
        phone_mobile: form.phone_mobile || null,
        phone_work: form.phone_work || null,
        prefix: form.prefix || null,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        company: form.company || null,
        job_title: form.job_title || null,
        address: form.street || form.address || null,
        street: form.street || null,
        suburb: form.suburb || null,
        city: form.city || null,
        state: form.state || null,
        postcode: form.postcode || null,
        country: form.country || null,
        notes: form.notes || null,
        tags: form.tags || [],
      }
      if (editClient?.id) {
        // Editing has to update — inserting here quietly duplicated the client
        const { error } = await supabase.from('clients')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editClient.id)
        if (error) throw error
        auditLog('client.updated', { entityType:'client', entityId: editClient.id, entityLabel: payload.name })
      } else {
        const { error } = await supabase.from('clients').insert(payload)
        if (error) throw error
        auditLog('client.created', { entityType:'client', entityId: null, entityLabel: payload.name })
      }
      cacheInvalidate('clients')
      await onSave?.({ ...payload, id: editClient?.id })
      onClose()
    } catch(err) {
      alert('Failed to save client: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header">
          <div className="modal-title">{editClient ? 'Edit client' : 'Add client'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>{'✕'}</button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="form-row">
            <div className="form-group" style={{ maxWidth:90 }}>
              <label className="form-label">Prefix</label>
              <select className="form-select" value={form.prefix||''} onChange={e=>setForm(f=>({...f,prefix:e.target.value}))}>
                <option value="">{'—'}</option>
                {PREFIXES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => {
                const v = e.target.value
                setForm(f=>({...f, name: v}))
                if (v.length > 2) {
                  const q = v.toLowerCase()
                  setDupWarning(existingClients.filter(c =>
                    c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(' ')[0])
                  ).filter(c => !editClient || c.id !== editClient.id).slice(0, 3))
                } else { setDupWarning([]) }
              }} />
              {dupWarning.length > 0 && (
                <div style={{ marginTop:6, padding:'8px 10px', background:'#fef9ec', border:'1px solid #f0c040', borderRadius:4 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#92600a', marginBottom:4 }}>&#9888; Possible duplicate</div>
                  {dupWarning.map(c => (
                    <div key={c.id} style={{ fontSize:11, color:'#6b6760', padding:'2px 0' }}>
                      {c.name}{c.phone ? ' · ' + c.phone : ''}{c.email ? ' · ' + c.email : ''}
                    </div>
                  ))}
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>Check this client does not already exist before saving.</div>
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email||''} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Mobile</label>
              <input className="form-input" value={form.phone_mobile||''} onChange={e=>setForm(f=>({...f,phone_mobile:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Work phone</label>
              <input className="form-input" value={form.phone_work||''} onChange={e=>setForm(f=>({...f,phone_work:e.target.value}))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-input" value={form.company||''} onChange={e=>setForm(f=>({...f,company:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Job title</label>
              <input className="form-input" value={form.job_title||''} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Street address</label>
            <input className="form-input" value={form.street||''} onChange={e=>setForm(f=>({...f,street:e.target.value}))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-input" value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Country</label>
              <input className="form-input" value={form.country||''} onChange={e=>setForm(f=>({...f,country:e.target.value}))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Tags</label>
            <TagInput tags={form.tags||[]} onChange={t=>setForm(f=>({...f,tags:t}))} suggestions={CLIENT_TAG_SUGGESTIONS} placeholder="e.g. modernist, sculpture..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
