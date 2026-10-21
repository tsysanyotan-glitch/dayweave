import { describe, expect, it } from 'vitest'
import { fitCrop, moveCrop, resizeCrop } from '../src/crop'
import { compactSize, clampRect, dockRect, nearestEdge } from '../src/windowGeometry'
import { mergeRemote, newTask, readBackup, summarySteps, uuid, validateTask } from '../src/model'
describe('parallel steps and old task compatibility', () => {
  const steps = () => ['完成的步骤', '分析', '实现', '验收'].map((title, i) => ({ id: uuid(), title, done: i === 0 }))
  it('legacy tasks show the next unfinished step, completed tasks show none', () => {
    const task = { ...newTask(), title: '工作', steps: steps() }
    expect(summarySteps(task).map(s => s.title)).toEqual(['分析'])
    expect(summarySteps({ ...task, status: 'done' })).toEqual([])
  })
  it('preserves concurrent selections and per-step executors through validation and backup', () => {
    const task = { ...newTask(), title: '工作', steps: steps().map((s, i) => ({ ...s, active: i < 3, showInSummary: i === 1 || i === 2, assignee: i === 1 ? 'codex' : '自己' })) }
    const checked = readBackup(JSON.stringify({ format: 'dayweave', version: 1, tasks: [task] }))[0]
    expect(checked.steps[0].active).toBe(false)
    expect(summarySteps(checked).map(s => [s.title, s.assignee])).toEqual([['分析', 'codex'], ['实现', '自己']])
    expect(summarySteps({ ...checked, steps: checked.steps.map(s => ({ ...s, showInSummary: false })) })).toEqual([])
    expect(summarySteps({ ...checked, steps: checked.steps.map(s => ({ ...s, done: true })) })).toEqual([])
  })
  it('rejects malformed optional metadata and strips unexpected fields', () => {
    const task = { ...newTask(), title: '工作', steps: [{ id: uuid(), title: '分析', done: false, active: 'yes' }] }
    expect(() => validateTask(task)).toThrow()
    expect(() => validateTask({ ...task, steps: [{ ...task.steps[0], active: true, assignee: 'x'.repeat(81) }] })).toThrow()
    const clean = validateTask({ ...task, steps: [{ ...task.steps[0], active: true, privatePath: 'C:/private' }] })
    expect(clean.steps[0]).not.toHaveProperty('privatePath')
  })
  it('retains known metadata after a legacy client edits surviving steps; explicit clearing wins', () => {
    const scope = uuid(), task = { ...newTask(), title: '工作', steps: [{ id: 'step', title: '分析', done: false, active: true, showInSummary: true, assignee: 'codex' }] }
    const local = { scope, task, serverRevision: 1, dirty: false, mutationId: uuid() }
    const row = { id: task.id, user_id: scope, document: { ...task, note: '旧客户端编辑', steps: [{ id: 'step', title: '分析', done: false }] }, revision: 2, updated_at: task.updatedAt, last_mutation_id: uuid() }
    expect(mergeRemote(local,row).task.steps[0]).toMatchObject({ active: true, assignee: 'codex' })
    expect(mergeRemote(local,{ ...row, document: { ...task, steps: [{ ...task.steps[0], active: false, showInSummary: false, assignee: '' }] } }).task.steps[0]).toMatchObject({ active: false, showInSummary: false, assignee: '' })
  })
})
describe('crop coordinates', () => {
  it('preserves image aspect ratio in portrait and landscape sources', () => {
    for (const source of [.3, 1, 3]) for (const ratio of [1, 4 / 3, 16 / 9]) {
      const rect = fitCrop(source, ratio)
      expect(rect.width * source / rect.height).toBeCloseTo(ratio)
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(1); expect(rect.y + rect.height).toBeLessThanOrEqual(1)
    }
  })
  it('clamps moves and all four resize handles while keeping the opposite corner fixed', () => {
    const rect = fitCrop(2, 1)
    expect(moveCrop(rect, -2, 2)).toMatchObject({ x: 0, y: 1 - rect.height })
    for (const corner of ['nw', 'ne', 'sw', 'se']) for (const delta of [-2, .1, 2]) {
      const next = resizeCrop(rect, delta, delta, corner, 2, 1)
      expect(next.width * 2 / next.height).toBeCloseTo(1)
      expect(next.x).toBeGreaterThanOrEqual(0); expect(next.y).toBeGreaterThanOrEqual(0)
      expect(next.x + next.width).toBeLessThanOrEqual(1.00001); expect(next.y + next.height).toBeLessThanOrEqual(1.00001)
    }
  })
  it('responds to vertical handle drags and independent free cropping', () => {
    const rect = fitCrop(1, 1)
    expect(resizeCrop(rect, 0, -.2, 'se', 1, 1).width).toBeLessThan(rect.width)
    const free = resizeCrop(rect, -.3, -.1, 'se', 1, null)
    expect(free.width).toBeCloseTo(rect.width - .3); expect(free.height).toBeCloseTo(rect.height - .1)
  })
})
describe('window geometry and remembered sizes', () => {
  it('includes the native invisible frame while keeping reminders and clock inside each work-area edge', () => {
    const area={x:-1920,y:-100,width:1920,height:1040},rect={x:-600,y:100,width:500,height:700},frame={width:16,height:16}
    for(const edge of ['left','right','top','bottom'] as const) for(const count of [1,3,5]) {
      const rail=dockRect(rect,area,edge,1.75,count,frame)
      expect(clampRect(rail,area)).toEqual(rail)
      expect(edge==='left'?rail.x-area.x:edge==='right'?rail.x+rail.width-area.x-area.width:edge==='top'?rail.y-area.y:rail.y+rail.height-area.y-area.height).toBe(0)
      expect(rail.width-frame.width).toBe(Math.round((edge==='left'||edge==='right'?76:280+count*80)*1.75))
    }
  })
  it('uses first-run defaults, validates storage and preserves custom sizes', () => {
    expect(compactSize(null)).toEqual({ width: 380, height: 620 })
    expect(compactSize('{broken')).toEqual({ width: 380, height: 620 })
    expect(compactSize('{"width":330,"height":420}')).toEqual({ width: 330, height: 420 })
    expect(compactSize('{"width":64,"height":208}')).toEqual({ width: 280, height: 260 })
  })
  it('docks inside negative-coordinate monitors at 150% DPI on every edge', () => {
    const area = { x: -1920, y: -100, width: 1920, height: 1040 }, rect = { x: -500, y: 200, width: 450, height: 600 }
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const rail = dockRect(rect, area, edge, 1.5)
      expect(nearestEdge(rail, area, 1)).toBe(edge)
      expect(clampRect(rail, area)).toEqual(rail)
      expect(rail.width).toBe(edge === 'left' || edge === 'right' ? 114 : 420)
    }
    expect(nearestEdge(rect, area, 16)).toBe(null)
    expect(clampRect({ ...rect, x: -3000, y: 3000 }, area)).toMatchObject({ x: -1920, y: 340 })
  })
})
