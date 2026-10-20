import { useId } from 'react'
export function AssigneePicker({ value, options, change }: { value: string; options: string[]; change: (value: string) => void }) {
  const id = useId()
  const tags = [...new Set(['自己', ...options].map(t => t.trim()).filter(Boolean))].sort((a, b) => a === '自己' ? -1 : b === '自己' ? 1 : a.localeCompare(b, 'zh-CN'))
  const fresh = value.trim() && !tags.includes(value.trim())
  return <div className="assignee-picker">
    <label htmlFor={id}>执行者</label>
    <input id={id} maxLength={80} value={value} onChange={e => change(e.target.value)} placeholder="输入标签名称，例如 codex" aria-describedby={id + '-hint'} />
    <div className="assignee-tags" role="group" aria-label="已用执行者标签">{tags.map(tag => <button type="button" key={tag} aria-pressed={value.trim() === tag} onClick={() => change(tag)} title={tag}>{tag}</button>)}</div>
    <small id={id + '-hint'}>{fresh ? `保存任务时创建「${value.trim()}」标签` : '输入名称即可创建标签；每项任务选择一个执行者。'}</small>
  </div>
}
