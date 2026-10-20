import { test, expect, type Page } from '@playwright/test'
async function create(page:Page,title:string,date:string,status:string){
  await page.locator('.new-task').click();const form=page.getByRole('dialog')
  await form.getByLabel('任务名称').fill(title);await form.getByLabel('安排日期').fill(date)
  await form.getByLabel('任务状态').selectOption(status)
  await form.getByRole('button',{name:'保存任务',exact:true}).click();await expect(form).not.toBeVisible()
}
async function records(page:Page){return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('dayweave-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
  try{return await new Promise<{task:{id:string;date:string;status:string;title:string}}[]>((resolve,reject)=>{const request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{db.close()}
})}
test('in-progress work carries over midnight repeatedly and catches up offline after restart',async({page,context})=>{
  await page.clock.install({time:new Date(2026,9,20,23,59,45)})
  await page.goto('/');await page.waitForFunction(()=>!!navigator.serviceWorker.controller)
  await create(page,'顺延任务','2026-10-20','doing')
  await create(page,'仍然待办','2026-10-20','todo')
  await create(page,'已经完成','2026-10-20','done')
  await create(page,'未来进行','2026-10-25','doing')
  const original=(await records(page)).find(r=>r.task.title==='顺延任务')!.task.id
  await context.setOffline(true)
  await page.clock.fastForward(16000)
  await expect(page.locator('.group-doing').getByTestId('task-row')).toHaveCount(1)
  await expect.poll(async()=> (await records(page)).find(r=>r.task.id===original)?.task.date).toBe('2026-10-21')
  await page.clock.fastForward(86400000)
  await expect.poll(async()=> (await records(page)).find(r=>r.task.id===original)?.task.date).toBe('2026-10-22')
  await page.clock.setSystemTime(new Date(2026,9,24,12));await page.reload()
  await expect(page.locator('.group-doing').getByTestId('task-row')).toContainText('顺延任务')
  const saved=await records(page)
  expect(saved).toHaveLength(4)
  expect(saved.find(r=>r.task.id===original)?.task).toMatchObject({date:'2026-10-24',status:'doing'})
  expect(saved.find(r=>r.task.title==='仍然待办')?.task.date).toBe('2026-10-20')
  expect(saved.find(r=>r.task.title==='已经完成')?.task.date).toBe('2026-10-20')
  expect(saved.find(r=>r.task.title==='未来进行')?.task.date).toBe('2026-10-25')
  await page.getByRole('button',{name:'完成：顺延任务'}).click()
  await expect(page.locator('.group-done').getByTestId('task-row')).toHaveCount(1)
  await page.clock.fastForward(86400000)
  await expect.poll(async()=> (await records(page)).find(r=>r.task.id===original)?.task.date).toBe('2026-10-24')
  expect((await records(page)).find(r=>r.task.id===original)?.task.status).toBe('done')
})
test('midnight preserves an explicitly selected historical date',async({page})=>{
  await page.clock.install({time:new Date(2026,9,20,23,59,45)})
  await page.goto('/');await create(page,'历史待办','2026-10-19','todo')
  await page.getByRole('button',{name:'选择日期 2026-10-19',exact:true}).click()
  await expect(page.getByTestId('task-row')).toContainText('历史待办')
  await page.clock.fastForward(16000)
  await expect(page.getByRole('button',{name:'选择日期 2026-10-19',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByTestId('task-row')).toContainText('历史待办')
})
