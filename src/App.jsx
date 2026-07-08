import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { supabase } from './lib/supabaseClient'

function App() {
  const [count, setCount] = useState(0)

  const testSupabaseConnection = async () => {
    try {
      const { data, error } = await supabase.from('test').select()
      console.log('Supabase data:', data)
      console.log('Supabase error:', error)
    } catch (err) {
      console.error('Unexpected error when calling Supabase:', err)
    }
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <button style={{ marginLeft: '1rem' }} onClick={testSupabaseConnection}>
          Test Supabase
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs" >
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
