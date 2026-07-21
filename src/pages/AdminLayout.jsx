import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../components/AuthProvider'

const NAV = [
  { section: 'Catalogue' },
  { path: '/admin', label: 'Dashboard', icon: '\u25A4' },
  { path: '/admin/artists', label: 'Artists', icon: '\u25CE' },
  { path: '/admin/artworks', label: 'Artworks', icon: '\u25FB' },
  { section: 'Archive' },
  { path: '/admin/archive', label: 'Live Archive', icon: '\u25C8' },
  { section: 'Commerce' },
  { path: '/admin/sales', label: 'Sales & Invoices', icon: '\u25D1' },
  { path: '/admin/safekeeping', label: 'Safekeeping', icon: '\u25C8' },
  { path: '/admin/crm', label: 'CRM', icon: '\u25C7' },
  { path: '/admin/consignors', label: 'Consignors', icon: '\u25D0' },
  { path: '/admin/books', label: 'Books', icon: '\u25A3' },
  { path: '/admin/catalogue', label: 'Catalogue', icon: '\u25A4' },
  { path: '/admin/forms', label: 'Forms', icon: '\u25FB' },
  { path: '/admin/reports', label: 'Reports', icon: '\u25E7' },
  { path: '/admin/certificates', label: 'Certificates', icon: '\u25C7' },
  { section: 'Admin' },
  { path: '/admin/users', label: 'Staff users', icon: '\u25C9' },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="admin-layout">
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

      <div className="admin-main">
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
          <a href="/" target="_blank" style={{ fontSize:12, color:'var(--muted)' }}>
            View public site {'\u2197'}
          </a>
        </div>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
