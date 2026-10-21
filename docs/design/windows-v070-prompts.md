# Windows v0.7.0 提醒与托盘设计

使用内置 ImageGen。先生成设计稿，再开始功能编码。用户截图作为浮条布局参考。

设计稿：`dayweave-windows-v070-reminders.png`。

## 最终提示词

```text
Use case: ui-mockup
Asset type: Windows DayWeave v0.7 reminder and tray feature design board BEFORE coding.
Input image: latest attached dark vertical rail is a visual/layout reference, keep its Beijing clock and quiet green colors.
Primary request: complete a coherent Windows desktop reminder UX with quick alarms DISTINCT from ordinary task deadlines, and startup/system tray options.
Composition: polished high-fidelity single design board with 6 clearly labeled panels in a balanced grid. (1) Existing dark vertical edge rail: first task at top, a compact upcoming reminder block in the middle red-box area of the reference (no red box in final), Beijing clock/date at bottom; show "最近提醒", amber bell, "16:00", "提交报告"; 2 entries alternative alongside with "16:30 休息一下", user can set 1–5 visible. (2) Full light main task page in existing DayWeave sage style, top actions "+ 新建任务" and purple bell "快捷闹钟"; normal task has small "今天 17:30 截止" amber badge, alarm has purple bell and "闹钟" label and clear time; keep doing/todo/done groups. (3) Minimal quick alarm dialog titled "快捷闹钟", fields "提醒内容" and "北京时间", date "2026-10-21" and time "16:00", quick "+5 分钟", "+15 分钟", "+30 分钟", primary "设置提醒". (4) Normal task editor shows optional "截止时间（北京时间）" and "提前提醒" with choices "到点提醒", "提前 5 分钟", "提前 15 分钟", "不提醒"; no extra wizard. (5) Prominent foreground always-on-top alert with violet bell, title "时间到了", text "提交报告", scheduled "北京时间 16:00", buttons "5 分钟后", "我知道了", "完成任务"; support multiple overdue items in a readable list. (6) Windows settings and tray: toggles "开机启动" OFF, "启动后隐藏到托盘" OFF, "关闭窗口时隐藏到托盘" ON, select "浮条最近提醒数量 1"; tray menu with "显示日序", "快捷闹钟", "暂停声音", "退出日序"; tray icon shown in Windows lower-right notification area.
Style: flat native-feeling React desktop UI, slim borders, readable sans serif Chinese, sage/off-white and deep forest dark theme, violet indicates alarm and amber indicates ordinary deadlines. Grid labels may be outside panels. Illustrate dark and light without wallpaper or decoration.
Functional logic captions small outside panels: "全部时间按北京时间", "后台托盘驻留仍提醒", "完成或删除后停止提醒", "休眠恢复补提醒"; do not claim waking a fully powered-off PC.
Constraints: preserve existing DayWeave vocabulary and Beijing clock; no new collaboration tab; no mobile UI; no repeated alarm or calendar sync features. Avoid red annotation, marketing copy, watermark. Prioritize all six panels legible.
```
