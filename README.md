# 日序 DayWeave

面向个人与 AI Agent 并行工作的轻量任务应用。Windows 客户端使用 Tauri 2 + 系统 WebView2，界面由 React 与 TypeScript 编写，同一套界面可运行于网页，适配手机屏幕。

![桌面与手机设计方案](docs/design/dayweave-concept.png)

## 首版功能

- 按日期创建任务、提前安排其他日期；周视图、月历与历史日期跳转。
- 待办任务 / 进行中 / 已结束；状态分组和每个任务可展开或折叠。
- 子步骤、备注、项目标签、优先级、今日重点、关联链接。
- 执行者可填自己、Codex、Claude 等；Agent 视图与等待反馈标记。
- IndexedDB 本机保存，Supabase Auth + Postgres + Realtime 账号同步。
- 版本冲突保留双方内容，可选择本机版本、云端版本或保留两个版本。
- 软删除回收站、JSON 备份导入导出、搜索与执行者筛选。
- 响应式布局、键盘快捷键、网页离线缓存与 PWA 安装支持。

## 开发

需要 Node.js 24、Rust stable；Windows 打包需要 Visual Studio C++ Build Tools、Windows SDK 和 WebView2。

```powershell
npm ci
Copy-Item .env.example .env.local
# 在 .env.local 填写项目 URL 和 publishable key
npm run dev
npm run desktop:dev
```

未填写云配置时自动使用本机模式。数据库密码、secret key、service_role key 不应放进客户端或提交到仓库。客户端只使用 URL 与 publishable key，个人任务由数据库 RLS 规则隔离。

## 构建与检查

```powershell
npm test
npm run test:e2e
npm run desktop:build
```

Windows 安装包输出到 `src-tauri/target/release/bundle/nsis/`；`src-tauri/target/release/dayweave.exe` 是可直接运行的程序。安装包为开发首版，尚未配置商业代码签名。

端到端测试默认使用 Playwright Chromium。本机可设 `$env:PLAYWRIGHT_CHANNEL='msedge'` 使用 Edge。测试运行生产构建，覆盖离线刷新、持久化、子步骤、日期、状态、删除恢复和两种屏幕布局。

## 云端初始化

在自己新建的 Supabase 项目中按顺序执行 `supabase/migrations/` 下的迁移。`commit_task` 在登录用户权限下执行，使用版本号进行原子比较，重复请求使用 mutation ID 去重；任务删除作为文档中的墓碑同步。

首次使用：打开「设置与同步」→ 注册邮箱账号 → 完成邮箱确认 → 登录。同一账号的电脑与网页会自动同步。登录前的离线任务保持独立，可用「复制离线任务到账号」手动导入；退出后回到本机任务空间。示例数据只会在主动点击体验按钮后加入本机。

`tests/rls.sql` 可在开发项目用 postgres 权限执行，测试事务会回滚。`scripts/verify-cloud.mjs` 是显式运行的真实云端集成检查，只可使用可清理的开发测试账号；账号文件放在忽略的 `artifacts/` 目录，不会上传。

## GitHub Actions

CI 检查类型、单元测试和桌面 / 手机浏览器交互。手动运行 Windows 工作流可生成安装包；在仓库 Variables 配置 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEY` 才会包含该项目的云连接，未配置时为本机模式。锁定的 npm 与 Rust 依赖均随源码提交。

## 当前边界

- Android 已有响应式界面与共用数据模型，原生 APK 尚未打包；后续需要 Android SDK / NDK 和真机验证。
- 网页构建已可运行，尚未发布公网域名。网页离线功能需要 HTTPS 或 localhost，并至少联网打开一次。
- Agent 执行者与等待反馈用于任务组织，当前不会自动调度外部 Agent，也不会读取其进程状态。
- 循环任务、系统提醒、托盘常驻、全局快捷捕获、Agent Webhook 与自动更新列入后续规划。
- 本机任务默认保存在应用的 WebView 数据目录或浏览器 IndexedDB；应定期导出备份。

更多产品建议、阶段取舍和验收说明见 [产品设计与路线](docs/product-plan.md) 与 [验证记录](docs/verification.md)。
