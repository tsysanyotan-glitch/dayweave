import { newTask, validateTask, validDate, type RemoteRow, type Task } from '../../../src/model.ts'
import specification from '../../../docs/api.openapi.json' with { type: 'json' }

interface Options { url: string; serviceKey: string; fetch?: typeof fetch }
class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const writable = new Set(['title','note','date','status','kind','priority','assignee','project','link','waiting','starred','steps','order'])
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type,if-match,idempotency-key,apikey', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'ETag,Retry-After,X-Request-Id' }
const json = (data: unknown, status: number, headers: Record<string,string> = {}) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers } })
// The hosted gateway strips /functions/v1 before passing the URL to the runtime.
const requestPath = (request: Request) => new URL(request.url).pathname.replace(/^\/(?:functions\/v1\/)?dayweave-api(?=\/|$)/,'').replace(/\/$/,'')
function output(row: RemoteRow) { return { task: row.document, revision: row.revision } }
function integer(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback
  if (!/^\d+$/.test(value) || +value > max) throw new ApiError(400, 'invalid_query', 'Invalid pagination')
  return +value
}
async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'content_type', 'Use application/json')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400,'invalid_body','JSON object required')
  let size = 0; const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break
      size += value.length
      if (size > 262144) { await reader.cancel(); throw new ApiError(413,'body_too_large','Body must be at most 256 KiB') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body as Record<string,unknown>
  } catch { throw new ApiError(400,'invalid_body','JSON object required') }
}
export function createHandler(options: Options) {
  const fetcher = options.fetch ?? fetch
  async function db(path: string, init?: RequestInit) {
    const response = await fetcher(options.url + '/rest/v1/' + path, { ...init, signal: AbortSignal.timeout(12000), headers: { apikey:options.serviceKey, Authorization:'Bearer '+options.serviceKey, 'Content-Type':'application/json', ...init?.headers } })
    const data = await response.json()
    if (!response.ok) {
      if (['PT401','PT409','PT429'].includes(data.code)) throw new ApiError(Number(data.code.slice(2)),data.code === 'PT401' ? 'unauthorized' : data.code === 'PT409' ? 'revision_conflict' : 'rate_limited', data.code === 'PT409' ? 'Fetch the current task and retry with its revision' : data.code === 'PT429' ? 'Limit: 60 requests per minute per key' : 'Invalid or expired API key')
      throw new ApiError(503,'unavailable','Service temporarily unavailable')
    }
    return data
  }
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID()
    if (request.method === 'OPTIONS') return new Response(null, {status:204,headers:cors})
    if (request.method === 'GET' && requestPath(request) === '/openapi.json') return json(specification,200,{'X-Request-Id':requestId})
    try {
      const bearer = request.headers.get('authorization') ?? ''
      if (!/^Bearer dw_[a-f0-9]{64}$/i.test(bearer)) throw new ApiError(401,'unauthorized','Personal API key required')
      const token = bearer.slice(7)
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')
      const authorized = await db('rpc/authorize_task_api', {method:'POST',body:JSON.stringify({p_hash:hash})})
      const identity = authorized[0] as {user_id:string;permissions:string[]} | undefined
      if (!identity) throw new ApiError(401,'unauthorized','Invalid API key')
      const permission = request.method === 'GET' ? 'tasks:read' : 'tasks:write'
      if (!identity.permissions.includes(permission)) throw new ApiError(403,'forbidden','API key lacks '+permission)
      const url = new URL(request.url)
      const path = requestPath(request)
      const match = /^\/v1\/tasks(?:\/([0-9a-f-]+))?$/i.exec(path)
      if (!match || (match[1] && !uuidPattern.test(match[1]))) throw new ApiError(404,'not_found','Endpoint not found')
      const id = match[1]?.toLowerCase()
      const query = new URLSearchParams({user_id:'eq.'+identity.user_id,select:'*'})
      if (id) query.set('id','eq.'+id)
      if (request.method === 'GET') {
        query.set('document->>deletedAt','is.null')
        if (!id) {
          const allowed = new Set(['limit','offset','status','date'])
          for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new ApiError(400,'invalid_query','Unknown query parameter: '+key)
          const status = url.searchParams.get('status'), date = url.searchParams.get('date')
          if (status && !['todo','doing','done'].includes(status)) throw new ApiError(400,'invalid_query','Invalid status')
          if (date && !validDate(date)) throw new ApiError(400,'invalid_query','Invalid date')
          if (status) query.set('document->>status','eq.'+status)
          if (date) query.set('document->>date','eq.'+date)
          const limit=integer(url.searchParams.get('limit'),50,100), offset=integer(url.searchParams.get('offset'),0,100000)
          if (!limit) throw new ApiError(400,'invalid_query','limit must be 1–100')
          query.set('limit',String(limit));query.set('offset',String(offset));query.set('order','id.asc')
          const rows: RemoteRow[] = await db('tasks?'+query)
          return json({data:rows.map(output),limit,offset,nextOffset:rows.length===limit?offset+limit:null},200,{'X-Request-Id':requestId})
        }
        const rows: RemoteRow[] = await db('tasks?'+query)
        if (!rows[0]) throw new ApiError(404,'not_found','Task not found')
        return json({data:output(rows[0])},200,{ETag:'"'+rows[0].revision+'"','X-Request-Id':requestId})
      }
      if (!((request.method === 'POST' && !id) || (['PATCH','DELETE'].includes(request.method) && id))) throw new ApiError(405,'method_not_allowed','Method not allowed')
      const mutation = (request.headers.get('idempotency-key') ?? '').toLowerCase()
      if (!uuidPattern.test(mutation)) throw new ApiError(400,'idempotency_key','Idempotency-Key must be a UUID')
      let expected = 0
      if (id) {
        const header = request.headers.get('if-match') ?? ''
        const revision = /^(?:(?:W\/)?"([1-9]\d*)"|([1-9]\d*))$/.exec(header)
        if (!revision || !Number.isSafeInteger(+(revision[1]??revision[2]))) throw new ApiError(428,'revision_required','If-Match revision required')
        expected = +(revision[1]??revision[2])
      }
      const body = request.method === 'DELETE' ? {} : await readBody(request)
      if (request.method === 'POST' && !validDate(body.date)) throw new ApiError(400,'invalid_task','date (YYYY-MM-DD) is required')
      for (const key of Object.keys(body)) if (!writable.has(key) && !(request.method === 'POST' && key === 'id')) throw new ApiError(400,'invalid_field','Field is not writable: '+key)
      const suppliedId = id ?? body.id ?? mutation
      if (typeof suppliedId !== 'string' || !uuidPattern.test(suppliedId)) throw new ApiError(400,'invalid_id','Task ID must be a UUID')
      const taskId = suppliedId.toLowerCase()
      query.set('id','eq.'+taskId)
      const current = (await db('tasks?'+query) as RemoteRow[])[0]
      if (current?.last_mutation_id === mutation) return json({data:output(current)},200,{ETag:'"'+current.revision+'"','X-Request-Id':requestId})
      if (id && (!current || current.document.deletedAt)) throw new ApiError(404,'not_found','Task not found')
      if (current && current.revision !== expected) throw new ApiError(409,'revision_conflict','Fetch the current task and retry with its revision')
      const now = new Date().toISOString()
      let document: Task
      try {
        document = validateTask({ ...(current?.document ?? newTask()), ...body, id:taskId, updatedAt:now, ...(request.method==='DELETE'?{deletedAt:now}:{}) })
      } catch (error) { throw new ApiError(400,'invalid_task',error instanceof Error?error.message:'Invalid task') }
      if (new TextEncoder().encode(JSON.stringify(document)).length > 262144) throw new ApiError(400,'invalid_task','Resulting task must be at most 256 KiB')
      const rows: RemoteRow[] = await db('rpc/commit_task_api',{method:'POST',body:JSON.stringify({p_user_id:identity.user_id,p_id:taskId,p_expected_revision:expected,p_document:document,p_mutation_id:mutation})})
      return json({data:output(rows[0])},request.method==='POST'?201:200,{ETag:'"'+rows[0].revision+'"','X-Request-Id':requestId})
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(503,'unavailable','Service temporarily unavailable')
      return json({error:{code:failure.code,message:failure.message},requestId},failure.status,{...(failure.status===429?{'Retry-After':'60'}:{}),'X-Request-Id':requestId})
    }
  }
}
