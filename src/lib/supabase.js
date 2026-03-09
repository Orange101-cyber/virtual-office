import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Fetch a single monthly report by its month string (e.g. "2026-03").
 * Returns the row object or null if not found.
 */
export async function getReportByMonth(month) {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('month', month)
    .single()

  if (error) {
    console.error('Error fetching report for', month, error)
    return null
  }
  return data
}

/**
 * Fetch all distinct months that have reports, ordered newest-first.
 * Returns an array of month strings, e.g. ["2026-03", "2026-02", ...].
 */
export async function getAllMonths() {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('month')
    .order('month', { ascending: false })

  if (error) {
    console.error('Error fetching months', error)
    return []
  }
  return data.map((row) => row.month)
}
