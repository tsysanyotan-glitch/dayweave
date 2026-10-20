import { test,expect } from '@playwright/test'
import { createHash } from 'node:crypto'
test('personal keys are hashed, scoped, shown once, and revocable',async({page},testInfo)=>{
  const id='f291a0a3-92e0-40d8-9cc4-8d268e206c3b',email='api@example.com'
  const url=process.env.VITE_SUPABASE_URL??'https://gacbkkhanzgbvrfwycji.supabase.co'
  const project=new URL(url).hostname.split('.')[0]
  const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,email,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')+'.test'
  const user={id,email,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{}}
  await page.addInitScript(({project,jwt,user})=>{localStorage.setItem('sb-'+project+'-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}))},{project,jwt,user})
  let saved:Record<string,unknown>|undefined;let keys:Record<string,unknown>[]=[]
  await page.route('**/auth/v1/user',route=>route.fulfill({json:user}))
  await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}))
  await page.route('**/rest/v1/task_api_keys*',async route=>{
    const method=route.request().method()
    if(method==='POST'){
      saved=route.request().postDataJSON();const {token_hash:_hash,...metadata}=saved!
      const key={...metadata,id:'6344c70e-72e3-4c3a-a6bf-a33c35a6bf7f',created_at:new Date().toISOString(),revoked_at:null,last_used_at:null};keys=[key]
      return route.fulfill({json:key})
    }
    if(method==='PATCH'){keys=keys.map(k=>({...k,revoked_at:new Date().toISOString()}));return route.fulfill({status:204})}
    return route.fulfill({json:keys})
  })
  await page.goto('/');await page.getByRole('button',{name:'打开设置',exact:true}).click()
  await expect(page.getByRole('heading',{name:'让其他服务接入任务'})).toBeVisible()
  await page.getByLabel('服务名称').fill('Codex 自动化')
  await page.getByLabel('访问权限').selectOption('read')
  await page.getByLabel('密钥有效期').selectOption('30')
  await page.getByRole('button',{name:'创建个人密钥',exact:true}).click()
  const token=await page.getByLabel('新密钥（仅显示一次）').inputValue()
  expect(token).toMatch(/^dw_[a-f0-9]{64}$/)
  expect(saved).toMatchObject({user_id:id,permissions:['tasks:read'],prefix:token.slice(0,15),token_hash:createHash('sha256').update(token).digest('hex')})
  expect(JSON.stringify(saved)).not.toContain(token)
  await page.getByRole('button',{name:'已保存，隐藏密钥'}).click()
  await expect(page.getByLabel('新密钥（仅显示一次）')).toHaveCount(0)
  await page.screenshot({path:`artifacts/${testInfo.project.name}-api-keys.png`})
  await page.reload();await page.getByRole('button',{name:'打开设置',exact:true}).click()
  await expect(page.locator('.api-key-list')).toContainText('Codex 自动化')
  await expect(page.getByLabel('新密钥（仅显示一次）')).toHaveCount(0)
  const browserStorage=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('dayweave-v1');r.onsuccess=()=>resolve(r.result)});const records=await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve(r.result)});db.close();return JSON.stringify({localStorage:{...localStorage},records})})
  expect(browserStorage).not.toContain(token)
  await page.getByRole('button',{name:'撤销密钥：Codex 自动化'}).click()
  await expect(page.locator('.api-key-list')).toContainText('已撤销')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
