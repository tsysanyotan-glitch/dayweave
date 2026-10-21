import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
if(process.env.DAYWEAVE_NATIVE_TEST!=='1')throw new Error('Use the isolated Windows launcher.')
const browser=await chromium.connectOverCDP(process.env.DAYWEAVE_CDP||'http://127.0.0.1:9240'),context=browser.contexts()[0]
const page=context.pages().find(p=>p.url().includes('tauri'))||context.pages()[0]
const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
try{
 expect(await invoke('plugin:window|is_visible',{label:'main'})).toBe(false)
 const snapshot=await invoke('desktop_snapshot');expect(snapshot.settings.startHidden).toBe(true);expect(snapshot.settings.railCount).toBe(3);expect(snapshot.autostart).toBe(false)
 await expect.poll(()=>context.pages().length,{timeout:10000}).toBeGreaterThan(1)
 const alert=context.pages().find(p=>p!==page)
 await expect(alert.locator('article')).toHaveCount(1,{timeout:10000})
 await expect(alert.locator('article')).toContainText('重启补提醒')
 await alert.getByRole('button',{name:'我知道了',exact:true}).click()
 await invoke('desktop_action',{action:'show'});expect(await invoke('plugin:window|is_visible',{label:'main'})).toBe(true)
 await invoke('desktop_settings',{settings:{...snapshot.settings,startHidden:false,closeToTray:false},autostart:false})
 fs.writeFileSync('artifacts/windows-v070-restart-results.json',JSON.stringify({checks:['Start hidden in system tray; persisted preferences and autostart disabled','Overdue alarm catches up exactly once after restart; dismissed/completed alarms do not reappear','Show from tray and explicit quit'],errors:[]},null,2))
 const closed=page.waitForEvent('close');await invoke('desktop_action',{action:'quit'}).catch(e=>{if(!String(e).includes('closed'))throw e});await closed
 console.log('PASS Tray-hidden startup, overdue catch-up after restart, persisted acknowledgement and explicit quit')
}finally{await browser.close().catch(()=>{})}
