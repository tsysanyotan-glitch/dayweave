import { useEffect } from 'react'
import { android } from './platform'

/** Use the visible area, including the space left above the Android keyboard. */
export function useMobileViewport() {
  useEffect(() => {
    if (!android) return
    document.documentElement.classList.add('android-app')
    const viewport = window.visualViewport
    const update = () => {
      const height = viewport?.height ?? innerHeight
      document.documentElement.style.setProperty('--visible-height', `${height}px`)
      document.documentElement.classList.toggle('keyboard-open', innerHeight - height > 120)
    }
    update()
    viewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => { viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update) }
  }, [])
}

export function useAndroidBack(closeLayer: () => boolean, report: (error: string) => void) {
  useEffect(() => {
    if (!android) return
    let disposed = false
    let release: (() => void) | undefined
    void import('@tauri-apps/api/app').then(async ({ onBackButtonPress, exit }) => {
      const listener = await onBackButtonPress(() => {
        const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
        const top = dialogs[dialogs.length - 1]
        if (top) { top.dispatchEvent(new Event('cancel', { cancelable: true })); return }
        if (!closeLayer()) void exit(0).catch(e => report(String(e)))
      })
      if (disposed) void listener.unregister()
      else release = () => { void listener.unregister() }
    }).catch(e => report(String(e)))
    return () => { disposed = true; release?.() }
  }, [closeLayer, report])
}
