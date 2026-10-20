import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { dataCloud } from './cloud'

interface ApiKey { id:string; name:string; prefix:string; permissions:string[]; created_at:string; expires_at:string; revoked_at:string|null; last_used_at:string|null }
const columns = 'id,name,prefix,permissions,created_at,expires_at,revoked_at,last_used_at'
export function ApiKeys({ scope }: {scope:string}) {
  const [keys,setKeys] = useState<ApiKey[]>([])
  const [name,setName] = useState('')
  const [days,setDays] = useState('90')
  const [readOnly,setReadOnly] = useState(false)
  const [secret,setSecret] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [copied,setCopied] = useState(false)
  useEffect(() => {
    let active=true
    void dataCloud!.from('task_api_keys').select(columns).eq('user_id',scope).order('created_at',{ascending:false})
      .then(({data,error}) => { if (active) { if(error)setError('密钥列表暂未加载，请联网后重试。'); else setKeys(data as ApiKey[]) } })
    return () => { active=false }
  },[scope])
  const create = async (event: FormEvent) => {
    event.preventDefault(); if(busy)return
    setBusy(true);setError('');setSecret('');setCopied(false)
    try {
      const bytes=crypto.getRandomValues(new Uint8Array(32))
      const token='dw_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
      const token_hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
      const {data,error}=await dataCloud!.from('task_api_keys').insert({user_id:scope,name:name.trim(),token_hash,prefix:token.slice(0,15),permissions:readOnly?['tasks:read']:['tasks:read','tasks:write'],expires_at:new Date(Date.now()+Number(days)*86400000).toISOString()}).select(columns).single()
      if(error)throw error
      setKeys(current=>[data as ApiKey,...current]);setSecret(token);setName('')
    } catch { setError('密钥创建失败，请检查网络后重试。') }
    finally { setBusy(false) }
  }
  const revoke = async (id:string) => {
    if(busy)return
    setBusy(true);setError('')
    try {
      const now=new Date().toISOString()
      const {error}=await dataCloud!.from('task_api_keys').update({revoked_at:now}).eq('user_id',scope).eq('id',id)
      if(error)throw error
      setKeys(current=>current.map(k=>k.id===id?{...k,revoked_at:now}:k));setSecret('')
    } catch {setError('撤销失败，请联网后重试。')}
    finally {setBusy(false)}
  }
  const endpoint=import.meta.env.VITE_SUPABASE_URL+'/functions/v1/dayweave-api/v1/tasks'
  return <section className="api-keys"><div className="settings-title"><KeyRound size={18}/><h3>让其他服务接入任务</h3></div>
    <p className="muted">为每个服务单独创建密钥，只能访问当前账号的任务。密钥仅显示一次，可随时撤销。</p>
    <form onSubmit={create} className="api-key-form">
      <label>服务名称<input required maxLength={80} placeholder="例如：Codex 自动化" value={name} onChange={e=>setName(e.target.value)}/></label>
      <div className="form-grid"><label>密钥有效期<select value={days} onChange={e=>setDays(e.target.value)}><option value="30">30 天</option><option value="90">90 天</option><option value="365">365 天</option></select></label><label>访问权限<select value={readOnly?'read':'write'} onChange={e=>setReadOnly(e.target.value==='read')}><option value="write">读取与修改任务</option><option value="read">只读任务</option></select></label></div>
      <button className="button secondary" disabled={busy||!name.trim()}>{busy?'正在处理…':'创建个人密钥'}</button>
    </form>
    {secret&&<div className="api-secret"><label>新密钥（仅显示一次）<textarea readOnly rows={3} value={secret} spellCheck={false}/></label><div className="row-actions"><button onClick={()=>void navigator.clipboard.writeText(secret).then(()=>setCopied(true)).catch(()=>setError('请选中上方密钥手动复制。'))}>{copied?'已复制':'复制密钥'}</button><button onClick={()=>setSecret('')}>已保存，隐藏密钥</button></div></div>}
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="api-key-list">{keys.map(k=><div className="api-key-item" key={k.id}><div><strong>{k.name}</strong><small>{k.prefix}… · {k.permissions.includes('tasks:write')?'读写':'只读'}</small><small>{k.revoked_at?'已撤销':Date.parse(k.expires_at)<=Date.now()?'已过期':'到期 '+new Date(k.expires_at).toLocaleDateString('zh-CN')}</small></div>{!k.revoked_at&&Date.parse(k.expires_at)>Date.now()&&<button className="text-button" disabled={busy} aria-label={'撤销密钥：'+k.name} onClick={()=>void revoke(k.id)}>撤销</button>}</div>)}</div>
    <details className="api-help"><summary>接口地址与使用文档</summary><code>{endpoint}</code><p className="muted">请求头：Authorization: Bearer 个人密钥。支持 GET 查询、POST 新建、PATCH 修改和 DELETE 移入回收站。修改时携带 If-Match 版本号。</p><a href="https://github.com/tsysanyotan-glitch/dayweave/blob/main/docs/api.md" target="_blank" rel="noreferrer" onClick={event=>{if('__TAURI_INTERNALS__' in window){event.preventDefault();void import('@tauri-apps/plugin-opener').then(({openUrl})=>openUrl('https://github.com/tsysanyotan-glitch/dayweave/blob/main/docs/api.md')).catch(()=>setError('文档暂未打开，请复制接口地址或稍后重试。'))}}}>查看完整接口文档与调用示例</a></details>
  </section>
}
