import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Admin from './pages/Admin'
import LibraryConnection from './pages/LibraryConnection'

function App() {
  return (
    <div className="mobile-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route element={<ProtectedRoute allowRoles={['coachee']} />}>
          <Route path="/home" element={<Home />} />
          <Route path="/library" element={<LibraryConnection />} />
        </Route>

        <Route element={<ProtectedRoute allowRoles={['coach', 'admin']} />}>
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  )
}

export default App
