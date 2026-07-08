import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export default function ProtectedRoute({ allowRoles }) {
  const { loading, session, role } = useAuth()
  const location = useLocation()

  if (loading) return null

  if (!session) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    )
  }

  if (Array.isArray(allowRoles) && allowRoles.length > 0) {
    if (!role) return <Navigate to="/login" replace />
    if (!allowRoles.includes(role)) return <Navigate to="/login" replace />
  }

  return <Outlet />
}

