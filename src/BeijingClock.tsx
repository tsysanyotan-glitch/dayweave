import { useEffect, useState } from 'react'
import { beijingTime } from './beijingTime'

/** Mounted only in the Windows edge rail; no timer runs in the expanded view. */
export function BeijingClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const update = () => {
      clearTimeout(timer)
      const current = new Date()
      setNow(current)
      timer = setTimeout(update, 60000 - current.getTime() % 60000 + 25)
    }
    update()
    // WebView timers may pause during sleep or while the window is hidden.
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('pageshow', update)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('pageshow', update)
    }
  }, [])
  const clock = beijingTime(now)
  return <time className="rail-clock" dateTime={clock.dateTime} aria-label={clock.label} title={clock.label}>
    <span className="rail-clock-zone">北京时间</span>
    <span className="rail-clock-time">{clock.time}</span>
    <span className="rail-clock-date">{clock.date}</span>
    <span className="rail-clock-short-date">{clock.shortDate}</span>
    <span className="rail-clock-weekday">{clock.weekday}</span>
  </time>
}
