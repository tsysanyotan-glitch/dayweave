import { test, expect } from '@playwright/test'
async function create(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: '新建任务', exact: true }).first().click(); await page.getByLabel('任务名称').fill(title); await page.getByRole('button', { name: '保存任务' }).click()
}
test('pointer or touch dragging moves between groups and keyboard status moves remain available', async ({ page }, info) => {
  await page.goto('/'); await create(page, '拖拽任务')
  const grip = page.getByRole('button', { name: '拖动任务：拖拽任务', exact: true }); const box = (await grip.boundingBox())!
  const touch = info.project.name === 'mobile'; const cdp = touch ? await page.context().newCDPSession(page) : null
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
  else { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down() }
  const target = (await page.locator('.drag-status-targets [data-drop-status="doing"]').boundingBox())!
  if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x + target.width / 2, y: target.y + target.height / 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
  else { await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 }); await page.mouse.up() }
  await expect(page.locator('.group-doing').getByTestId('task-row')).toHaveCount(1)
  await grip.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  await expect(page.locator('.group-done').getByTestId('task-row')).toHaveCount(1)
  await page.reload(); await expect(page.locator('.group-done').getByTestId('task-row')).toHaveCount(1)
})
test('compact view persists and preserves task controls without horizontal overflow', async ({ page }) => {
  await page.goto('/'); await create(page, '精简任务'); await page.getByRole('button', { name: '切换精简视图' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/compact-mode/); await expect(page.locator('.task-title').filter({ hasText: '精简任务' })).toBeVisible()
  await page.reload(); await expect(page.locator('.app-shell')).toHaveClass(/compact-mode/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '完成：精简任务' }).click(); await expect(page.locator('.group-done').getByTestId('task-row')).toHaveCount(1)
  await page.getByRole('button', { name: '恢复完整视图' }).click(); await expect(page.locator('.app-shell')).not.toHaveClass(/compact-mode/)
})
test('completed task outputs persist locally, never upload automatically, and can be unlinked without deleting local bytes', async ({ page }) => {
  let uploads = 0; page.on('request', request => { if (request.url().includes('/storage/v1/object/') && request.method() === 'POST') uploads++ })
  await page.goto('/'); await create(page, '文档产出'); await page.getByRole('button', { name: '完成：文档产出' }).click()
  await page.getByRole('button', { name: '展开：文档产出' }).click()
  await page.getByLabel('选择本机产出文件').setInputFiles({ name: '本机结果.txt', mimeType: 'text/plain', buffer: Buffer.from('local-only') })
  await expect(page.getByTestId('output-row')).toContainText('仅在本机'); await expect(page.getByRole('button', { name: '上传到云端', exact: true })).toBeDisabled()
  await page.reload(); await page.getByRole('button', { name: '展开：文档产出' }).click(); await expect(page.getByTestId('output-row')).toContainText('本机结果.txt')
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '保存本机文件', exact: true }).click(); const download = await downloadPromise; expect(download.suggestedFilename()).toBe('本机结果.txt')
  expect(uploads).toBe(0)
  await page.getByRole('button', { name: '移除产出关联：本机结果.txt' }).click(); await page.getByRole('group', { name: '确认文件存储方式' }).getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByTestId('output-row')).toHaveCount(0)
  expect(await page.evaluate(async () => { const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('dayweave-outputs-v1'); r.onsuccess = () => resolve(r.result); r.onerror = reject }); return new Promise<number>(resolve => { const r = db.transaction('files').objectStore('files').count(); r.onsuccess = () => resolve(r.result) }) })).toBe(1)
})
