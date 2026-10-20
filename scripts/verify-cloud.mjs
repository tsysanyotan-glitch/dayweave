// Opt-in integration check. Credentials must belong to disposable development test users.
// No passwords or session tokens are logged; this script does not create real email messages.
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
const accounts = JSON.parse(await readFile(process.env.DAYWEAVE_TEST_ACCOUNTS || 'artifacts/cloud-auth.json', 'utf8'))
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).trim().split(/\r?\n/).map(line => line.split(/=(.*)/s).slice(0, 2)))
const clients = accounts.map(() => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }))
const sessions = []
let browser
let debugPage
try {
  for (let i = 0; i < accounts.length; i++) {
    const { data, error } = await clients[i].auth.signInWithPassword(accounts[i]); if (error) throw error
    sessions.push(data.session)
  }
  const anonymous = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const blocked = await anonymous.from('tasks').select('*'); if (!blocked.error && blocked.data.length) throw new Error('Anonymous data exposed')
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const contexts = await Promise.all([browser.newContext({ serviceWorkers: 'block' }), browser.newContext({ serviceWorkers: 'block' }), browser.newContext({ serviceWorkers: 'block' })])
  const pages = await Promise.all(contexts.map(c => c.newPage()))
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]; const account = accounts[i === 2 ? 1 : 0]
    debugPage = page
    page.on('response', response => { if (response.status() >= 400) console.log('HTTP', response.status(), new URL(response.url()).pathname) })
    page.on('pageerror', error => console.log('Page error', error.message))
    page.on('requestfailed', request => console.log('Request failed', new URL(request.url()).pathname, request.failure()?.errorText))
    await contexts[i].addInitScript(({ session, key }) => localStorage.setItem(key, JSON.stringify(session)), { session: sessions[i === 2 ? 1 : 0], key: 'sb-' + new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0] + '-auth-token' })
    await page.goto('http://127.0.0.1:1420')
    await page.getByRole('button', { name: '打开设置', exact: true }).click()
    await expect(page.getByRole('dialog').getByText(account.email, { exact: true })).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: '关闭窗口' }).click()
  }
  debugPage = pages[1]
  await pages[0].getByRole('button', { name: '新建任务', exact: true }).first().click()
  await pages[0].getByLabel('任务名称').fill('真实云同步测试')
  await pages[0].getByRole('button', { name: '保存任务' }).click()
  await expect(pages[1].getByTestId('task-row')).toHaveCount(1, { timeout: 20000 })
  console.log('PASS: two-device initial sync')
  await expect(pages[2].getByTestId('task-row')).toHaveCount(0)
  await contexts[1].setOffline(true)
  await pages[1].getByRole('button', { name: '展开：真实云同步测试' }).click()
  await pages[1].getByRole('button', { name: '编辑', exact: true }).click()
  await pages[1].getByLabel('备注', { exact: true }).fill('离线设备的内容')
  await pages[1].getByRole('button', { name: '保存任务' }).click()
  await pages[0].getByRole('button', { name: '完成：真实云同步测试' }).click()
  await expect.poll(async () => { const { data, error } = await clients[0].from('tasks').select('*'); if (error) throw error; return data[0]?.document.status }).toBe('done')
  await contexts[1].setOffline(false)
  await pages[1].getByRole('button', { name: '打开设置', exact: true }).click()
  await pages[1].getByRole('button', { name: '立即同步', exact: true }).click()
  await pages[1].getByRole('button', { name: '关闭窗口' }).click()
  await expect(pages[1].getByText('另一台设备也修改了这个任务')).toBeVisible({ timeout: 40000 })
  await pages[1].getByRole('button', { name: '保留两个版本', exact: true }).click()
  await expect.poll(async () => { const { data } = await clients[0].from('tasks').select('*'); return data.length }).toBe(2)
  const isolated = await clients[1].from('tasks').select('*'); if (isolated.error || isolated.data.length) throw new Error('Cross-user data visible')
  console.log('PASS: real Auth login, two-device Realtime, offline edits, conflict preservation, third-device account isolation, anonymous access check')
} catch (error) {
  console.error(error.message); process.exitCode = 1
  if (debugPage) console.log('Sync diagnostics', await debugPage.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('dayweave-v1'); request.onsuccess = () => resolve(request.result); request.onerror = reject })
    const records = await new Promise((resolve, reject) => { const request = db.transaction('records').objectStore('records').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = reject })
    return { online: navigator.onLine, records: records.map(r => ({ title: r.task.title, note: r.task.note, revision: r.serverRevision, dirty: r.dirty, conflict: !!r.conflict })), status: document.querySelector('.sync-button')?.textContent, error: document.querySelector('.error-banner')?.textContent, notice: document.querySelector('.notice')?.textContent }
  }))
} finally {
  if (browser) await browser.close()
  await Promise.all(clients.map(c => c.auth.signOut()))
}
