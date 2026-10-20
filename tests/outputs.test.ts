import 'fake-indexeddb/auto'
import { beforeAll, expect, test, vi } from 'vitest'
import { newTask, taskOrder, validateTask, uuid } from '../src/model'
vi.mock('../src/cloud', () => ({ dataCloud: null }))
vi.stubGlobal('window', {})
let outputs: typeof import('../src/outputs')
beforeAll(async () => { outputs = await import('../src/outputs') })
test('legacy tasks migrate to an empty output list; private fields never enter synchronized metadata', () => {
  const t = { ...newTask(), title: 'deliver', localPath: 'C:/private', outputs: [{ id: uuid(), name: '结果.pdf', kind: 'file', localPath: 'C:/private/结果.pdf', bytes: [1,2,3] }] }
  const clean = validateTask(t)
  expect(JSON.stringify(clean)).not.toContain('private'); expect(JSON.stringify(clean)).not.toContain('bytes')
  const { outputs: _ignored, ...legacy } = t; expect(validateTask(legacy).outputs).toEqual([])
  expect(() => validateTask({ ...t, outputs: [{ ...t.outputs[0], cloudPath: '../another-user/document.pdf' }] })).toThrow()
  expect(() => validateTask({ ...t, order: Infinity })).toThrow()
})
test('browser files stay local, survive lookup, and are isolated until explicitly copied to a new scope', async () => {
  const a = uuid(), b = uuid(); const file = new File(['private-only'], '结果.txt', { type: 'text/plain' })
  const output = await outputs.addBrowserOutput(a, file)
  expect(output.cloudPath).toBeUndefined(); expect(await outputs.localOutputIds(a)).toEqual([output.id])
  expect(await (await outputs.readLocalOutput(a, output)).text()).toBe('private-only')
  await expect(outputs.readLocalOutput(b, output)).rejects.toThrow('原设备')
  await expect(outputs.uploadOutput(a, uuid(), output)).rejects.toThrow('登录')
  await outputs.copyLocalOutputScope(a, b, [output.id]); await outputs.copyLocalOutputScope(a, b, [output.id])
  expect(await outputs.localOutputIds(b)).toEqual([output.id]); expect(await (await outputs.readLocalOutput(b, output)).text()).toBe('private-only')
})
test('manual ordering supersedes default priority and files beyond the explicit browser limit are rejected', async () => {
  const task = { ...newTask(), title: 'x', priority: 'high' as const }; expect(taskOrder({ ...task, order: -2048 })).toBe(-2048)
  const file = new File([new Uint8Array(outputs.OUTPUT_LIMIT + 1)], 'large.bin'); await expect(outputs.addBrowserOutput(uuid(), file)).rejects.toThrow('25 MB')
})
