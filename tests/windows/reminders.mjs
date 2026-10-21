import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
if(process.env.DAYWEAVE_NATIVE_TEST!=='1')throw new Error('Use the isolated Windows launcher.')
const browser=await chromium.connectOverCDP(process.env.DAYWEAVE_CDP||'http://127.0.0.1:9240'),context=browser.contexts()[0],page=context.pages()[0],errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
const dbWrite=async(tasks)=>page.evaluate(async tasks=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dayweave-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
 await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');for(const task of tasks)tx.objectStore('records').put({scope:'guest',task,serverRevision:0,dirty:true,mutationId:crypto.randomUUID()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()
},tasks)
function task(title,after,alarm=true){const id=crypto.randomUUID(),now=new Date().toISOString(),at=new Date(Date.now()+after).toISOString();return{id,title,note:'',date:new Intl.DateTimeFormat('en-CA').format(new Date()),kind:'planned',status:'todo',priority:'medium',assignee:'自己',project:'',link:'',waiting:false,starred:false,steps:[],outputs:[],alarm,deadlineAt:at,reminderAt:at,createdAt:now,updatedAt:now,deletedAt:null}}
const cursor=(x,y)=>execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class DWReminderCursor { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'; [DWReminderCursor]::SetProcessDPIAware() | Out-Null; [DWReminderCursor]::SetCursorPos(${Math.round(x)},${Math.round(y)}) | Out-Null`],{windowsHide:true})
let config,originalCursor
try{
 originalCursor=await invoke('plugin:window|cursor_position')
 await page.evaluate(()=>{localStorage.setItem('dayweave-edge-dock','false');localStorage.setItem('dayweave-compact','false')});await page.reload()
 await invoke('plugin:window|set_size',{label:'main',value:{Logical:{width:1150,height:850}}});await invoke('plugin:window|center',{label:'main'})
 config=(await invoke('desktop_snapshot')).settings
 await invoke('desktop_settings',{settings:{...config,closeToTray:true,startHidden:false,railCount:3,sound:false},autostart:true})
 expect((await invoke('desktop_snapshot')).autostart).toBe(true)
 await invoke('desktop_settings',{settings:{...config,closeToTray:true,startHidden:false,railCount:3,sound:false},autostart:false})
 expect((await invoke('desktop_snapshot')).autostart).toBe(false)
 checks.push('Real Windows autostart enable/query/disable using the isolated DayWeave Native Test registry name')
 await page.getByRole('button',{name:'快捷闹钟',exact:true}).filter({visible:true}).click()
 await page.getByRole('dialog').getByLabel('提醒内容').fill('稍后提交报告')
 await page.screenshot({path:'artifacts/windows-v070-quick.png'})
 await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click()
 const a=task('Windows 后台闹钟 A',6500),b=task('Windows 后台闹钟 B',6500),future=[task('最近截止一',3600000,false),task('最近截止二',7200000,false),task('最近截止三',10800000,false),task('最近截止四',14400000,false),task('最近截止五',18000000,false)]
 await dbWrite([a,b,...future]);await page.reload();await expect(page.getByTestId('task-row').filter({hasText:b.title})).toBeVisible()
 await invoke('desktop_action',{action:'close'})
 expect(await invoke('plugin:window|is_visible',{label:'main'})).toBe(false)
 const session=await context.newCDPSession(page);await session.send('Page.setWebLifecycleState',{state:'frozen'})
 const alert=await expect.poll(()=>context.pages().find(p=>p!==page),{timeout:12000}).not.toBeUndefined().then(()=>context.pages().find(p=>p!==page))
 alert.on('pageerror',e=>errors.push(e.message))
 await expect(alert.locator('.reminder-alert article')).toHaveCount(2,{timeout:12000})
 expect(await alert.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|is_always_on_top',{label:'reminder'}))).toBe(true)
 await alert.screenshot({path:'artifacts/windows-v070-alert.png'})
 await alert.locator('article').filter({hasText:a.title}).getByRole('button',{name:'5 分钟后',exact:true}).click()
 await expect(alert.locator('article')).toHaveCount(1)
 await alert.locator('article').filter({hasText:b.title}).getByRole('button',{name:'完成任务',exact:true}).click()
 // WebView2 can dispatch native IPC even while page lifecycle is frozen. Wait
 // for the committed native acknowledgement, then verify the final task below.
 await expect.poll(async()=>(await alert.evaluate(()=>window.__TAURI_INTERNALS__.invoke('desktop_snapshot'))).active.some(p=>p.taskId===b.id)).toBe(false)
 const disk=JSON.parse(fs.readFileSync(process.env.WEBVIEW2_USER_DATA_FOLDER+'/desktop-reminders.json','utf8'))
 expect(Object.values(disk.responses).some(r=>r.snoozeUntil>Date.now()+290000)).toBe(true)
 await session.send('Page.setWebLifecycleState',{state:'active'})
 await invoke('desktop_action',{action:'show'})
 await expect(page.getByTestId('task-row').filter({hasText:b.title})).toHaveClass(/is-done/)
 await expect.poll(async()=>(await invoke('desktop_snapshot')).pending.length).toBe(0)
 checks.push('Native scheduler fires two alerts while main WebView is frozen and hidden; alert is always on top')
 checks.push('5-minute snooze persists; native completion is applied to the task and its queue is cleared')
 // Dismiss A by completing its task; reschedule a fresh overdue alarm and dismiss it.
 await page.getByRole('button',{name:'完成：'+a.title,exact:true}).click()
 const c=task('Windows 知晓提醒',-1000);await dbWrite([c]);await page.reload()
 await expect(alert.locator('article').filter({hasText:c.title})).toBeVisible({timeout:10000})
 await alert.locator('article').getByRole('button',{name:'我知道了',exact:true}).click()
 await expect.poll(async()=>(await invoke('desktop_snapshot')).active.length).toBe(0)
 await page.reload();await expect.poll(async()=>(await invoke('desktop_snapshot')).active.length).toBe(0)
 checks.push('Acknowledged reminders stay acknowledged across reload; completed reminders cancel')
 await page.getByRole('button',{name:'打开设置',exact:true}).click()
 await expect(page.getByLabel('浮条最近提醒数量')).toHaveValue('3')
 await expect(page.getByLabel('开机启动',{exact:true})).not.toBeChecked()
 await page.getByLabel('浮条最近提醒数量').scrollIntoViewIfNeeded()
 await page.screenshot({path:'artifacts/windows-v070-settings.png'})
 await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click()
 await page.evaluate(()=>localStorage.setItem('dayweave-theme','dark'));await page.reload()
 // Check the expanded rail geometry with three upcoming tasks; move the real
 // cursor away, otherwise the native hover affordance intentionally opens it.
 await page.getByRole('button',{name:'切换精简视图',exact:true}).click()
 await expect(page.getByRole('button',{name:'恢复完整视图',exact:true})).toBeEnabled()
 await expect.poll(()=>page.evaluate(()=>innerWidth)).toBeLessThanOrEqual(520)
 await invoke('plugin:window|set_position',{label:'main',value:{Physical:{x:300,y:200}}})
 const monitor=await invoke('plugin:window|current_monitor',{label:'main'}),size=await invoke('plugin:window|outer_size',{label:'main'})
 cursor(monitor.workArea.position.x+monitor.workArea.size.width/2,monitor.workArea.position.y+monitor.workArea.size.height/2)
 await page.mouse.move(10,4);await page.getByRole('button',{name:'贴边收起',exact:true}).click();await page.evaluate(()=>document.activeElement?.blur())
 await invoke('plugin:window|set_position',{label:'main',value:{Physical:{x:monitor.workArea.position.x+monitor.workArea.size.width-size.width,y:monitor.workArea.position.y+180}}})
 await expect(page.getByLabel('最近截止提醒',{exact:true})).toBeVisible({timeout:10000})
 await expect(page.locator('.rail-upcoming-item')).toHaveCount(3)
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerWidth-76))).toBeLessThan(2)
 expect(await page.locator('.rail-clock').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight)).toBe(true)
 await page.screenshot({path:'artifacts/windows-v070-rail.png'})
 checks.push('Three upcoming task deadlines fit between the current task and Beijing clock in the native rail')
 const area=monitor.workArea,center={x:area.position.x+area.size.width/2,y:area.position.y+area.size.height/2}
 const expand=async()=>{const p=await invoke('plugin:window|outer_position',{label:'main'}),s=await invoke('plugin:window|outer_size',{label:'main'});cursor(p.x+s.width/2,p.y+s.height/2);await expect(page.locator('.app-shell')).toBeVisible({timeout:10000});await invoke('plugin:window|set_position',{label:'main',value:{Physical:{x:area.position.x+200,y:area.position.y+200}}});cursor(center.x,center.y)}
 await expand()
 await invoke('desktop_settings',{settings:{...(await invoke('desktop_snapshot')).settings,railCount:5}})
 for(const edge of ['left','right','top','bottom']){
  if(await page.locator('.edge-rail').isVisible())await expand()
  const s=await invoke('plugin:window|outer_size',{label:'main'})
  const x=edge==='left'?area.position.x:edge==='right'?area.position.x+area.size.width-s.width:area.position.x+200
  const y=edge==='top'?area.position.y:edge==='bottom'?area.position.y+area.size.height-s.height:area.position.y+180
  cursor(center.x,center.y);await invoke('plugin:window|set_position',{label:'main',value:{Physical:{x,y}}})
  await expect(page.locator('.edge-'+edge+' .rail-upcoming-item')).toHaveCount(5,{timeout:10000})
  await expect.poll(()=>page.evaluate(expected=>Math.abs(innerWidth-expected),edge==='left'||edge==='right'?76:680)).toBeLessThan(2)
  await expect.poll(async()=>{const p=await invoke('plugin:window|outer_position',{label:'main'}),s=await invoke('plugin:window|outer_size',{label:'main'});return Math.abs(edge==='left'?p.x-area.position.x:edge==='right'?p.x+s.width-area.position.x-area.size.width:edge==='top'?p.y-area.position.y:p.y+s.height-area.position.y-area.size.height)}).toBeLessThan(2)
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('.rail-upcoming-item,.rail-clock')].every(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight}))).toBe(true)
  if(edge==='top')await page.screenshot({path:'artifacts/windows-v070-rail-five.png'})
 }
 checks.push('All four native edges display five reminders and the Beijing clock without clipping')
 await invoke('desktop_settings',{settings:{...(await invoke('desktop_snapshot')).settings,railCount:3}})
 // This record is intentionally written just before quitting; startup must catch
 // it from IndexedDB rather than relying on a previous JS or native timer.
 const catchup=task('重启补提醒',1000);await dbWrite([catchup])
 const current=(await invoke('desktop_snapshot')).settings
 await invoke('desktop_settings',{settings:{...current,startHidden:true},autostart:false})
 expect(errors).toEqual([])
 fs.writeFileSync('artifacts/windows-v070-reminders-results.json',JSON.stringify({checks,errors,catchup:catchup.id},null,2))
 const closed=page.waitForEvent('close');await invoke('desktop_action',{action:'quit'}).catch(e=>{if(!String(e).includes('closed'))throw e});await closed
 console.log('PASS Native reminders, frozen background, snooze, completion, dismiss persistence, tray, autostart and 3-item rail')
}catch(e){await page.screenshot({path:'artifacts/windows-v070-failure.png'}).catch(()=>{});throw e}
finally{if(originalCursor)cursor(originalCursor.x,originalCursor.y);await invoke('desktop_settings',{settings:{...(config||{closeToTray:false,startHidden:false,railCount:1,sound:false})},autostart:false}).catch(()=>{});await browser.close().catch(()=>{})}
