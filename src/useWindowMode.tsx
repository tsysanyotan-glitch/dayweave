import { useEffect, useRef, useState } from 'react'
import { Copy, Expand, Minimize2, Minus, Pin, PinOff, Square, X } from 'lucide-react'
import { desktop as native, android } from './platform'
const compactSizeKey = 'dayweave-compact-size'
function savedCompactSize() {
  try {
    const size = JSON.parse(localStorage.getItem(compactSizeKey) || 'null')
    if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) return { width: Math.max(280, Math.min(size.width, 4096)), height: Math.max(260, Math.min(size.height, 4096)) }
  } catch { /* Fall back to the initial compact dimensions. */ }
  return { width: 380, height: 620 }
}
export function useWindowMode(report: (message: string) => void) {
  const [compact, setCompact] = useState(() => !android && localStorage.getItem('dayweave-compact') === 'true')
  const [pinned, setPinned] = useState(() => localStorage.getItem('dayweave-pinned') === 'true')
  const full = useRef<{ width: number; height: number; x: number; y: number; maximized: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const compactRef = useRef(compact)
  const changing = useRef(false)
  const saveCompactSize = async () => {
    const win = (await import('@tauri-apps/api/window')).getCurrentWindow()
    if (await win.isMaximized() || await win.isMinimized()) return
    const size = (await win.innerSize()).toLogical(await win.scaleFactor())
    if (size.width >= 279 && size.height >= 259) localStorage.setItem(compactSizeKey, JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }))
  }
  const resize = async (small: boolean, remember: boolean) => {
    if (!native) return
    changing.current = true
    try {
    const { getCurrentWindow, currentMonitor, LogicalSize, PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (small) {
      const wasMaximized = await win.isMaximized()
      if (wasMaximized) await win.unmaximize()
      if (remember) { const size = await win.innerSize(); const position = await win.outerPosition(); full.current = { width: size.width, height: size.height, x: position.x, y: position.y, maximized: wasMaximized } }
      const size = savedCompactSize()
      const monitor = await currentMonitor()
      const available = monitor?.workArea.size.toLogical(monitor.scaleFactor)
      await win.setMinSize(new LogicalSize(280, 260))
      await win.setSize(new LogicalSize(Math.min(size.width, available?.width ?? size.width), Math.min(size.height, available?.height ?? size.height)))
    } else {
      if (remember && compactRef.current) await saveCompactSize()
      if (await win.isMaximized()) await win.unmaximize()
      await win.setMinSize(new LogicalSize(320, 360))
      if (full.current) { await win.setSize(new PhysicalSize(full.current.width, full.current.height)); await win.setPosition(new PhysicalPosition(full.current.x, full.current.y)); if (full.current.maximized) await win.maximize() }
      else { await win.setSize(new LogicalSize(1360, 900)); await win.center() }
    }
    compactRef.current = small
    } finally { changing.current = false }
  }
  useEffect(() => { if (native) { void resize(compact, false).catch(e => report(String(e))); void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setAlwaysOnTop(pinned)).catch(e => report(String(e))) } }, [])
  useEffect(() => {
    if (!native) return
    let disposed = false
    let unlisten: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow()
      const update = async () => { const value = await win.isMaximized(); if (!disposed) setMaximized(value) }
      await update()
      const release = await win.onResized(() => {
        void update().catch(e => report(String(e)))
        clearTimeout(timer)
        if (compactRef.current && !changing.current) timer = setTimeout(() => { if (!disposed && compactRef.current && !changing.current) void saveCompactSize().catch(e => report(String(e))) }, 180)
      })
      if (disposed) release(); else unlisten = release
    }).catch(e => report(String(e)))
    return () => { disposed = true; clearTimeout(timer); unlisten?.() }
  }, [])
  const toggle = async () => {
    if (busy) return; setBusy(true)
    try { await resize(!compact, true); localStorage.setItem('dayweave-compact', String(!compact)); setCompact(!compact) } catch (e) { report('窗口调整失败：' + String(e)) } finally { setBusy(false) }
  }
  const pin = async () => {
    try { await (await import('@tauri-apps/api/window')).getCurrentWindow().setAlwaysOnTop(!pinned); setPinned(!pinned); localStorage.setItem('dayweave-pinned', String(!pinned)) } catch (e) { report('置顶失败：' + String(e)) }
  }
  const windowAction = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    try { const win = (await import('@tauri-apps/api/window')).getCurrentWindow(); await win[action]() } catch (e) { report('窗口操作失败：' + String(e)) }
  }
  const controls = <div className="window-controls"><button disabled={busy} onClick={() => void toggle()} aria-label={compact ? '恢复完整视图' : '切换精简视图'} title={compact ? '恢复完整窗口' : '精简任务列表'}>{compact ? <Expand size={16} /> : <Minimize2 size={16} />}<span>{compact ? '完整视图' : '精简模式'}</span></button>{native && <button className={pinned ? 'pinned' : ''} aria-pressed={pinned} aria-label={pinned ? '取消窗口置顶' : '窗口置顶'} title={pinned ? '取消窗口置顶' : '窗口置顶'} onClick={() => void pin()}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}</div>
  const frameControls = native && <div className="frame-controls" role="group" aria-label="窗口操作">
    <button aria-label="最小化窗口" title="最小化" onClick={() => void windowAction('minimize')}><Minus size={16} /></button>
    <button disabled={busy} aria-label={maximized ? '还原窗口' : '最大化窗口'} title={maximized ? '还原' : '最大化'} onClick={() => void windowAction('toggleMaximize')}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button>
    <button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => void windowAction('close')}><X size={17} /></button>
  </div>
  return { compact, controls: android ? null : controls, frameControls, native }
}
