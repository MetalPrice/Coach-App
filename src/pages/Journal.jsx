import { useEffect, useState } from 'react'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabaseClient'

function formatDate(value) {
  const d = new Date(value)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function Journal() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!user?.id) return
      setLoading(true)
      const { data, error } = await supabase
        .from('entries')
        .select('*')
        .eq('coachee_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load entries:', error)
        setEntries([])
      } else {
        setEntries(data || [])
      }
      setLoading(false)
    }
    load()
  }, [user?.id])

  return (
    <div className="screen">
      <div className="screen-content">
        <h1 className="screen-title">Journal</h1>
        <p className="muted-line">Your check-ins, in one place.</p>

        {loading ? (
          <div className="skeleton-stack">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : null}

        {!loading && entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✦</div>
            <p className="empty-title">No journal entries yet</p>
            <p className="empty-text">Record your day to create your first reflection.</p>
          </div>
        ) : null}

        {!loading &&
          entries.map((entry) => {
            const transcript = String(entry.transcript || '').replace(/\s+/g, ' ').trim()
            const preview =
              transcript.length > 110 ? `${transcript.slice(0, 110)}...` : transcript
            const sentiment =
              entry.sentiment_label || entry.sentiment || entry.mood || null

            return (
              <article key={entry.id} className="journal-card">
                <div className="row-between">
                  <p className="journal-date">{formatDate(entry.created_at)}</p>
                  {sentiment ? (
                    <span className="journal-tag">{String(sentiment)}</span>
                  ) : null}
                </div>
                <p className="journal-preview">{preview || 'No transcript available.'}</p>
              </article>
            )
          })}
      </div>
      <BottomNav />
    </div>
  )
}

