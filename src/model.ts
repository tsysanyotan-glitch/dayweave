import { clockDate, clockIso } from './time.ts'
export type Status = 'todo' | 'doing' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type TaskKind = 'planned' | 'issue' | 'alarm'
export interface Step { id: string; title: string; done: boolean; assignee?: string; active?: boolean; showInSummary?: boolean }
export interface Output { id: string; name: string; kind: 'file' | 'folder'; size?: number; cloudPath?: string }
export interface Task {
  id: string; title: string; note: string; date: string; status: Status; kind: 'planned' | 'issue'
  alarm?: boolean; deadlineAt?: string | null; reminderAt?: string | null
  priority: Priority; assignee: string; project: string; link: string
  waiting: boolean; starred: boolean; steps: Step[]; outputs: Output[]; order?: number
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
export const kindLabels: Record<TaskKind, string> = { planned: '计划任务', issue: '零碎问题', alarm: '闹钟' }
export const taskKind = (task: Task): TaskKind => task.alarm ? 'alarm' : task.kind ?? 'planned'
export const uuid = () => crypto.randomUUID()
export function dateKey(date = clockDate()): string {
  const beijing = new Date(date.getTime() + 8 * 3600000)
  return `${beijing.getUTCFullYear()}-${String(beijing.getUTCMonth() + 1).padStart(2, '0')}-${String(beijing.getUTCDate()).padStart(2, '0')}`
}
export function parseDate(value: string): Date { return new Date(value + 'T04:00:00Z') }
export function shiftDate(value: string, days: number): string {
  const date = parseDate(value); date.setUTCDate(date.getUTCDate() + days); return dateKey(date)
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(+parseDate(value)) && dateKey(parseDate(value)) === value
}
export function newTask(date = dateKey()): Task {
  const now = clockIso()
  return { id: uuid(), title: '', note: '', date, status: 'todo', kind: 'planned', priority: 'medium', assignee: '自己', project: '', link: '', waiting: false, starred: false, steps: [], outputs: [], createdAt: now, updatedAt: now, deletedAt: null }
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
  if (t.kind !== undefined && !['planned', 'issue'].includes(t.kind)) throw new Error('任务类型无效')
  if (t.alarm !== undefined && typeof t.alarm !== 'boolean') throw new Error('闹钟标记无效')
  for (const value of [t.deadlineAt, t.reminderAt]) if (value !== undefined && value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z'))) throw new Error('提醒时间需要有效的 UTC ISO 时间')
  if (t.alarm && (!t.deadlineAt || !t.reminderAt)) throw new Error('闹钟需要设置截止与提醒时间')
  if (t.deadlineAt && t.reminderAt && Date.parse(t.reminderAt) > Date.parse(t.deadlineAt)) throw new Error('提醒时间不能晚于截止时间')
  for (const field of ['note', 'assignee', 'project', 'link'] as const) {
    if (typeof t[field] !== 'string' || t[field].length > (field === 'note' ? 20000 : 2000)) throw new Error('任务字段格式无效')
  }
  if (typeof t.waiting !== 'boolean' || typeof t.starred !== 'boolean') throw new Error('任务标记无效')
  if (!Array.isArray(t.steps) || t.steps.length > 200 || t.steps.some(s => !s || typeof s.id !== 'string' || typeof s.title !== 'string' || !s.title.trim() || s.title.length > 500 || typeof s.done !== 'boolean')) throw new Error('子步骤格式无效')
  if (new Set(t.steps.map(s => s.id)).size !== t.steps.length) throw new Error('子步骤 ID 重复')
  if (t.steps.some(s => (s.assignee !== undefined && (typeof s.assignee !== 'string' || s.assignee.length > 80)) || (s.active !== undefined && typeof s.active !== 'boolean') || (s.showInSummary !== undefined && typeof s.showInSummary !== 'boolean'))) throw new Error('子步骤执行信息无效')
  if (![t.createdAt, t.updatedAt].every(x => typeof x === 'string' && !Number.isNaN(Date.parse(x))) || (t.deletedAt !== null && (typeof t.deletedAt !== 'string' || Number.isNaN(Date.parse(t.deletedAt))))) throw new Error('任务时间无效')
  if (t.link && !safeLink(t.link)) throw new Error('关联链接需要以 https:// 或 http:// 开头')
  if (t.outputs !== undefined && !Array.isArray(t.outputs)) throw new Error('任务产出格式无效')
  const outputs = (t.outputs ?? []).map(validateOutput)
  if (outputs.length > 100 || new Set(outputs.map(o => o.id)).size !== outputs.length) throw new Error('任务产出最多 100 项，且不能重复')
  if (t.order !== undefined && (typeof t.order !== 'number' || !Number.isFinite(t.order) || Math.abs(t.order) > 1e16)) throw new Error('任务顺序无效')
  // Whitelist synchronized fields. Native paths and browser file bytes never enter tasks.
  return { id: t.id, title: t.title.trim(), note: t.note, date: t.date, status: t.status, kind: t.kind ?? 'planned', ...(t.alarm === undefined ? {} : { alarm: t.alarm }), ...(t.deadlineAt === undefined ? {} : { deadlineAt: t.deadlineAt }), ...(t.reminderAt === undefined ? {} : { reminderAt: t.reminderAt }), priority: t.priority, assignee: t.assignee, project: t.project, link: t.link, waiting: t.waiting, starred: t.starred, steps: t.steps.map(s => ({ id: s.id, title: s.title.trim(), done: s.done, ...(s.assignee === undefined ? {} : { assignee: s.assignee.trim() }), ...(s.active === undefined ? {} : { active: !s.done && s.active }), ...(s.showInSummary === undefined ? {} : { showInSummary: s.showInSummary }) })), outputs, ...(t.order === undefined ? {} : { order: t.order }), createdAt: t.createdAt, updatedAt: t.updatedAt, deletedAt: t.deletedAt }
}
export function summarySteps(task: Task): Step[] {
  if (task.status === 'done') return []
  const explicit = task.steps.some(s => s.active !== undefined || s.showInSummary !== undefined)
  return explicit ? task.steps.filter(s => !s.done && (s.showInSummary ?? s.active ?? false)) : task.steps.filter(s => !s.done).slice(0, 1)
}
export function validateOutput(value: unknown): Output {
  const o = value as Output
  if (!o || typeof o.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(o.id) || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 300 || !['file', 'folder'].includes(o.kind)) throw new Error('任务产出格式无效')
  if (o.size !== undefined && (!Number.isSafeInteger(o.size) || o.size < 0)) throw new Error('文件大小无效')
  if (o.cloudPath !== undefined && (typeof o.cloudPath !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(bin|zip)$/i.test(o.cloudPath))) throw new Error('云端文件位置无效')
  if (o.cloudPath && o.cloudPath.split('/')[2] !== o.id) throw new Error('云端文件标识不匹配')
  return { id: o.id, name: o.name.trim(), kind: o.kind, ...(o.size === undefined ? {} : { size: o.size }), ...(o.cloudPath ? { cloudPath: o.cloudPath } : {}) }
}
export const taskOrder = (t: Task) => t.order ?? (t.starred ? -1e15 : 0) + ({ high: 0, medium: 1e14, low: 2e14 }[t.priority]) + Date.parse(t.createdAt)
// Move the original record, preserving attachment IDs and all work already done.
export function carryForward(records: LocalRecord[], today = dateKey(), now = clockIso()): LocalRecord[] {
  return records.filter(r => !r.conflict && !r.task.deletedAt && r.task.status === 'doing' && r.task.date < today)
    .map(r => ({ ...r, task: { ...r.task, date: today, updatedAt: now }, dirty: true, mutationId: uuid() }))
}
function sameWork(a: Task, b: Task) {
  const { date: _ad, updatedAt: _au, ...left } = validateTask(a)
  const { date: _bd, updatedAt: _bu, ...right } = validateTask(b)
  return JSON.stringify(left) === JSON.stringify(right)
}
export function fromRemote(scope: string, row: RemoteRow, previous?: Task): LocalRecord {
  const task = validateTask(row.document)
  if (previous) {
    if (task.alarm === undefined && previous.alarm !== undefined) task.alarm = previous.alarm
    if (task.deadlineAt === undefined && previous.deadlineAt !== undefined) task.deadlineAt = previous.deadlineAt
    if (task.reminderAt === undefined && previous.reminderAt !== undefined) task.reminderAt = previous.reminderAt
  }
  if (row.id !== task.id || row.user_id !== scope || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('云端任务数据无效')
  // Older clients omit optional step metadata. Retain known values for surviving
  // step IDs; explicit false/empty values from newer clients still clear them.
  if (previous) task.steps = task.steps.map(step => {
    const old = previous.steps.find(s => s.id === step.id)
    if (!old) return step
    return { ...step, ...(step.assignee === undefined && old.assignee !== undefined ? { assignee: old.assignee } : {}), ...(step.active === undefined && old.active !== undefined ? { active: !step.done && old.active } : {}), ...(step.showInSummary === undefined && old.showInSummary !== undefined ? { showInSummary: old.showInSummary } : {}) }
  })
  return { scope, task, serverRevision: row.revision, dirty: false, mutationId: row.last_mutation_id }
}
export function mergeRemote(local: LocalRecord | undefined, row: RemoteRow): LocalRecord {
  const remote = fromRemote(row.user_id, row, local?.task)
  if (!local) return remote
  if (local.scope !== row.user_id) throw new Error('任务账号不匹配')
  if (row.revision <= local.serverRevision) return local
  // Two devices can carry the same task forward independently. Only reconcile
  // dates when every other field agrees; actual content edits still conflict.
  if (local.dirty && !local.conflict && local.task.status === 'doing' && !local.task.deletedAt && sameWork(local.task, remote.task)) {
    return remote.task.date >= local.task.date ? remote : { ...local, serverRevision: row.revision }
  }
  if (local.dirty) return { ...local, conflict: row }
  return remote
}
export function acknowledge(current: LocalRecord, sent: LocalRecord, row: RemoteRow): LocalRecord {
  const remote = fromRemote(current.scope, row, current.task)
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
