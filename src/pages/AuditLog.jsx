import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ACTION_LABELS = {
  'artwork.created':    { label: 'Artwork created',    color: 'var(--green,#27ae60)' },
  'artwork.updated':    { label: 'Artwork updated',    color: 'var(--amber,#b8862a)' },
  'artwork.deleted':    { label: 'Artwork deleted',    color: 'var(--red,#c0392b)' },
  'invoice.created':   { label: 'Invoice created',    color: 'var(--green,#27ae60)' },
  'invoice.deleted':   { label: 'Invoice deleted',    color: 'var(--red,#c0392b)' },
  'payment.added':     { label: 'Payment added',      color: 'var(--green,#27ae60)' },
  'payment.deleted':   { label: 'Payment deleted',    color: 'var(--red,#c0392b)' },
  'artwork.collected': { label: 'Artwork collected',  color: 'var(--green,#27ae60)' },
  'client.created':    { label: 'Client created',     color: 'var(--green,#27ae60)' },
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PER_PAGE = 50

  useEffect(() => {
    load()
  }, [filter, page])

  async function load() {
    setLoading(true)
    let q = supabase.from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)
    if (filter) q = q.eq('action', filter)
    const { data } = await q
    setLogs(data || [])
    setLoading(false)
  }

  const filtered = search
    ? logs.filter(l =>
        l.entity_label?.toLowerCase().includes(search.toLowerCase()) ||
        l.user_email?.toLowerCase().includes(search.toLowerCase()) ||
        l.action?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Activity log</div>
        <div className="page-subtitle">System audit trail — all key actions recorded</div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input className="form-input" style={{ width:220 }} placeholder="Search..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-select" style={{ width:180 }} value={filter} onChange={e => { setFilter(e.target.value); setPage(0) }}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => load()}>Refresh</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Item</th>
                <th>User</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>Loading...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>No log entries found</td></tr>
              )}
              {!loading && filtered.map(log => {
                const meta = ACTION_LABELS[log.action] || { label: log.action, color: 'var(--muted)' }
                const dt = new Date(log.created_at)
                return (
                  <tr key={log.id}>
                    <td style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>
                      <div>{dt.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>
                      <div>{dt.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>
                    </td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:600, color: meta.color, textTransform:'uppercase', letterSpacing:'.04em' }}>
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ fontSize:13, fontWeight:500 }}>{log.entity_label || '—'}</td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{log.user_email || '—'}</td>
                    <td style={{ fontSize:11, color:'var(--muted)' }}>
                      {log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', gap:8, padding:'12px 16px', borderTop:'1px solid var(--line-soft)' }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>&larr; Prev</button>
          <span style={{ fontSize:12, color:'var(--muted)', padding:'4px 8px' }}>Page {page + 1}</span>
          <button className="btn btn-ghost btn-sm" disabled={logs.length < PER_PAGE} onClick={() => setPage(p => p + 1)}>Next &rarr;</button>
        </div>
      </div>
    </div>
  )
}
