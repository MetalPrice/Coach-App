import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import BottomNav from '../components/BottomNav'

export default function LibraryConnection() {
  return (
    <div className="screen">
      <div className="screen-content">
        <header className="row-between">
          <h1 className="screen-title">Library &amp; Connection</h1>
          <button className="ghost-button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </header>

        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            placeholder="Search tools, exercises, topics..."
          />
        </div>

        <div className="row-between section-head">
          <h2 className="section-title">Recommended for You</h2>
          <button className="see-all-link">SEE ALL</button>
        </div>

        <div className="recommended-grid">
          <article className="resource-card resource-card-sage">
            <div className="resource-badge">◉</div>
            <p className="resource-title">Breathing Reset</p>
            <p className="resource-subtitle">2-minute grounding exercise</p>
          </article>
          <article className="resource-card resource-card-peach">
            <div className="resource-badge">◎</div>
            <p className="resource-title">Thought Reframe</p>
            <p className="resource-subtitle">Quick perspective shift</p>
          </article>
        </div>

        <h2 className="section-title journey-title">Your Journey</h2>

        <Link className="journey-row" to="/journal">
          <div className="journey-icon">◌</div>
          <div>
            <p className="journey-row-title">Reflection Journal</p>
            <p className="journey-row-subtitle">Capture thoughts and emotions</p>
          </div>
          <span className="journey-arrow">›</span>
        </Link>

        <Link className="journey-row" to="/progress">
          <div className="journey-icon">◍</div>
          <div>
            <p className="journey-row-title">View History</p>
            <p className="journey-row-subtitle">Review your progress timeline</p>
          </div>
          <span className="journey-arrow">›</span>
        </Link>
      </div>
      <BottomNav />
    </div>
  )
}

