# Windows v0.7.1 统一北京时间

仅更新 Windows 客户端，不重建 Android 安装包。保留现有界面布局，调整时间来源及日期逻辑。

## 行为

- 主界面“今天”、星期、周视图、月历、默认新任务日期均按北京时间计算。
- 进行中任务在北京时间 00:00 顺延；跨多天重新打开时直接顺延到北京日期的今天。历史日期浏览、待办、已结束、未来任务和冲突记录沿用原规则。
- 快捷闹钟、普通任务截止和提醒、5 分钟后提醒、浮条时钟与最近截止排序共用同一时间来源。
- 新建/编辑/删除/备份/最近同步时间、验证码重发倒计时、个人密钥有效期，以及登录 SDK 的令牌过期计算同样使用校准时间。
- 云端和任务中的绝对时间仍保存为 UTC ISO 字符串；界面显示和日期归属固定为北京时间。旧任务的安排日期不作时区转换或批量迁移。

## 时间来源与离线边界

原生后台通过 HTTPS `HEAD` 请求读取服务器的 `Date` 响应头，首选项目域名 `gacbkkhanzgbvrfwycji.supabase.co`，不可达时使用 `www.baidu.com`。请求不携带账号、令牌或任务内容；使用系统代理配置，保留 TLS 证书验证。请求随机化查询参数并要求不缓存，拒绝 `Age > 0` 或往返超过 4 秒的结果。HTTP 日期精确到秒，加入半秒及往返时延补偿，适合本应用按分钟设置的提醒，不作为高精度授时工具。

校准后以 Windows `GetTickCount64` 运行计数推进 UTC，不调用系统日期时钟。该计数包含睡眠和休眠时间；[微软说明](https://learn.microsoft.com/en-us/windows/win32/sysinfo/windows-time)。正常每 10 分钟重新校准；联网、恢复前台和后台检测到唤醒时请求校准，短时间重复触发会合并，失败后每 30 秒重试。主界面每 15 秒通过本机 IPC 更新锚点，并在恢复前台时立即更新。

可信锚点保存在当前用户的易失注册表子键中，同一次 Windows 登录期间可跨应用退出/重开继续计时；断网仍可操作已经加载的任务并触发提醒。完整关机或用户注销后缓存失效；系统快速启动/休眠的实际缓存生命周期由 Windows 决定。运行计数倒退时拒绝缓存。易失键说明见 [RegCreateKeyExW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regcreatekeyexw)。

没有可信缓存且无法联网时，只显示“正在获取北京时间”，不会打开任务库、按错误日期顺延或生成时间戳。联网校准成功后自动进入应用。此边界是避免依赖电脑时钟的必要取舍。应用不会修改 Windows 的时间、时区或时间同步设置。TLS 握手仍由 Windows 校验证书；若电脑日期错误到导致证书校验失败，需恢复有效的系统日期或网络环境才能首次校准。

隐藏到托盘后原生提醒继续运行；完全退出、关机或睡眠时不发提醒、不唤醒电脑，恢复运行后按校准时间补提醒。未添加操作系统后台服务。

## 验证

41 项逻辑测试、3 项 Rust 测试、36 项桌面/移动尺寸浏览器回归通过。新增覆盖北京零点/跨年/闰日、设备时钟错误、断网后单调推进、登录 SDK 所用 Date 兼容性；洛杉矶时区下的界面测试验证北京零点顺延和历史日期保留。

Windows 原生交付程序另使用独立 WebView2 数据目录检查真实 HTTPS 校准、设备时间固定为 2001 年和 Honolulu 时区时的显示、北京跨年、前台恢复、四边浮条、冻结/隐藏主页面时的置顶闹钟、离线重启沿用校准、无缓存离线启动不碰任务库。未调整真实 Windows 时钟、时区，未执行真实系统注销或关机。

## 开发

`src/time.ts` 为任务模型及服务端可共享的纯时间接口。Windows 在动态加载模型、任务库和 Auth SDK 前完成校准；`src/clock.ts` 将原生时间提供给页面，并校准 Date 无参构造和 Date.now，以覆盖 SDK 内部的有效期判断。其他未发布的端保持现有时间来源，公共日期工具现统一北京日期语义。

`src-tauri/src/clock.rs` 使用 Windows 自带 WinHTTP、运行计数和注册表接口，没有新增运行库依赖。测试时间注入和模拟断网仅在隔离测试启动环境启用，普通应用拒绝注入。后续重新部署任务 API 时，共享模型新增的 `src/time.ts` 也必须包含在部署依赖中；本轮未修改线上 API 或账号数据。

```powershell
rtk npm test
$env:PLAYWRIGHT_CHANNEL='msedge'
rtk npm run test:e2e
rtk cargo test --lib --manifest-path src-tauri/Cargo.toml
rtk npm run desktop:build
powershell -NoProfile -File tests/windows/run.ps1 -Executable artifacts/release/DayWeave_0.7.1_x64.exe
```
