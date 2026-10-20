import { useEffect, useRef, useState } from 'react'
import { Expand, Minimize2, Minus, Pin, PinOff } from 'lucide-react'
import { native } from './outputs'
export function useWindowMode(report: (message: string) => void) {
  const [compact, setCompact] = useState(() => localStorage.getItem('dayweave-compact') === 'true')
  const [pinned, setPinned] = useState(() => localStorage.getItem('dayweave-pinned') === 'true')
  const full = useRef<{ width: number; height: number; x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const resize = async (small: boolean, remember: boolean) => {
    if (!native) return
    const { getCurrentWindow, LogicalSize, PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (small) {
      if (remember) { const size = await win.innerSize(); const position = await win.outerPosition(); full.current = { width: size.width, height: size.height, x: position.x, y: position.y } }
      await win.setMinSize(new LogicalSize(330, 360)); await win.setSize(new LogicalSize(380, 620))
    } else {
      await win.setMinSize(new LogicalSize(420, 600))
      if (full.current) { await win.setSize(new PhysicalSize(full.current.width, full.current.height)); await win.setPosition(new PhysicalPosition(full.current.x, full.current.y)) }
      else { await win.setSize(new LogicalSize(1360, 900)); await win.center() }
    }
  }
  useEffect(() => { if (native) { void resize(compact, false).catch(e => report(String(e))); void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setAlwaysOnTop(pinned)).catch(e => report(String(e))) } }, [])
  const toggle = async () => {
    if (busy) return; setBusy(true)
    try { await resize(!compact, true); localStorage.setItem('dayweave-compact', String(!compact)); setCompact(!compact) } catch (e) { report('窗口调整失败：' + String(e)) } finally { setBusy(false) }
  }
  const pin = async () => {
    try { await (await import('@tauri-apps/api/window')).getCurrentWindow().setAlwaysOnTop(!pinned); setPinned(!pinned); localStorage.setItem('dayweave-pinned', String(!pinned)) } catch (e) { report('置顶失败：' + String(e)) }
  }
  const controls = <div className="window-controls"><button disabled={busy} onClick={() => void toggle()} aria-label={compact ? '恢复完整视图' : '切换精简视图'} title={compact ? '恢复完整窗口' : '精简任务列表'}>{compact ? <Expand size={16} /> : <Minimize2 size={16} />}<span>{compact ? '完整视图' : '精简模式'}</span></button>{native && <><button className={pinned ? 'pinned' : ''} aria-pressed={pinned} aria-label={pinned ? '取消窗口置顶' : '窗口置顶'} title={pinned ? '取消窗口置顶' : '窗口置顶'} onClick={() => void pin()}>{pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>{compact && <button aria-label="最小化窗口" onClick={() => void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().minimize()).catch(e => report(String(e)))}><Minus size={16} /></button>}</>}</div>
  return { compact, controls }
}
