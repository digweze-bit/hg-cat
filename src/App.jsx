import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { AuthProvider } from './components/AuthProvider'
import RequireAuth from './components/RequireAuth'

// Public pages \u2014 load immediately
import Catalogue from './pages/Catalogue'
import AdminLogin from './pages/AdminLogin'

// Admin pages \u2014 lazy loaded
const AdminLayout  = lazy(() => import('./pages/AdminLayout'))
const Dashboard    = lazy(() => import('./pages/Dashboard'))
const Artists      = lazy(() => import('./pages/Artists'))
const Artworks     = lazy(() => import('./pages/Artworks'))
const Archive      = lazy(() => import('./pages/Archive'))
const Sales        = lazy(() => import('./pages/Sales'))
const Safekeeping  = lazy(() => import('./pages/Safekeeping'))
const CRM = lazy(() => import('./pages/CRM'))
const BackfillThumbnails = lazy(() => import('./pages/BackfillThumbnails'))
const Consignors   = lazy(() => import('./pages/Consignors'))
const Books        = lazy(() => import('./pages/Books'))
const Forms        = lazy(() => import('./pages/Forms'))
const Reports      = lazy(() => import('./pages/Reports'))
const Certificates = lazy(() => import('./pages/Certificates'))
const Users        = lazy(() => import('./pages/Users'))
const ArtworkPage  = lazy(() => import('./pages/ArtworkPage'))
const FormSign     = lazy(() => import('./pages/FormSign'))

function PageLoader() {
  return (
    <div style={{ minHeight:'60vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:'sans-serif', fontSize:13, color:'#9a9490' }}>Loading{'\u2026'}</div>
    </div>
  )
}

function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <div style={{ position:'fixed', bottom:16, left:'50%', transform:'translateX(-50%)', background:'#1a1714', color:'#fff', padding:'10px 20px', borderRadius:4, fontSize:13, zIndex:9999, display:'flex', gap:12, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,.3)' }}>
      <span>New version available</span>
      <button onClick={() => { updateServiceWorker(true); setTimeout(() => window.location.reload(), 500) }}
        style={{ background:'#E05C2A', border:'none', color:'#fff', padding:'4px 12px', borderRadius:3, cursor:'pointer', fontSize:12, fontWeight:600 }}>
        Update
      </button>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UpdateBanner />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Catalogue />} />
            <Route path="/artwork/:id" element={<ArtworkPage />} />
            <Route path="/sign/:token" element={<FormSign />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }>
              <Route index element={<Dashboard />} />
              <Route path="artists" element={<Artists />} />
              <Route path="artworks" element={<Artworks />} />
              <Route path="archive" element={<Archive />} />
              <Route path="archive/:artistId" element={<Archive />} />
              <Route path="sales" element={<Sales />} />
              <Route path="safekeeping" element={<Safekeeping />} />
              <Route path="crm" element={<CRM />} />
              <Route path="backfill-thumbnails" element={<BackfillThumbnails />} />
              <Route path="consignors" element={<Consignors />} />
              <Route path="books" element={<Books />} />
              <Route path="forms" element={<Forms />} />
              <Route path="catalogue" element={<CatalogueBuilder />} />
              <Route path="reports" element={<Reports />} />
              <Route path="certificates" element={<Certificates />} />
              <Route path="users" element={<Users />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
import CatalogueBuilder from './pages/CatalogueBuilder'
