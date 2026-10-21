// Run against an isolated Windows Release profile with WebView2 CDP enabled.
import { chromium, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
if(process.env.DAYWEAVE_NATIVE_TEST !== '1') throw new Error('Use tests/windows/run.ps1 to create an isolated test profile.')
const browser = await chromium.connectOverCDP(process.env.DAYWEAVE_CDP || 'http://127.0.0.1:9240')
const page = browser.contexts()[0].pages()[0], errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
const invoke = (cmd,extra={}) => page.evaluate(({cmd,extra}) => window.__TAURI_INTERNALS__.invoke('plugin:window|'+cmd,{label:'main',...(extra.position || extra.size ? {value:extra.position || extra.size} : extra)}),{cmd,extra})
const pass = name => { checks.push(name); console.log('PASS '+name) }
const cursor = (x,y) => execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class DWCursor { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'; [DWCursor]::SetProcessDPIAware() | Out-Null; [DWCursor]::SetCursorPos(${Math.round(x)},${Math.round(y)}) | Out-Null`],{windowsHide:true})
let originalCursor
const reveal = async () => {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0,0) })
  await page.mouse.move(5,80); await page.mouse.move(12,4)
  await expect(page.locator('.app-shell')).toHaveClass(/toolbar-visible/)
}
try {
 // This runner is only for the dedicated test profile created by launch.ps1.
 await page.evaluate(()=>{localStorage.setItem('dayweave-compact','false');localStorage.setItem('dayweave-edge-dock','false');localStorage.removeItem('dayweave-compact-size')})
 await page.reload()
 await invoke('set_size',{size:{Logical:{width:1360,height:900}}}); await invoke('center')
 await expect(page.locator('.new-task')).toBeVisible()
 await page.evaluate(()=>localStorage.removeItem('dayweave-compact-size'))
 if(await invoke('is_always_on_top')) await page.getByRole('button',{name:'取消窗口置顶',exact:true}).click()
 expect(await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:app|version'))).toBe('0.6.0')
 originalCursor=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|cursor_position'))
 const monitor=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|current_monitor',{label:'main'}))
 expect(await invoke('is_decorated')).toBe(false)
 const area=monitor.workArea, scale=monitor.scaleFactor
 cursor(area.position.x+Math.round(area.size.width/2),area.position.y+Math.round(area.size.height/2))
 if (await page.getByRole('dialog').isVisible()) await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click()
 if(!(await page.getByTestId('task-row').count())) {
 await page.locator('.new-task').click(); await page.getByLabel('任务名称').fill('日序 · Windows 并行项目')
 await page.getByLabel('任务状态').selectOption('doing')
 for(const [i,title] of ['设计界面与裁剪背景','实现贴边浮窗与尺寸记忆'].entries()) {
  await page.getByRole('button',{name:'添加步骤'}).click(); await page.getByLabel('子步骤 '+(i+1),{exact:true}).fill(title)
  await page.getByLabel('子步骤 '+(i+1)+' 执行者').fill(['自己','codex'][i]); await page.getByLabel('子步骤 '+(i+1)+' 正在做').check()
 }
 await page.getByRole('button',{name:'保存任务',exact:true}).click()
 }
 await expect(page.getByLabel('当前步骤：日序 · Windows 并行项目',{exact:true})).toContainText('codex')
 await page.getByRole('button',{name:'切换精简视图',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerWidth-380))).toBeLessThanOrEqual(2)
 await invoke('set_position',{position:{Physical:{x:area.position.x+Math.round(100*scale),y:area.position.y+Math.round(80*scale)}}})
 pass('Undecorated Windows Release; parallel task and executor summary; first-run 380px compact view')
 for(const [width,height] of [[280,260],[330,420],[520,620]]) {
   await invoke('set_size',{size:{Logical:{width,height}}})
   await expect.poll(()=>page.evaluate(width=>Math.abs(innerWidth-width),width)).toBeLessThanOrEqual(2)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }
 await invoke('set_size',{size:{Logical:{width:330,height:420}}})
 await expect.poll(()=>page.evaluate(()=>Math.abs(JSON.parse(localStorage.getItem('dayweave-compact-size')||'{}').width-330))).toBeLessThanOrEqual(2)
 await reveal(); await page.getByRole('button',{name:'窗口置顶',exact:true}).click(); expect(await invoke('is_always_on_top')).toBe(true)
 await page.getByRole('button',{name:'恢复完整视图',exact:true}).click(); await page.getByRole('button',{name:'切换精简视图',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerWidth-330))).toBeLessThanOrEqual(2)
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerHeight-420))).toBeLessThanOrEqual(2)
 pass('280×260, 330×420, 520×620 elastic layout, pin and full/compact size restoration')
 await reveal(); await page.mouse.move(30,150)
 await page.evaluate(()=>document.activeElement?.blur())
 await expect.poll(()=>page.locator('.topbar').evaluate(el=>getComputedStyle(el).opacity),{timeout:5000}).toBe('0')
 await reveal(); await expect.poll(()=>page.locator('.topbar').evaluate(el=>getComputedStyle(el).opacity)).toBe('1')
 await page.getByRole('button',{name:'打开设置',exact:true}).click()
 await page.getByLabel('颜色模式').selectOption('dark'); await expect(page.locator('html')).toHaveAttribute('data-theme','dark')
 await expect.poll(()=>invoke('theme')).toBe('dark')
 await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click()
 await page.screenshot({path:'artifacts/windows-v060-native-compact-dark.png'})
 await reveal(); await page.getByRole('button',{name:'打开设置',exact:true}).click(); await page.getByLabel('颜色模式').selectOption('system');await page.getByRole('dialog').getByRole('button',{name:'关闭窗口',exact:true}).click()
 pass('Idle toolbar hides, top hover reveals; native dark theme and system preference')
 await reveal();await page.getByRole('button',{name:'贴边收起',exact:true}).click()
 await page.evaluate(()=>document.activeElement?.blur())
 const size=await invoke('outer_size'),x=area.position.x+area.size.width-size.width,y=area.position.y+Math.round(120*scale)
 cursor(area.position.x+50,area.position.y+50)
 await invoke('set_position',{position:{Physical:{x,y}}})
 await expect(page.getByRole('button',{name:'展开贴边浮窗',exact:true})).toBeVisible({timeout:10000})
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerWidth-64))).toBeLessThanOrEqual(2)
 await expect(page.locator('.edge-rail')).toContainText('日序 · Windows 并行项目')
 expect(await page.locator('.edge-rail strong').count()).toBe(1)
 await page.screenshot({path:'artifacts/windows-v060-native-edge.png'})
 const railPosition=await invoke('outer_position'),railSize=await invoke('outer_size')
 cursor(railPosition.x+railSize.width/2,railPosition.y+railSize.height/2)
 await expect(page.locator('.app-shell')).toBeVisible({timeout:10000})
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerWidth-330))).toBeLessThanOrEqual(2)
 await expect.poll(()=>page.evaluate(()=>Math.abs(innerHeight-420))).toBeLessThanOrEqual(2)
 await page.screenshot({path:'artifacts/windows-v060-native-compact.png'})
 pass('Actual screen-edge shrink to one-task 64px rail and OS-cursor hover restoration to 330×420')
 // Pull away before closing; the rail geometry must never overwrite the saved size.
 await invoke('set_position',{position:{Physical:{x:area.position.x+Math.round(120*scale),y}}})
 await expect.poll(()=>page.evaluate(()=>Math.abs(JSON.parse(localStorage.getItem('dayweave-compact-size')).width-330))).toBeLessThanOrEqual(2)
 expect(errors).toEqual([])
 cursor(area.position.x+50,area.position.y+50)
 await invoke('set_position',{position:{Physical:{x,y}}})
 await expect(page.getByRole('button',{name:'展开贴边浮窗',exact:true})).toBeVisible({timeout:10000})
 const closed=page.waitForEvent('close');await invoke('close');await closed
 pass('Close while docked saves expanded compact geometry, never the temporary rail size')
 fs.writeFileSync('artifacts/windows-v060-native-results.json',JSON.stringify({checks,errors,scale,monitor:area},null,2))
} catch(e) { await page.screenshot({path:'artifacts/windows-v060-native-failure.png'}).catch(()=>{});throw e }
finally { if(originalCursor) cursor(originalCursor.x,originalCursor.y); await browser.close().catch(()=>{}) }
