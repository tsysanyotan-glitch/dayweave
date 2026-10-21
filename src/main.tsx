import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './features.css'
import './window.css'
import './scrollbars.css'
import './task-types.css'
import './responsive.css'
import './mobile.css'
import './windows-v060.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
if (import.meta.env.PROD && 'serviceWorker' in navigator && !('__TAURI_INTERNALS__' in window)) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
