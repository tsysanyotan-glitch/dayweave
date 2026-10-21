import 'fake-indexeddb/auto'
import { expect, test } from 'vitest'
import { initializeLooks, lookStyle, saveTaskLook, taskLook } from '../src/appearance'
const luminance = (hex: string) => {
  const v = hex.slice(1).match(/../g)!.map(x => parseInt(x,16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055)/1.055)**2.4)
  return .2126*v[0]+.7152*v[1]+.0722*v[2]
}
test('custom grayscale backgrounds retain at least 4.5:1 text contrast', () => {
  for(let gray=0;gray<256;gray++) {
    const color = '#' + gray.toString(16).padStart(2,'0').repeat(3)
    const style = lookStyle({kind:'color',color}) as Record<string,string>
    const a=luminance(color),b=luminance(style['--card-ink'])
    expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5)
  }
})
test('local appearances stay scoped to the task account and reject invalid look references', async () => {
  await initializeLooks()
  await saveTaskLook('guest','task',{kind:'color',color:'#e5eddf'})
  expect(taskLook('guest','task')).toEqual({kind:'color',color:'#e5eddf'})
  expect(taskLook('another-account','task')).toEqual({kind:'default'})
  await expect(saveTaskLook('guest','task',{kind:'color',color:'url(private)'})).rejects.toThrow()
  await expect(saveTaskLook('guest','task',{kind:'image',backgroundId:'missing'})).rejects.toThrow()
  expect(taskLook('guest','task')).toEqual({kind:'color',color:'#e5eddf'})
})
