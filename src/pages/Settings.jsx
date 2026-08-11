import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('bank_accounts').select('*').order('is_default', { ascending: false }).order('account_name')
    setAccounts(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm({ account_name:'', bank_name:'', account_number:'', sort_code:'', routing_number:'', swift_bic:'', bank_address:'', currency:'NGN', is_default:false, notes:'' })
    setModal('add')
  }

  function openEdit(acc) {
    setForm({ ...acc })
    setModal('edit')
  }

  async function save() {
    if (!form.account_name || !form.bank_name || !form.account_number) return alert('Account name, bank name and account number are required')
    setSaving(true)
    try {
      if (form.is_default) {
        await supabase.from('bank_accounts').update({ is_default: false }).eq('is_default', true)
      }
      if (modal === 'edit') {
        await supabase.from('bank_accounts').update({
          account_name: form.account_name, bank_name: form.bank_name, account_number: form.account_number,
          sort_code: form.sort_code || null, routing_number: form.routing_number || null,
          swift_bic: form.swift_bic || null, bank_address: form.bank_address || null,
          currency: form.currency, is_default: form.is_default, notes: form.notes || null,
          updated_at: new Date().toISOString(),
        }).eq('id', form.id)
      } else {
        await supabase.from('bank_accounts').insert({
          account_name: form.account_name, bank_name: form.bank_name, account_number: form.account_number,
          sort_code: form.sort_code || null, routing_number: form.routing_number || null,
          swift_bic: form.swift_bic || null, bank_address: form.bank_address || null,
          currency: form.currency, is_default: form.is_default, notes: form.notes || null,
        })
      }
      await load()
      setModal(null)
    } catch(e) { alert('Failed: ' + e.message) } finally { setSaving(false) }
  }

  async function deleteAccount(id) {
    if (!confirm('Delete this bank account?')) return
    await supabase.from('bank_accounts').delete().eq('id', id)
    await load()
  }

  async function setDefault(id) {
    await supabase.from('bank_accounts').update({ is_default: false }).eq('is_default', true)
    await supabase.from('bank_accounts').update({ is_default: true }).eq('id', id)
    await load()
  }

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Gallery configuration</div>
      </div>

      {/* Bank Accounts */}
      <div className="card" style={{ padding:'18px 22px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600 }}>Bank accounts</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Manage payment accounts shown on invoices</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add account</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {accounts.map(acc => (
            <div key={acc.id} style={{
              padding:'12px 16px', border: acc.is_default ? '2px solid var(--green,#27ae60)' : '1px solid var(--line)',
              borderRadius:6, background:'var(--white)', display:'flex', justifyContent:'space-between', alignItems:'center'
            }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:600, fontSize:14 }}>{acc.account_name}</span>
                  {acc.is_default && <span style={{ fontSize:9, padding:'2px 8px', borderRadius:10, background:'#e8f5e9', color:'#2d6a4f', fontWeight:600, textTransform:'uppercase' }}>Default</span>}
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'var(--parchment)', color:'var(--muted)' }}>{acc.currency}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>
                  {acc.bank_name} &middot; {acc.account_number}
                  {acc.sort_code ? ` \u00b7 Sort: ${acc.sort_code}` : ''}
                  {acc.routing_number ? ` \u00b7 Routing: ${acc.routing_number}` : ''}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {!acc.is_default && <button className="btn btn-ghost btn-sm" style={{ fontSize:11 }} onClick={() => setDefault(acc.id)}>Set default</button>}
                <button className="btn btn-outline btn-sm" style={{ fontSize:11 }} onClick={() => openEdit(acc)}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize:11, color:'var(--red,#c0392b)' }} onClick={() => deleteAccount(acc.id)}>Delete</button>
              </div>
            </div>
          ))}
          {accounts.length === 0 && <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No accounts yet</div>}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header">
              <div className="modal-title">{modal === 'edit' ? 'Edit bank account' : 'Add bank account'}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Account name *</label>
                  <input className="form-input" value={form.account_name} onChange={e => setForm(f => ({...f, account_name:e.target.value}))} placeholder="e.g. Hourglass Lagos" /></div>
                <div className="form-group"><label className="form-label">Currency</label>
                  <select className="form-select" value={form.currency} onChange={e => setForm(f => ({...f, currency:e.target.value}))}>
                    <option value="NGN">NGN</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option>
                  </select></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Bank name *</label>
                  <input className="form-input" value={form.bank_name} onChange={e => setForm(f => ({...f, bank_name:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Account number *</label>
                  <input className="form-input" value={form.account_number} onChange={e => setForm(f => ({...f, account_number:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Sort code</label>
                  <input className="form-input" value={form.sort_code||''} onChange={e => setForm(f => ({...f, sort_code:e.target.value}))} placeholder="e.g. 40-62-45" /></div>
                <div className="form-group"><label className="form-label">Routing number</label>
                  <input className="form-input" value={form.routing_number||''} onChange={e => setForm(f => ({...f, routing_number:e.target.value}))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">SWIFT / BIC</label>
                  <input className="form-input" value={form.swift_bic||''} onChange={e => setForm(f => ({...f, swift_bic:e.target.value}))} /></div>
              </div>
              <div className="form-group"><label className="form-label">Bank address</label>
                <input className="form-input" value={form.bank_address||''} onChange={e => setForm(f => ({...f, bank_address:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Notes</label>
                <input className="form-input" value={form.notes||''} onChange={e => setForm(f => ({...f, notes:e.target.value}))} /></div>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({...f, is_default:e.target.checked}))} />
                Set as default account
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
