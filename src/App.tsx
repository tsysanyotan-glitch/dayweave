import { clockIso, clockDate } from './time'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Circle, Bell, MonitorDown, Cloud, CloudOff, ExternalLink, Flag, Folder, House, ListTodo, LoaderCircle, Menu, MoreHorizontal, Paperclip, Plus, Search, Settings, Sparkles, Sprout, Star, Trash2, X } from 'lucide-react'
import { cloud } from './cloud'
import { Modal } from './Modal'
import { TaskAppearance } from './TaskAppearance'
import { initializeLooks, lookStyle, saveTaskLook, taskLook, useLooks } from './appearance'
import { StepEditor, StepSummary } from './Steps'
import { BeijingClock } from './BeijingClock'
import { DeadlineFields, QuickAlarm, ReminderSettings, Upcoming } from './Reminders'
import { nativeAction, useDesktopReminders } from './desktopReminders'
import { deadlineLabel } from './reminderModel'
import { useTheme } from './theme'
import { useCompactToolbar } from './useCompactToolbar'
import { EmailOtpForm } from './EmailOtpForm'
import { AssigneePicker } from './AssigneePicker'
import { ApiKeys } from './ApiKeys'
import './api-keys.css'
import { OutputPanel } from './OutputPanel'
import { KindFilter, KindIcon, KindPicker } from './TaskKind'
import { useTaskDrag } from './useTaskDrag'
import { useWindowMode } from './useWindowMode'
import { useAndroidBack, useMobileViewport } from './useMobile'
import { android, desktop } from './platform'
import { copyGuestTasks, exampleTasks, importTasks, initialize, moveTask, patchTask, resolveConflict, saveTask, syncNow, useTasks } from './store'
import { dateKey, newTask, parseDate, priorityLabels, safeLink, shiftDate, kindLabels, statusLabels, summarySteps, taskKind, taskOrder, uuid, type LocalRecord, type Status, type Task, type TaskKind } from './model'

type View = 'day' | 'all' | 'done' | 'trash'
const navItems = [{ id: 'day' as const, label: '我的一天', icon: House }, { id: 'all' as const, label: '全部任务', icon: ListTodo }, { id: 'done' as const, label: '已结束', icon: CheckCheck }]
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

function TaskEditor({ initial, close, saved, assignees }: { initial: Task; close: () => void; saved: () => void; assignees: string[] }) {
  const { scope } = useTasks()
  const looks = useLooks()
  const [look, setLook] = useState(() => taskLook(scope, initial.id))
  useEffect(() => { if (looks.ready) setLook(taskLook(scope, initial.id)) }, [looks.ready, scope, initial.id])
  const [task, setTask] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Task>(key: K, value: Task[K]) => setTask(t => ({ ...t, [key]: value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('')
    try { await saveTask({ ...task, assignee: task.assignee.trim() || '自己', project: task.project.trim(), link: task.link.trim(), steps: task.steps.filter(s => s.title.trim()) }); if (!android && looks.ready) await saveTaskLook(scope, task.id, look); saved(); close() }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <Modal title={initial.title ? '编辑任务' : '留下一件要做的事'} close={close} wide>
    <form onSubmit={submit} className="editor" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.currentTarget.requestSubmit() } }}>
      <label>任务名称<input autoFocus required maxLength={300} placeholder="想完成什么？" value={task.title} onChange={e => set('title', e.target.value)} /></label>
      <KindPicker value={taskKind(task)} change={kind => setTask(t=>({...t,kind:kind==='issue'?'issue':'planned',alarm:kind==='alarm',...(kind==='alarm'&&t.deadlineAt&&!t.reminderAt?{reminderAt:t.deadlineAt}:{})}))} />
      <div className="form-grid"><label>安排日期<input type="date" required value={task.date} onChange={e => set('date', e.target.value)} /></label><label>任务状态<select value={task.status} onChange={e => set('status', e.target.value as Status)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="form-grid"><AssigneePicker value={task.assignee} options={assignees} change={value => set('assignee', value)} /><label>优先级<select value={task.priority} onChange={e => set('priority', e.target.value as Task['priority'])}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {!android && <DeadlineFields task={task} change={setTask} />}
      <label>项目 / 标签<input maxLength={80} placeholder="例如：研究论文、个人事务" value={task.project} onChange={e => set('project', e.target.value)} /></label>
      <label>备注<textarea maxLength={20000} rows={3} placeholder="补充背景、交付标准，或下次继续的位置…" value={task.note} onChange={e => set('note', e.target.value)} /></label>
      <div className="field-heading"><span>子步骤 <small>把大任务拆小一点</small></span><button type="button" className="text-button" onClick={() => set('steps', [...task.steps, { id: uuid(), title: '', done: false }])} disabled={task.steps.length >= 200}><Plus size={14} /> 添加步骤</button></div>
      {!android ? <StepEditor steps={task.steps} change={value => set('steps', value)} assignees={assignees} /> : <div className="edit-steps">{task.steps.map((step, i) => <div key={step.id}><input aria-label={'子步骤 ' + (i + 1)} maxLength={500} placeholder="一个明确的小步骤" value={step.title} onChange={e => set('steps', task.steps.map(s => s.id === step.id ? { ...s, title: e.target.value } : s))} /><button type="button" className="icon-button" aria-label={'移除子步骤 ' + (i + 1)} onClick={() => set('steps', task.steps.filter(s => s.id !== step.id))}><X size={16} /></button></div>)}</div>}
      {!android && looks.ready && <TaskAppearance value={look} change={setLook} />}
      <label>关联链接<input type="url" maxLength={2000} placeholder="https://…  关联 PR、Agent 对话或文档" value={task.link} onChange={e => set('link', e.target.value)} /></label>
      <div className="check-fields"><label><input type="checkbox" checked={task.starred} onChange={e => set('starred', e.target.checked)} /> 设为今日重点</label><label><input type="checkbox" checked={task.waiting} onChange={e => set('waiting', e.target.checked)} /> 等待反馈 / 人工验收</label></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-footer"><span className="keyboard-note">Ctrl + Enter 保存</span><button type="button" className="button secondary" onClick={close}>取消</button><button className="button primary" disabled={busy}>{busy ? '正在保存…' : '保存任务'}</button></div>
    </form>
  </Modal>
}

async function openLink(url: string) {
  if (!safeLink(url)) return
  if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url)
  } else window.open(url, '_blank', 'noopener,noreferrer')
}

function TaskRow({ record, expanded, toggle, edit, act, showDate, dragControl, dragging, dropBefore }: { record: LocalRecord; expanded: boolean; toggle: () => void; edit: () => void; act: (work: Promise<unknown>, success?: string) => void; showDate: boolean; dragControl: ReactNode; dragging?: boolean; dropBefore?: boolean }) {
  useLooks()
  const task = record.task
  const look = android ? { kind: 'default' as const } : taskLook(record.scope, task.id)
  const kind = taskKind(task)
  const doneSteps = task.steps.filter(s => s.done).length
  const mutate = (fn: (t: Task) => Task, message?: string) => act(patchTask(task.id, fn), message)
  const complete = () => mutate(t => ({ ...t, status: t.status === 'done' ? 'todo' : 'done', waiting: false }), task.status === 'done' ? '任务已重新打开' : '又完成了一件事')
  return <article className={'task-row ' + (look.kind === 'default' ? '' : look.kind + '-look ') + 'task-kind-' + kind + ' ' + (task.status === 'done' ? 'is-done' : '') + (record.conflict ? ' has-conflict' : '') + (dragging ? ' is-dragged' : '') + (dropBefore ? ' drop-before' : '')} style={lookStyle(look)} data-task-id={task.id} data-task-kind={kind} data-testid="task-row">
    <div className="task-main">{dragControl}<button className={'task-check ' + task.status} aria-label={(task.status === 'done' ? '重新打开：' : '完成：') + task.title} onClick={complete}>{task.status === 'done' && <Check size={14} />}</button><KindIcon kind={kind} />
      <button className="task-open" onClick={toggle} aria-expanded={expanded}><span className="task-title-line"><span className="task-title">{task.title}</span>{task.starred && <Star size={13} className="star-filled" />}</span>
        <span className="task-meta"><span className={'badge task-kind-label kind-' + kind}>{kindLabels[kind]}</span>{!android && task.deadlineAt && <span className={'badge deadline-badge ' + (task.alarm ? 'alarm-badge' : '')}><Bell size={10}/>{deadlineLabel(task.deadlineAt)}{task.alarm ? ' 提醒' : ' 截止'}</span>}<span className={'badge ' + (task.assignee === '自己' ? 'self' : 'executor')}>{task.assignee === '自己' ? null : <Sparkles size={10} />}{task.assignee}</span>{task.project && <span className="project-tag"><Folder size={12} />{task.project}</span>}<span className={'badge priority-' + task.priority}>{priorityLabels[task.priority]}</span>{task.waiting && <span className="badge waiting">等待反馈</span>}{record.conflict && <span className="badge conflict">版本冲突</span>}</span>
      </button><div className="task-trailing">{(task.outputs?.length ?? 0) > 0 && <span className="output-count" title="任务产出"><Paperclip size={12} />{task.outputs.length}</span>}{showDate && <span className={'task-date ' + (task.date < dateKey() && task.status !== 'done' ? 'overdue' : '')}>{task.date.slice(5).replace('-', '/')}</span>}{task.steps.length > 0 && <span className="step-count">{doneSteps}/{task.steps.length}</span>}<button className={'icon-button chevron ' + (expanded ? 'open' : '')} aria-label={(expanded ? '折叠：' : '展开：') + task.title} onClick={toggle}><ChevronDown size={16} /></button></div>
    </div>
    {!expanded && !android && <StepSummary task={task} />}
    {!expanded && task.note && <p className="task-preview">{task.note}</p>}
    {expanded && <div className="task-detail">
      {task.note && <p className="task-note">{task.note}</p>}
      {task.steps.length > 0 && <div className="substeps">{task.steps.map(step => <label key={step.id} className={step.done ? 'checked' : ''}><input type="checkbox" aria-label={step.title} checked={step.done} onChange={() => mutate(t => ({ ...t, steps: t.steps.map(s => s.id === step.id ? { ...s, done: !s.done, ...(s.active !== undefined ? { active: false } : {}) } : s) }))} /><span>{step.title}</span>{!android && step.assignee && <small className="step-assignee">{step.assignee}</small>}{!android && step.active && !step.done && <small className="step-in-progress">正在做</small>}</label>)}</div>}
      {task.link && <button className="link-button" onClick={() => act(openLink(task.link))}><ExternalLink size={13} />打开关联链接</button>}
      {record.conflict && <div className="conflict-box"><strong>另一台设备也修改了这个任务</strong><p>本机：{task.title} · {statusLabels[task.status]}<br />云端：{record.conflict.document.title} · {statusLabels[record.conflict.document.status]}</p><div className="row-actions"><button onClick={() => act(resolveConflict(task.id, 'both'), '两个版本都已保留')}>保留两个版本</button><button onClick={() => act(resolveConflict(task.id, 'local'))}>使用本机版本</button><button onClick={() => act(resolveConflict(task.id, 'remote'))}>使用云端版本</button></div></div>}
      <OutputPanel task={task} /><div className="task-detail-footer"><div className="row-actions">{!task.deletedAt && <><select aria-label={'更改状态：' + task.title} value={task.status} onChange={e => { const status = e.target.value as Status; mutate(t => ({ ...t, status })) }}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button onClick={edit}>编辑</button><button onClick={() => mutate(t => ({ ...t, date: shiftDate(task.date, 1) }), '已安排到下一天')}>移至次日</button></>}{task.deletedAt ? <button onClick={() => mutate(t => ({ ...t, deletedAt: null }), '任务已恢复')}>恢复任务</button> : <button className="delete-action" aria-label={'删除：' + task.title} onClick={() => mutate(t => ({ ...t, deletedAt: clockIso() }), '已移入回收站，可在设置中恢复')}><Trash2 size={13} />删除</button>}</div><span className="local-indicator">{record.dirty ? '已存本机' : '已同步'}</span></div>
    </div>}
  </article>
}

function MiniCalendar({ date, setDate }: { date: string; setDate: (value: string) => void }) {
  const [month, setMonth] = useState(date.slice(0, 7))
  useEffect(() => setMonth(date.slice(0, 7)), [date])
  const first = parseDate(month + '-01')
  const start = shiftDate(month + '-01', -(first.getUTCDay() + 6) % 7)
  const monthMove = (delta: number) => { const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + delta); setMonth(dateKey(next).slice(0, 7)) }
  return <div className="mini-calendar"><div className="calendar-heading"><span>{first.getUTCFullYear()} 年 {first.getUTCMonth() + 1} 月</span><div><button className="icon-button" aria-label="上个月" onClick={() => monthMove(-1)}><ChevronLeft size={14} /></button><button className="icon-button" aria-label="下个月" onClick={() => monthMove(1)}><ChevronRight size={14} /></button></div></div><div className="calendar-grid">{['一', '二', '三', '四', '五', '六', '日'].map(w => <span className="weekday" key={w}>{w}</span>)}{Array.from({ length: 42 }, (_, i) => shiftDate(start, i)).map(day => <button key={day} className={(day === date ? 'selected ' : '') + (day.slice(0, 7) !== month ? 'other-month ' : '') + (day === dateKey() ? 'is-today' : '')} aria-label={day} aria-pressed={day === date} onClick={() => setDate(day)}>{parseDate(day).getUTCDate()}</button>)}</div></div>
}

function Preferences({ close, act, showTrash, theme, reminders }: { reminders:ReturnType<typeof useDesktopReminders>; theme: ReturnType<typeof useTheme>; close: () => void; act: (p: Promise<unknown>, message?: string) => void; showTrash: () => void }) {
  const state = useTasks()
  const [message, setMessage] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const chooseBackup = async () => {
    if (!android) { file.current?.click(); return }
    const { invoke } = await import('@tauri-apps/api/core')
    const content = await invoke<string | null>('pick_backup')
    if (content !== null) setMessage(`已添加 ${await importTasks(content)} 个任务副本。`)
  }
  const exportData = async () => {
    const content = JSON.stringify({ format: 'dayweave', version: 1, exportedAt: clockIso(), tasks: state.records.map(r => r.task) }, null, 2)
    if ('__TAURI_INTERNALS__' in window) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const path = await save({ defaultPath: `dayweave-${dateKey()}.json`, filters: [{ name: '日序备份', extensions: ['json'] }] })
      if (path) { await writeTextFile(path, content); setMessage('备份已导出。') }
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `dayweave-${dateKey()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
    }
  }
  return <Modal title="设置与同步" close={close}>
    <div className="settings-body"><section><div className="settings-title"><Cloud size={18} /><h3>让任务跟着你走</h3></div><p className="muted">登录同一账号，在手机、电脑与网页间同步。离线时也能继续记录。</p>
      {!cloud ? <p className="notice">当前为本机模式。配置 Supabase 后即可启用云同步。</p> : state.email ? <div className="account-box"><strong>{state.email}</strong><p>{state.syncing ? '正在同步…' : state.lastSync ? '最近同步 ' + new Date(state.lastSync).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '等待首次同步'}</p><div className="row-actions"><button onClick={() => act(syncNow())}>立即同步</button><button onClick={() => act(copyGuestTasks().then(count => setMessage(`已复制 ${count} 个本机任务到当前账号；本机原件保留。`)))}>复制离线任务到账号</button><button onClick={() => act(cloud!.auth.signOut().then(({ error }) => { if (error) throw error }), '已退出，已切换到独立的本机任务空间')}>退出登录</button></div></div> : <EmailOtpForm />}
    </section>
    <section><div className="settings-title"><Folder size={18} /><h3>数据由你保管</h3></div><p className="muted">备份包含当前空间的全部任务及回收站，不包含登录信息。导入会添加副本。</p><div className="settings-actions"><button className="button secondary" onClick={() => act(exportData())}><ArrowDownToLine size={15} />导出备份</button><button className="button secondary" onClick={() => act(chooseBackup())}><ArrowUpFromLine size={15} />导入备份</button><button className="button secondary" onClick={showTrash}><Trash2 size={15} />回收站</button></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { const selected = e.target.files?.[0]; if (selected) act((async () => { if (selected.size > 20 * 1024 * 1024) throw new Error('备份文件不能超过 20 MB'); const count = await importTasks(await selected.text()); setMessage(`已添加 ${count} 个任务副本。`) })()); e.target.value = '' }} /></section>
    {state.email && cloud && <ApiKeys key={state.scope} scope={state.scope} />}
    {!android && <section className="theme-settings"><div className="settings-title"><Sprout size={18} /><h3>外观</h3></div><label>颜色模式<select aria-label="颜色模式" value={theme.preference} onChange={e => theme.setPreference(e.target.value as typeof theme.preference)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">暗黑</option></select></label><p className="muted">默认跟随 Windows 的浅色或暗黑模式，变化时立即生效。</p></section>}
    {!android && <ReminderSettings bridge={reminders} act={act} />}
    <section className="about"><Sprout size={21} /><div><strong>日序 <span>DAYWEAVE</span></strong><p>v0.7.0 · 给并行任务，留一点秩序。</p><small>Android · Windows · 网页 · 离线优先</small></div></section>
    {(message || state.error) && <p className="notice" role="status">{message || state.error}</p>}
    </div>
  </Modal>
}

export default function App() {
  useMobileViewport()
  const theme = useTheme()
  const state = useTasks()
  const [view, setView] = useState<View>('day')
  const [date, setDate] = useState(dateKey())
  const previousToday = useRef(state.today)
  useEffect(() => {
    const previous = previousToday.current
    previousToday.current = state.today
    if (previous !== state.today) setDate(selected => selected === previous ? state.today : selected)
  }, [state.today])
  const [search, setSearch] = useState('')
  const [assignee, setAssignee] = useState('all')
  const [kindFilter, setKindFilter] = useState<TaskKind | 'all'>(() => { const saved = localStorage.getItem('dayweave-kind-filter'); return saved === 'planned' || saved === 'issue' || saved === 'alarm' ? saved : 'all' })
  const [editor, setEditor] = useState<Task | null>(null)
  const [settings, setSettings] = useState(false)
  const [sidebar, setSidebar] = useState(false)
  const [compactFilters, setCompactFilters] = useState(false)
  const [toast, setToast] = useState('')
  const [quickAlarm,setQuickAlarm]=useState(false)
  const openQuickAlarm=useCallback(()=>setQuickAlarm(true),[])
  const reminders=useDesktopReminders(setToast,openQuickAlarm)
  const closeMobileLayer = useCallback(() => {
    if (sidebar) { setSidebar(false); return true }
    if (view !== 'day') { setView('day'); return true }
    return false
  }, [sidebar, view])
  useAndroidBack(closeMobileLayer, setToast)
  const windowMode = useWindowMode(setToast, reminders.upcoming.length)
  const toolbar = useCompactToolbar(windowMode.compact)
  useEffect(() => { if (!android) void initializeLooks().catch(() => setToast('本机背景库无法读取，请检查可用磁盘空间')) }, [])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [collapsed, setCollapsed] = useState<Set<Status>>(() => { try { return new Set(JSON.parse(localStorage.getItem('dayweave-collapsed') || '[]')) } catch { return new Set() } })
  const searchRef = useRef<HTMLInputElement>(null)
  const createTask = () => kindFilter==='alarm'?openQuickAlarm():setEditor({ ...newTask(date), kind: kindFilter === 'issue' ? 'issue' : 'planned', assignee: '自己' })
  useEffect(() => { localStorage.setItem('dayweave-kind-filter', kindFilter) }, [kindFilter])
  useEffect(() => { if (windowMode.compact) { setView('day'); setSearch(''); setAssignee('all'); setSidebar(false) } }, [windowMode.compact])
  useEffect(initialize, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { localStorage.setItem('dayweave-collapsed', JSON.stringify([...collapsed])) }, [collapsed])
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.matches('input,textarea,select,[contenteditable]'))) return; if (e.key.toLowerCase() === 'n') { e.preventDefault(); createTask() } if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [date, kindFilter, view])
  const act = (work: Promise<unknown>, success?: string) => { void work.then(() => { if (success) setToast(success) }).catch(error => setToast(error instanceof Error ? error.message : '操作失败，请重试')) }
  const taskDrag = useTaskDrag(state.scope, (id, status, before, peers) => act(moveTask(id, status, before, peers), '已移入' + statusLabels[status]))
  const navigate = (next: View) => { setView(next); setSearch(''); setAssignee('all'); setKindFilter('all'); setSidebar(false) }
  const selectDate = (next: string) => { setDate(next); setView('day'); setSidebar(false) }
  const tasks = state.records.filter(r => !r.task.deletedAt)
  const todayTasks = tasks.filter(r => r.task.date === date)
  const todayDone = todayTasks.filter(r => r.task.status === 'done').length
  const doing = tasks.filter(r => r.task.status === 'doing')
  const waiting = tasks.filter(r => r.task.waiting && r.task.status !== 'done')
  const pendingSync = state.records.filter(r => r.dirty).length
  const conflicts = state.records.filter(r => r.conflict).length
  const selected = state.records.filter(record => {
    const t = record.task
    if (view === 'trash' ? !t.deletedAt : !!t.deletedAt) return false
    if (view === 'day' && t.date !== date) return false
    if (view === 'done' && t.status !== 'done') return false
    if (assignee !== 'all' && t.assignee !== assignee && !t.steps.some(s => s.assignee === assignee)) return false
    if (kindFilter !== 'all' && taskKind(t) !== kindFilter) return false
    return !search.trim() || [t.title, t.note, t.project, t.assignee, ...t.steps.flatMap(s => [s.title, s.assignee ?? ''])].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  }).sort((a, b) => taskOrder(a.task) - taskOrder(b.task))
  const focus = todayTasks.filter(r => r.task.status !== 'done').sort((a, b) => Number(b.task.starred) - Number(a.task.starred) || Number(b.task.priority === 'high') - Number(a.task.priority === 'high'))[0]?.task
  const overdue = tasks.filter(r => r.task.date < dateKey() && r.task.status !== 'done')
  const weekStart = shiftDate(date, -((parseDate(date).getUTCDay() + 6) % 7))
  const heading = view === 'day' ? '把今天，理出头绪。' : view === 'all' ? '每件事，都有着落。' : view === 'trash' ? '留一点，反悔的余地。' : '做完的事，值得回望。'
  const progress = todayTasks.length ? Math.round(todayDone / todayTasks.length * 100) : 0
  const assignees = [...new Set(tasks.flatMap(r => [r.task.assignee, ...r.task.steps.map(s => s.assignee ?? '')]).filter(Boolean))].sort()
  const railTask = tasks.filter(r => r.task.date === state.today && r.task.status !== 'done').sort((a,b) => Number(a.task.status !== 'doing') - Number(b.task.status !== 'doing') || taskOrder(a.task) - taskOrder(b.task))[0]?.task
  if (windowMode.dock.collapsed) return <div className={'edge-rail edge-' + windowMode.dock.edge}><button aria-label="展开贴边浮窗" title="悬停或点击展开任务列表" onPointerEnter={() => void windowMode.dock.expand()} onFocus={() => void windowMode.dock.expand()} onClick={() => void windowMode.dock.expand()}><span className="rail-task"><span className="rail-status"><i />{railTask ? statusLabels[railTask.status] : '日序'}</span><strong>{railTask?.title || '今天，留一点秩序'}</strong><small>{railTask ? summarySteps(railTask)[0]?.title || railTask.assignee : '悬停展开'}</small></span><Upcoming tasks={reminders.upcoming} /><BeijingClock /></button></div>
  return <div className={"app-shell " + (windowMode.compact ? "compact-mode " : "") + (compactFilters ? "compact-filters-open " : "") + (toolbar.visible ? "toolbar-visible " : "") + (windowMode.native ? "native-window" : "")}>
    {sidebar && <div className="sidebar-scrim" onClick={() => setSidebar(false)} />}
    <aside className={'sidebar ' + (sidebar ? 'visible' : '')}>
      <button className="brand" onClick={() => selectDate(dateKey())} aria-label="日序，返回今天"><span className="brand-symbol"><CheckCheck size={22} /></span><span><strong>日序</strong><small>DAYWEAVE</small></span></button>
      <div className="workspace-label">个人工作空间 <span>PERSONAL</span></div>
      <nav aria-label="主导航">{navItems.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { navigate(item.id); if (item.id === 'day') setDate(dateKey()) }}><item.icon size={18} /><span>{item.label}</span>{item.id === 'day' && <small>{tasks.filter(r => r.task.date === dateKey() && r.task.status !== 'done').length}</small>}</button>)}</nav>
      <div className="sidebar-line" /><MiniCalendar date={date} setDate={selectDate} />
      <div className="sidebar-note"><Sprout size={19} /><p>不必同时做完所有事，<br />只要清楚下一步。</p></div>
      <div className="sidebar-bottom"><button onClick={() => setSettings(true)} className="sync-button">{!state.online ? <CloudOff size={18} /> : <Cloud size={18} />}<span>{!state.online ? '离线 · 本机保存' : state.email ? state.syncing ? '正在同步' : state.error ? '同步待重试' : pendingSync ? `${pendingSync} 项待同步` : '云端已同步' : '本机模式'}</span><i className={state.email && !state.error && state.online ? 'connected' : ''} /></button><button onClick={() => setSettings(true)}><Settings size={18} /><span>设置与同步</span><MoreHorizontal size={16} /></button><div className="profile"><span>{state.email ? state.email.charAt(0).toUpperCase() : '我'}</span><div><strong>{state.email ? state.email.split('@')[0] : '我的日序'}</strong><small>{state.email ? '个人云空间' : '离线也能安心记录'}</small></div></div></div>
    </aside>
    <div className="workspace">{windowMode.compact && <button className="toolbar-sensor" aria-label="显示窗口工具栏" onPointerEnter={toolbar.enter} onPointerLeave={toolbar.leave} onFocus={toolbar.focus} onClick={toolbar.reveal} />}<header onPointerEnter={toolbar.enter} onPointerLeave={toolbar.leave} onFocus={toolbar.focus} onBlur={toolbar.blur} className="topbar" data-tauri-drag-region={windowMode.native ? "deep" : undefined}><div><button className="icon-button mobile-menu" aria-label="打开侧栏" onClick={() => setSidebar(true)}><Menu size={20} /></button><span className="breadcrumb">个人空间 <ChevronRight size={12} /> <strong>{view === 'trash' ? '回收站' : navItems.find(x => x.id === view)?.label}</strong></span></div><div className="topbar-right">{windowMode.controls}<span className="today-label">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(clockDate())}</span><button className="icon-button" aria-label="打开设置" onClick={() => setSettings(true)}><Settings size={17} /></button>{desktop && <button className="icon-button" aria-label="隐藏到托盘" title="隐藏到托盘，提醒继续运行" onClick={()=>act(nativeAction('hide'))}><MonitorDown size={16}/></button>}{windowMode.frameControls}</div></header>
      <div className="workspace-body"><main className="main-content">{windowMode.compact && <div className="compact-summary"><div><strong data-tauri-drag-region>日序 · {date.slice(5).replace("-", "月")}日</strong><small>{todayTasks.filter(r => r.task.status === "doing").length} 进行中 · {todayTasks.filter(r => r.task.status === "todo").length} 待办</small></div><div className="compact-summary-actions">{!android && <button className="icon-button alarm-quick" aria-label="快捷闹钟" title="快捷闹钟" onClick={openQuickAlarm}><Bell size={17}/></button>}<button className="icon-button compact-filter-toggle" aria-label="筛选任务" aria-expanded={compactFilters} onClick={() => setCompactFilters(v => !v)}><Search size={16} /></button><button className="icon-button" aria-label="新建任务" onClick={() => createTask()}><Plus size={19} /></button></div></div>}<div className="page-heading"><div><div className="eyebrow">A LITTLE ORDER, EVERY DAY</div><h1>{heading}</h1><p>{view === 'day' ? `${parseDate(date).getUTCMonth() + 1}月${parseDate(date).getUTCDate()}日，星期${weekdays[parseDate(date).getUTCDay()]} · ${date === dateKey() ? '从容开启今天' : '提前安排，也能回顾过去'}` : view === 'trash' ? '删除的任务仍保留在这里，可以随时恢复。' : view === 'done' ? `已经完成 ${tasks.filter(r => r.task.status === 'done').length} 件事，继续按自己的节奏前进。` : `${tasks.length} 个任务，一处掌握所有进展。`}</p></div><div className="heading-actions">{!android && <button className="button alarm-button" aria-label="快捷闹钟" onClick={openQuickAlarm} disabled={!state.ready}><Bell size={16}/>快捷闹钟</button>}<button className="button primary new-task" aria-label="新建任务" onClick={() => createTask()} disabled={!state.ready}><Plus size={17} /><span>新建任务</span><kbd>N</kbd></button></div></div>
      {view === 'day' && <div className="week-strip"><button className="icon-button week-prev" aria-label="上一周" onClick={() => setDate(shiftDate(date, -7))}><ChevronLeft size={17} /></button>{Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i)).map(day => <button className={'week-day ' + (date === day ? 'selected' : '')} key={day} onClick={() => setDate(day)} aria-label={'选择日期 ' + day} aria-pressed={date === day}><span>周{weekdays[parseDate(day).getUTCDay()]}</span><strong>{parseDate(day).getUTCDate()}</strong><i className={tasks.some(r => r.task.date === day && r.task.status !== 'done') ? 'has-tasks' : ''} /></button>)}<button className="icon-button" aria-label="下一周" onClick={() => setDate(shiftDate(date, 7))}><ChevronRight size={17} /></button></div>}
      <div className="list-toolbar"><div className="search-input"><Search size={16} /><input ref={searchRef} aria-label="搜索任务" placeholder="搜索任务、项目或步骤" value={search} onChange={e => setSearch(e.target.value)} />{search ? <button className="icon-button" aria-label="清空搜索" onClick={() => setSearch('')}><X size={14} /></button> : <kbd>/</kbd>}</div><select aria-label="筛选执行者" value={assignee} onChange={e => setAssignee(e.target.value)}><option value="all">全部执行者</option>{assignees.map(a => <option key={a}>{a}</option>)}</select><button className="icon-button" aria-label="跳转到今天" title="跳转到今天" onClick={() => selectDate(dateKey())}><House size={16} /></button></div>
      <KindFilter value={kindFilter} change={setKindFilter} />
      {state.error && <div className="banner error-banner" role="status"><CloudOff size={16} /><span>{state.error}。任务已保存在本机。</span><button onClick={() => act(syncNow())}>重试</button></div>}
      {conflicts > 0 && <div className="banner"><Flag size={16} /><span>{conflicts} 个任务存在版本冲突。展开任务可选择保留方式。</span></div>}
      {view === 'day' && overdue.length > 0 && <button className="overdue-banner" onClick={() => { navigate('all') }}><span><Circle size={12} />{overdue.length} 件往日任务尚未完成</span><span>查看全部 <ChevronRight size={13} /></span></button>}
      {!state.ready ? <div className="empty-state"><LoaderCircle className="spin" /><h3>正在打开你的日序…</h3>{state.error && <p>{state.error}</p>}</div> : selected.length === 0 ? <div className="empty-state"><span className="empty-icon"><Sprout size={32} strokeWidth={1.4} /></span><h3>{search || assignee !== 'all' || kindFilter !== 'all' ? '还没有找到匹配的任务' : view === 'done' ? '每一个完成，都从开始算起' : view === 'trash' ? '回收站空空的' : '留白的一天，有无限可能'}</h3><p>{search || assignee !== 'all' || kindFilter !== 'all' ? '试试其他关键词，或切换执行者。' : view === 'trash' ? '删除的任务会保存在这里。' : '记下第一件事，再一步一步完成。'}</p>{view !== 'trash' && <button className="button primary" onClick={() => createTask()}><Plus size={16} />新建任务</button>}{state.records.length === 0 && state.scope === 'guest' && !search && <button className="text-button demo-button" onClick={() => act((async () => { for (const t of exampleTasks(date)) await saveTask(t); setExpanded(new Set()) })(), '已添加 5 个可编辑的示例任务')}>先用示例体验一下 <ChevronRight size={13} /></button>}</div> : <div className="task-groups">{(['doing', 'todo', 'done'] as Status[]).filter(status => view !== 'done' || status === 'done').map(status => { const records = selected.filter(r => r.task.status === status); return <section className={'task-group group-' + status + (taskDrag.drag?.status === status ? ' drop-active' : '')} data-drop-status={status} key={status}><button className="group-heading" aria-expanded={!collapsed.has(status)} onClick={() => setCollapsed(current => { const next = new Set(current); next.has(status) ? next.delete(status) : next.add(status); return next })}><ChevronDown size={16} className={collapsed.has(status) ? 'closed' : ''} /><span className="group-dot" /><h2>{statusLabels[status]}</h2><span className="group-count">{records.length}</span><span className="group-line" /></button>{!collapsed.has(status) && (records.length ? <div className="group-list">{records.map(record => <TaskRow key={record.task.id} record={record} dragControl={taskDrag.handle(record.task)} dragging={taskDrag.drag?.task.id === record.task.id} dropBefore={taskDrag.drag?.before === record.task.id && taskDrag.drag?.status === status} expanded={expanded.has(record.task.id)} toggle={() => setExpanded(current => { const next = new Set(current); next.has(record.task.id) ? next.delete(record.task.id) : next.add(record.task.id); return next })} edit={() => setEditor(record.task)} act={act} showDate={view !== 'day'} />)}</div> : <div className="empty-group">{status === 'doing' ? '开始一个任务，让事情向前一步。' : status === 'todo' ? '暂时没有待办，给自己一点留白。' : '每一点完成，都会出现在这里。'}</div>)}</section> })}</div>}
      <footer className="main-footer"><span><Check size={12} />本地优先，随手记录</span><span>{selected.length} 项任务{view === 'day' ? ' · ' + todayDone + ' 项已完成' : ''}</span></footer></main>
      <aside className="focus-panel"><div className="eyebrow">ONE STEP AT A TIME</div><h2>专注当下</h2><div className="progress-ring"><svg viewBox="0 0 160 160" aria-label={`所选日期完成进度 ${progress}%`} role="img"><circle cx="80" cy="80" r="68" className="ring-bg" /><circle cx="80" cy="80" r="68" className="ring-value" strokeDasharray={`${progress * 4.2726} 427.26`} /></svg><div><strong>{todayDone}<span> / {todayTasks.length}</span></strong><small>{date === dateKey() ? '今日' : '所选日期'}进度</small></div></div><p className="focus-caption">给并行任务，留一点秩序。</p><div className="focus-divider" /><div className="focus-label"><Star size={14} />下一件重要的事</div>{focus ? <button className="focus-card" onClick={() => { setView('day'); setSearch(''); setAssignee('all'); setKindFilter('all'); setExpanded(new Set([focus.id])); setCollapsed(current => new Set([...current].filter(s => s !== focus.status))) }}><span className="focus-title"><Circle size={17} />{focus.title}</span><span className="task-meta"><span className={'badge priority-' + focus.priority}>{priorityLabels[focus.priority]}</span><span>{focus.assignee}</span></span>{focus.steps.length > 0 && <small>{focus.steps.filter(s => s.done).length} / {focus.steps.length} 个步骤</small>}</button> : <div className="focus-empty"><Sprout size={24} /><p>{todayTasks.length ? '今天安排的事都完成了。' : '先为这一天安排一件事吧。'}</p></div>}
      <div className="parallel-summary"><div><span className="summary-dot" /><span>并行进行</span><strong>{doing.length}</strong></div><div><span className="summary-dot amber" /><span>等待反馈</span><strong>{waiting.length}</strong></div></div><div className="quiet-note"><span>慢慢来，也很快。</span><p>开始一件事之前，<br />先给正在做的事一个位置。</p><Sprout size={40} strokeWidth={1} /></div><div className="shortcuts"><div><kbd>N</kbd><span>新建任务</span></div><div><kbd>/</kbd><span>快速搜索</span></div><div><kbd>Ctrl ↵</kbd><span>保存编辑</span></div></div></aside></div>
    </div><nav className="mobile-nav" aria-label="手机导航">{navItems.slice(0, 3).map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { navigate(item.id); if (item.id === 'day') setDate(dateKey()) }}><item.icon size={19} /><span>{item.id === 'day' ? '今天' : item.id === 'all' ? '全部' : '已结束'}</span></button>)}<button onClick={() => setSettings(true)}><Settings size={19} /><span>设置</span></button></nav>
    {quickAlarm && <QuickAlarm close={()=>setQuickAlarm(false)} saved={()=>setToast('闹钟已设置，按北京时间提醒')} />}{taskDrag.overlay}{editor && <TaskEditor initial={editor} assignees={assignees} close={() => setEditor(null)} saved={() => setToast('任务已保存')} />}{settings && <Preferences reminders={reminders} theme={theme} close={() => setSettings(false)} act={act} showTrash={() => { navigate('trash'); setSettings(false) }} />}{toast && <div className="toast" role="status"><Check size={15} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>
}
