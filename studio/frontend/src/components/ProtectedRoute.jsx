import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import { authApi } from '../api/client'

export default function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user)
  const authChecked = useAuthStore((s) => s.authChecked)
  const setAuth = useAuthStore((s) => s.setAuth)
  const logout = useAuthStore((s) => s.logout)
  const setAuthChecked = useAuthStore((s) => s.setAuthChecked)
  const location = useLocation()
  const [checking, setChecking] = useState(!authChecked)

  useEffect(() => {
    if (authChecked && user) {
      setChecking(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await authApi.me()
        if (!cancelled && res.data?.user) {
          setAuth(res.data.user)
        } else if (!cancelled) {
          logout()
        }
      } catch {
        if (!cancelled) logout()
      } finally {
        if (!cancelled) {
          setAuthChecked()
          setChecking(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [authChecked, user, setAuth, logout, setAuthChecked])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted">
        <div className="text-center space-y-3">
          <span className="spinner-ring mx-auto block" />
          <p className="text-sm">Loading your studio…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
