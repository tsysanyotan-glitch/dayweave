/** Windows supplies network UTC anchored to sleep-inclusive native uptime.
 * Other (not updated) targets retain their existing clock source.
 * Pure model imports also run on the API server, without window or Tauri.
 */
import { clockNow, setClockSource } from './time'
const SystemDate = Date
let anchor: { epoch: number; tick: number } | null = null
const listeners = new Set<() => void>()
export function subscribeClock(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
interface NativeTime { epochMs: number | null; source: string; ageMs: number | null }
let syncing: Promise<boolean> | null = null
export function refreshClock(): Promise<boolean> {
  if (syncing) return syncing
  syncing = (async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    const start = performance.now()
    const result = await invoke<NativeTime>('time_snapshot')
    const end = performance.now()
    if (result.epochMs === null || !Number.isFinite(result.epochMs)) return false
    anchor = { epoch: result.epochMs + (end - start) / 2, tick: end }
    setClockSource(() => anchor!.epoch + performance.now() - anchor!.tick)
    listeners.forEach(fn => fn())
    return true
  })().finally(() => { syncing = null })
  return syncing
}
export function installCalibratedDate(): void {
  // Auth SDK token-expiry and retry calculations also need calibrated UTC.
  // Explicit date parsing/UTC/instanceof/subclass semantics remain native.
  globalThis.Date = new Proxy(SystemDate, {
    construct(target, args, newTarget) { return Reflect.construct(target, args.length ? args : [clockNow()], newTarget) },
    apply() { return new SystemDate(clockNow()).toString() },
    get(target, property, receiver) { return property === 'now' ? clockNow : Reflect.get(target, property, receiver) },
  })
}
export async function initializeClock(): Promise<void> {
  while (!await refreshClock().catch(() => false)) await new Promise(resolve => setTimeout(resolve, 1000))
  installCalibratedDate()
  const { listen } = await import('@tauri-apps/api/event')
  const { invoke } = await import('@tauri-apps/api/core')
  const update = () => { void refreshClock().catch(() => {}) }
  const wake = () => { update(); void invoke('time_refresh').catch(() => {}) }
  await listen('dayweave-time', update)
  window.addEventListener('focus', wake)
  window.addEventListener('online', wake)
  window.addEventListener('pageshow', wake)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake() })
  // IPC only, no web requests; catches WebView suspension and native corrections.
  setInterval(update, 15000)
}
