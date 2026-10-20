export type Status = 'todo' | 'doing' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export interface Step { id: string; title: string; done: boolean }
export interface Task {
  id: string; title: string; note: string; date: string; status: Status
  priority: Priority; assignee: string; project: string; link: string
  waiting: boolean; starred: boolean; steps: Step[]
  createdAt: string; updatedAt: string; deletedAt: string | null
}
export interface RemoteRow {
  id: string; user_id: string; document: Task; revision: number
  updated_at: string; last_mutation_id: string
}
export interface LocalRecord {
  scope: string; task: Task; serverRevision: number; dirty: boolean
  mutationId: string; conflict?: RemoteRow
}
export const statusLabels: Record<Status, string> = { doing: '进行中', todo: '待办任务', done: '已结束' }
export const priorityLabels: Record<Priority, string> = { high: '高优先', medium: '普通', low: '低优先' }
export const uuid = () => crypto.randomUUID()
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function parseDate(value: string): Date { return new Date(value + 'T12:00:00') }
export function shiftDate(value: string, days: number): string {
  const date = parseDate(value); date.setDate(date.getDate() + days); return dateKey(date)
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(+parseDate(value)) && dateKey(parseDate(value)) === value
}
export function newTask(date = dateKey()): Task {
  const now = new Date().toISOString()
  return { id: uuid(), title: '', note: '', date, status: 'todo', priority: 'medium', assignee: '自己', project: '', link: '', waiting: false, starred: false, steps: [], createdAt: now, updatedAt: now, deletedAt: null }
}
export function safeLink(value: string): string | null {
  if (!value) return null
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null } catch { return null }
}
export function validateTask(value: unknown): Task {
  if (!value || typeof value !== 'object') throw new Error('任务格式无效')
  const t = value as Task
  if (typeof t.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.id)) throw new Error('任务 ID 无效')
  if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 300) throw new Error('任务标题需要 1–300 个字符')
  if (!validDate(t.date)) throw new Error('任务日期无效')
  if (!['todo', 'doing', 'done'].includes(t.status) || !['high', 'medium', 'low'].includes(t.priority)) throw new Error('任务状态无效')
  for (const field of ['note', 'assignee', 'project', 'link'] as const) {
    if (typeof t[field] !== 'string' || t[field].length > (field === 'note' ? 20000 : 2000)) throw new Error('任务字段格式无效')
  }
  if (typeof t.waiting !== 'boolean' || typeof t.starred !== 'boolean') throw new Error('任务标记无效')
  if (!Array.isArray(t.steps) || t.steps.length > 200 || t.steps.some(s => !s || typeof s.id !== 'string' || typeof s.title !== 'string' || !s.title.trim() || s.title.length > 500 || typeof s.done !== 'boolean')) throw new Error('子步骤格式无效')
  if (new Set(t.steps.map(s => s.id)).size !== t.steps.length) throw new Error('子步骤 ID 重复')
  if (![t.createdAt, t.updatedAt].every(x => typeof x === 'string' && !Number.isNaN(Date.parse(x))) || (t.deletedAt !== null && (typeof t.deletedAt !== 'string' || Number.isNaN(Date.parse(t.deletedAt))))) throw new Error('任务时间无效')
  if (t.link && !safeLink(t.link)) throw new Error('关联链接需要以 https:// 或 http:// 开头')
  return { ...t, title: t.title.trim(), steps: t.steps.map(s => ({ ...s, title: s.title.trim() })) }
}
export function fromRemote(scope: string, row: RemoteRow): LocalRecord {
  const task = validateTask(row.document)
  if (row.id !== task.id || row.user_id !== scope || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('云端任务数据无效')
  return { scope, task, serverRevision: row.revision, dirty: false, mutationId: row.last_mutation_id }
}
export function mergeRemote(local: LocalRecord | undefined, row: RemoteRow): LocalRecord {
  const remote = fromRemote(row.user_id, row)
  if (!local) return remote
  if (row.revision <= local.serverRevision) return local
  if (local.dirty) return { ...local, conflict: row }
  return remote
}
export function acknowledge(current: LocalRecord, sent: LocalRecord, row: RemoteRow): LocalRecord {
  const remote = fromRemote(current.scope, row)
  if (current.mutationId === sent.mutationId) return remote
  // An edit made while the request was in flight remains queued on the acknowledged revision.
  return { ...current, serverRevision: row.revision, conflict: undefined }
}
export function readBackup(text: string): Task[] {
  const data = JSON.parse(text)
  if (data?.format !== 'dayweave' || data?.version !== 1 || !Array.isArray(data.tasks) || data.tasks.length > 10000) throw new Error('请选择日序导出的备份文件（最多 10000 项）')
  const tasks = data.tasks.map(validateTask) as Task[]
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('备份中存在重复任务')
  return tasks
}
