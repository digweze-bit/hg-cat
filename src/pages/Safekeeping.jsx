import { useState, useEffect, useMemo } from 'react'
import { supabase, fetchAll } from '../lib/supabase'
import { cacheInvalidate } from '../lib/cache'

const EMPTY = {
  title:'', artist_name:'', medium:'', dimensions:'', image_url:'',
  client_id:'', purpose:'', received_by:'', received_at: new Date().toISOString().split('T')[0],
  expected_return:'', declared_value:'', location:'', condition_in:'', notes:'',
}

export default function Safekeeping() {
  const [items, setItems] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'add' | 'return' | null
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [returnForm, setReturnForm] = useState({ returned_to:'', returned_at: new Date().toISOString().split('T')[0], condition_out:'' })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('in_storage')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    async function load() {
      const [it, c] = await Promise.all([
        supabase.from('safekeeping_items').select('*, clients(name, phone, phone_mobile)').order('received_at', { ascending: false }).then(r => r.data || []),
        fetchAll('clients', { select:'id,name', order:'name' }),
      ])
      // Auto-flag overdue
      const today = new Date().toISOString().split('T')[0]
      const flagged = it.map(x => ({
        ...x,
        status: x.status === 'in_storage' && x.expected_return && x.expected_return < today ? 'overdue' : x.status
      }))
      setItems(flagged)
      setClients(c)
      setLoading(false)
    }
    load()
  }, [])

  async function refresh() {
    const { data } = await supabase.from('safekeeping_items').select('*, clients(name, phone, phone_mobile)').order('received_at', { ascending: false })
    const today = new Date().toISOString().split('T')[0]
    setItems((data || []).map(x => ({
      ...x,
      status: x.status === 'in_storage' && x.expected_return && x.expected_return < today ? 'overdue' : x.status
    })))
  }

  const filtered = useMemo(() => items.filter(it => {
    if (statusFilter === 'in_storage' && !['in_storage','overdue'].includes(it.status)) return false
    if (statusFilter === 'returned' && it.status !== 'returned') return false
    if (search) {
      const q = search.toLowerCase()
      return it.title?.toLowerCase().includes(q) || it.artist_name?.toLowerCase().includes(q) ||
        it.clients?.name?.toLowerCase().includes(q)
    }
    return true
  }), [items, search, statusFilter])

  function openAdd() { setForm(EMPTY); setModal('add') }

  async function handleImageUpload(file) {
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `safekeeping/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('artwork-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('artwork-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: data.publicUrl }))
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally { setUploading(false) }
  }

  async function save() {
    if (!form.title) return alert('Enter a title / description')
    if (!form.client_id) return alert('Select a client')
    setSaving(true)
    try {
      const { error } = await supabase.from('safekeeping_items').insert({
        title: form.title,
        artist_name: form.artist_name || null,
        medium: form.medium || null,
        dimensions: form.dimensions || null,
        image_url: form.image_url || null,
        client_id: form.client_id,
        purpose: form.purpose || null,
        received_by: form.received_by || null,
        received_at: form.received_at,
        expected_return: form.expected_return || null,
        declared_value: form.declared_value ? Number(form.declared_value) : null,
        location: form.location || null,
        condition_in: form.condition_in || null,
        notes: form.notes || null,
        status: 'in_storage',
      })
      if (error) throw error
      cacheInvalidate('safekeeping_items')
      await refresh()
      setModal(null)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally { setSaving(false) }
  }

  function openReturn(item) {
    setSelected(item)
    setReturnForm({ returned_to:'', returned_at: new Date().toISOString().split('T')[0], condition_out:'' })
    setModal('return')
  }

  async function markReturned() {
    if (!returnForm.returned_to) return alert('Enter who collected the item')
    setSaving(true)
    try {
      const { error } = await supabase.from('safekeeping_items').update({
        status: 'returned',
        returned_to: returnForm.returned_to,
        returned_at: returnForm.returned_at,
        condition_out: returnForm.condition_out || null,
        updated_at: new Date().toISOString(),
      }).eq('id', selected.id)
      if (error) throw error
      cacheInvalidate('safekeeping_items')
      await refresh()
      setModal(null); setSelected(null)
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally { setSaving(false) }
  }

  async function deleteItem(id) {
    if (!confirm('Delete this safekeeping record? This cannot be undone.')) return
    await supabase.from('safekeeping_items').delete().eq('id', id)
    cacheInvalidate('safekeeping_items')
    await refresh()
  }

  const counts = useMemo(() => ({
    inStorage: items.filter(i => i.status === 'in_storage').length,
    overdue: items.filter(i => i.status === 'overdue').length,
    returned: items.filter(i => i.status === 'returned').length,
  }), [items])

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Safekeeping</div>
          <div className="page-subtitle">
            {counts.inStorage} in storage {counts.overdue > 0 && <span style={{ color:'var(--red,#c0392b)' }}>· {counts.overdue} overdue</span>} · {counts.returned} returned
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add item</button>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input className="form-input" style={{ width:240 }} placeholder="Search title, artist, client..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select" style={{ width:160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="in_storage">Currently in storage</option>
          <option value="returned">Returned</option>
          <option value="">All records</option>
        </select>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} items</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width:56 }}></th>
                <th>Item</th>
                <th>Client</th>
                <th>Purpose</th>
                <th>Received</th>
                <th>Expected return</th>
                <th>Location</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>No items found</td></tr>
              )}
              {filtered.map(it => (
                <tr key={it.id}>
                  <td>
                    {it.image_url
                      ? <img src={it.image_url} alt="" style={{ width:40, height:40, objectFit:'cover', borderRadius:2 }} />
                      : <div style={{ width:40, height:40, background:'var(--parchment-2,#f0ece7)', borderRadius:2 }} />}
                  </td>
                  <td>
                    <div style={{ fontWeight:500, fontSize:13 }}>{it.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{it.artist_name}{it.medium ? ` · ${it.medium}` : ''}</div>
                  </td>
                  <td style={{ fontSize:13 }}>{it.clients?.name || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{it.purpose || '—'}</td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{it.received_at}</td>
                  <td style={{ fontSize:12, color: it.status === 'overdue' ? 'var(--red,#c0392b)' : 'var(--muted)', fontWeight: it.status === 'overdue' ? 600 : 400 }}>
                    {it.expected_return || '—'}
                  </td>
                  <td style={{ fontSize:12, color:'var(--muted)' }}>{it.location || '—'}</td>
                  <td>
                    <span className="badge" style={{
                      background: it.status === 'overdue' ? '#fdecea' : it.status === 'returned' ? '#edf7f0' : '#fef9ec',
                      color: it.status === 'overdue' ? '#c0392b' : it.status === 'returned' ? '#27ae60' : '#b8862a',
                    }}>
                      {it.status === 'in_storage' ? 'In storage' : it.status === 'overdue' ? 'Overdue' : 'Returned'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      {it.status !== 'returned' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => openReturn(it)}>Mark returned</button>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{ color:'var(--red,#c0392b)' }} onClick={() => deleteItem(it.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
      {modal === 'add' && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">Add safekeeping item</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Title / description *</label>
                  <input className="form-input" value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} placeholder="e.g. Untitled portrait, framed" />
                </div>
                <div className="form-group">
                  <label className="form-label">Artist (if known)</label>
                  <input className="form-input" value={form.artist_name} onChange={e => setForm(f => ({...f, artist_name:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Medium</label>
                  <input className="form-input" value={form.medium} onChange={e => setForm(f => ({...f, medium:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dimensions</label>
                  <input className="form-input" value={form.dimensions} onChange={e => setForm(f => ({...f, dimensions:e.target.value}))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Photo</label>
                <input type="file" accept="image/*" onChange={e => handleImageUpload(e.target.files[0])} />
                {uploading && <div style={{ fontSize:11, color:'var(--muted)' }}>Uploading...</div>}
                {form.image_url && <img src={form.image_url} alt="" style={{ width:80, height:80, objectFit:'cover', borderRadius:3, marginTop:6 }} />}
              </div>
              <div className="form-group">
                <label className="form-label">Client *</label>
                <select className="form-select" value={form.client_id} onChange={e => setForm(f => ({...f, client_id:e.target.value}))}>
                  <option value="">— select client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Purpose</label>
                  <input className="form-input" value={form.purpose} onChange={e => setForm(f => ({...f, purpose:e.target.value}))} placeholder="e.g. Temporary storage, condition assessment" />
                </div>
                <div className="form-group">
                  <label className="form-label">Received by (staff)</label>
                  <input className="form-input" value={form.received_by} onChange={e => setForm(f => ({...f, received_by:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date received</label>
                  <input className="form-input" type="date" value={form.received_at} onChange={e => setForm(f => ({...f, received_at:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Expected return date</label>
                  <input className="form-input" type="date" value={form.expected_return} onChange={e => setForm(f => ({...f, expected_return:e.target.value}))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Declared value (₦)</label>
                  <input className="form-input" type="number" value={form.declared_value} onChange={e => setForm(f => ({...f, declared_value:e.target.value}))} placeholder="For insurance / liability reference only" />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" value={form.location} onChange={e => setForm(f => ({...f, location:e.target.value}))} placeholder="e.g. Storage room A" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Condition on arrival</label>
                <textarea className="form-textarea" rows={2} value={form.condition_in} onChange={e => setForm(f => ({...f, condition_in:e.target.value}))} placeholder="Note any existing damage, frame condition, etc." />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {modal === 'return' && selected && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">Mark returned — {selected.title}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:13, color:'var(--muted)' }}>
                Received {selected.received_at} from {selected.clients?.name}
                {selected.condition_in && <div style={{ marginTop:6, padding:'8px 10px', background:'var(--parchment)', borderRadius:3 }}>Condition on arrival: {selected.condition_in}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Returned to *</label>
                <input className="form-input" value={returnForm.returned_to} onChange={e => setReturnForm(f => ({...f, returned_to:e.target.value}))} placeholder="Name of person collecting" />
              </div>
              <div className="form-group">
                <label className="form-label">Return date</label>
                <input className="form-input" type="date" value={returnForm.returned_at} onChange={e => setReturnForm(f => ({...f, returned_at:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Condition on return</label>
                <textarea className="form-textarea" rows={2} value={returnForm.condition_out} onChange={e => setReturnForm(f => ({...f, condition_out:e.target.value}))} placeholder="Confirm condition matches arrival, or note any changes" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={markReturned} disabled={saving}>{saving ? 'Saving...' : 'Confirm return'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
