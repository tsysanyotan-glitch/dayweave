import { describe, expect, it } from 'vitest'
import { carryForward, mergeRemote, newTask, type LocalRecord, type RemoteRow } from '../src/model'
const scope=crypto.randomUUID()
function record(date='2026-10-20'):LocalRecord {return {scope,task:{...newTask(date),title:'继续工作',status:'doing',steps:[{id:'step',title:'保留步骤',done:true}],outputs:[{id:crypto.randomUUID(),name:'本地文件夹',kind:'folder'}]},serverRevision:3,mutationId:crypto.randomUUID(),dirty:false}}
describe('unfinished work carries forward',()=>{
  it('moves the same record repeatedly, including month/year/leap boundaries and days offline',()=>{
    for(const [from,to] of [['2026-10-20','2026-10-21'],['2026-10-21','2026-10-29'],['2026-12-31','2027-01-01'],['2024-02-28','2024-02-29']]) {
      const source=record(from),[next]=carryForward([source],to,'2026-10-20T16:00:00Z')
      expect(next.task).toEqual({...source.task,date:to,updatedAt:'2026-10-20T16:00:00Z'})
      expect(next.task.id).toBe(source.task.id);expect(next.serverRevision).toBe(3);expect(next.dirty).toBe(true)
      expect(next.mutationId).not.toBe(source.mutationId)
      expect(carryForward([next],to)).toEqual([])
      expect(source.task.date).toBe(from)
    }
  })
  it('leaves todo, done, deleted, future and unresolved conflicts untouched',()=>{
    const source=record();const conflict:RemoteRow={id:source.task.id,user_id:scope,document:source.task,revision:4,last_mutation_id:crypto.randomUUID(),updated_at:new Date().toISOString()}
    const cases:LocalRecord[]=[{...source,task:{...source.task,status:'todo'}},{...source,task:{...source.task,status:'done'}},{...source,task:{...source.task,deletedAt:new Date().toISOString()}},record('2026-10-22'),{...source,conflict}]
    expect(carryForward(cases,'2026-10-21')).toEqual([])
  })
  it('coalesces equivalent multi-device rollovers but never discards actual edits',()=>{
    const source=record(),[local]=carryForward([source],'2026-10-22')
    const remote:RemoteRow={id:source.task.id,user_id:scope,document:{...source.task,date:'2026-10-22'},revision:4,last_mutation_id:crypto.randomUUID(),updated_at:new Date().toISOString()}
    expect(mergeRemote(local,remote).dirty).toBe(false)
    const behind={...remote,document:{...remote.document,date:'2026-10-21'}}
    expect(mergeRemote(local,behind)).toMatchObject({serverRevision:4,dirty:true,task:{date:'2026-10-22'}})
    expect(mergeRemote(local,{...remote,document:{...remote.document,note:'另一端写的内容'}}).conflict).toBeTruthy()
    expect(mergeRemote(local,{...remote,document:{...remote.document,status:'done'}}).conflict).toBeTruthy()
  })
})
