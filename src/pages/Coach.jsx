import BottomNav from '../components/BottomNav'

export default function Coach() {
  return (
    <div className="screen">
      <div className="screen-content">
        <h1 className="screen-title">Coach</h1>
        <p className="muted-line">Messages and guidance from your coach will appear here.</p>
        <div className="empty-state">
          <div className="empty-icon">◌</div>
          <p className="empty-title">Coach check-ins coming soon</p>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

