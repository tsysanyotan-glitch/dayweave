# Windows 0.6.0 编码前设计

生成工具：内置 imagegen；图稿：[dayweave-windows-v060.png](dayweave-windows-v060.png)。2026-10-21 生成，之后开始界面编码。图稿中的附加示例导航不纳入功能范围，沿用现有应用导航。

## 提示词

Use case: ui-mockup. Asset: one polished high-resolution desktop UI design board, landscape 3840x2160 if possible, for the existing Windows Chinese task app 日序 DayWeave version 0.6.0. This is a pre-implementation design, with seven legible labeled artboards arranged as a coherent product specification. Keep its established warm ivory #fafbf8, sage green accents and dark forest green text, fine hairline dividers, rounded task cards, calm typography. Windows app only, no phones. NO browser chrome, NO decorative unrelated photos or marketing.

Artboards:
1 "完整界面 · 浅色": familiar left sidebar, day navigation, task groups 进行中 / 待办 / 已结束; cards can have subtle custom background colors and one low-opacity landscape background. A collapsed parent "[日序]完善开发" has below the title/executor row two compact current step rows "接口联调 · codex" and "桌面回归 · 自己", each with small active indicator and assignee chip, showing concurrent steps cleanly.
2 "完整界面 · 跟随系统暗色": same information in dark charcoal #171c19 surfaces, muted sage borders, pale cream text, no white panels or glaring light backgrounds; controls all readable.
3 "精简窗口 · 记住大小": narrow 360x600-ish floating task list on a neutral Windows desktop backdrop. Parent rows and selected substeps visible. Header window controls disappear in idle, leaving task content space; very subtle top hover reveal affordance. Show a second smaller 320x420 customized instance labeled 上次大小.
4 "贴边浮窗": on right screen edge a slim rounded tab, showing only the first in-progress task and its active step, no entire task list. A simple arrow shows hover expands back into the remembered compact window, and leaving pointer docks again. Keep the edge tab useful with a readable short task title rather than just an icon.
5 "任务外观": task editor subsection with choice 默认, 颜色, 图片; accessible swatch buttons, default selected, saved custom background thumbnail shelf and "上传并制作背景". Preview of task card remains legible.
6 "图片背景制作": dialog with local landscape image preview (abstract misty green hills), actual crop rectangle and drag handles, zoom slider, crop ratios 自由 / 16:9 / 4:3 / 1:1, opacity slider with value 18%, preview of task title over background, background name input and button "保存为可选背景". Image layer opacity only, task text fully opaque.
7 "并行步骤": task editor with step title, assignee editable tags e.g. 自己/codex/gemini, independent "正在做" toggle and "缩略显示" checkbox per step, select several concurrently; display checked active choices below collapsed parent row.

Precise hierarchy, realistic compact densities, crisp readable Chinese labels, clean vector-like product mockup fidelity. Use notes sparingly for hover and persistence behavior. Preserve existing identity. Make all requested behavior visually reviewable.
