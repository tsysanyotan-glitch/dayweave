import { describe, expect, it } from 'vitest'
import { newTask, validateTask, fromRemote, uuid } from '../src/model'
import { beijingInput, fromBeijingInput, scheduleItems, upcomingTasks } from '../src/reminderModel'
describe('Windows alarms and deadlines',()=>{
  const at='2026-10-21T08:00:00.000Z'
  const alarm=()=>({...newTask('2026-10-21'),title:'提交报告',alarm:true,deadlineAt:at,reminderAt:at})
  it('interprets form wall time strictly as Beijing time, including midnight and invalid dates',()=>{
    expect(fromBeijingInput('2026-10-22T00:00')).toBe('2026-10-21T16:00:00.000Z')
    expect(beijingInput(new Date('2026-10-21T02:00:00-05:00'))).toBe('2026-10-21T15:00')
    expect(()=>fromBeijingInput('2026-02-30T12:00')).toThrow()
    expect(()=>fromBeijingInput('2026-10-21T24:01')).toThrow()
  })
  it('roundtrips optional metadata while keeping the serialized kind compatible with older clients',()=>{
    const t=validateTask(alarm());expect(t).toMatchObject({alarm:true,kind:'planned',reminderAt:at,deadlineAt:at})
    expect(validateTask({...newTask(),title:'普通任务'})).not.toHaveProperty('alarm')
    expect(()=>validateTask({...alarm(),reminderAt:'2026-10-21T09:00:00Z'})).toThrow()
    expect(()=>validateTask({...alarm(),deadlineAt:'2026-02-30T08:00:00Z'})).toThrow()
    expect(()=>validateTask({...alarm(),reminderAt:null})).toThrow()
    expect(()=>validateTask({...alarm(),alarm:'yes'})).toThrow()
  })
  it('cancels completed/deleted entries, preserves overdue entries for resume, and changes keys when rescheduled',()=>{
    const t=alarm(),items=scheduleItems('guest',[t,{...alarm(),status:'done'},{...alarm(),deletedAt:at}]);expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({taskId:t.id,at:Date.parse(at),alarm:true})
    expect(scheduleItems('guest',[{...t,deadlineAt:'2026-10-22T08:00:00Z',reminderAt:'2026-10-22T08:00:00Z'}])[0].key).not.toBe(items[0].key)
    expect(scheduleItems(uuid(),[t])[0].key).not.toBe(items[0].key)
  })
  it('selects future deadlines across all task dates in chronological order and obeys the display limit',()=>{
    const t=alarm(),later={...alarm(),deadlineAt:'2026-10-22T08:00:00Z'}
    expect(upcomingTasks([later,t,{...alarm(),status:'done'}],1,Date.parse(at)-1).map(x=>x.id)).toEqual([t.id])
    expect(upcomingTasks([later,t],5,Date.parse(at)+1).map(x=>x.id)).toEqual([later.id])
  })
  it('retains known alarm metadata after legacy edits; explicit null or false clears it',()=>{
    const t=alarm(),scope=uuid(),{alarm:_alarm,deadlineAt:_deadline,reminderAt:_reminder,...old}=t
    const row={id:t.id,user_id:scope,document:old,revision:2,updated_at:at,last_mutation_id:uuid()}
    expect(fromRemote(scope,row,t).task).toMatchObject({alarm:true,deadlineAt:at,reminderAt:at})
    expect(fromRemote(scope,{...row,document:{...old,alarm:false,deadlineAt:null,reminderAt:null}},t).task).toMatchObject({alarm:false,deadlineAt:null,reminderAt:null})
  })
})
