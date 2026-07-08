import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchUserRole } from '../lib/auth'
import { AuthContext } from './AuthContextBase'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function init() {
      const { data } = await supabase.auth.getSession()
      const nextSession = data?.session ?? null

      if (!isMounted) return
      setSession(nextSession)

      if (nextSession?.user?.id) {
        const { role: nextRole } = await fetchUserRole(nextSession.user.id)
        if (!isMounted) return
        setRole(nextRole)
      } else {
        setRole(null)
      }

      setLoading(false)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!isMounted) return
        setSession(nextSession)

        if (nextSession?.user?.id) {
          setLoading(true)
          const { role: nextRole } = await fetchUserRole(nextSession.user.id)
          if (!isMounted) return
          setRole(nextRole)
          setLoading(false)
        } else {
          setRole(null)
        }
      }
    )

    return () => {
      isMounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      loading,
    }),
    [session, role, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

