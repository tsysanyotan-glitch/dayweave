import { useEffect, useRef, useState } from 'react'
import { Cloud, Download, FileText, Folder, HardDrive, LoaderCircle, Paperclip, Upload, X } from 'lucide-react'
import { clearCloudReference, patchTask, useTasks } from './store'
import type { Output, Task } from './model'
import { addBrowserOutput, cacheCloudOutput, chooseOutput, localOutputIds, native, openLocalOutput, removeCloudOutput, uploadOutput } from './outputs'

export function OutputPanel({ task }: { task: Task }) {
  const state = useTasks(); const scope = state.scope
  const [local, setLocal] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(''); const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState<{ output: Output; mode: 'upload' | 'local' | 'unlink' } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const outputs = task.outputs ?? []
  const refresh = async () => setLocal(new Set(await localOutputIds(scope)))
  useEffect(() => { let live = true; void localOutputIds(scope).then(ids => { if (live) setLocal(new Set(ids)) }).catch(e => { if (live) setMessage(String(e)) }); return () => { live = false } }, [scope, outputs.length])
  const run = async (id: string, work: () => Promise<unknown>) => {
    if (busy) return; setBusy(id); setMessage('')
    try { await work(); await refresh() } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) } finally { setBusy('') }
  }
  const append = async (output: Output | null) => { if (output) await patchTask(task.id, t => ({ ...t, outputs: [...(t.outputs ?? []), output] }), scope) }
  const execute = async () => {
    const action = confirm; if (!action) return
    await run(action.output.id, async () => {
      const output = action.output
      if (action.mode === 'upload') {
        const cloudPath = await uploadOutput(scope, task.id, output)
        try { await patchTask(task.id, t => { if (!t.outputs.some(o => o.id === output.id)) throw new Error('附件已被移除，请重新关联'); return { ...t, outputs: t.outputs.map(o => o.id === output.id ? { ...o, cloudPath } : o) } }, scope) }
        catch (e) { await removeCloudOutput(scope, cloudPath).catch(() => {}); throw e }
        setMessage('已上传私有云端副本，同账号手机端同步后可下载。')
      } else {
        if (output.cloudPath) {
          // Preserve a local copy before removing the remote bytes, including on phones.
          if (!local.has(output.id)) await cacheCloudOutput(scope, output)
          await removeCloudOutput(scope, output.cloudPath)
          await clearCloudReference(output.cloudPath, scope)
        }
        await patchTask(task.id, t => ({ ...t, outputs: action.mode === 'unlink' ? t.outputs.filter(o => o.id !== output.id) : t.outputs.map(o => o.id === output.id ? { ...o, cloudPath: undefined } : o) }), scope)
        setMessage(action.mode === 'unlink' ? '已移除关联，本机原文件保留。' : '已改为仅本机；已下载到其他设备的副本仍保留在那些设备。')
      }
      setConfirm(null)
    })
  }
  return <section className="output-panel" aria-label="任务产出">
    <div className="output-heading"><h3><Paperclip size={14} />任务产出 <small>{outputs.length}</small></h3><div>
      {native ? <><button disabled={!!busy || outputs.length >= 100} onClick={() => void run('pick', async () => append(await chooseOutput(scope)))}><FileText size={13} />关联文件</button><button disabled={!!busy || outputs.length >= 100} onClick={() => void run('pick', async () => append(await chooseOutput(scope, true)))}><Folder size={13} />关联文件夹</button></> : <button disabled={!!busy || outputs.length >= 100} onClick={() => fileInput.current?.click()}><FileText size={13} />添加本机文件</button>}
      <input ref={fileInput} type="file" hidden aria-label="选择本机产出文件" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run('pick', async () => append(await addBrowserOutput(scope, file))) }} />
    </div></div>
    <p className="output-hint">默认仅在本机。上传需逐项确认；名称随任务同步，本机路径与文件内容不会自动上传。{!native && ' 文件夹请在 Windows 客户端关联。'}</p>
    {outputs.map(output => <div className="output-row" key={output.id} data-testid="output-row">
      {output.kind === 'folder' ? <Folder size={19} /> : <FileText size={19} />}
      <div className="output-info"><strong>{output.name}</strong><div><span className={'output-badge ' + (output.cloudPath ? 'cloud' : '')}>{output.cloudPath ? <Cloud size={11} /> : <HardDrive size={11} />}{output.cloudPath ? '云端可查' : local.has(output.id) ? '仅在本机' : '仅在原电脑'}</span>{output.kind === 'folder' && <small>文件夹{output.cloudPath ? ' · ZIP 副本' : ''}</small>}</div>{!local.has(output.id) && !output.cloudPath && <small>请在原电脑上传，或在当前 Windows 客户端重新关联。</small>}</div>
      <div className="output-actions">{busy === output.id ? <LoaderCircle className="spin" size={16} /> : <>
        {local.has(output.id) && <button disabled={!!busy} onClick={() => void run(output.id, () => openLocalOutput(scope, output))}>{native ? '打开本机' : '保存本机文件'}</button>}
        {output.cloudPath && <><button disabled={!!busy} onClick={() => void run(output.id, async () => { await cacheCloudOutput(scope, output); await openLocalOutput(scope, output, true) })}><Download size={12} />{native ? '下载并打开' : '下载'}</button><button disabled={!!busy} onClick={() => setConfirm({ output, mode: 'local' })}>改为仅本机</button></>}
        {!output.cloudPath && local.has(output.id) && <button disabled={!!busy || scope === 'guest' || !state.online} title={scope === 'guest' ? '登录云账号后可上传' : '主动上传私有副本'} onClick={() => setConfirm({ output, mode: 'upload' })}><Upload size={12} />上传到云端</button>}
        {!local.has(output.id) && native && <button disabled={!!busy} onClick={() => void run(output.id, async () => { const selected = await chooseOutput(scope, output.kind === 'folder', output.id); if (selected) { await patchTask(task.id, t => ({ ...t, outputs: t.outputs.map(o => o.id === output.id ? { ...selected, cloudPath: o.cloudPath } : o) }), scope) } })}>重新关联</button>}
        <button aria-label={'移除产出关联：' + output.name} disabled={!!busy} onClick={() => setConfirm({ output, mode: 'unlink' })}><X size={12} /></button>
      </>}</div>
    </div>)}
    {confirm && <div className="output-confirm" role="group" aria-label="确认文件存储方式"><strong>{confirm.mode === 'upload' ? `上传「${confirm.output.name}」？` : confirm.mode === 'local' ? '移除云端副本，改为仅本机？' : '移除这个产出关联？'}</strong><p>{confirm.mode === 'upload' ? `${confirm.output.kind === 'folder' ? '文件夹将打包为 ZIP（含其中的文件）后上传。' : '文件内容将上传至私有云空间。'}同账号手机可下载。上限 25 MB，文件夹最多 2000 项。` : confirm.output.cloudPath ? '先确保本机有副本，再删除云端内容。本机原文件不会删除。' : '只移除任务中的关联，本机原文件不会删除。'}</p><button disabled={!!busy} className="button primary" onClick={() => void execute()}>{busy ? '正在处理…' : confirm.mode === 'upload' ? '确认上传' : '确认'}</button><button disabled={!!busy} onClick={() => setConfirm(null)}>取消</button></div>}
    {message && <p className="output-message" role="status">{message}</p>}
  </section>
}
