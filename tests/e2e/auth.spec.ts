import { test, expect, type Page } from '@playwright/test'

async function mockCloud(page: Page) {
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }))
  await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 204 }))
  await page.goto('/')
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await expect(page.getByRole('button', { name: '获取验证码', exact: true })).toBeVisible()
}

test('email OTP preserves leading zeros, rejects an expired code, binds verification to the sent address, and persists the session', async ({ page }) => {
  const sends: unknown[] = []; const attempts: Record<string, string>[] = []
  const id = '710ae64f-3510-4faa-81ca-af58b8289731'
  const email = 'otp@example.com'
  const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, email, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })).toString('base64url') + '.test'
  const user = { id, email, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {} }
  await page.route('**/auth/v1/otp', async route => { sends.push(route.request().postDataJSON()); await route.fulfill({ json: {} }) })
  await page.route('**/auth/v1/verify', async route => {
    const body = route.request().postDataJSON(); attempts.push(body)
    if (body.token !== '014728') await route.fulfill({ status: 403, headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, json: { code: 'otp_expired', msg: 'Token has expired or is invalid' } })
    else await route.fulfill({ json: { access_token: jwt, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } })
  })
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }))
  await mockCloud(page)
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await page.getByLabel('邮箱', { exact: true }).fill('OTP@EXAMPLE.COM')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.getByLabel('6 位验证码')).toBeVisible()
  expect(sends).toEqual([expect.objectContaining({ email, create_user: true })])
  await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled()
  await page.getByLabel('6 位验证码').fill('000001')
  await page.getByRole('button', { name: '登录并同步', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不正确或已过期')
  await expect(page.locator('.account-box')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: '关闭窗口' }).click()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await expect(page.getByLabel('6 位验证码')).toBeVisible()
  await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled()
  await page.getByLabel('6 位验证码').fill('01472')
  await expect(page.getByRole('button', { name: '登录并同步', exact: true })).toBeDisabled()
  await page.getByLabel('6 位验证码').fill('014728')
  await page.getByRole('button', { name: '登录并同步', exact: true }).click()
  await expect(page.locator('.account-box')).toContainText(email)
  expect(attempts).toEqual([expect.objectContaining({ email, token: '000001', type: 'email' }), expect.objectContaining({ email, token: '014728', type: 'email' })])
  await page.reload()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await expect(page.locator('.account-box')).toContainText(email)
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '获取验证码', exact: true })).toBeVisible()
  expect(sends).toHaveLength(1)
})

test('delivery failures stay on email entry and retry cooldown expires before resending', async ({ page }) => {
  let calls = 0
  await page.clock.install()
  await page.route('**/auth/v1/otp', async route => {
    calls++
    await route.fulfill(calls === 1 ? { status: 429, json: { code: 'over_email_send_rate_limit', msg: 'rate limited' } } : { json: {} })
  })
  await mockCloud(page)
  await page.getByLabel('邮箱', { exact: true }).fill('other@example.com')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('发送过于频繁')
  await expect(page.getByLabel('6 位验证码')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /秒后可发送/ })).toBeDisabled()
  await page.clock.fastForward(61000)
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.getByLabel('6 位验证码')).toBeVisible()
  await page.getByLabel('6 位验证码').fill('000123')
  await page.clock.fastForward(61000)
  await page.getByRole('button', { name: '重新发送验证码', exact: true }).click()
  await expect(page.getByLabel('6 位验证码')).toHaveValue('')
  await expect(page.getByRole('button', { name: /秒后重发/ })).toBeDisabled()
  await page.getByRole('button', { name: '修改邮箱', exact: true }).click()
  await page.getByLabel('邮箱', { exact: true }).fill('changed@example.com')
  await page.getByRole('button', { name: '获取验证码', exact: true }).click()
  await expect(page.locator('.otp-delivery')).toContainText('changed@example.com')
  expect(calls).toBe(4)
})
