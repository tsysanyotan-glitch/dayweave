import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { statusLabels, type Status, type Task } from './model'
type Drag = { task: Task; x: number; y: number; status: Status; before?: string; keyboard?: boolean }
const statuses: Status[] = ['doing', 'todo', 'done']
export function useTaskDrag(scope: string, move: (id: string, status: Status, before?: string, peers?: string[]) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const active = useRef<Drag | null>(null); const cleanup = useRef<() => void>(() => {})
  const callback = useRef(move); callback.current = move
  const publish = (next: Drag | null) => { active.current = next; setDrag(next) }
  const finish = (apply: boolean) => {
    const current = active.current; cleanup.current(); publish(null)
    if (apply && current) {
      const peers = [...document.querySelectorAll<HTMLElement>(`.task-group[data-drop-status="${current.status}"] [data-task-id]`)].map(el => el.dataset.taskId!)
      callback.current(current.task.id, current.status, current.before, peers)
    }
  }
  useEffect(() => { cleanup.current(); publish(null); return () => cleanup.current() }, [scope])
  const start = (e: PointerEvent<HTMLButtonElement>, task: Task) => {
    if (e.button !== 0) return; e.preventDefault(); cleanup.current()
    e.currentTarget.setPointerCapture(e.pointerId)
    let moved = false
    publish({ task, x: e.clientX, y: e.clientY, status: task.status })
    const handleMove = (event: globalThis.PointerEvent) => {
      if (!active.current) return
      if (Math.hypot(event.clientX - e.clientX, event.clientY - e.clientY) > 6) moved = true
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      const group = hit?.closest<HTMLElement>('[data-drop-status]')
      const status = group?.dataset.dropStatus as Status | undefined
      let before: string | undefined
      const row = hit?.closest<HTMLElement>('[data-task-id]')
      if (row && row.dataset.taskId !== task.id) {
        const bounds = row.getBoundingClientRect()
        before = event.clientY < bounds.top + bounds.height / 2 ? row.dataset.taskId : (row.nextElementSibling as HTMLElement | null)?.dataset.taskId
        if (before === task.id) before = (row.nextElementSibling?.nextElementSibling as HTMLElement | null)?.dataset.taskId
      }
      publish({ ...active.current, x: event.clientX, y: event.clientY, status: status ?? active.current.status, before })
      if (event.clientY < 80) window.scrollBy(0, -18)
      else if (event.clientY > innerHeight - 100) window.scrollBy(0, 18)
    }
    const up = (event: globalThis.PointerEvent) => finish(moved && !!document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-status]'))
    const cancel = () => finish(false)
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('pointermove', handleMove); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', escape)
    cleanup.current = () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', escape) }
  }
  const keyboard = (e: KeyboardEvent<HTMLButtonElement>, task: Task) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); return }
    if (!active.current && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); publish({ task, x: 24, y: 100, status: task.status, keyboard: true }); return }
    if (!active.current?.keyboard) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const offset = e.key === 'ArrowDown' ? 1 : -1; publish({ ...active.current, status: statuses[(statuses.indexOf(active.current.status) + offset + 3) % 3] }) }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(true) }
  }
  const handle = (task: Task) => <button className="drag-handle" aria-label={'拖动任务：' + task.title} title="拖动到状态分组；键盘空格拿起、上下键选状态、回车放下、Esc 取消" onPointerDown={e => start(e, task)} onKeyDown={e => keyboard(e, task)} disabled={!!task.deletedAt}><GripVertical size={15} /></button>
  const overlay = drag && <><div className="drag-status-targets">{statuses.map(status => <div key={status} data-drop-status={status} className={drag.status === status ? 'active' : ''}>{statusLabels[status]}</div>)}</div><div className="drag-overlay" style={{ left: Math.min(drag.x + 12, innerWidth - 260), top: Math.min(drag.y + 12, innerHeight - 90) }}><strong>{drag.task.title}</strong><span>{drag.keyboard ? '↑↓ 选择，Enter 放下' : '松开移入'} · {statusLabels[drag.status]}</span></div><div className="sr-only" role="status">正在移动 {drag.task.title}，目标 {statusLabels[drag.status]}</div></>
  return { drag, handle, overlay }
}
