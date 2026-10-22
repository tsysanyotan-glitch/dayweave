import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import './features.css'
import './window.css'
import './scrollbars.css'
import './task-types.css'
import './responsive.css'
import './mobile.css'
import './windows-v060.css'
import './reminders.css'
import { initializeClock } from './clock'
import { desktop } from './platform'

const root = ReactDOM.createRoot(document.getElementById('root')!)
async function start() {
  if (desktop) {
    root.render(<div className="empty-state" role="status"><h3>正在获取北京时间…</h3><p>请保持联网。校准完成后会自动打开你的日序。</p></div>)
    // Do not load the store, date defaults or Auth SDK before time is trustworthy.
    await initializeClock()
  }
  const Component = '__DAYWEAVE_REMINDER__' in window ? (await import('./Reminders')).ReminderAlert : (await import('./App')).default
  root.render(<React.StrictMode><Component /></React.StrictMode>)
}
void start()
if (import.meta.env.PROD && 'serviceWorker' in navigator && !('__TAURI_INTERNALS__' in window)) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
