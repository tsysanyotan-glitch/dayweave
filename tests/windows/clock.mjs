// Uses the same isolated profile/owned Windows process as run.ps1.
import { chromium, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
if (process.env.DAYWEAVE_NATIVE_TEST !== '1') throw new Error('Use the isolated Windows test launcher.')
const browser = await chromium.connectOverCDP(process.env.DAYWEAVE_CDP || 'http://127.0.0.1:9240')
const context = browser.contexts()[0], page = context.pages()[0], errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
const invoke = (cmd, value) => page.evaluate(({cmd,value}) => window.__TAURI_INTERNALS__.invoke('plugin:window|' + cmd, {label:'main', ...(value ? {value} : {})}), {cmd,value})
const cursor = (x,y) => execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class DWClockCursor { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'; [DWClockCursor]::SetProcessDPIAware() | Out-Null; [DWClockCursor]::SetCursorPos(${Math.round(x)},${Math.round(y)}) | Out-Null`],{windowsHide:true})
let originalCursor
try {
  originalCursor = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|cursor_position'))
  await page.evaluate(() => { localStorage.setItem('dayweave-compact','true');localStorage.setItem('dayweave-edge-dock','true');localStorage.setItem('dayweave-theme','dark') })
  await page.reload()
  const monitor = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|current_monitor',{label:'main'}))
  const area = monitor.workArea, scale = monitor.scaleFactor
  const center = {x:area.position.x+Math.round(area.size.width/2),y:area.position.y+Math.round(area.size.height/2)}
  cursor(center.x,center.y)
  const show = async () => {
    if (await page.locator('.edge-rail').isVisible()) {
      const position = await invoke('outer_position'), size = await invoke('outer_size')
      cursor(position.x+size.width/2,position.y+size.height/2)
      await expect(page.locator('.app-shell')).toBeVisible({timeout:10000})
    }
    await invoke('set_position',{Physical:{x:area.position.x+Math.round(150*scale),y:area.position.y+Math.round(150*scale)}})
    cursor(center.x,center.y)
  }
  for (const edge of ['right','left','top','bottom']) {
    await show()
    const size = await invoke('outer_size')
    const x = edge==='left' ? area.position.x : edge==='right' ? area.position.x+area.size.width-size.width : area.position.x+Math.round(170*scale)
    const y = edge==='top' ? area.position.y : edge==='bottom' ? area.position.y+area.size.height-size.height : area.position.y+Math.round(160*scale)
    await invoke('set_position',{Physical:{x,y}})
    const rail = page.locator('.edge-'+edge), clock = rail.locator('.rail-clock')
    await expect(clock).toBeVisible({timeout:10000})
    const vertical = edge==='left'||edge==='right'
    await expect.poll(()=>page.evaluate(()=>innerWidth)).toBeGreaterThan(vertical?73:277)
    expect(await clock.getAttribute('datetime')).toMatch(/\+08:00$/)
    expect(await clock.getAttribute('aria-label')).toMatch(/^北京时间 \d{4}年\d{2}月\d{2}日 周. \d{2}:\d{2}$/)
    expect(await page.evaluate(() => {
      const rail = document.querySelector('.edge-rail').getBoundingClientRect()
      return document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.rail-clock span')].filter(el=>getComputedStyle(el).display!=='none').every(el=>{const b=el.getBoundingClientRect();return b.left>=rail.left && b.right<=rail.right && b.top>=rail.top && b.bottom<=rail.bottom && el.scrollWidth<=el.clientWidth+1})
    })).toBe(true)
    if(edge==='left'||edge==='top') await page.screenshot({path:`artifacts/windows-v061-${edge}-dark.png`})
    checks.push(edge+' rail: Beijing clock, date and weekday fit without overflow')
  }
  // Exercise the actual mounted React clock at a Beijing year boundary. The host
  // timezone is irrelevant; no OS clock/timezone or user's data is changed.
  await page.clock.install({time:new Date('2026-12-31T15:59:59.500Z')})
  await page.clock.pauseAt(new Date('2026-12-31T15:59:59.500Z'))
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
  const clock=page.locator('.rail-clock')
  await expect(clock.locator('.rail-clock-time')).toHaveText('23:59')
  await page.clock.runFor(600)
  await expect(clock.locator('.rail-clock-time')).toHaveText('00:00')
  await expect(clock.locator('.rail-clock-date')).toHaveText('01月01日')
  await expect(clock.locator('.rail-clock-weekday')).toHaveText('周五')
  await page.clock.setSystemTime(new Date('2027-01-02T04:35:00Z'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await expect(clock.locator('.rail-clock-time')).toHaveText('12:35')
  await expect(clock).toHaveAttribute('datetime','2027-01-02T12:35:00+08:00')
  checks.push('Live timer advances Beijing midnight/year; focus after simulated sleep resynchronizes immediately')
  await page.clock.resume()
  await show()
  await page.evaluate(()=>localStorage.setItem('dayweave-theme','light'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme','light')
  const size=await invoke('outer_size')
  cursor(center.x,center.y)
  await invoke('set_position',{Physical:{x:area.position.x+area.size.width-size.width,y:area.position.y+Math.round(160*scale)}})
  await expect(page.locator('.rail-clock')).toBeVisible({timeout:10000})
  await page.screenshot({path:'artifacts/windows-v061-right-light.png'})
  checks.push('Light theme clock remains readable')
  expect(errors).toEqual([])
  fs.writeFileSync('artifacts/windows-v061-clock-results.json',JSON.stringify({checks,errors,scale},null,2))
  const closed=page.waitForEvent('close');await invoke('close');await closed
  console.log('PASS Windows clock: all four screen edges, light/dark, live Beijing midnight/date/year, resume refresh')
} catch(e) {await page.screenshot({path:'artifacts/windows-v061-clock-failure.png'}).catch(()=>{});throw e}
finally {if(originalCursor)cursor(originalCursor.x,originalCursor.y);await browser.close().catch(()=>{})}
