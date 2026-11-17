import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

// Team job tracker. Anyone can log a job for anyone; work is submitted for
// review and only approved closers (job_closers) can close it or send it back.
// The database enforces those rules — this page only reflects them.

export const STATUS = {
  open:        { label: 'Open',              badge: 'badge-gray' },
  in_progress: { label: 'In progress',       badge: 'badge-blue' },
  submitted:   { label: 'Awaiting review',   badge: 'badge-amber' },
  sent_back:   { label: 'Sent back',         badge: 'badge-red' },
  closed:      { label: 'Closed',            badge: 'badge-green' },
  cancelled:   { label: 'Cancelled',         badge: 'badge-gray' },
}
const PRIORITY = {
  urgent: { label: 'Urgent', badge: 'badge-red', rank: 0 },
  high:   { label: 'High',   badge: 'badge-amber', rank: 1 },
  normal: { label: 'Normal', badge: 'badge-gray', rank: 2 },
  low:    { label: 'Low',    badge: 'badge-gray', rank: 3 },
}
const ACTIVE = ['open', 'in_progress', 'submitted', 'sent_back']
// Order a person's list so what needs them most comes first.
const STATUS_RANK = { sent_back: 0, in_progress: 1, open: 2, submitted: 3, closed: 4, cancelled: 5 }

const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => d ? new Date(d + (d.length === 10 ? 'T00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const fmtWhen = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function dueInfo(job) {
  if (!job.due_date || !ACTIVE.includes(job.status)) return null
  const days = Math.round((new Date(job.due_date + 'T00:00') - new Date(today() + 'T00:00')) / 86400000)
  if (days < 0) return { text: `${-days} day${days === -1 ? '' : 's'} late`, color: 'var(--red)', late: true }
  if (days === 0) return { text: 'Due today', color: 'var(--amber)' }
  if (days === 1) return { text: 'Due tomorrow', color: 'var(--amber)' }
  return { text: `Due ${fmtDate(job.due_date)}`, color: 'var(--muted)' }
}

const personKey = p => p.employee_id ? `e:${p.employee_id}` : `u:${p.user_id}`
const jobKey = j => j.assignee_employee_id ? `e:${j.assignee_employee_id}` : j.assignee_user_id ? `u:${j.assignee_user_id}` : ''

// Jobs that belong to the signed-in user (directly, or via their HR position).
export function isMine(job, uid, myEmployeeIds) {
  return job.assignee_user_id === uid || (job.assignee_employee_id && myEmployeeIds.includes(job.assignee_employee_id))
}

const EMPTY = { title: '', details: '', done_means: '', assignee: '', priority: 'normal', due_date: '' }

export default function Jobs() {
  const { user } = useAuth()
  const uid = user?.id
  const [jobs, setJobs] = useState([])
  const [people, setPeople] = useState([])
  const [closers, setClosers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mine')
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [form, setForm] = useState(null) // null | {…EMPTY, id?}
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const [j, p, c] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.rpc('job_people'),
      supabase.from('job_closers').select('user_id'),
    ])
    if (j.error) setErr(j.error.message)
    setJobs(j.data || [])
    setPeople(p.data || [])
    setClosers((c.data || []).map(r => r.user_id))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const isCloser = closers.includes(uid)
  const myEmployeeIds = useMemo(() => people.filter(p => p.user_id === uid && p.employee_id).map(p => p.employee_id), [people, uid])
  const nameFor = useMemo(() => {
    const byKey = {}, byUser = {}
    people.forEach(p => { byKey[personKey(p)] = p.name; if (p.user_id) byUser[p.user_id] = p.name })
    return { job: j => byKey[jobKey(j)] || 'Unassigned', user: id => byUser[id] || 'Someone' }
  }, [people])

  // Default to the review queue for closers with nothing of their own.
  useEffect(() => {
    if (loading || !isCloser) return
    const mine = jobs.filter(j => ACTIVE.includes(j.status) && j.status !== 'submitted' && isMine(j, uid, myEmployeeIds))
    if (!mine.length && jobs.some(j => j.status === 'submitted')) setTab('review')
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    mine: jobs.filter(j => ['open', 'in_progress', 'sent_back'].includes(j.status) && isMine(j, uid, myEmployeeIds)).length,
    review: jobs.filter(j => j.status === 'submitted').length,
    active: jobs.filter(j => ACTIVE.includes(j.status)).length,
    late: jobs.filter(j => dueInfo(j)?.late).length,
  }), [jobs, uid, myEmployeeIds])

  const shown = useMemo(() => {
    let list = jobs
    if (tab === 'mine') list = list.filter(j => ACTIVE.includes(j.status) && isMine(j, uid, myEmployeeIds))
    else if (tab === 'review') list = list.filter(j => j.status === 'submitted')
    else if (tab === 'active') list = list.filter(j => ACTIVE.includes(j.status))
    else if (tab === 'late') list = list.filter(j => dueInfo(j)?.late)
    else if (tab === 'done') list = list.filter(j => !ACTIVE.includes(j.status))
    if (who) list = list.filter(j => jobKey(j) === who)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      list = list.filter(j => `${j.number} ${j.title} ${j.details || ''} ${nameFor.job(j)}`.toLowerCase().includes(s))
    }
    if (tab === 'done') return list
    return [...list].sort((a, b) =>
      (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
      ((dueInfo(b)?.late ? 1 : 0) - (dueInfo(a)?.late ? 1 : 0)) ||
      (PRIORITY[a.priority].rank - PRIORITY[b.priority].rank) ||
      ((a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : 0))
  }, [jobs, tab, who, q, uid, myEmployeeIds, nameFor])

  function changed() { load(); window.dispatchEvent(new Event('jobs:changed')) }

  async function saveForm() {
    if (!form.title.trim()) { setErr('Give the job a title'); return }
    if (!form.assignee) { setErr('Choose who the job is for'); return }
    setSaving(true); setErr('')
    const [kind, id] = form.assignee.split(':')
    const row = {
      title: form.title.trim(),
      details: form.details.trim() || null,
      done_means: form.done_means.trim() || null,
      assignee_employee_id: kind === 'e' ? id : null,
      assignee_user_id: kind === 'u' ? id : null,
      priority: form.priority,
      due_date: form.due_date || null,
    }
    const res = form.id
      ? await supabase.from('jobs').update(row).eq('id', form.id)
      : await supabase.from('jobs').insert(row)
    setSaving(false)
    if (res.error) { setErr(res.error.message); return }
    setForm(null)
    changed()
  }

  function editJob(j) {
    setErr('')
    setForm({
      id: j.id, title: j.title, details: j.details || '', done_means: j.done_means || '',
      assignee: jobKey(j), priority: j.priority, due_date: j.due_date || '',
    })
  }

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading jobs{'…'}</div>

  const TABS = [
    ['mine', 'My jobs', counts.mine],
    ['review', 'Awaiting review', counts.review],
    ['active', 'All open', counts.active],
    ['late', 'Overdue', counts.late],
    ['done', 'Closed', null],
  ]
  const openJob = jobs.find(j => j.id === openId)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="page-title">Team jobs</div>
          <div className="page-subtitle">
            {counts.active} open {'·'} {counts.review} awaiting review {'·'} {counts.late} overdue
            {isCloser ? ' · you can close jobs' : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setErr(''); setForm({ ...EMPTY }) }}>+ New job</button>
      </div>

      {err && !form && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {TABS.map(([k, label, n]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(k)}>
            {label}{n ? ` (${n})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-select" style={{ maxWidth: 260 }} value={who} onChange={e => setWho(e.target.value)}>
          <option value="">Everyone</option>
          {people.map(p => <option key={personKey(p)} value={personKey(p)}>{p.name}</option>)}
        </select>
        <input className="form-input" style={{ maxWidth: 260 }} placeholder="Search jobs" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {shown.length === 0 ? (
        <div className="card" style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {tab === 'mine' ? 'Nothing assigned to you right now.' :
           tab === 'review' ? 'No jobs waiting for review.' :
           tab === 'late' ? 'Nothing overdue.' : 'No jobs here.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(j => {
            const due = dueInfo(j)
            return (
              <div key={j.id} className="card card-hover" onClick={() => setOpenId(j.id)}
                style={{ padding: '12px 16px', cursor: 'pointer', borderLeft: `3px solid ${j.status === 'sent_back' || due?.late ? 'var(--red)' : j.status === 'submitted' ? 'var(--amber)' : 'transparent'}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>#{j.number}</span>
                  <span style={{ fontWeight: 500, flex: '1 1 220px', minWidth: 0 }}>{j.title}</span>
                  {j.priority !== 'normal' && <span className={`badge ${PRIORITY[j.priority].badge}`}>{PRIORITY[j.priority].label}</span>}
                  <span className={`badge ${STATUS[j.status].badge}`}>{STATUS[j.status].label}</span>
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  <span>{nameFor.job(j)}</span>
                  {due && <span style={{ color: due.color, fontWeight: due.late ? 600 : 400 }}>{due.text}</span>}
                  {j.status === 'closed' && j.closed_at && <span>Closed {fmtDate(j.closed_at.slice(0, 10))}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isCloser && <Closers closers={closers} people={people} uid={uid} onChange={load} />}

      {openJob && !form && (
        <JobModal job={openJob} uid={uid} isCloser={isCloser} nameFor={nameFor}
          onClose={() => setOpenId(null)} onEdit={() => editJob(openJob)} onChanged={changed} />
      )}

      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{form.id ? 'Edit job' : 'New job'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>{'✕'}</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Job</label>
                <input className="form-input" autoFocus value={form.title} placeholder="e.g. Photograph new consignment from Studio X"
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">For</label>
                  <select className="form-select" value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })}>
                    <option value="">Choose{'…'}</option>
                    {people.map(p => <option key={personKey(p)} value={personKey(p)}>{p.name}{p.user_id === uid ? ' (me)' : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due</label>
                  <input type="date" className="form-input" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                  {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Details</label>
                <textarea className="form-textarea" value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Done means</label>
                <textarea className="form-textarea" style={{ minHeight: 60 }} value={form.done_means}
                  placeholder="What will be checked before this is closed, e.g. all 12 works uploaded with photos and prices"
                  onChange={e => setForm({ ...form, done_means: e.target.value })} />
              </div>
              {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveForm}>{saving ? 'Saving…' : form.id ? 'Save' : 'Add job'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function JobModal({ job, uid, isCloser, nameFor, onClose, onEdit, onChanged }) {
  const [events, setEvents] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function loadEvents() {
    const { data } = await supabase.from('job_events').select('*').eq('job_id', job.id).order('created_at')
    setEvents(data || [])
  }
  useEffect(() => { loadEvents() }, [job.id, job.updated_at])

  async function setStatus(status, needsNote) {
    if (needsNote && !note.trim()) { setErr(needsNote); return }
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('job_set_status', { p_job: job.id, p_status: status, p_note: note.trim() || null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNote('')
    onChanged()
  }

  async function comment() {
    if (!note.trim()) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('job_events').insert({ job_id: job.id, kind: 'comment', body: note.trim(), by_user: uid })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setNote('')
    loadEvents()
  }

  const s = job.status
  const closed = s === 'closed' || s === 'cancelled'
  const due = dueInfo(job)
  const actions = []
  if (s === 'open' || s === 'sent_back') actions.push(['Start', () => setStatus('in_progress'), 'btn-outline'])
  if (s === 'in_progress') actions.push(['Pause', () => setStatus('open'), 'btn-outline'])
  if (['open', 'in_progress', 'sent_back'].includes(s))
    actions.push(['Submit for review', () => setStatus('submitted', 'Write what was done before submitting'), 'btn-gold'])
  if (s === 'submitted' && !isCloser) actions.push(['Withdraw', () => setStatus('in_progress'), 'btn-outline'])
  if (isCloser && !closed) {
    if (s === 'submitted') actions.push(['Send back', () => setStatus('sent_back', 'Write why it is being sent back'), 'btn-danger'])
    actions.push(['Close job', () => setStatus('closed'), 'btn-primary'])
    actions.push(['Cancel job', () => confirm('Cancel this job? It will be kept in the history.') && setStatus('cancelled'), 'btn-ghost'])
  }
  if (isCloser && closed) actions.push(['Reopen', () => setStatus('open'), 'btn-outline'])

  const lastSentBack = [...events].reverse().find(e => e.to_status === 'sent_back')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">#{job.number} {job.title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{'✕'}</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontSize: 13 }}>
            <span className={`badge ${STATUS[s].badge}`}>{STATUS[s].label}</span>
            <span className={`badge ${PRIORITY[job.priority].badge}`}>{PRIORITY[job.priority].label}</span>
            <span>For <strong>{nameFor.job(job)}</strong></span>
            {due && <span style={{ color: due.color, fontWeight: due.late ? 600 : 400 }}>{'·'} {due.text}</span>}
            <span style={{ color: 'var(--muted)' }}>{'·'} logged by {nameFor.user(job.created_by)} {fmtDate(job.created_at.slice(0, 10))}</span>
            {(!closed || isCloser) && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onEdit}>Edit</button>}
          </div>

          {s === 'sent_back' && lastSentBack?.body && (
            <div style={{ background: '#fce8e8', color: 'var(--red)', padding: '10px 14px', borderRadius: 3, fontSize: 13, marginBottom: 14 }}>
              <strong>Sent back:</strong> {lastSentBack.body}
            </div>
          )}

          {job.details && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginBottom: 14 }}>{job.details}</div>}
          {job.done_means && (
            <div style={{ background: 'var(--parchment)', padding: '10px 14px', borderRadius: 3, fontSize: 13, marginBottom: 18 }}>
              <div className="form-label" style={{ marginBottom: 4 }}>Done means</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{job.done_means}</div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Note</label>
            <textarea className="form-textarea" style={{ minHeight: 64 }} value={note} onChange={e => setNote(e.target.value)}
              placeholder={s === 'submitted' && isCloser ? 'Reason for sending back, or a closing note' : 'What was done, an update, or a question'} />
          </div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 22 }}>
            {actions.map(([label, fn, cls]) => (
              <button key={label} className={`btn btn-sm ${cls}`} disabled={busy} onClick={fn}>{label}</button>
            ))}
            <button className="btn btn-sm btn-ghost" disabled={busy || !note.trim()} onClick={comment}>Add comment</button>
          </div>
          {s === 'submitted' && !isCloser && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -14, marginBottom: 18 }}>Waiting for review {'—'} only an approved closer can close this job.</div>
          )}

          <div className="form-label" style={{ marginBottom: 8 }}>History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...events].reverse().map(e => (
              <div key={e.id} style={{ fontSize: 13, borderLeft: '2px solid var(--line)', paddingLeft: 12 }}>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {fmtWhen(e.created_at)} {'·'} {nameFor.user(e.by_user)}
                  {e.kind === 'created' && ' logged this job'}
                  {e.kind === 'status' && <> {'→'} <span className={`badge ${STATUS[e.to_status]?.badge}`}>{STATUS[e.to_status]?.label}</span></>}
                  {e.kind === 'comment' && ' commented'}
                  {e.kind === 'change' && ' edited'}
                </div>
                {e.body && <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{e.body}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Closers({ closers, people, uid, onChange }) {
  const logins = people.filter(p => p.user_id)
  const [add, setAdd] = useState('')
  const [err, setErr] = useState('')

  async function addCloser() {
    if (!add) return
    const { error } = await supabase.from('job_closers').insert({ user_id: add })
    if (error) { setErr(error.message); return }
    setAdd(''); onChange()
  }
  async function remove(id) {
    if (id === uid && !confirm('Remove yourself as a closer? Someone else will have to add you back.')) return
    if (closers.length === 1) { setErr('There must be at least one closer.'); return }
    const { error } = await supabase.from('job_closers').delete().eq('user_id', id)
    if (error) { setErr(error.message); return }
    onChange()
  }

  return (
    <div style={{ marginTop: 32, padding: '16px 20px', background: 'var(--parchment)', borderRadius: 3, fontSize: 13 }}>
      <div className="form-label" style={{ marginBottom: 8 }}>Who can close jobs</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {closers.map(id => (
          <span key={id} className="badge badge-blue" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {logins.find(p => p.user_id === id)?.name || 'Unknown login'}{id === uid ? ' (me)' : ''}
            <button onClick={() => remove(id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>{'✕'}</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="form-select" style={{ maxWidth: 260 }} value={add} onChange={e => setAdd(e.target.value)}>
          <option value="">Add a closer{'…'}</option>
          {logins.filter(p => !closers.includes(p.user_id)).map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
        </select>
        <button className="btn btn-sm btn-outline" disabled={!add} onClick={addCloser}>Add</button>
      </div>
      {err && <div style={{ color: 'var(--red)', marginTop: 8 }}>{err}</div>}
      <div style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
        Only people with a staff login can update or close jobs. Positions without a login can still be given jobs; someone with a login updates them on their behalf.
      </div>
    </div>
  )
}
