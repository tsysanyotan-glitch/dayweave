# DayWeave 个人任务 API v1

接口基址：`https://gacbkkhanzgbvrfwycji.supabase.co/functions/v1/dayweave-api`

[OpenAPI 3.1 JSON（可导入 Postman / Apifox）](https://gacbkkhanzgbvrfwycji.supabase.co/functions/v1/dayweave-api/openapi.json) · [仓库规范](api.openapi.json)

## 1. 获取个人密钥

在 v0.4.0 或更新版本中登录自己的账号，打开「设置与同步 → 让其他服务接入任务」。输入服务名称，选择读取与修改或只读权限，以及 30 / 90 / 365 天有效期，点击创建。

`dw_` 开头的完整密钥只显示一次。将它保存到调用服务的环境变量 / 密钥管理中。列表之后只显示前缀；可以随时撤销，撤销后的新请求立即失效。已经通过鉴权、正在执行的请求仍可能完成。密钥在数据库中只保存 SHA-256 摘要，不写进任务、备份或应用本地存储。建议每个接入服务使用独立密钥。

请求头：`Authorization: Bearer <你的个人密钥>`。不需要 Supabase 数据库密码、publishable key 或 service_role key；个人密钥不是 Supabase 管理平台的 PAT。

所有数据访问都绑定密钥所属用户，不接受请求中指定另一个用户。API 只能访问已登录账号的云任务；登录前的本机任务需先在设置中「复制离线任务到账号」。

## 2. 路由

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/v1/tasks` | 查询任务，排除回收站 |
| GET | `/v1/tasks/{id}` | 单项任务，返回 revision 与 ETag |
| POST | `/v1/tasks` | 新建任务 |
| PATCH | `/v1/tasks/{id}` | 局部更新，未传的字段保留 |
| DELETE | `/v1/tasks/{id}` | 软删除，可从客户端回收站恢复 |

GET 需要 `tasks:read`；写操作需要 `tasks:write`。创建时的读写选项同时具备两项权限。

列表参数：`date=2026-10-21`、`status=todo|doing|done`、`limit=1..100`（默认 50）、`offset=0..100000`（默认 0）。按任务 ID 升序分页，响应包含 `nextOffset`；满页可能还需请求下一页确认结束。分页是实时查询，批量编辑期间不保证一致快照。

列表响应：

```json
{"data":[{"task":{"id":"…","title":"检查交付","date":"2026-10-21","status":"doing"},"revision":1}],"limit":50,"offset":0,"nextOffset":null}
```

示例中的 task 做了省略；实际返回完整任务字段。单项与写入响应为 `{"data":{"task":{…},"revision":1}}`，并带 `ETag: "1"`。

## 3. 新建与修改字段

POST 必填 `title` 和 `date`；可选 UUID `id`，省略时以 `Idempotency-Key` 作为任务 ID。服务器生成创建和更新时间。

| 字段 | 类型 / 限制 | 默认值 |
| --- | --- | --- |
| title | 非空字符串，最多 300 字符 | 必填 |
| date | 有效日历日期 `YYYY-MM-DD` | 必填 |
| status | `todo` / `doing` / `done` | `todo` |
| kind | `planned`（计划）/ `issue`（零碎问题） | `planned` |
| priority | `high` / `medium` / `low` | `medium` |
| assignee | 自定义执行者标签，最多 2000 字符 | `自己` |
| project / link | 字符串，各最多 2000 字符；link 为空或 http(s) 地址 | 空字符串 |
| note | 字符串，最多 20000 字符 | 空字符串 |
| starred / waiting | 布尔值 | false |
| steps | 最多 200 个 `{id,title,done}`，ID 唯一，标题 1–500 字符 | `[]` |
| order | 有限数字，绝对值不超过 1e16 | 自动排序 |
| alarm | 布尔值；true 表示快捷闹钟，kind 仍保存 planned | 省略 |
| deadlineAt | UTC ISO 时间，必须以 Z 结尾；null 明确取消截止 | 省略 |
| reminderAt | UTC ISO 时间，不晚于 deadlineAt；null 关闭提醒 | 省略 |

v1.2（Windows v0.7.0）支持提醒字段。例如北京时间 2026-10-21 16:00 的闹钟：

```json
{"title":"提交报告","date":"2026-10-21","kind":"planned","alarm":true,"deadlineAt":"2026-10-21T08:00:00Z","reminderAt":"2026-10-21T08:00:00Z"}
```

普通任务可以只设置 deadlineAt；提前 15 分钟提醒时，将 reminderAt 设置为 deadlineAt 减 15 分钟。闹钟要求两项时间均存在。API 本身不发送通知：Windows 客户端在运行或托盘驻留时负责提醒；休眠/完全退出期间不唤醒电脑，恢复后补提醒。本机的已知晓记录、5 分钟稍后提醒和开机/托盘设置不进入任务 API。

早期客户端可把闹钟当作 planned 任务读取，不支持提醒 UI。旧版编辑可能省略这些可选字段；Windows 会保留本机已经知道的提醒信息，明确关闭请传 alarm=false、deadlineAt=null、reminderAt=null。新设备无法恢复云端被旧版覆盖的字段。

PATCH 仅传要改的字段即可。`steps` 按整个数组替换：更改一步时先读取，再保留其余步骤一起提交。标记完成通常传 `{"status":"done","waiting":false}`。

禁止写 `user_id`、`createdAt`、`updatedAt`、`deletedAt`、`outputs` 或本机路径；未知字段返回 400。删除请用 DELETE。API 可读文件名称等产出元数据，不能读取本机文件、替换附件或触发上传；文件是否上云仍由客户端逐项确认。

## 4. 版本冲突与重试

v1.1 新增可选子步骤字段（Windows v0.6.0）：`assignee`（最多 80 字，留空沿用任务执行者）、`active`（正在做）、`showInSummary`（在折叠行显示）。多个步骤可同时为 true；已完成步骤不会出现在折叠摘要中。示例：

```json
{"steps":[{"id":"step-a","title":"界面开发","done":false,"assignee":"codex","active":true,"showInSummary":true},{"id":"step-b","title":"查阅资料","done":false,"assignee":"自己","active":true,"showInSummary":true}]}
```

`steps` 仍是整组替换，提交时保留其他步骤及其可选字段。明确清空标记请传 `false`，清空执行者请传空字符串。任务背景、裁剪素材、颜色模式和窗口尺寸是当前电脑的设置，不进入 API 文档或任务云端数据。

早期客户端（含 Android v0.5.0）只识别基础步骤字段；旧版编辑可能省略新增字段。Windows 会为本机已知、ID 未变的步骤保留这些标签，但新设备不能恢复云端已经被旧版覆盖的标记。需要管理并行步骤时请在 Windows v0.6.0 操作。

每次 POST / PATCH / DELETE 都必须带 `Idempotency-Key: <新的 UUID>`。同一次操作因网络中断而重试时，复用同一个 UUID、路径和请求体；新操作换一个 UUID。相同任务最后一次写入的重试返回原结果，不重复创建或修改；该任务后来被别人修改后，旧请求返回 409，不能无限期重放。

PATCH / DELETE 还必须带 `If-Match: <最近读取的 revision>`，例如 `If-Match: 3` 或 `If-Match: "3"`。网关可能返回 `ETag: W/"3"`，同样可以原样传入 If-Match；这里按数字版本比较。版本已变化会返回 409；重新 GET 并合并修改，再以新 revision 和新幂等 UUID 提交，避免覆盖客户端或另一服务的更新。不要盲目循环覆盖。

客户端每天把过去日期仍处于 doing 的任务移到当天，并保持原任务 ID；跨零点、唤醒或再次打开时处理，离线变化联网后同步。待办、已结束、未来任务不受影响；关闭所有客户端期间不会运行客户端的顺延逻辑，下次打开时补齐。API 返回当时云端已保存的日期和版本；顺延也是一次版本变化。

## 5. 调用示例

PowerShell（将真实密钥放入当前进程的 `DAYWEAVE_API_KEY` 环境变量）：

```powershell
$base = 'https://gacbkkhanzgbvrfwycji.supabase.co/functions/v1/dayweave-api'
$headers = @{ Authorization = "Bearer $env:DAYWEAVE_API_KEY" }
# 查询
$list = Invoke-RestMethod "$base/v1/tasks?status=doing" -Headers $headers
# 新建；同一次网络重试保留这个 UUID 和请求体
$createHeaders = $headers.Clone()
$createHeaders['Idempotency-Key'] = [guid]::NewGuid().ToString()
$body = @{ title='检查 Codex 交付'; date='2026-10-21'; status='doing'; assignee='codex'; kind='planned' } | ConvertTo-Json
$created = Invoke-RestMethod "$base/v1/tasks" -Method Post -Headers $createHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
# 用创建结果的版本修改；若期间有其他修改，请重新读取
$updateHeaders = $headers.Clone()
$updateHeaders['Idempotency-Key'] = [guid]::NewGuid().ToString()
$updateHeaders['If-Match'] = [string]$created.data.revision
$change = @{ status='done'; waiting=$false; note='已检查测试结果' } | ConvertTo-Json
$updated = Invoke-RestMethod "$base/v1/tasks/$($created.data.task.id)" -Method Patch -Headers $updateHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($change))
```

Node.js 24 / 支持 fetch 的服务：

```javascript
const base = 'https://gacbkkhanzgbvrfwycji.supabase.co/functions/v1/dayweave-api'
const authorization = `Bearer ${process.env.DAYWEAVE_API_KEY}`
const mutation = crypto.randomUUID()
const response = await fetch(`${base}/v1/tasks`, {
  method: 'POST',
  headers: { authorization, 'Content-Type': 'application/json', 'Idempotency-Key': mutation },
  body: JSON.stringify({ title: '修复蓝牙问题', date: '2026-10-21', kind: 'issue', assignee: 'codex' })
})
const result = await response.json()
if (!response.ok) throw new Error(JSON.stringify(result.error))
console.log(result.data.task.id, result.data.revision)
```

## 6. 错误与限制

错误格式：`{"error":{"code":"revision_conflict","message":"…"},"requestId":"…"}`。

请求体和合并后的完整任务文档均限制为 256 KiB；修改少数字段时也会检查最终任务大小。UUID 支持大小写输入，服务端统一保存为小写。

| HTTP | 含义 |
| --- | --- |
| 400 | 字段、日期、分页或幂等 UUID 无效 |
| 401 | 未提供密钥、密钥错误、过期或已撤销 |
| 403 | 密钥缺少操作所需权限 |
| 404 | 路由无效、任务不存在 / 已删除，或任务不属于当前账号 |
| 405 | 当前路由不支持该方法 |
| 409 | 版本冲突，需重新读取并合并 |
| 413 | 请求体超过 256 KiB |
| 415 | POST / PATCH 未使用 application/json |
| 428 | PATCH / DELETE 缺少有效 If-Match |
| 429 | 单个密钥每分钟超过 60 次，按 Retry-After 等待 |
| 503 | 后端暂不可用，稍后重试 |

响应包含 `X-Request-Id`。限流为每密钥的固定 60 秒窗口，失败请求也可能计数。CORS 允许带显式 Bearer 密钥的跨域请求；不要把个人密钥放入公共网页源码或提交到 GitHub。

## 7. 自托管 / 新项目部署

顺序执行仓库迁移，部署 `supabase/functions/dayweave-api/index.ts` 及其相对依赖 `handler.ts`、`src/model.ts`、本 OpenAPI JSON。函数名为 `dayweave-api`，`verify_jwt=false`：入口使用个人密钥自行鉴权，每次请求通过仅服务端可执行的 `authorize_task_api` 验证。

Supabase Edge Runtime 自动注入 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，服务端 key 仅用于函数内部；客户端始终只含 publishable key。`commit_task_api` 仅授予 service_role 执行权限，以原子版本比较写入并触发原有 Realtime；普通用户不能直接调用它指定其他用户。部署其他项目时同步修改 OpenAPI servers 和客户端云配置。

相关官方说明：[Edge Function 鉴权](https://supabase.com/docs/guides/functions/auth-headers)、[函数环境变量](https://supabase.com/docs/guides/functions/secrets)、[数据库 RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
