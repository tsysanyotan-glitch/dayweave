import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Expand, Minimize2, Minus, PanelRightClose, Pin, PinOff, Square, X } from 'lucide-react'
import { desktop as native, android } from './platform'
import { useEdgeDock } from './useEdgeDock'
import { compactSize, compactSizeKey } from './windowGeometry'
export function useWindowMode(report: (message: string) => void) {
  const [compact, setCompact] = useState(() => !android && localStorage.getItem('dayweave-compact') === 'true')
  const [pinned, setPinned] = useState(() => localStorage.getItem('dayweave-pinned') === 'true')
  const full = useRef<{ width: number; height: number; x: number; y: number; maximized: boolean } | null>(null)
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [maximized, setMaximized] = useState(false)
  const compactRef = useRef(compact), changing = useRef(false), startup = useRef<Promise<void> | null>(null)
  const dock = useEdgeDock(compact, ready, changing, report)
  const saveCompactSize = useCallback(async () => {
    if (!compactRef.current || dock.collapsedRef.current) return
    const win = (await import('@tauri-apps/api/window')).getCurrentWindow()
    if (await win.isMaximized() || await win.isMinimized()) return
    const size = (await win.innerSize()).toLogical(await win.scaleFactor())
    if (size.width >= 279 && size.height >= 259) localStorage.setItem(compactSizeKey, JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }))
  }, [dock.collapsedRef])
  const resize = async (small: boolean, remember: boolean) => {
    if (!native) return
    changing.current = true
    try {
      const { getCurrentWindow, currentMonitor, LogicalSize, PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/window'), win = getCurrentWindow()
      if (small) {
        const wasMaximized = await win.isMaximized()
        if (wasMaximized) await win.unmaximize()
        if (remember) { const size = await win.innerSize(), position = await win.outerPosition(); full.current = { width: size.width, height: size.height, x: position.x, y: position.y, maximized: wasMaximized } }
        const size = compactSize(localStorage.getItem(compactSizeKey)), monitor = await currentMonitor(), available = monitor?.workArea.size.toLogical(monitor.scaleFactor)
        await win.setMinSize(new LogicalSize(280, 260))
        await win.setSize(new LogicalSize(Math.min(size.width, available?.width ?? size.width), Math.min(size.height, available?.height ?? size.height)))
      } else {
        if (remember) await saveCompactSize()
        if (await win.isMaximized()) await win.unmaximize()
        await win.setMinSize(new LogicalSize(320, 360))
        if (full.current) { await win.setSize(new PhysicalSize(full.current.width, full.current.height)); await win.setPosition(new PhysicalPosition(full.current.x, full.current.y)); if (full.current.maximized) await win.maximize() }
        else if (remember) { await win.setSize(new LogicalSize(1360, 900)); await win.center() }
      }
      compactRef.current = small
    } finally { changing.current = false }
  }
  useEffect(() => {
    if (!native) { setReady(true); return }
    let disposed = false
    startup.current ??= resize(compact, false).then(async () => { await (await import('@tauri-apps/api/window')).getCurrentWindow().setAlwaysOnTop(pinned) })
    void startup.current.then(() => { if (!disposed) setReady(true) }).catch(e => report(String(e)))
    return () => { disposed = true }
  }, [])
  useEffect(() => {
    if (!native) return
    let disposed = false, closing = false
    const unlisten: (() => void)[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow()
      const update = async () => { const value = await win.isMaximized(); if (!disposed) setMaximized(value) }
      await update()
      const resized = await win.onResized(() => {
        void update().catch(e => report(String(e))); clearTimeout(timer)
        if (compactRef.current && !changing.current && !dock.collapsedRef.current) timer = setTimeout(() => { if (!disposed && !changing.current) void saveCompactSize().catch(e => report(String(e))) }, 180)
      })
      if (disposed) { resized(); return } unlisten.push(resized)
      const close = await win.onCloseRequested(event => {
        event.preventDefault(); if (closing) return; closing = true
        void (async () => { clearTimeout(timer); await dock.release(); await saveCompactSize(); await win.destroy() })().catch(e => { closing = false; report('关闭窗口失败：' + String(e)) })
      })
      if (disposed) close(); else unlisten.push(close)
    }).catch(e => report(String(e)))
    return () => { disposed = true; clearTimeout(timer); unlisten.forEach(fn => fn()) }
  }, [dock.release, dock.collapsedRef, saveCompactSize, report])
  const toggle = async () => {
    if (busy || !ready) return; setBusy(true)
    try { await dock.release(); await resize(!compact, true); localStorage.setItem('dayweave-compact', String(!compact)); setCompact(!compact) } catch (e) { report('窗口调整失败：' + String(e)) } finally { setBusy(false) }
  }
  const pin = async () => {
    try { await (await import('@tauri-apps/api/window')).getCurrentWindow().setAlwaysOnTop(!pinned); setPinned(!pinned); localStorage.setItem('dayweave-pinned', String(!pinned)) } catch (e) { report('置顶失败：' + String(e)) }
  }
  const windowAction = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    try { const win = (await import('@tauri-apps/api/window')).getCurrentWindow(); if (action === 'toggleMaximize') await dock.release(); await win[action]() } catch (e) { report('窗口操作失败：' + String(e)) }
  }
  const controls = <div className="window-controls"><button disabled={busy || !ready} onClick={() => void toggle()} aria-label={compact ? '恢复完整视图' : '切换精简视图'} title={compact ? '恢复完整窗口' : '精简任务列表'}>{compact ? <Expand size={16} /> : <Minimize2 size={16} />}<span>{compact ? '完整视图' : '精简模式'}</span></button>{native && <><button className={pinned ? 'pinned' : ''} aria-pressed={pinned} aria-label={pinned ? '取消窗口置顶' : '窗口置顶'} title={pinned ? '取消窗口置顶' : '窗口置顶'} onClick={() => void pin()}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>{compact && <button aria-label="贴边收起" title="贴近屏幕边缘后自动收起，悬停展开" aria-pressed={dock.enabled} className={dock.enabled ? 'pinned' : ''} onClick={() => dock.setEnabled(!dock.enabled)}><PanelRightClose size={16} /></button>}</>}</div>
  const frameControls = native && <div className="frame-controls" role="group" aria-label="窗口操作"><button aria-label="最小化窗口" title="最小化" onClick={() => void windowAction('minimize')}><Minus size={16} /></button><button disabled={busy} aria-label={maximized ? '还原窗口' : '最大化窗口'} title={maximized ? '还原' : '最大化'} onClick={() => void windowAction('toggleMaximize')}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button><button className="window-close" aria-label="关闭窗口" title="关闭" onClick={() => void windowAction('close')}><X size={17} /></button></div>
  return { compact, controls: android ? null : controls, frameControls, native, dock }
}
