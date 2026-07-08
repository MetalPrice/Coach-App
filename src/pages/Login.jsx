import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchUserRole } from '../lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // If already logged in, redirect using existing session.
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data?.session ?? null
      if (!session?.user?.id) return

      const roleResult = await fetchUserRole(session.user.id)
      const normalizedRole = roleResult?.role
        ? String(roleResult.role).trim().toLowerCase()
        : null

      if (normalizedRole === 'coachee') navigate('/home', { replace: true })
      else if (normalizedRole === 'coach' || normalizedRole === 'admin')
        navigate('/admin', { replace: true })
    })
  }, [navigate])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    setSubmitting(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    // Ensure the auth session is actually established before hitting RLS-protected tables.
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData?.session ?? null
    const userId = session?.user?.id ?? data?.user?.id

    const roleResult = await fetchUserRole(userId)
    const normalizedRole = roleResult?.role
      ? String(roleResult.role).trim().toLowerCase()
      : null

    if (normalizedRole === 'coachee') {
      navigate('/home', { replace: true })
      return
    }

    if (normalizedRole === 'coach' || normalizedRole === 'admin') {
      navigate('/admin', { replace: true })
      return
    }

    // Surface the underlying Supabase error (RLS, wrong column, empty result, etc.)
    console.error('Role lookup failed:', roleResult?.error)

    setError(
      'Logged in, but could not determine your role from public.users.'
    )
  }

  return (
    <div className="auth-screen">
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-subtitle">Log in to continue your coaching journey.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          <span>Email</span>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </label>

        <label className="auth-label">
          <span>Password</span>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </label>

        <button className="auth-primary-btn" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Log in'}
        </button>

        {error ? <p className="auth-error">{error}</p> : null}
      </form>

      <p className="auth-footer">
        New here?{' '}
        <Link className="auth-link" to="/signup">
          Create an account
        </Link>
      </p>
    </div>
  )
}

