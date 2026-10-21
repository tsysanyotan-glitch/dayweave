export interface CropRect { x: number; y: number; width: number; height: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
export function fitCrop(sourceRatio: number, ratio: number | null): CropRect {
  const width = ratio ? Math.min(.92, .92 * ratio / sourceRatio) : .8
  const height = ratio ? width * sourceRatio / ratio : .8
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}
export function moveCrop(rect: CropRect, dx: number, dy: number): CropRect { return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) } }
export function resizeCrop(rect: CropRect, dx: number, dy: number, corner: string, sourceRatio: number, ratio: number | null): CropRect {
  const left = corner.includes('w'), top = corner.includes('n')
  const anchorX = left ? rect.x + rect.width : rect.x, anchorY = top ? rect.y + rect.height : rect.y
  const maxWidth = left ? anchorX : 1 - anchorX, maxHeight = top ? anchorY : 1 - anchorY
  const deltaX = left ? -dx : dx, deltaY = top ? -dy : dy
  const widthDelta = ratio && Math.abs(deltaY * ratio / sourceRatio) > Math.abs(deltaX) ? deltaY * ratio / sourceRatio : deltaX
  let width = clamp(rect.width + widthDelta, .05, maxWidth)
  let height = clamp(rect.height + (top ? -dy : dy), .05, maxHeight)
  if (ratio) { width = Math.min(width, maxHeight * ratio / sourceRatio); height = width * sourceRatio / ratio }
  return { x: left ? anchorX - width : anchorX, y: top ? anchorY - height : anchorY, width, height }
}
export function cropImage(image: HTMLImageElement, rect: CropRect) {
  const width = rect.width * image.naturalWidth, height = rect.height * image.naturalHeight
  const scale = Math.min(1, 960 / width, 640 / height)
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d'); if (!context) throw new Error('无法制作背景，请重试')
  context.drawImage(image, rect.x * image.naturalWidth, rect.y * image.naturalHeight, width, height, 0, 0, canvas.width, canvas.height)
  return { dataUrl: canvas.toDataURL('image/webp', .8), width: canvas.width, height: canvas.height }
}
