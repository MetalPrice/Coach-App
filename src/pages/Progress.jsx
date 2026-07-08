import BottomNav from '../components/BottomNav'

export default function Progress() {
  return (
    <div className="screen">
      <div className="screen-content">
        <h1 className="screen-title">Progress</h1>
        <p className="muted-line">Streaks and milestones will appear as you keep showing up.</p>
        <div className="empty-state">
          <div className="empty-icon">◔</div>
          <p className="empty-title">Your progress timeline is warming up</p>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}

