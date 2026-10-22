import { clockNow, clockDate } from './time'
import type { Task } from './model'
import { beijingTime } from './beijingTime'
export function beijingInput(date = clockDate()) { return beijingTime(date).dateTime.slice(0,16) }
export function fromBeijingInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('请选择完整的北京时间')
  const date = new Date(value + ':00+08:00')
  if (!Number.isFinite(+date) || beijingInput(date) !== value) throw new Error('日期或时间无效')
  return date.toISOString()
}
export function reminderKey(scope: string, task: Task) { return `${scope}:${task.id}:${Date.parse(task.reminderAt!)}` }
export function scheduleItems(scope: string, tasks: Task[]) {
  return tasks.filter(t => !t.deletedAt && t.status !== 'done' && !!t.reminderAt).map(t => ({ key: reminderKey(scope,t), taskId:t.id, title:t.title, at:Date.parse(t.reminderAt!), due:Date.parse(t.deadlineAt || t.reminderAt!), alarm:!!t.alarm }))
}
export function upcomingTasks(tasks: Task[], count: number, now = clockNow()) {
  return tasks.filter(t => !t.deletedAt && t.status !== 'done' && !!t.deadlineAt && Date.parse(t.deadlineAt) >= now)
    .sort((a,b)=>Date.parse(a.deadlineAt!)-Date.parse(b.deadlineAt!)).slice(0,Math.max(1,Math.min(5,count)))
}
export function deadlineLabel(value: string) { const b=beijingTime(new Date(value));return `${b.shortDate} ${b.time}` }
