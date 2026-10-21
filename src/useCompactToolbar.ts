import { useEffect, useRef, useState } from 'react'
export function useCompactToolbar(compact: boolean) {
  const [visible, setVisible] = useState(true), hovering = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reveal = () => { clearTimeout(timer.current); setVisible(true) }
  const idle = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (!hovering.current) setVisible(false) }, 1100) }
  useEffect(() => { if (compact) idle(); else reveal(); return () => clearTimeout(timer.current) }, [compact])
  return { visible, reveal, enter: () => { hovering.current = true; reveal() }, leave: () => { hovering.current = false; idle() }, focus: reveal, blur: idle }
}
