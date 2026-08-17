import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const PERIOD_OPTIONS = (() => {
  const opts = []
  const now = new Date()
  for (let m = 0; m < 24; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const yr = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const moName = d.toLocaleString('en', { month: 'short' })
    opts.push({ value: `${yr}-${mo}-1`, label: `${moName} ${yr} (1st half)` })
    opts.push({ value: `${yr}-${mo}-2`, label: `${moName} ${yr} (2nd half)` })
  }
  return opts
})()

function currentPeriod() {
  const d = new Date()
  const yr = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  return d.getDate() <= 15 ? `${yr}-${mo}-1` : `${yr}-${mo}-2`
}

export default function HR() {
  const [employees, setEmployees] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeEmp, setActiveEmp] = useState(null)
  const [activePeriod, setActivePeriod] = useState(currentPeriod())
  const [modal, setModal] = useState(null) // 'add-employee' | 'employee-portal'
  const [portalPin, setPortalPin] = useState('')
  const [portalEmployee, setPortalEmployee] = useState(null)
  const [saving, setSaving] = useState(false)
  const [empForm, setEmpForm] = useState({ name: '', role: '', email: '', pin: '', checklist: ['','','','','',''] })

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: emp }, { data: rev }] = await Promise.all([
      supabase.from('hr_employees').select('*').eq('active', true).order('name'),
      supabase.from('hr_reviews').select('*').order('period', { ascending: false }),
    ])
    setEmployees(emp || [])
    setReviews(rev || [])
    setLoading(false)
  }

  // Get or create review for employee + period
  function getReview(empId, period) {
    return reviews.find(r => r.employee_id === empId && r.period === period)
  }

  async function ensureReview(empId, period) {
    let rev = getReview(empId, period)
    if (rev) return rev
    const label = PERIOD_OPTIONS.find(p => p.value === period)?.label || period
    const { data, error } = await supabase.from('hr_reviews').insert({
      employee_id: empId, period, period_label: label,
    }).select().single()
    if (error) { alert('Error: ' + error.message); return null }
    setReviews(prev => [data, ...prev])
    return data
  }

  // Save scores
  async function saveManagerScores(reviewId, scores, notes, finalScore) {
    setSaving(true)
    const status = finalScore != null ? 'final' : 'reviewed'
    await supabase.from('hr_reviews').update({
      manager_scores: scores,
      manager_notes: notes,
      final_score: finalScore,
      status,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reviewId)
    await load()
    setSaving(false)
  }

  async function saveEmployeeScores(reviewId, scores, notes) {
    setSaving(true)
    await supabase.from('hr_reviews').update({
      employee_scores: scores,
      employee_notes: notes,
      status: 'employee_done',
    }).eq('id', reviewId)
    await load()
    setSaving(false)
  }

  // Employee portal login
  async function portalLogin() {
    const emp = employees.find(e => e.pin === portalPin)
    if (!emp) { alert('Invalid PIN'); return }
    setPortalEmployee(emp)
    setModal('employee-portal')
  }

  // Add employee
  async function saveEmployee() {
    if (!empForm.name || !empForm.role) return alert('Name and role required')
    const checklist = empForm.checklist.filter(c => c.trim())
    if (checklist.length < 1) return alert('Add at least one metric')
    setSaving(true)
    await supabase.from('hr_employees').insert({
      name: empForm.name, role: empForm.role, email: empForm.email || null,
      pin: empForm.pin || null, checklist: JSON.stringify(checklist),
    })
    await load()
    setModal(null)
    setSaving(false)
  }

  function openEditEmployee(emp) {
    const cl = Array.isArray(emp.checklist) ? emp.checklist : JSON.parse(emp.checklist || '[]')
    const padded = [...cl, ...Array(Math.max(0, 6 - cl.length)).fill('')]
    setEmpForm({ name: emp.name, role: emp.role, email: emp.email || '', pin: emp.pin || '', checklist: padded, id: emp.id })
    setModal('edit-employee')
  }

  async function updateEmployee() {
    if (!empForm.name || !empForm.role) return alert('Name and role required')
    const checklist = empForm.checklist.filter(c => c.trim())
    if (checklist.length < 1) return alert('Add at least one metric')
    setSaving(true)
    await supabase.from('hr_employees').update({
      name: empForm.name, role: empForm.role, email: empForm.email || null,
      pin: empForm.pin || null, checklist: JSON.stringify(checklist),
    }).eq('id', empForm.id)
    await load()
    setModal(null)
    setSaving(false)
  }

  async function deleteEmployee(emp) {
    if (!confirm(`Remove ${emp.name}? Their review history will also be deleted.`)) return
    await supabase.from('hr_reviews').delete().eq('employee_id', emp.id)
    await supabase.from('hr_employees').delete().eq('id', emp.id)
    if (activeEmp?.id === emp.id) setActiveEmp(null)
    await load()
  }

  // Performance averages
  const perfData = useMemo(() => {
    if (!activeEmp) return []
    const empReviews = reviews.filter(r => r.employee_id === activeEmp.id && r.final_score != null)
      .sort((a, b) => a.period.localeCompare(b.period))
    return empReviews.map(r => ({
      period: r.period_label || r.period,
      score: r.final_score,
      managerAvg: r.manager_scores?.length > 0
        ? (r.manager_scores.reduce((s, m) => s + Number(m.score || 0), 0) / r.manager_scores.length).toFixed(1)
        : null,
    }))
  }, [activeEmp, reviews])

  if (loading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div className="page-title">Hourglass Job Check</div>
          <div className="page-subtitle">Bi-monthly employee performance monitoring</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => { setPortalPin(''); setPortalEmployee(null); setModal('portal-login') }}>Employee portal</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEmpForm({ name:'', role:'', email:'', pin:'', checklist:['','','','','',''] }); setModal('add-employee') }}>+ Add employee</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, minHeight: 'calc(100vh - 200px)' }}>
        {/* Employee list */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)' }}>
            Team ({employees.length})
          </div>
          {employees.map(emp => {
            const latest = reviews.find(r => r.employee_id === emp.id && r.final_score != null)
            return (
              <div key={emp.id} onClick={() => { setActiveEmp(emp); setActivePeriod(currentPeriod()) }}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer',
                  background: activeEmp?.id === emp.id ? 'var(--parchment)' : 'transparent',
                }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{emp.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{emp.role}</div>
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEditEmployee(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', padding: '2px 4px' }}>Edit</button>
                    <button onClick={() => deleteEmployee(emp)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#c0392b', padding: '2px 4px' }}>Del</button>
                  </div>
                </div>
                {latest && (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    <span style={{ fontWeight: 600, color: latest.final_score >= 7 ? '#2d6a4f' : latest.final_score >= 5 ? '#b8862a' : '#c0392b' }}>
                      {latest.final_score}/10
                    </span>
                    <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{latest.period_label}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Review panel */}
        {activeEmp ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{activeEmp.name}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{activeEmp.role}</div>
              </div>
              <select className="form-select" style={{ width: 220 }} value={activePeriod} onChange={e => setActivePeriod(e.target.value)}>
                {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <ReviewCard
              employee={activeEmp}
              period={activePeriod}
              review={getReview(activeEmp.id, activePeriod)}
              onEnsure={() => ensureReview(activeEmp.id, activePeriod)}
              onSaveManager={saveManagerScores}
              onSaveEmployee={saveEmployeeScores}
              saving={saving}
              isManager={true}
            />

            {/* Performance tracker */}
            {perfData.length > 0 && (
              <div className="card" style={{ padding: '16px 20px', marginTop: 20 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
                  Performance tracker
                </div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 120 }}>
                  {perfData.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: d.score >= 7 ? '#2d6a4f' : d.score >= 5 ? '#b8862a' : '#c0392b' }}>
                        {d.score}
                      </div>
                      <div style={{
                        width: '100%', maxWidth: 40,
                        height: `${(d.score / 10) * 100}%`,
                        background: d.score >= 7 ? '#2d6a4f' : d.score >= 5 ? '#b8862a' : '#c0392b',
                        borderRadius: '3px 3px 0 0', minHeight: 4,
                      }} />
                      <div style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>{d.period}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>Average: <strong style={{ color: 'var(--ink)' }}>
                    {(perfData.reduce((s, d) => s + Number(d.score), 0) / perfData.length).toFixed(1)}/10
                  </strong></span>
                  <span style={{ color: 'var(--muted)' }}>{perfData.length} review{perfData.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, minHeight: 300 }}>
            Select an employee to review
          </div>
        )}
      </div>

      {/* Add employee modal */}
      {(modal === 'add-employee' || modal === 'edit-employee') && (
        <div className="modal-overlay">
          <div className="modal modal-md">
            <div className="modal-header"><div className="modal-title">{modal === 'edit-employee' ? 'Edit employee' : 'Add employee'}</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={empForm.name} onChange={e => setEmpForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Role *</label><input className="form-input" value={empForm.role} onChange={e => setEmpForm(f => ({ ...f, role: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={empForm.email} onChange={e => setEmpForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Portal PIN (4 digits)</label><input className="form-input" value={empForm.pin} maxLength={4} onChange={e => setEmpForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="e.g. 1234" /></div>
              </div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginTop: 8 }}>Performance metrics (up to 6)</div>
              {empForm.checklist.map((c, i) => (
                <div key={i} className="form-group">
                  <label className="form-label" style={{ fontSize: 10 }}>Metric {i + 1}</label>
                  <input className="form-input" value={c} onChange={e => {
                    const updated = [...empForm.checklist]
                    updated[i] = e.target.value
                    setEmpForm(f => ({ ...f, checklist: updated }))
                  }} />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={modal === 'edit-employee' ? updateEmployee : saveEmployee} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Employee portal login */}
      {modal === 'portal-login' && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header"><div className="modal-title">Employee portal</div><button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button></div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Enter your 4-digit PIN to access your performance portal.</div>
              <div className="form-group">
                <label className="form-label">PIN</label>
                <input className="form-input" type="password" maxLength={4} value={portalPin}
                  onChange={e => setPortalPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={e => e.key === 'Enter' && portalLogin()}
                  style={{ fontSize: 24, textAlign: 'center', letterSpacing: 12 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={portalLogin}>Enter</button>
            </div>
          </div>
        </div>
      )}

      {/* Employee portal */}
      {modal === 'employee-portal' && portalEmployee && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{portalEmployee.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{portalEmployee.role} &middot; Employee portal</div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <EmployeePortal employee={portalEmployee} reviews={reviews.filter(r => r.employee_id === portalEmployee.id)} onSave={saveEmployeeScores} onEnsure={() => ensureReview(portalEmployee.id, currentPeriod())} saving={saving} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Review Card ──
function ReviewCard({ employee, period, review, onEnsure, onSaveManager, onSaveEmployee, saving, isManager }) {
  const checklist = employee.checklist || []
  const [scores, setScores] = useState([])
  const [notes, setNotes] = useState('')
  const [finalScore, setFinalScore] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (review) {
      const src = isManager ? review.manager_scores : review.employee_scores
      setScores(checklist.map((m, i) => {
        const existing = (src || []).find(s => s.metric === m)
        return { metric: m, score: existing?.score || '' }
      }))
      setNotes(isManager ? (review.manager_notes || '') : (review.employee_notes || ''))
      setFinalScore(review.final_score != null ? String(review.final_score) : '')
      setStarted(true)
    } else {
      setScores(checklist.map(m => ({ metric: m, score: '' })))
      setNotes('')
      setFinalScore('')
      setStarted(false)
    }
  }, [review, employee, isManager])

  async function startReview() {
    const rev = await onEnsure()
    if (rev) setStarted(true)
  }

  function updateScore(i, val) {
    const v = Math.max(0, Math.min(10, Number(val) || 0))
    setScores(prev => prev.map((s, j) => j === i ? { ...s, score: val === '' ? '' : v } : s))
  }

  async function save() {
    const filledScores = scores.filter(s => s.score !== '')
    if (isManager) {
      const avg = filledScores.length > 0 ? (filledScores.reduce((s, m) => s + Number(m.score), 0) / filledScores.length).toFixed(1) : null
      const fs = finalScore !== '' ? parseFloat(finalScore) : (avg ? parseFloat(avg) : null)
      await onSaveManager(review.id, scores, notes, fs)
    } else {
      await onSaveEmployee(review.id, scores, notes)
    }
  }

  const empScores = review?.employee_scores || []
  const mgrScores = review?.manager_scores || []
  const filledMgr = scores.filter(s => s.score !== '')
  const avgMgr = filledMgr.length > 0 ? (filledMgr.reduce((s, m) => s + Number(m.score), 0) / filledMgr.length).toFixed(1) : null

  const statusLabel = {
    pending: 'Awaiting input',
    employee_done: 'Employee submitted — manager review needed',
    reviewed: 'Manager reviewed',
    final: 'Finalised',
  }

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {PERIOD_OPTIONS.find(p => p.value === period)?.label || period}
          </div>
          {review && (
            <div style={{ fontSize: 11, color: review.status === 'final' ? '#2d6a4f' : 'var(--muted)' }}>
              {statusLabel[review.status] || review.status}
            </div>
          )}
        </div>
        {!started && <button className="btn btn-primary btn-sm" onClick={startReview}>Start review</button>}
      </div>

      {started && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Metric</th>
                {isManager && <th style={{ width: 70, textAlign: 'center', padding: '6px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Self</th>}
                <th style={{ width: 80, textAlign: 'center', padding: '6px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>
                  {isManager ? 'Manager' : 'Score'}
                </th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => {
                const empScore = empScores.find(e => e.metric === s.metric)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '10px 8px', lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 500 }}>{i + 1}. {s.metric}</div>
                    </td>
                    {isManager && (
                      <td style={{ textAlign: 'center', padding: '10px 4px' }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: empScore?.score ? (empScore.score >= 7 ? '#2d6a4f' : empScore.score >= 5 ? '#b8862a' : '#c0392b') : 'var(--muted)' }}>
                          {empScore?.score || '\u2014'}
                        </span>
                      </td>
                    )}
                    <td style={{ textAlign: 'center', padding: '10px 4px' }}>
                      <input type="number" min="1" max="10" value={s.score}
                        onChange={e => updateScore(i, e.target.value)}
                        style={{ width: 50, textAlign: 'center', padding: '4px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 16, fontWeight: 600 }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Average */}
          {avgMgr && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 8px', fontSize: 13 }}>
              <span style={{ color: 'var(--muted)' }}>Average: </span>
              <span style={{ fontWeight: 600, marginLeft: 6, color: avgMgr >= 7 ? '#2d6a4f' : avgMgr >= 5 ? '#b8862a' : '#c0392b' }}>{avgMgr}/10</span>
            </div>
          )}

          {/* Final score (manager only) */}
          {isManager && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)', marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Final score:</label>
              <input type="number" min="0" max="10" step="0.5" value={finalScore}
                onChange={e => setFinalScore(e.target.value)}
                placeholder={avgMgr || '—'}
                style={{ width: 70, textAlign: 'center', padding: '6px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 18, fontWeight: 700 }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>/10</span>
              {avgMgr && finalScore === '' && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setFinalScore(avgMgr)}>
                  Use average ({avgMgr})
                </button>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">{isManager ? 'Manager notes' : 'Notes'}</label>
            <textarea className="form-textarea" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={isManager ? 'Discussion points, areas for improvement, goals...' : 'Self-reflection, challenges, goals...'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : isManager ? 'Save & finalise' : 'Submit scores'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Employee Portal ──
function EmployeePortal({ employee, reviews, onSave, onEnsure, saving }) {
  const period = currentPeriod()
  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || period
  const currentReview = reviews.find(r => r.period === period)
  const pastReviews = reviews.filter(r => r.period !== period && r.final_score != null).sort((a, b) => b.period.localeCompare(a.period))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Current period */}
      <div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 8 }}>Current period: {periodLabel}</div>
        <ReviewCard
          employee={employee}
          period={period}
          review={currentReview}
          onEnsure={onEnsure}
          onSaveEmployee={onSave}
          saving={saving}
          isManager={false}
        />
      </div>

      {/* Past reviews */}
      {pastReviews.length > 0 && (
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 8 }}>Past reviews</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pastReviews.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--parchment)', borderRadius: 4 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.period_label || r.period}</div>
                  {r.manager_notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.manager_notes.slice(0, 80)}{r.manager_notes.length > 80 ? '...' : ''}</div>}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: r.final_score >= 7 ? '#2d6a4f' : r.final_score >= 5 ? '#b8862a' : '#c0392b' }}>
                  {r.final_score}/10
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance average */}
      {pastReviews.length > 0 && (
        <div style={{ textAlign: 'center', padding: '12px', background: 'var(--parchment)', borderRadius: 4, fontSize: 13 }}>
          Overall average: <strong style={{ fontSize: 18 }}>
            {(pastReviews.reduce((s, r) => s + Number(r.final_score), 0) / pastReviews.length).toFixed(1)}/10
          </strong>
          <span style={{ color: 'var(--muted)', marginLeft: 8 }}>({pastReviews.length} review{pastReviews.length !== 1 ? 's' : ''})</span>
        </div>
      )}
    </div>
  )
}
