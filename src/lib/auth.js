import { supabase } from './supabaseClient'

export async function fetchUserRole(userId) {
  if (!userId) return { role: null, error: null }

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  return { role: data?.role ?? null, error: error ?? null }
}

