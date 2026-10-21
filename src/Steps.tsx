import { useId } from 'react'
import { Circle, Eye, Play, X } from 'lucide-react'
import { summarySteps, type Step, type Task } from './model'
export function StepEditor({ steps, change, assignees }: { steps: Step[]; change: (steps: Step[]) => void; assignees: string[] }) {
  const list = useId()
  const patch = (id: string, value: Partial<Step>) => change(steps.map(s => s.id === id ? { ...s, ...value } : s))
  return <><datalist id={list}>{[...new Set(['自己', ...assignees, ...steps.map(s => s.assignee ?? '')].filter(Boolean))].map(a => <option key={a} value={a} />)}</datalist><div className="edit-steps parallel-step-editor">{steps.map((step, i) => <div className="step-editor-row" key={step.id}>
    <div className="step-editor-title"><input aria-label={'子步骤 ' + (i + 1)} maxLength={500} placeholder="一个明确的小步骤" value={step.title} onChange={e => patch(step.id, { title: e.target.value })} /><button type="button" className="icon-button" aria-label={'移除子步骤 ' + (i + 1)} onClick={() => change(steps.filter(s => s.id !== step.id))}><X size={16} /></button></div>
    <div className="step-editor-options"><label>执行者<input list={list} aria-label={'子步骤 ' + (i + 1) + ' 执行者'} maxLength={80} placeholder="沿用任务执行者" value={step.assignee ?? ''} onChange={e => patch(step.id, { assignee: e.target.value })} /></label><label className="step-toggle"><input type="checkbox" disabled={step.done} aria-label={'子步骤 ' + (i + 1) + ' 正在做'} checked={!!step.active && !step.done} onChange={e => patch(step.id, { active: e.target.checked, ...(step.showInSummary === undefined ? { showInSummary: e.target.checked } : {}) })} /><Play size={12} />正在做</label><label className="step-toggle"><input type="checkbox" aria-label={'子步骤 ' + (i + 1) + ' 缩略显示'} checked={step.showInSummary ?? step.active ?? false} onChange={e => patch(step.id, { showInSummary: e.target.checked })} /><Eye size={12} />缩略显示</label></div>
  </div>)}</div>{steps.length > 0 && <p className="field-help">可以同时进行和显示多个步骤；执行者留空时沿用任务标签。未设置时自动显示第一个未完成步骤。</p>}</>
}
export function StepSummary({ task }: { task: Task }) {
  const steps = summarySteps(task)
  if (!steps.length) return null
  return <div className="step-summary" aria-label={'当前步骤：' + task.title}>{steps.map(step => <div key={step.id} className={step.active ? 'active' : ''}>{step.active ? <Play size={11} fill="currentColor" /> : <Circle size={10} />}<span className="step-summary-title">{step.title}</span><span className="step-assignee">{step.assignee || task.assignee}</span></div>)}</div>
}
