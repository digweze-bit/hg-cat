import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentInvoices, setRecentInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Two parallel calls instead of seven
      const [
        { data: invoices },
        [artists, artworks, clients],
      ] = await Promise.all([
        supabase.from('invoices').select('*, clients(name)').order('created_at', { ascending:false }).limit(5),
        Promise.all([
          supabase.from('artists').select('id', { count:'exact', head:true }),
          supabase.from('artworks').select('id,availability', { count:'exact' }).range(0,4999),
          supabase.from('clients').select('id', { count:'exact', head:true }),
        ])
      ])
      const artworkData = artworks.data || []
      setStats({
        totalArtists:   artists.count || 0,
        totalArtworks:  artworkData.length,
        availableWorks: artworkData.filter(w => w.availability === 'Available').length,
        soldWorks:      artworkData.filter(w => w.availability === 'Sold').length,
        totalClients:   clients.count || 0,
        pendingInvoices: (invoices||[]).filter(i => ['sent','partial'].includes(i.status)).length,
      })
      setRecentInvoices(invoices || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color:'var(--muted)', fontSize:14 }}>Loading…</div>

  const statCards = [
    { label: 'Artists', value: stats.totalArtists, path: '/admin/artists', color: 'var(--ink)' },
    { label: 'Total works', value: stats.totalArtworks, path: '/admin/artworks', color: 'var(--ink)' },
    { label: 'Available', value: stats.availableWorks, path: '/admin/artworks', color: 'var(--green)' },
    { label: 'Sold', value: stats.soldWorks, path: '/admin/artworks', color: 'var(--red)' },
    { label: 'Clients', value: stats.totalClients, path: '/admin/sales', color: 'var(--blue)' },
    { label: 'Pending invoices', value: stats.pendingInvoices, path: '/admin/sales', color: 'var(--amber)' },
  ]

  const statusColors = { draft:'var(--muted)', sent:'var(--blue)', partial:'var(--amber)', paid:'var(--green)', cancelled:'var(--red)' }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">Hourglass Gallery — at a glance</div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:14, marginBottom:36 }}>
        {statCards.map(s => (
          <div key={s.label} className="card" style={{ padding:'18px 20px', cursor:'pointer' }} onClick={() => navigate(s.path)}>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:'2rem', color:s.color, lineHeight:1 }}>{s.value?.toLocaleString() ?? '—'}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginTop:6, textTransform:'uppercase', letterSpacing:'.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent invoices */}
      <div className="card">
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:'1.1rem' }}>Recent invoices</div>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/admin/sales')}>View all</button>
        </div>
        {recentInvoices.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No invoices yet</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th><th>Client</th><th>Total</th><th>Status</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map(inv => (
                  <tr key={inv.id} style={{ cursor:'pointer' }} onClick={() => navigate('/admin/sales')}>
                    <td style={{ fontFamily:'var(--font-serif)' }}>{inv.invoice_number}</td>
                    <td>{inv.clients?.name || '—'}</td>
                    <td>{inv.currency} {Number(inv.total).toLocaleString()}</td>
                    <td><span className="badge" style={{ background: statusColors[inv.status]+'22', color: statusColors[inv.status] }}>{inv.status}</span></td>
                    <td style={{ color:'var(--muted)', fontSize:12 }}>{inv.issue_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ marginTop:28 }}>
        <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--muted)', marginBottom:12 }}>Quick actions</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={() => navigate('/admin/artworks')}>+ Add artwork</button>
          <button className="btn btn-outline" onClick={() => navigate('/admin/artists')}>+ Add artist</button>
          <button className="btn btn-outline" onClick={() => navigate('/admin/sales')}>+ New invoice</button>
          <button className="btn btn-outline" onClick={() => navigate('/admin/reports')}>Reports</button>
          <button className="btn btn-outline" onClick={() => navigate('/admin/certificates')}>Generate COA</button>
          <button className="btn btn-outline" onClick={() => navigate('/admin/archive')}>Live Archive</button>
        </div>
      </div>
    </div>
  )
}
