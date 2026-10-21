import { useSyncExternalStore, type CSSProperties } from 'react'
import { openDB, type DBSchema } from 'idb'
export type TaskLook = { kind: 'color'; color: string } | { kind: 'image'; backgroundId: string } | { kind: 'default' }
export interface Background { id: string; name: string; dataUrl: string; opacity: number; width: number; height: number }
interface LookRow { key: string; look: TaskLook }
interface LooksDB extends DBSchema { backgrounds: { key: string; value: Background }; looks: { key: string; value: LookRow } }
const db = openDB<LooksDB>('dayweave-appearance-v1', 1, { upgrade(database) { database.createObjectStore('backgrounds', { keyPath: 'id' }); database.createObjectStore('looks', { keyPath: 'key' }) } })
let state = { ready: false, backgrounds: [] as Background[], looks: {} as Record<string, TaskLook> }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())
let loading: Promise<void> | undefined
export function initializeLooks() {
  return loading ??= (async () => { const database = await db; const [backgrounds, rows] = await Promise.all([database.getAll('backgrounds'), database.getAll('looks')]); state = { ready: true, backgrounds, looks: Object.fromEntries(rows.map(r => [r.key, r.look])) }; emit() })()
}
export const useLooks = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => state)
export const taskLook = (scope: string, id: string) => state.looks[scope + ':' + id] ?? { kind: 'default' } as TaskLook
export async function saveTaskLook(scope: string, id: string, look: TaskLook) {
  if (look.kind === 'color' && !/^#[0-9a-f]{6}$/i.test(look.color)) throw new Error('请选择有效的背景颜色')
  if (look.kind === 'image' && !state.backgrounds.some(b => b.id === look.backgroundId)) throw new Error('背景图片已不存在，请重新选择')
  const key = scope + ':' + id
  await (await db).put('looks', { key, look }); state = { ...state, looks: { ...state.looks, [key]: look } }; emit()
}
export async function saveBackground(background: Background) {
  if (state.backgrounds.length >= 40) throw new Error('最多保存 40 个自制背景，请先移除不再使用的背景')
  if (!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(background.dataUrl) || background.dataUrl.length > 800000 || !background.name.trim() || background.name.length > 80 || background.opacity < 0 || background.opacity > 1) throw new Error('背景格式或大小无效')
  await (await db).put('backgrounds', background); state = { ...state, backgrounds: [...state.backgrounds, background] }; emit()
}
export async function removeBackground(id: string) {
  await (await db).delete('backgrounds', id); state = { ...state, backgrounds: state.backgrounds.filter(b => b.id !== id) }; emit()
}
export function lookStyle(look: TaskLook): CSSProperties {
  if (look.kind === 'color') {
    const rgb = look.color.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
    const ink = luminance > .32 ? '#25352b' : luminance > .179 ? '#000000' : '#ffffff'
    return { '--task-color': look.color, '--card-ink': ink } as CSSProperties
  }
  const background = look.kind === 'image' ? state.backgrounds.find(b => b.id === look.backgroundId) : undefined
  return background ? { '--task-image': `url("${background.dataUrl}")`, '--task-image-opacity': background.opacity } as CSSProperties : {}
}
