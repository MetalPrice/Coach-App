import { supabase } from '../lib/supabaseClient'

export default function Home() {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h2>Home (Coachee)</h2>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}

