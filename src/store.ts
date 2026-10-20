import { useSyncExternalStore } from 'react'
import { cloud, dataCloud } from './cloud'
import { loadRecords, saveRecords } from './db'
import { acknowledge, fromRemote, mergeRemote, newTask, readBackup, uuid, validateTask, type LocalRecord, type RemoteRow, type Task } from './model'

interface Snapshot {
  ready: boolean; scope: string; email: string | null; records: LocalRecord[]
  syncing: boolean; online: boolean; error: string; lastSync: string | null
}
let snapshot: Snapshot = { ready: false, scope: 'guest', email: null, records: [], syncing: false, online: navigator.onLine, error: '', lastSync: null }
const listeners = new Set<() => void>()
const emit = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()) }
export const useTasks = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => snapshot)
let storageQueue = Promise.resolve()
let authQueue = Promise.resolve()
let syncTimer: ReturnType<typeof setTimeout> | undefined
let activeSync: Promise<void> | null = null
let syncAgain = false
let channel: ReturnType<NonNullable<typeof dataCloud>['channel']> | null = null

function commit(update: LocalRecord[] | ((current: LocalRecord[]) => LocalRecord[]), scope: string) {
  // Serialize the read/transform/write as one operation, including cloud acknowledgements.
  const work = storageQueue.then(async () => {
    if (snapshot.scope !== scope) return
    const records = typeof update === 'function' ? update(snapshot.records) : update
    await saveRecords(records)
    if (snapshot.scope !== scope) return
    const map = new Map(snapshot.records.map(r => [r.task.id, r]))
    records.forEach(r => map.set(r.task.id, r))
    emit({ records: [...map.values()] })
  })
  storageQueue = work.catch(() => {})
  return work
}
export function scheduleSync() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { void syncNow() }, 650)
}
export async function saveTask(task: Task) {
  const scope = snapshot.scope
  const baseUpdatedAt = task.updatedAt
  const clean = validateTask({ ...task, updatedAt: new Date().toISOString() })
  await commit(records => {
    const current = records.find(r => r.task.id === clean.id)
    if (current && current.task.updatedAt !== baseUpdatedAt) throw new Error('任务在编辑期间发生了变化。请保留当前输入，重新打开任务后再保存。')
    return [{ scope, task: clean, serverRevision: current?.serverRevision ?? 0, dirty: true, mutationId: uuid(), conflict: current?.conflict }]
  }, scope)
  scheduleSync()
}
export async function patchTask(id: string, transform: (task: Task) => Task) {
  const scope = snapshot.scope
  await commit(records => {
    const record = records.find(r => r.task.id === id)
    if (!record) return []
    return [{ ...record, task: validateTask({ ...transform(record.task), updatedAt: new Date().toISOString() }), dirty: true, mutationId: uuid() }]
  }, scope)
  scheduleSync()
}
export async function importTasks(text: string) {
  const tasks = readBackup(text)
  const scope = snapshot.scope
  const now = new Date().toISOString()
  const records = tasks.map(task => ({ scope, task: { ...task, id: uuid(), createdAt: now, updatedAt: now, steps: task.steps.map(s => ({ ...s, id: uuid() })) }, serverRevision: 0, dirty: true, mutationId: uuid() }))
  await commit(records, scope); scheduleSync(); return records.length
}
export async function copyGuestTasks() {
  const scope = snapshot.scope
  if (scope === 'guest') return 0
  const guests = (await loadRecords('guest')).filter(r => !r.task.deletedAt)
  // Stable IDs make repeated imports harmless, including after interrupted uploads.
  const existing = new Set(snapshot.records.map(r => r.task.id))
  const records = guests.filter(r => !existing.has(r.task.id)).map(r => ({ scope, task: r.task, serverRevision: 0, dirty: true, mutationId: uuid() }))
  await commit(records, scope); scheduleSync(); return records.length
}
export async function resolveConflict(id: string, choice: 'local' | 'remote' | 'both') {
  const scope = snapshot.scope
  const current = snapshot.records.find(r => r.task.id === id)
  if (!current?.conflict) return
  const remote = fromRemote(scope, current.conflict)
  const records: LocalRecord[] = choice === 'local'
    ? [{ ...current, serverRevision: remote.serverRevision, mutationId: uuid(), dirty: true, conflict: undefined }]
    : [remote]
  if (choice === 'both') records.push({ scope, task: { ...current.task, id: uuid(), title: (current.task.title.slice(0, 290) + '（本地副本）'), updatedAt: new Date().toISOString() }, serverRevision: 0, dirty: true, mutationId: uuid() })
  await commit(records, scope); scheduleSync()
}

async function performSync() {
  if (!dataCloud || snapshot.scope === 'guest' || !navigator.onLine || !snapshot.ready) return
  const scope = snapshot.scope
  emit({ syncing: true, error: '' })
  try {
    const pending = snapshot.records.filter(r => r.dirty && !r.conflict)
    for (const sent of pending) {
      if (snapshot.scope !== scope) return
      const { data, error } = await dataCloud.rpc('commit_task', { p_id: sent.task.id, p_expected_revision: sent.serverRevision, p_document: sent.task, p_mutation_id: sent.mutationId })
      if (error) {
        if (error.code !== 'PT409') throw error
        const fresh = await dataCloud.from('tasks').select('*').eq('user_id', scope).eq('id', sent.task.id).single()
        if (fresh.error) throw fresh.error
        if (snapshot.scope !== scope) return
        await commit(records => {
          const current = records.find(r => r.task.id === sent.task.id)
          return current ? [mergeRemote(current, fresh.data as RemoteRow)] : []
        }, scope)
        continue
      }
      if (snapshot.scope !== scope) return
      const row = (Array.isArray(data) ? data[0] : data) as RemoteRow
      await commit(records => {
        const current = records.find(r => r.task.id === sent.task.id)
        return current ? [acknowledge(current, sent, row)] : []
      }, scope)
    }
    // Paginate to avoid the Data API's default row limit silently losing older tasks.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await dataCloud.from('tasks').select('*').eq('user_id', scope).order('id').range(offset, offset + 499)
      if (error) throw error
      if (snapshot.scope !== scope) return
      await commit(records => (data as RemoteRow[]).map(row => mergeRemote(records.find(r => r.task.id === row.id), row)), scope)
      if (data.length < 500) break
    }
    if (snapshot.scope === scope) emit({ lastSync: new Date().toISOString() })
  } catch (error) {
    if (snapshot.scope === scope) emit({ error: '同步暂未完成：' + (error instanceof Error ? error.message : (error as { message?: string })?.message || '请检查网络后重试') })
  } finally { if (snapshot.scope === scope) emit({ syncing: false }) }
}
export async function syncNow() {
  if (activeSync) { syncAgain = true; return activeSync }
  activeSync = performSync()
  try { await activeSync } finally {
    activeSync = null
    if (syncAgain) { syncAgain = false; scheduleSync() }
  }
}
async function switchAccount(user: { id: string; email?: string } | null) {
  await storageQueue
  const scope = user?.id ?? 'guest'
  if (scope === snapshot.scope && snapshot.ready) { emit({ email: user?.email ?? null }); return }
  emit({ ready: false, scope, email: user?.email ?? null, records: [], syncing: false, lastSync: null, error: '' })
  if (channel && dataCloud) { void dataCloud.removeChannel(channel); channel = null }
  const records = await loadRecords(scope)
  if (snapshot.scope !== scope) return
  emit({ ready: true, records })
  if (dataCloud && user) {
    channel = dataCloud.channel('tasks-' + scope).on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: 'user_id=eq.' + scope }, scheduleSync).subscribe(status => { if (status === 'SUBSCRIBED') scheduleSync() })
    scheduleSync()
  }
}
let started = false
export function initialize() {
  if (started) return
  started = true
  const apply = (user: { id: string; email?: string } | null) => {
    authQueue = authQueue.then(() => switchAccount(user)).catch(error => emit({ error: '无法打开本地数据：' + String(error), ready: false }))
  }
  if (cloud) cloud.auth.onAuthStateChange((_event, session) => { apply(session?.user ?? null) })
  else apply(null)
  window.addEventListener('online', () => { emit({ online: true }); scheduleSync() })
  window.addEventListener('offline', () => emit({ online: false }))
  window.addEventListener('focus', scheduleSync)
  // Low-frequency fallback also covers missed Realtime events after waking the computer.
  setInterval(() => { if (document.visibilityState === 'visible') scheduleSync() }, 60000)
}
export function exampleTasks(date: string): Task[] {
  return [
    { ...newTask(date), title: '完成论文方法章节', note: '梳理方法逻辑，把关键公式和可执行流程对应起来。', project: '研究论文', status: 'doing' as const, priority: 'high' as const, starred: true, steps: [{ id: uuid(), title: '梳理符号与问题定义', done: true }, { id: uuid(), title: '补充方法流程说明', done: false }, { id: uuid(), title: '检查公式与正文一致性', done: false }] },
    { ...newTask(date), title: '检查 Agent 的代码交付', note: '打开关联 PR，检查功能与测试结果。', project: '日序开发', assignee: 'Codex', status: 'doing' as const, waiting: true, link: 'https://github.com/tsysanyotan-glitch/dayweave' },
    { ...newTask(date), title: '整理下周组会材料', project: '组会汇报', steps: [{ id: uuid(), title: '列出本周进展', done: false }, { id: uuid(), title: '写下需要讨论的问题', done: false }] },
    { ...newTask(date), title: '阅读与整理相关工作', project: '研究论文', priority: 'low' as const },
    { ...newTask(date), title: '备份今天的研究笔记', status: 'done' as const, priority: 'low' as const },
  ]
}
