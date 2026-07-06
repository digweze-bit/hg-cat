import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Catalogue from './pages/Catalogue'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './pages/AdminLayout'
import Dashboard from './pages/Dashboard'
import Artists from './pages/Artists'
import Artworks from './pages/Artworks'
import Archive from './pages/Archive'
import Sales from './pages/Sales'
import Certificates from './pages/Certificates'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Consignors from './pages/Consignors'
import Books from './pages/Books'
import ArtworkPage from './pages/ArtworkPage'
import { AuthProvider } from './components/AuthProvider'
import RequireAuth from './components/RequireAuth'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public catalogue */}
          <Route path="/" element={<Catalogue />} />
          <Route path="/artwork/:id" element={<ArtworkPage />} />

          {/* Admin login */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Protected admin routes */}
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
            <Route path="reports" element={<Reports />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="users" element={<Users />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
