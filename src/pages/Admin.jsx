import { supabase } from '../lib/supabaseClient'

export default function Admin() {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h2>Admin (Coach/Admin)</h2>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}

