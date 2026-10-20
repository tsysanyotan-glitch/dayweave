# 任务类型补充设计

使用内置 imagegen 工具，先分别生成电脑与手机设计图，再开始编码。两种类型均可处于待办、进行中或已结束，类型不代表优先级。

## 电脑设计提示词

Use case: ui-mockup.
Asset type: Windows desktop UI design for 日序 DayWeave, adding distinction between planned work and incidental small issues.
Primary request: A high fidelity implementable desktop screenshot, warm off-white #fafbf8, pale sage sidebar #edf1e8, forest green #244f42, clean Chinese typography, understated thin borders and ample whitespace. Main daily task list keeps three collapsible status groups 进行中 / 待办任务 / 已结束 and six-dot drag grips, check circles, project tags and chevrons.
Add task TYPE, independent of status or priority. Planned work has a sage clipboard icon and small label 计划任务. Incidental problems have an amber wrench icon, text 零碎问题, a subtle pale amber row tint and short amber left rule. Never rely on color alone. Show one planned task 完成论文方法章节 and small issues 修复电脑蓝牙断连 / 解决浏览器闪退. Both types can be pending, in progress, or complete.
Toolbar shows type filter 全部类型 / 计划任务 / 零碎问题 alongside search. Small secondary task editor inset shows 任务类型 with two choices 计划任务 and 零碎问题, short explanation 临时故障、随手处理的小问题. Preserve current functionality including compact mode, pin, subtasks and local-only outputs.
Composition: one large desktop application screenshot and a modest editor inset. No 3D hardware, gradients, charts, extra workflow states, red error alarms, or decorative illustrations. Readable Chinese, sage regular tasks and muted amber issues, accessible labels and simple consistent icons.

## 手机设计提示词

Use case: ui-mockup.
Asset type: high fidelity mobile UI design board for 日序 DayWeave.
Primary request: Distinguish ordinary planned tasks from incidental small problems, using BOTH icon shape and color, independent of status.
Composition: TWO flat mobile screens side by side on a warm off-white canvas, clean readable Chinese typography. First screen daily task list: date 10月20日, search, a three-option task type filter 全部 / 计划任务 / 零碎问题, and three collapsible status groups 进行中 / 待办任务 / 已结束. Planned work has sage clipboard icon and small text 计划任务. Small incidental issues use amber wrench icon, text 零碎问题, subtle warm cream tint and amber left rule. Examples 完成论文方法章节 / 修复电脑蓝牙断连 / 解决浏览器闪退. Every row retains six-dot drag grip, round completion check and expand chevron. Bottom navigation 今天 / 全部 / 协作 / 设置.
Second screen task editor with task title 修复电脑蓝牙断连. Show 任务类型 as two large selectable cards: sage clipboard 计划任务 and amber wrench 零碎问题 (selected). Explanation 临时故障、随手处理的小问题. Date, status 待办任务, priority 普通 and 保存任务 button. Do not portray incidental issues as automatically urgent.
Colors: warm white #fafbf8, pale sage #edf1e8, forest #244f42, muted amber text #946521 and pale amber background #fff6e7. Functional understated flat UI, generous touch targets, no device frames, no gradients, no marketing captions, no additional workflow states or fake system overlays.
