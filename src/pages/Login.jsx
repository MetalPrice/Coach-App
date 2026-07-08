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
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      <h2>Log in</h2>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Log in'}
        </button>

        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      </form>

      <p style={{ marginTop: 16 }}>
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  )
}

