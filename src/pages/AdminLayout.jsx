import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'

const NAV = [
  { section: 'Catalogue' },
  { path: '/admin', label: 'Dashboard', icon: '▤' },
  { path: '/admin/artists', label: 'Artists', icon: '◎' },
  { path: '/admin/artworks', label: 'Artworks', icon: '◻' },
  { section: 'Archive' },
  { path: '/admin/archive', label: 'Live Archive', icon: '◈' },
  { section: 'Commerce' },
  { path: '/admin/sales', label: 'Sales & Invoices', icon: '◑' },
  { path: '/admin/consignors', label: 'Consignors', icon: '◐' },
  { path: '/admin/books', label: 'Books', icon: '▣' },
  { path: '/admin/forms', label: 'Forms', icon: '◻' },
  { path: '/admin/reports', label: 'Reports', icon: '◧' },
  { path: '/admin/certificates', label: 'Certificates', icon: '◇' },
  { section: 'Admin' },
  { path: '/admin/users', label: 'Staff users', icon: '◉' },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  // Show loader on route change
  useEffect(() => {
    setIsLoading(true)
    const t = setTimeout(() => setIsLoading(false), 800)
    return () => clearTimeout(t)
  }, [location.pathname])
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  // Inject loading animation CSS once
  useEffect(() => {
    if (document.getElementById('hg-loader-css')) return
    const s = document.createElement('style')
    s.id = 'hg-loader-css'
    s.textContent = '@keyframes hg-progress{0%{opacity:1;transform:scaleX(.1);transform-origin:left}50%{opacity:1;transform:scaleX(.7);transform-origin:left}100%{opacity:0;transform:scaleX(1);transform-origin:left}}@keyframes hg-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
    document.head.appendChild(s)
  }, [])

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">Hourglass</div>
          <div className="sidebar-logo-sub">Gallery Platform</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className="sidebar-section">{item.section}</div>
            )
            return (
              <div
                key={item.path}
                className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span style={{ fontSize:14, opacity:.8 }}>{item.icon}</span>
                {item.label}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginBottom:8 }}>
            {profile?.full_name || profile?.email}
            <span style={{ marginLeft:6, background:'rgba(255,255,255,.1)', padding:'1px 6px', borderRadius:3, fontSize:10, textTransform:'uppercase' }}>
              {profile?.role}
            </span>
          </div>
          <button
            onClick={signOut}
            style={{ fontSize:12, color:'rgba(255,255,255,.4)', background:'none', border:'none', cursor:'pointer', padding:0 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="admin-main">
        {/* Global loading indicator */}
        {isLoading && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            height: 3, background: 'linear-gradient(90deg, #E05C2A, #b8862a)',
            animation: 'hg-progress 1.2s ease-in-out infinite',
          }} />
        )}
        <div className="admin-topbar">
          <div style={{ fontSize:13, color:'var(--muted)' }}>
            {location.pathname === '/admin' ? 'Dashboard' :
             location.pathname.includes('artists') ? 'Artists' :
             location.pathname.includes('artworks') ? 'Artworks' :
             location.pathname.includes('archive') ? 'Live Archive' :
             location.pathname.includes('sales') ? 'Sales & Invoices' :
             location.pathname.includes('consignors') ? 'Consignors' :
             location.pathname.includes('books') ? 'Books' :
             location.pathname.includes('forms') ? 'Forms' :
             location.pathname.includes('certificates') ? 'Certificates' :
             location.pathname.includes('users') ? 'Staff Users' : ''}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            {isLoading && (
              <div style={{ display:'flex', alignItems:'center', gap:6, color:'#E05C2A', fontSize:12 }}>
                <span style={{ display:'inline-block', animation:'hg-spin 1s linear infinite', fontSize:16 }}>⧗</span>
                Loading…
              </div>
            )}
            <a href="/" target="_blank" style={{ fontSize:12, color:'var(--muted)' }}>
              View public site ↗
            </a>
          </div>
        </div>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
