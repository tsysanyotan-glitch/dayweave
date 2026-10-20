# 第二版设计图提示词

使用内置 imagegen 生成，先完成两张设计图再编码。

## Windows 桌面与精简浮窗

Use case: ui-mockup.
Asset type: high fidelity Windows desktop product design board for DayWeave 日序, a personal daily todo application.
Generate a polished 1920x1200 landscape presentation with one large desktop application view plus a compact floating window inset and an attachment detail inset, all coherent actual implementable software UI. Existing identity: warm off-white #fafbf8, pale sage sidebar #edf1e8, deep forest green #244f42, muted sage accents, light fine borders, clean Chinese typography, generous whitespace, understated editorial style. No decorative 3D devices, no gradients.
Main desktop: left navigation 日序 / 我的一天 / 全部任务 / Agent 协作 / 已结束 with month calendar. Header 10月20日 and task list three vertical sections 进行中, 待办任务, 已结束. Task rows have a six-dot drag grip, round completion checkbox, project and executor labels, substep count, expand chevron. Show one lifted task being dragged between groups with a green highlighted drop target in 进行中 and understated label 松开以移入进行中. Top right toolbar shows 精简模式 and a pin button 窗口置顶.
A completed task expanded in main view called 完成论文方法章节, with output section 任务产出 and two rows 方法章节.pdf (本机文件) and 实验项目 (本机文件夹), folder and document icons. Each local row has 打开 / 上传到云端. Small muted explanation 文件默认保留在本机. A third row 结果摘要.pdf shows 云端可查 with 下载 / 移除云端. Local storage and cloud availability must look clearly different. Do not imply automatic upload.
Compact window inset about 360px wide with draggable titlebar 日序 · 精简, pin icon active, return-to-full icon and minimize icon. Date, tiny counts 进行中2 待办3, five single line tasks with drag grips, checkbox, status badge, optional attachment indicator. Rounded but understated framed real window. It floats at upper right on neutral desktop.
Attachment detail inset shows selected local project folder, label 仅这台电脑, explicit green action 上传文件供手机查看; folder instruction 选择文件夹中的文件 separately to avoid suggesting a filesystem path works on phones.
Readable concise Chinese labels, no giant marketing slogan, no fake security certification, no public sharing buttons, no file contents in cloud unless explicitly marked. Visually consistent desktop product design with realistic information density.

## 移动端交互与任务产出

Use case: ui-mockup.
Asset type: high fidelity Android mobile interface design board for 日序 DayWeave personal todo application, companion to a Windows sage-green and warm-white app.
Generate a landscape board with THREE large flat mobile app screens side by side, clean readable Chinese typography, warm offwhite background #fafbf8, fine borders, forest green #244f42 and pale sage accents. No 3D tilted hardware, no promotional slogan, no gradients.
Screen 1 我的今天: date 10月20日, add button, horizontal week selector, three vertical collapsible groups 进行中 / 待办任务 / 已结束. Each row has six-dot drag grip, circle completion check, task title, tiny executor/project badges, expand chevron. A task is visibly lifted by its grip with green highlight drop area in 进行中. A compact instruction 按住把手拖动 and accessible three-dot action. Bottom nav 今天 / 全部 / 协作 / 设置. Mobile drag should look touch-friendly, no desktop-style hover-only action.
Screen 2 completed task detail 完成论文方法章节: 已结束 status chip, completed substeps, 任务产出 section. Three rows: 方法章节.pdf with 云端可查 green badge and 查看 button; 实验项目 with 仅在电脑 folder badge and explanation 请在原电脑上传文件后查看; 原始数据.csv with 仅在电脑 badge. An explanatory banner 本机文件不会自动上传. Show a tiny 云端下载 affordance only on the cloud file, no fake open button on inaccessible local folder.
Screen 3 a task sheet with 文件 / 本机与云端 tabs or clearly visible output section. Show a cloud-ready attachment 方法章节.pdf, signed private access implied by a small 锁 icon and 仅当前账号 label, with action 查看文件 and 保存到本机. Lower panel demonstrates status action selection 待办任务 / 进行中 / 已结束, supporting users who cannot drag. Header also includes 精简列表 toggle; on mobile this makes a dense task list rather than claiming an Android system always-on-top overlay. Small caption 电脑端支持置顶浮窗 at footer, not a mobile overlay permission prompt.
Style understated, functional Chinese productivity tool, generous touch targets and believable real app design. Distinguish local references from explicitly uploaded cloud copies. No public share links, no automatic cloud upload, no personal filenames beyond given examples, no security certification claims.
