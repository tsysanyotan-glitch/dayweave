import { useEffect, useState } from 'react'
import { android, desktop } from './platform'
export type ThemePreference = 'system' | 'light' | 'dark'
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => { const value = localStorage.getItem('dayweave-theme'); return value === 'light' || value === 'dark' ? value : 'system' })
  useEffect(() => {
    if (android) return
    localStorage.setItem('dayweave-theme', preference)
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      const theme = preference === 'system' ? media.matches ? 'dark' : 'light' : preference
      document.documentElement.dataset.theme = theme
      if (desktop) void import('@tauri-apps/api/webviewWindow').then(async ({ getCurrentWebviewWindow }) => { const win = getCurrentWebviewWindow(); await win.setTheme(preference === 'system' ? null : preference); await win.setBackgroundColor(theme === 'dark' ? '#171c19' : '#fafbf8') }).catch(() => { /* CSS still follows the system if the native backdrop cannot be changed. */ })
    }
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [preference])
  return { preference, setPreference }
}
