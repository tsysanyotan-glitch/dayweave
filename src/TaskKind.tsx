import { Bell, ClipboardList, Wrench } from 'lucide-react'
import { android } from './platform'
import { kindLabels, type TaskKind } from './model'

export function KindIcon({ kind }: { kind: TaskKind }) {
  const Icon = kind === 'alarm' ? Bell : kind === 'issue' ? Wrench : ClipboardList
  return <span className={'task-kind-icon kind-' + kind} role="img" aria-label={kindLabels[kind]} title={kindLabels[kind]}><Icon size={16} /></span>
}

export function KindPicker({ value, change }: { value: TaskKind; change: (kind: TaskKind) => void }) {
  return <fieldset className="kind-picker"><legend>任务类型</legend><div>
    {(['planned', 'issue', ...(!android?['alarm'] as const:[])] as const).map(kind => <label key={kind} className={'kind-choice kind-' + kind + (value === kind ? ' selected' : '')}>
      <input type="radio" name="task-kind" aria-label={kindLabels[kind]} value={kind} checked={value === kind} onChange={() => change(kind)} />
      <KindIcon kind={kind} /><span><strong>{kindLabels[kind]}</strong><small>{kind === 'alarm'?'按北京时间到点提醒':kind === 'issue' ? '临时故障、随手处理的小问题' : '有明确目标和计划的工作'}</small></span>
    </label>)}
  </div></fieldset>
}

export function KindFilter({ value, change }: { value: TaskKind | 'all'; change: (kind: TaskKind | 'all') => void }) {
  return <div className="kind-filters" role="group" aria-label="筛选任务类型">
    {(['all', 'planned', 'issue', ...(!android?['alarm'] as const:[])] as const).map(kind => <button key={kind} className={'kind-filter kind-' + kind} aria-label={'筛选：' + (kind === 'all' ? '全部类型' : kindLabels[kind])} aria-pressed={value === kind} onClick={() => change(kind)}>
      {kind !== 'all' && <KindIcon kind={kind} />}{kind === 'all' ? '全部类型' : kindLabels[kind]}
    </button>)}
  </div>
}
