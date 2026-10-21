import { openDB } from 'idb'
import { dataCloud } from './cloud'
import { uuid, type Output } from './model'
export { native } from './platform'
import { native } from './platform'
import { android } from './platform'
export const OUTPUT_LIMIT = 25 * 1024 * 1024
const BUCKET = 'task-outputs'
const files = openDB('dayweave-outputs-v1', 1, { upgrade(db) { db.createObjectStore('files', { keyPath: 'key' }) } })
type Stored = { key: string; scope: string; output: Output; blob: Blob }
const key = (scope: string, id: string) => scope + ':' + id
async function invoke<T>(command: string, args?: Record<string, unknown>) { return (await import('@tauri-apps/api/core')).invoke<T>(command, args) }
export async function localOutputIds(scope: string): Promise<string[]> {
  if (native) return invoke('local_output_ids', { scope })
  return ((await (await files).getAll('files')) as Stored[]).filter(f => f.scope === scope).map(f => f.output.id)
}
export async function chooseOutput(scope: string, folder = false, id: string = uuid()): Promise<Output | null> {
  return native ? invoke('pick_output', { scope, id, folder }) : null
}
export async function addBrowserOutput(scope: string, file: File): Promise<Output> {
  if (file.size > OUTPUT_LIMIT) throw new Error('网页本机附件最多 25 MB；大文件可在 Windows 客户端关联')
  const output: Output = { id: uuid(), name: file.name, kind: 'file', size: file.size }
  await (await files).put('files', { key: key(scope, output.id), scope, output, blob: file })
  return output
}
export async function copyLocalOutputScope(from: string, to: string, ids: string[]) {
  if (native) return invoke('copy_output_scope', { from, to, ids })
  const db = await files
  for (const id of ids) { const f = await db.get('files', key(from, id)) as Stored | undefined; if (f && !await db.get('files', key(to, id))) await db.put('files', { ...f, scope: to, key: key(to, id) }) }
}
export async function readLocalOutput(scope: string, output: Output): Promise<Blob> {
  if (native) return new Blob([await invoke<ArrayBuffer>('read_output', { scope, id: output.id })], { type: output.kind === 'folder' ? 'application/zip' : 'application/octet-stream' })
  const stored = await (await files).get('files', key(scope, output.id)) as Stored | undefined
  if (!stored) throw new Error('文件仅在原设备，请先在原电脑上传')
  return stored.blob
}
export function outputFilename(output: Output) { return output.kind === 'folder' ? output.name + '.zip' : output.name }
function checkCloud(scope: string, path?: string) {
  if (!dataCloud || scope === 'guest') throw new Error('请先在设置中登录云账号')
  if (path && !path.startsWith(scope + '/')) throw new Error('此云端副本属于其他账号，请重新关联本机文件')
  return dataCloud.storage.from(BUCKET)
}
export async function uploadOutput(scope: string, taskId: string, output: Output) {
  const storage = checkCloud(scope)
  const blob = await readLocalOutput(scope, output)
  if (blob.size > OUTPUT_LIMIT) throw new Error('云端副本最多 25 MB')
  const path = `${scope}/${taskId}/${output.id}/${uuid()}.${output.kind === 'folder' ? 'zip' : 'bin'}`
  const { error } = await storage.upload(path, blob, { upsert: false, cacheControl: '0', contentType: output.kind === 'folder' ? 'application/zip' : blob.type || 'application/octet-stream' })
  if (error) throw new Error('上传未完成：' + error.message)
  return path
}
export async function cacheCloudOutput(scope: string, output: Output) {
  const storage = checkCloud(scope, output.cloudPath)
  if (!output.cloudPath) throw new Error('该产出尚未上传')
  const { data, error } = await storage.download(output.cloudPath, { cacheNonce: uuid() })
  if (error) throw new Error('下载未完成：' + error.message)
  if (native) {
    if (android) {
      // Android's Tauri bridge accepts JSON, but not a raw binary invoke body.
      // FileReader avoids allocating a JSON number array for large documents.
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',', 2)[1])
        reader.onerror = () => reject(reader.error ?? new Error('无法读取下载内容'))
        reader.readAsDataURL(data)
      })
      await invoke('cache_mobile_output', { scope, id: output.id, name: outputFilename(output), base64 })
      return
    }
    const meta = new TextEncoder().encode(JSON.stringify({ scope, id: output.id, name: outputFilename(output) }))
    const header = btoa(Array.from(meta, b => String.fromCharCode(b)).join(''))
    await (await import('@tauri-apps/api/core')).invoke('cache_output', await data.arrayBuffer(), { headers: { 'x-output-meta': header } })
  } else await (await files).put('files', { key: key(scope, output.id), scope, output, blob: data })
}
export async function removeCloudOutput(scope: string, path: string) {
  const { error } = await checkCloud(scope, path).remove([path]); if (error) throw new Error('移除云端副本失败：' + error.message)
}
export async function openLocalOutput(scope: string, output: Output, download = false) {
  if (native) return invoke('open_output', { scope, id: output.id })
  const blob = await readLocalOutput(scope, output); const url = URL.createObjectURL(blob)
  // Browser output is always a local download; never execute uploaded HTML or scripts
  // under this application's origin. The OS/browser can open the saved document.
  const a = document.createElement('a'); a.href = url; a.download = outputFilename(output); a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  void download
}
export async function saveMobileOutput(scope: string, output: Output) {
  return invoke<boolean>('save_output', { scope, id: output.id })
}
