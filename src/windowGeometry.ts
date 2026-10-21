export interface Rect { x: number; y: number; width: number; height: number }
export type Edge = 'left' | 'right' | 'top' | 'bottom'
export const compactSizeKey = 'dayweave-compact-size'
export function compactSize(value: string | null) {
  try { const size = JSON.parse(value || 'null'); if (Number.isFinite(size?.width) && Number.isFinite(size?.height)) return { width: Math.max(280, Math.min(Math.round(size.width), 4096)), height: Math.max(260, Math.min(Math.round(size.height), 4096)) } } catch { /* Use the first-run size. */ }
  return { width: 380, height: 620 }
}
export function nearestEdge(rect: Rect, area: Rect, threshold: number): Edge | null {
  const distances: [Edge, number][] = [['right', Math.abs(rect.x + rect.width - area.x - area.width)], ['left', Math.abs(rect.x - area.x)], ['top', Math.abs(rect.y - area.y)], ['bottom', Math.abs(rect.y + rect.height - area.y - area.height)]]
  distances.sort((a, b) => a[1] - b[1]); return distances[0][1] <= threshold ? distances[0][0] : null
}
export function clampRect(rect: Rect, area: Rect): Rect {
  const width = Math.min(rect.width, area.width), height = Math.min(rect.height, area.height)
  return { width, height, x: Math.round(Math.max(area.x, Math.min(rect.x, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(rect.y, area.y + area.height - height))) }
}
export function dockRect(rect: Rect, area: Rect, edge: Edge, scale: number): Rect {
  const vertical = edge === 'left' || edge === 'right'
  const result = clampRect({ ...rect, width: Math.round((vertical ? 64 : 240) * scale), height: Math.round((vertical ? 208 : 72) * scale) }, area)
  if (edge === 'right') result.x = area.x + area.width - result.width
  if (edge === 'left') result.x = area.x
  if (edge === 'top') result.y = area.y
  if (edge === 'bottom') result.y = area.y + area.height - result.height
  return result
}
export const inside = (point: { x: number; y: number }, rect: Rect) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height
