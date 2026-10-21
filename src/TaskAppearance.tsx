import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ImagePlus, Palette, X } from 'lucide-react'
import { Modal } from './Modal'
import { cropImage, fitCrop, moveCrop, resizeCrop, type CropRect } from './crop'
import { lookStyle, removeBackground, saveBackground, useLooks, type Background, type TaskLook } from './appearance'
import { uuid } from './model'
export const backgroundColors = ['#e5eddf', '#e1edf3', '#ede5f4', '#f7e2da', '#f5eccf', '#dcefed', '#f1efeb']
function ImageBackgroundEditor({ close, saved }: { close: () => void; saved: (background: Background) => void }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [rect, setRect] = useState<CropRect>({ x: .1, y: .1, width: .8, height: .8 })
  const [ratio, setRatio] = useState<number | null>(16 / 9)
  const [opacity, setOpacity] = useState(.18)
  const [name, setName] = useState('我的背景')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const urls = useRef(new Set<string>())
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)) }, [])
  useEffect(() => () => { if (image) { URL.revokeObjectURL(image.src); urls.current.delete(image.src) } }, [image])
  const active = useRef<{ x: number; y: number; rect: CropRect; corner?: string } | null>(null)
  const load = async (file?: File) => {
    if (!file) return
    setError('')
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG 或 WebP 图片')
      if (file.size > 15 * 1024 * 1024) throw new Error('原图不能超过 15 MB')
      const url = URL.createObjectURL(file)
      urls.current.add(url)
      try { const selected = new Image(); selected.src = url; await selected.decode(); if (selected.naturalWidth * selected.naturalHeight > 32000000) throw new Error('图片像素过大，请先缩小到 3200 万像素以内'); setImage(selected); setRect(fitCrop(selected.naturalWidth / selected.naturalHeight, ratio)); setName(file.name.replace(/\.[^.]+$/, '').slice(0, 80) || '我的背景') }
      catch (e) { URL.revokeObjectURL(url); urls.current.delete(url); throw e }
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }
  useEffect(() => { if (!image) return; const timer = setTimeout(() => { try { setPreview(cropImage(image, rect).dataUrl) } catch { setError('图片预览失败，请重新选择') } }, 100); return () => clearTimeout(timer) }, [image, rect])
  const chooseRatio = (next: number | null) => { setRatio(next); if (image) setRect(fitCrop(image.naturalWidth / image.naturalHeight, next)) }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !image) return
    const target = event.target as HTMLElement
    if (!target.closest('.crop-selection')) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId)
    active.current = { x: event.clientX, y: event.clientY, rect, corner: target.dataset.corner }
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!active.current || !image || !stage.current) return
    const bounds = stage.current.getBoundingClientRect(), current = active.current
    const dx = (event.clientX - current.x) / bounds.width, dy = (event.clientY - current.y) / bounds.height
    setRect(current.corner ? resizeCrop(current.rect, dx, dy, current.corner, image.naturalWidth / image.naturalHeight, ratio) : moveCrop(current.rect, dx, dy))
  }
  const save = async () => {
    if (!image || busy) return; setBusy(true); setError('')
    try { const background = { id: uuid(), name: name.trim(), opacity, ...cropImage(image, rect) }; await saveBackground(background); saved(background); close() }
    catch (e) { setError(e instanceof Error ? e.message : '保存背景失败') } finally { setBusy(false) }
  }
  return <Modal title="制作任务背景" close={close} wide><div className="background-maker" onKeyDown={e => {
    if (e.key !== 'Enter') return
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); void save() }
    else if (e.target instanceof HTMLInputElement) e.preventDefault()
  }}>
    <label className="upload-background"><ImagePlus size={18} /><span>{image ? '更换原图' : '选择本机图片'}</span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传背景原图" onChange={e => { void load(e.target.files?.[0]); e.target.value = '' }} /></label>
    {image && <><div className="crop-stage" ref={stage} style={{ aspectRatio: image.naturalWidth / image.naturalHeight, maxWidth: Math.min(700, 280 * image.naturalWidth / image.naturalHeight) }} onPointerDown={start} onPointerMove={move} onPointerUp={() => { active.current = null }} onPointerCancel={() => { active.current = null }}><img src={image.src} alt="背景原图" draggable={false} /><div className="crop-selection" role="group" tabIndex={0} onKeyDown={e => { const delta = e.shiftKey ? .02 : .003; const moves: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }; if (moves[e.key]) { e.preventDefault(); setRect(moveCrop(rect, ...moves[e.key])) } }} aria-label="拖动裁剪区域" style={{ left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.width * 100 + '%', height: rect.height * 100 + '%' }}>{['nw', 'ne', 'sw', 'se'].map(corner => <span key={corner} data-corner={corner} className={'crop-handle ' + corner} />)}<span className="crop-grid" /></div></div>
    <p className="field-help">拖动选框移动位置，拖动四角裁剪；方向键可微调位置。</p><div className="crop-ratios" role="group" aria-label="裁剪比例">{[['自由', null], ['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1]] .map(([label, value]) => <button key={String(label)} type="button" aria-pressed={ratio === value} onClick={() => chooseRatio(value as number | null)}>{label}</button>)}</div>
    <div className="crop-adjustments"><label>裁剪区域宽度<input type="range" aria-label="裁剪区域宽度" min={5} max={100} value={rect.width * 100} onChange={e => setRect(resizeCrop(rect, +e.target.value / 100 - rect.width, 0, 'se', image.naturalWidth / image.naturalHeight, ratio))} /></label><label>裁剪区域高度<input type="range" aria-label="裁剪区域高度" disabled={ratio !== null} min={5} max={100} value={rect.height * 100} onChange={e => setRect(resizeCrop(rect, 0, +e.target.value / 100 - rect.height, 'se', image.naturalWidth / image.naturalHeight, null))} /></label></div>
    <label className="background-field">背景不透明度 <output>{Math.round(opacity * 100)}%</output><input aria-label="背景不透明度" type="range" min={0} max={100} value={opacity * 100} onChange={e => setOpacity(+e.target.value / 100)} /></label><div className="look-preview image-look" style={{ '--task-image': `url("${preview}")`, '--task-image-opacity': opacity } as CSSProperties}><strong>示例任务 · 保持文字清晰</strong><small>图片仅改变背景，不改变文字透明度。</small></div><label className="background-field">背景名称<input maxLength={80} value={name} aria-label="背景名称" onChange={e => setName(e.target.value)} /></label></>}
    <p className="field-help">背景与裁剪后的图片仅保存在这台电脑，不会自动上传。单张保存为最多 960 × 640 的轻量图片。</p>{error && <p className="error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="button secondary" onClick={close}>取消</button><button type="button" className="button primary" disabled={!image || !name.trim() || busy} onClick={() => void save()}>{busy ? '正在保存…' : '保存为可选背景'}</button></div>
  </div></Modal>
}
export function TaskAppearance({ value, change }: { value: TaskLook; change: (look: TaskLook) => void }) {
  const state = useLooks(), [making, setMaking] = useState(false), [error, setError] = useState('')
  return <section className="task-appearance" aria-label="任务背景"><div className="field-heading"><span><Palette size={14} />任务背景</span></div><div className="look-choices" role="group" aria-label="背景类型"><button type="button" aria-pressed={value.kind === 'default'} onClick={() => change({ kind: 'default' })}>默认</button><button type="button" aria-pressed={value.kind === 'color'} onClick={() => change({ kind: 'color', color: value.kind === 'color' ? value.color : backgroundColors[0] })}>颜色</button><button type="button" aria-pressed={value.kind === 'image'} onClick={() => state.backgrounds.length ? change({ kind: 'image', backgroundId: state.backgrounds[0].id }) : setMaking(true)}>图片</button></div>
    {value.kind === 'color' && <div className="color-choices">{backgroundColors.map((color, i) => <button key={color} type="button" aria-label={'背景颜色 ' + (i + 1)} aria-pressed={value.color === color} style={{ background: color }} onClick={() => change({ kind: 'color', color })} />)}<label>自选颜色<input type="color" aria-label="自选背景颜色" value={value.color} onChange={e => change({ kind: 'color', color: e.target.value })} /></label></div>}
    <div className={'look-preview ' + (value.kind === 'color' ? 'color-look' : value.kind === 'image' ? 'image-look' : '')} style={lookStyle(value)}><strong>示例任务 · 今天完成一点</strong><small>正文与步骤始终清晰可读</small></div>
    <div className="background-library">{state.backgrounds.map(background => <div key={background.id}><button type="button" className="saved-background" aria-label={'使用背景：' + background.name} aria-pressed={value.kind === 'image' && value.backgroundId === background.id} onClick={() => change({ kind: 'image', backgroundId: background.id })}><img src={background.dataUrl} alt="" /><span>{background.name}</span></button><button type="button" className="remove-background" aria-label={'移除背景：' + background.name} onClick={() => { void removeBackground(background.id).then(() => { if (value.kind === 'image' && value.backgroundId === background.id) change({ kind: 'default' }) }).catch(e => setError(String(e))) }}><X size={12} /></button></div>)}<button type="button" className="make-background" onClick={() => setMaking(true)}><ImagePlus size={17} />上传并制作背景</button></div>{error && <p className="error" role="alert">{error}</p>}{making && <ImageBackgroundEditor close={() => setMaking(false)} saved={background => change({ kind: 'image', backgroundId: background.id })} />}
  </section>
}
