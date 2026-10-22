import {chromium,expect} from '@playwright/test'
import fs from 'node:fs'
if(process.env.DAYWEAVE_NATIVE_TEST!=='1'||process.env.DAYWEAVE_CLOCK_OFFLINE!=='1')throw new Error('Use the isolated offline test launcher.')
const browser=await chromium.connectOverCDP(process.env.DAYWEAVE_CDP||'http://127.0.0.1:9240')
const page=browser.contexts()[0].pages()[0]
const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args})
try{
 await expect(page.getByRole('status')).toContainText('正在获取北京时间')
 expect((await invoke('time_snapshot')).epochMs).toBe(null)
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([])
 await invoke('time_test_set',{epochMs:Date.parse('2026-10-22T04:00:00Z')})
 await expect(page.locator('.app-shell')).toBeVisible({timeout:10000})
 await expect(page.locator('.today-label')).toContainText('10月22日')
 fs.writeFileSync('artifacts/windows-v071-no-time-results.json',JSON.stringify({checks:['No cached calibration + offline: shows time-acquisition state, never loads/mutates task database','Acquiring a valid clock opens the app automatically with Beijing date']},null,2))
 const closed=page.waitForEvent('close');await invoke('desktop_action',{action:'quit'}).catch(e=>{if(!String(e).includes('closed'))throw e});await closed
 console.log('PASS No network/cached clock: task database stays untouched until calibrated time becomes available')
}finally{await browser.close().catch(()=>{})}
