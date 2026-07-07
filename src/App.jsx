import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from './components/AuthProvider'
import RequireAuth from './components/RequireAuth'

// Public pages — load immediately
import Catalogue from './pages/Catalogue'
import AdminLogin from './pages/AdminLogin'

// Heavy admin pages — load only when navigated to
const AdminLayout    = lazy(() => import('./pages/AdminLayout'))
const Dashboard      = lazy(() => import('./pages/Dashboard'))
const Artists        = lazy(() => import('./pages/Artists'))
const Artworks       = lazy(() => import('./pages/Artworks'))
const Archive        = lazy(() => import('./pages/Archive'))
const Sales          = lazy(() => import('./pages/Sales'))
const Consignors     = lazy(() => import('./pages/Consignors'))
const Books          = lazy(() => import('./pages/Books'))
const Forms          = lazy(() => import('./pages/Forms'))
const Reports        = lazy(() => import('./pages/Reports'))
const Certificates   = lazy(() => import('./pages/Certificates'))
const Users          = lazy(() => import('./pages/Users'))
const ArtworkPage    = lazy(() => import('./pages/ArtworkPage'))
const FormSign       = lazy(() => import('./pages/FormSign'))

function PageLoader() {
  return (
    <div style={{ minHeight:'60vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontFamily:'sans-serif', fontSize:13, color:'#9a9490' }}>Loading…</div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Catalogue />} />
            <Route path="/artwork/:id" element={<ArtworkPage />} />
            <Route path="/sign/:token" element={<FormSign />} />

            {/* Auth */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Protected admin */}
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
              <Route path="consignors" element={<Consignors />} />
              <Route path="books" element={<Books />} />
              <Route path="forms" element={<Forms />} />
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
