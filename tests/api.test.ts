import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHandler } from '../supabase/functions/dayweave-api/handler'
import { newTask, type RemoteRow } from '../src/model'
const owner=crypto.randomUUID(),other=crypto.randomUUID(),token='dw_'+'a'.repeat(64)
let rows:RemoteRow[],permissions:string[],requests:string[],valid:boolean
const backend=vi.fn<typeof fetch>(async(input,init)=>{
  const url=new URL(String(input)); requests.push(url.pathname+url.search)
  if(url.pathname.endsWith('authorize_task_api'))return Response.json(valid?[{user_id:owner,permissions}]:{code:'PT401'},{status:valid?200:401})
  if(url.pathname.endsWith('commit_task_api')){
    const body=JSON.parse(String(init?.body));expect(body.p_user_id).toBe(owner)
    const current=rows.find(r=>r.user_id===owner&&r.id===body.p_id)
    if(current&&current.revision!==body.p_expected_revision)return Response.json({code:'PT409'},{status:409})
    const row={user_id:owner,id:body.p_id,document:body.p_document,revision:(current?.revision??0)+1,last_mutation_id:body.p_mutation_id,updated_at:new Date().toISOString()}
    rows=rows.filter(r=>!(r.user_id===owner&&r.id===row.id));rows.push(row);return Response.json([row])
  }
  expect(url.searchParams.get('user_id')).toBe('eq.'+owner)
  return Response.json(rows.filter(r=>r.user_id===owner&&(!url.searchParams.has('id')||url.searchParams.get('id')==='eq.'+r.id)&&(!url.searchParams.has('document->>deletedAt')||!r.document.deletedAt)))
})
const handler=createHandler({url:'https://test.invalid',serviceKey:'server-only',fetch:backend})
const call=(method:string,path='',body?:unknown,headers:Record<string,string>={})=>handler(new Request('https://test.invalid/functions/v1/dayweave-api/v1/tasks'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}))
beforeEach(()=>{rows=[];permissions=['tasks:read','tasks:write'];requests=[];valid=true;backend.mockClear()})
describe('personal API contract',()=>{
  it('serves OpenAPI and routes both gateway and local request paths',async()=>{
    for(const prefix of ['/functions/v1/dayweave-api','/dayweave-api','']){
      const response=await handler(new Request('https://test.invalid'+prefix+'/openapi.json'))
      expect(response.status).toBe(200);expect((await response.json()).openapi).toBe('3.1.0')
      expect((await handler(new Request('https://test.invalid'+prefix+'/v1/tasks',{headers:{Authorization:'Bearer '+token}}))).status).toBe(200)
    }
  })
  it('rejects missing, invalid, revoked/expired keys and read-only writes',async()=>{
    expect((await handler(new Request('https://test.invalid/v1/tasks'))).status).toBe(401)
    expect(backend).not.toHaveBeenCalled()
    valid=false;expect((await call('GET')).status).toBe(401)
    valid=true;permissions=['tasks:read'];expect((await call('POST','',{title:'x'},{'Idempotency-Key':crypto.randomUUID()})).status).toBe(403)
  })
  it('creates, retries, reads, updates with CAS, then soft-deletes the same task',async()=>{
    const key=crypto.randomUUID(),body={title:'API 任务',date:'2026-10-20',status:'doing',assignee:'codex',steps:[{id:'step',title:'检查结果',done:false}]}
    let result=await call('POST','',body,{'Idempotency-Key':key.toUpperCase()});expect(result.status).toBe(201)
    const created=await result.json();expect(created.data.task.id).toBe(key);expect(created.data.revision).toBe(1)
    result=await call('POST','',body,{'Idempotency-Key':key.toUpperCase()});expect(result.status).toBe(200);expect(rows).toHaveLength(1)
    result=await call('GET','/'+key.toUpperCase());expect(result.headers.get('etag')).toBe('"1"')
    expect((await call('PATCH','/'+key,{note:'修改'},{'Idempotency-Key':crypto.randomUUID()})).status).toBe(428)
    result=await call('PATCH','/'+key,{note:'修改'},{'Idempotency-Key':crypto.randomUUID(),'If-Match':'W/"1"'});expect(result.status).toBe(200)
    expect(rows[0].document.steps).toEqual(body.steps)
    expect((await call('PATCH','/'+key,{title:'过期修改'},{'Idempotency-Key':crypto.randomUUID(),'If-Match':'1'})).status).toBe(409)
    result=await call('DELETE','/'+key,undefined,{'Idempotency-Key':crypto.randomUUID(),'If-Match':'2'});expect(result.status).toBe(200)
    expect(rows[0].document.deletedAt).toBeTruthy();expect((await (await call('GET')).json()).data).toEqual([])
  })
  it('always scopes IDs to the key owner and rejects identity/file injection and malformed data',async()=>{
    const task={...newTask(),title:'另一人'}
    rows=[{user_id:other,id:task.id,document:task,revision:1,updated_at:task.updatedAt,last_mutation_id:crypto.randomUUID()}]
    expect((await call('GET','/'+task.id)).status).toBe(404)
    for(const body of [{title:'x',date:'2026-10-20',user_id:other},{title:'x',date:'2026-10-20',outputs:[]},{title:'x',date:'2026-10-20',path:'C:/secret'},{title:'x',date:'2026-02-31'},{title:'x',note:'a'.repeat(270000)}]) {
      expect([400,413]).toContain((await call('POST','',body,{'Idempotency-Key':crypto.randomUUID()})).status)
    }
    expect(requests.some(r=>r.includes('commit_task_api'))).toBe(false)
    expect((await call('GET','?limit=1000')).status).toBe(400)
    expect((await call('GET','?user_id='+other)).status).toBe(400)
  })
})
