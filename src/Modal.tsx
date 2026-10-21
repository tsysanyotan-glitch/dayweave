import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
export function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { ref.current?.showModal(); return () => { ref.current?.close() } }, [])
  return <dialog ref={ref} className={'modal ' + (wide ? 'wide' : '')} aria-labelledby={id} onCancel={e => { e.preventDefault(); e.stopPropagation(); close() }} onClick={e => { if (e.target === ref.current) close() }}>
    <div className="modal-heading"><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label="关闭窗口" onClick={close}><X size={20} /></button></div>{children}
  </dialog>
}
