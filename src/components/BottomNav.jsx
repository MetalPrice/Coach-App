import { NavLink } from 'react-router-dom'

const items = [
  { to: '/home', label: 'Home', icon: '⌂' },
  { to: '/journal', label: 'Journal', icon: '◍' },
  { to: '/library', label: 'Library', icon: '◎' },
  { to: '/coach', label: 'Coach', icon: '◌' },
  { to: '/progress', label: 'Progress', icon: '◔' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `bottom-nav-link ${isActive ? 'active' : ''}`
          }
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

