import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Signup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    })

    setSubmitting(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setMessage(
      'Signup successful. If email confirmation is enabled, check your inbox before logging in.'
    )
    navigate('/login', { replace: true })
  }

  return (
    <div className="auth-screen">
      <h1 className="auth-title">Create account</h1>
      <p className="auth-subtitle">Start your daily check-ins in under a minute.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          <span>Name</span>
          <input
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Coach"
          />
        </label>

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
            minLength={6}
            placeholder="••••••••"
          />
        </label>

        <button className="auth-primary-btn" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        {error ? <p className="auth-error">{error}</p> : null}
        {message ? <p className="auth-ok">{message}</p> : null}
      </form>

      <p className="auth-footer">
        Already have an account?{' '}
        <Link className="auth-link" to="/login">
          Log in
        </Link>
      </p>
    </div>
  )
}

