import { describe, expect, it } from 'vitest'
import { beijingTime } from '../src/beijingTime'

describe('Beijing rail clock', () => {
  it('uses Beijing time even when the input contains a US offset', () => {
    expect(beijingTime(new Date('2026-10-21T07:38:40-05:00'))).toMatchObject({
      time: '20:38', date: '10月21日', shortDate: '10/21', weekday: '周三',
      dateTime: '2026-10-21T20:38:00+08:00', label: '北京时间 2026年10月21日 周三 20:38',
    })
  })
  it('advances the date and year at Beijing midnight, using 00 rather than 24', () => {
    expect(beijingTime(new Date('2026-12-31T15:59:59.999Z'))).toMatchObject({ time: '23:59', date: '12月31日', weekday: '周四' })
    expect(beijingTime(new Date('2026-12-31T16:00:00Z'))).toMatchObject({ time: '00:00', date: '01月01日', weekday: '周五', dateTime: '2027-01-01T00:00:00+08:00' })
  })
  it('keeps UTC+8 across US daylight-saving transitions and leap days', () => {
    expect(beijingTime(new Date('2026-11-01T06:59:00Z')).time).toBe('14:59')
    expect(beijingTime(new Date('2026-11-01T07:00:00Z')).time).toBe('15:00')
    expect(beijingTime(new Date('2028-02-28T16:00:00Z'))).toMatchObject({ time: '00:00', date: '02月29日', weekday: '周二' })
  })
})
