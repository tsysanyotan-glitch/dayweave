import { afterEach, describe, expect, it, vi } from 'vitest'
import { clockNow, clockIso, setClockSource } from '../src/time'
import { installCalibratedDate, refreshClock } from '../src/clock'
import { carryForward, dateKey, newTask, parseDate, shiftDate, type LocalRecord } from '../src/model'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
const SystemDate = Date, nativeNow = Date.now.bind(Date)
afterEach(() => { globalThis.Date = SystemDate; vi.restoreAllMocks(); setClockSource(nativeNow) })
describe('calibrated Beijing business clock', () => {
  it('ignores a wrong PC wall clock; keeps ticking offline from the network anchor', async () => {
    let tick = 100
    vi.spyOn(performance, 'now').mockImplementation(() => tick)
    invoke.mockResolvedValue({ epochMs: 1798732799500, source: 'https://time.example', ageMs: 0 })
    expect(await refreshClock()).toBe(true)
    vi.spyOn(SystemDate, 'now').mockReturnValue(946684800000)
    expect(clockIso()).toBe('2026-12-31T15:59:59.500Z')
    expect(dateKey()).toBe('2026-12-31')
    const task = { ...newTask(), title: '跨北京时间零点', status: 'doing' as const }
    const record: LocalRecord = { scope: 'guest', task, dirty: true, serverRevision: 0, mutationId: crypto.randomUUID() }
    tick += 600
    invoke.mockResolvedValue({ epochMs: null, source: '', ageMs: null })
    expect(await refreshClock()).toBe(false)
    expect(clockIso()).toBe('2026-12-31T16:00:00.100Z')
    expect(carryForward([record])[0].task).toMatchObject({ date: '2027-01-01', updatedAt: '2026-12-31T16:00:00.100Z' })
    tick += 86400000
    expect(carryForward([record])[0].task.date).toBe('2027-01-02')
  })
  it('keeps Auth SDK Date.now/no-argument Date calibrated without breaking explicit dates', () => {
    const epoch = SystemDate.parse('2026-10-21T16:00:00Z')
    setClockSource(() => epoch)
    installCalibratedDate()
    expect(Date.now()).toBe(epoch)
    expect(new Date().toISOString()).toBe('2026-10-21T16:00:00.000Z')
    expect(new Date('2020-02-29T00:00:00Z').toISOString()).toBe('2020-02-29T00:00:00.000Z')
    expect(new Date(0).getTime()).toBe(0)
    expect(Date.UTC(2020, 0, 1)).toBe(1577836800000)
    expect(new Date() instanceof Date).toBe(true)
    class SubDate extends Date {}
    expect(new SubDate().getTime()).toBe(epoch)
    expect(new SubDate() instanceof SubDate).toBe(true)
    expect(Date()).toBe(new SystemDate(epoch).toString())
    expect(clockNow()).toBe(epoch)
  })
  it('uses Beijing midnight, UTC calendar arithmetic and leap validation in any host zone', () => {
    expect(dateKey(new Date('2026-10-21T15:59:59Z'))).toBe('2026-10-21')
    expect(dateKey(new Date('2026-10-21T16:00:00Z'))).toBe('2026-10-22')
    expect(dateKey(new Date('2026-10-21T23:30:00-07:00'))).toBe('2026-10-22')
    expect(parseDate('2028-02-29').getUTCDate()).toBe(29)
    expect(shiftDate('2028-02-29', 1)).toBe('2028-03-01')
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31')
  })
})
