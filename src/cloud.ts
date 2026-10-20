import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
let accessToken: string | null = null
let network = new AbortController()
window.addEventListener('offline', () => network.abort())
window.addEventListener('online', () => { network = new AbortController() })
const transport = { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.any([network.signal, AbortSignal.timeout(12000), ...(init?.signal ? [init.signal] : [])]) }) }
export const cloud = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: transport,
}) : null
// Data requests use the latest auth event token directly. This keeps offline/reconnect
// requests independent of Auth's session queue and Realtime's token callbacks.
export const dataCloud = url && key ? createClient(url, key, { accessToken: async () => accessToken, global: transport }) : null
cloud?.auth.onAuthStateChange((_event, session) => {
  accessToken = session?.access_token ?? null
  if (session) void dataCloud?.realtime.setAuth(session.access_token)
})
