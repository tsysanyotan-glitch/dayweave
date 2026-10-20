import { describe, expect, it } from 'vitest'
import { acknowledge, dateKey, fromRemote, mergeRemote, newTask, readBackup, safeLink, shiftDate, validDate, validateTask, type LocalRecord, type RemoteRow } from '../src/model'

const scope = '29d69405-0106-4c59-a70b-b756396e411d'
function fixture() {
  const task = { ...newTask('2026-10-20'), title: '测试任务' }
  const local: LocalRecord = { scope, task, dirty: true, serverRevision: 1, mutationId: crypto.randomUUID() }
  const remote: RemoteRow = { id: task.id, user_id: scope, document: { ...task, title: '另一台设备的修改' }, revision: 2, last_mutation_id: crypto.randomUUID(), updated_at: new Date().toISOString() }
  return { local, remote }
}
describe('calendar and validation', () => {
  it('keeps dates local and handles month/leap transitions', () => {
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(dateKey(new Date(2026, 9, 20, 0, 1))).toBe('2026-10-20')
    expect(validDate('2026-02-31')).toBe(false)
    expect(validDate('2026-13-01')).toBe(false)
  })
  it('rejects executable and malformed links', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull()
    expect(safeLink('file:///C:/test')).toBeNull()
    expect(safeLink('https://example.com')).toBe('https://example.com/')
  })
  it('rejects malformed imports before any writes', () => {
    const { local } = fixture()
    expect(() => validateTask({ ...local.task, date: '2026-02-31' })).toThrow()
    expect(() => readBackup(JSON.stringify({ format: 'dayweave', version: 1, tasks: [local.task, local.task] }))).toThrow('重复')
    expect(() => readBackup('{"tasks":[]}')).toThrow()
    expect(() => validateTask({ ...local.task, steps: [{ id: 'a', title: '', done: false }] })).toThrow()
  })
  it('keeps task type through sync and backups while treating older tasks as planned work', () => {
    const { local, remote } = fixture()
    const { kind: _kind, ...legacy } = local.task
    expect(validateTask(legacy).kind).toBe('planned')
    const issue = { ...remote.document, kind: 'issue' as const, status: 'done' as const }
    expect(fromRemote(scope, { ...remote, document: issue }).task.kind).toBe('issue')
    expect(readBackup(JSON.stringify({ format: 'dayweave', version: 1, tasks: [issue] }))[0].kind).toBe('issue')
    expect(() => validateTask({ ...issue, kind: 'urgent' })).toThrow('类型')
  })
})
describe('sync without lost edits', () => {
  it('preserves both versions on a conflict', () => {
    const { local, remote } = fixture(); const result = mergeRemote(local, remote)
    expect(result.task.title).toBe('测试任务'); expect(result.conflict?.document.title).toBe('另一台设备的修改')
    expect(result.serverRevision).toBe(1); expect(result.dirty).toBe(true)
  })
  it('does not turn clean or older snapshots into conflicts', () => {
    const { local, remote } = fixture()
    expect(mergeRemote({ ...local, dirty: false }, remote).task.title).toBe(remote.document.title)
    expect(mergeRemote(local, { ...remote, revision: 1 })).toBe(local)
  })
  it('acknowledges an upload while preserving an edit made during the request', () => {
    const { local, remote } = fixture()
    const edited = { ...local, task: { ...local.task, note: '新备注' }, mutationId: crypto.randomUUID() }
    const result = acknowledge(edited, local, remote)
    expect(result.task.note).toBe('新备注'); expect(result.dirty).toBe(true); expect(result.serverRevision).toBe(2)
    expect(acknowledge(local, local, remote).dirty).toBe(false)
  })
  it('propagates soft deletions and rejects cross-account/invalid data', () => {
    const { local, remote } = fixture()
    const deleted = { ...remote, document: { ...remote.document, deletedAt: new Date().toISOString() } }
    expect(mergeRemote({ ...local, dirty: false }, deleted).task.deletedAt).toBeTruthy()
    expect(() => fromRemote('different-account', remote)).toThrow()
    expect(() => fromRemote(scope, { ...remote, id: crypto.randomUUID() })).toThrow()
  })
})
