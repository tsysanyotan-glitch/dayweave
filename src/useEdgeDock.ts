import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { desktop } from './platform'
import { clampRect, dockRect, inside, nearestEdge, type Edge, type Rect } from './windowGeometry'
interface Anchor { edge: Edge; rect: Rect; inner: { width: number; height: number }; area: Rect; scale: number }
// Even an undecorated resizable Windows window can have an invisible native
// frame. Geometry and hover use outer bounds; setSize receives the inner size.
const frameSize = (saved: Anchor) => ({ width: Math.max(0,saved.rect.width-saved.inner.width), height: Math.max(0,saved.rect.height-saved.inner.height) })
export function useEdgeDock(compact: boolean, ready: boolean, changing: RefObject<boolean>, report: (message: string) => void, reminders = 0) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('dayweave-edge-dock') !== 'false')
  const [edge, setEdge] = useState<Edge | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const anchor = useRef<Anchor | null>(null), collapsedRef = useRef(false)
  const operation = useRef<Promise<void> | null>(null)
  const leaveAt = useRef(0), pollBusy = useRef(false)
  const resizeDock = useCallback((small: boolean): Promise<void> => {
    if (!desktop || changing.current || !anchor.current || small === collapsedRef.current) return Promise.resolve()
    const saved = anchor.current
    const work = async () => {
    changing.current = true
    try {
      const { getCurrentWindow, LogicalSize, PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/window'); const win = getCurrentWindow()
      if (small && (await win.isMaximized() || await win.isMinimized() || document.querySelector('dialog[open]'))) return
      if (small) {
        const frame = frameSize(saved), rect = dockRect(saved.rect, saved.area, saved.edge, saved.scale, reminders, frame)
        collapsedRef.current = true; setCollapsed(true)
        await win.setMinSize(new LogicalSize(48, 48)); await win.setSize(new PhysicalSize(rect.width-frame.width, rect.height-frame.height)); await win.setPosition(new PhysicalPosition(rect.x, rect.y))
      } else {
        const rect = clampRect(saved.rect, saved.area)
        await win.setSize(new PhysicalSize(saved.inner.width, saved.inner.height)); await win.setPosition(new PhysicalPosition(rect.x, rect.y)); await win.setMinSize(new LogicalSize(280, 260))
        collapsedRef.current = false; setCollapsed(false); leaveAt.current = 0
      }
    } catch (e) { anchor.current = null; collapsedRef.current = false; setCollapsed(false); setEdge(null); report('贴边窗口调整失败：' + String(e)) }
    finally { changing.current = false }
    }
    operation.current = work()
    return operation.current
  }, [changing, report, reminders])
  const release = useCallback(async () => { await operation.current; await resizeDock(false); anchor.current = null; setEdge(null); leaveAt.current = 0 }, [resizeDock])
  useEffect(() => { localStorage.setItem('dayweave-edge-dock', String(enabled)); if (!enabled) void release() }, [enabled, release])
  useEffect(() => {
    if (!desktop || !compact || !ready || !enabled) return
    let disposed = false
    const releases: (() => void)[] = []; let settle: ReturnType<typeof setTimeout> | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    const register = async () => {
      const api = await import('@tauri-apps/api/window'), win = api.getCurrentWindow()
      const inspect = async () => {
        if (disposed || changing.current || collapsedRef.current || await win.isMaximized() || await win.isMinimized()) return
        const [position, size, innerSize, monitor] = await Promise.all([win.outerPosition(), win.outerSize(), win.innerSize(), api.currentMonitor()])
        if (!monitor || disposed || changing.current || collapsedRef.current) return
        const rect = { x: position.x, y: position.y, width: size.width, height: size.height }
        const area = { x: monitor.workArea.position.x, y: monitor.workArea.position.y, width: monitor.workArea.size.width, height: monitor.workArea.size.height }
        const next = nearestEdge(rect, area, 16 * monitor.scaleFactor)
        anchor.current = next ? { edge: next, rect, inner: { width: innerSize.width, height: innerSize.height }, area, scale: monitor.scaleFactor } : null
        setEdge(next); leaveAt.current = 0
      }
      const moved = () => { if (changing.current) return; clearTimeout(settle); settle = setTimeout(() => { void inspect().catch(e => report(String(e))) }, 240) }
      const movedRelease = await win.onMoved(moved), resizedRelease = await win.onResized(moved)
      if (disposed) { movedRelease(); resizedRelease(); return }
      releases.push(movedRelease, resizedRelease)
      await inspect()
      timer = setInterval(() => {
        if (pollBusy.current || changing.current || !anchor.current || disposed) return
        pollBusy.current = true
        void (async () => {
          const current = anchor.current!; const cursor = await api.cursorPosition()
          if (disposed || changing.current || anchor.current !== current) return
          const rect = collapsedRef.current ? dockRect(current.rect, current.area, current.edge, current.scale, reminders, frameSize(current)) : current.rect
          const hovering = inside(cursor, rect)
          if (collapsedRef.current) { if (hovering) await resizeDock(false); return }
          if (hovering || document.querySelector('dialog[open]') || document.activeElement?.matches('input,textarea,select,[contenteditable=true]')) { leaveAt.current = 0; return }
          if (await win.isMinimized()) return
          if (!leaveAt.current) leaveAt.current = Date.now()
          if (Date.now() - leaveAt.current > 850) await resizeDock(true)
        })().catch(e => report(String(e))).finally(() => { pollBusy.current = false })
      }, 350)
    }
    void register().catch(e => report(String(e)))
    return () => { disposed = true; clearTimeout(settle); clearInterval(timer); releases.forEach(fn => fn()) }
  }, [compact, ready, enabled, changing, report, resizeDock, reminders])
  useEffect(() => {
    if (!desktop || !collapsedRef.current || !anchor.current) return
    const saved=anchor.current
    void (async()=>{const {getCurrentWindow,PhysicalSize,PhysicalPosition}=await import('@tauri-apps/api/window');const frame=frameSize(saved),rect=dockRect(saved.rect,saved.area,saved.edge,saved.scale,reminders,frame);const win=getCurrentWindow();await win.setSize(new PhysicalSize(rect.width-frame.width,rect.height-frame.height));await win.setPosition(new PhysicalPosition(rect.x,rect.y))})().catch(e=>report(String(e)))
  },[reminders,report])
  return { enabled, setEnabled, edge, collapsed, collapsedRef, expand: () => resizeDock(false), release }
}
