# QA、代码质量与性能检查

## 每轮基础检查

- `npm run typecheck`
- `npm run build`
- `npm run cf:check`
- `npm run verify:launch`
- 本地打开页面，验证首页、投递、打捞、安利墙、任务和后台数据。

## 功能检查

- 未登录用户能浏览首页，但投递、打捞、保存会进入登录或演示身份。
- 投递图片必须校验格式、大小、标题、游戏名、推荐理由字数和敏感词。
- 打捞会消耗次数，且同账号不会重复打捞同一瓶子。
- 保存到安利墙时，槽位可替换，4 宫格/9 宫格布局可切换。
- 分享、投递、拉新任务不超过每日上限。

## 性能检查

- 首屏不依赖巨大图片；示例图按合理尺寸加载。
- API 返回只包含当前页面所需字段。
- `/media/*` 使用缓存头，避免重复回源读取 R2。
- Worker 不使用全局可变请求状态。
- D1 查询使用 prepared statements 和必要索引。

## 100 轮小步迭代记录方式

每轮按“发现 -> 修复 -> 验证 -> 记录”执行。完成一批有意义修订后，在 `PROJECT.md` 写明变更、验证结果、剩余风险和下一步。

## 已完成轮次

### 第 1 轮：首版上线与质量修订

- 功能：投递、打捞、保存安利墙、分享任务、运营数据、R2 图片代理。
- 后端：Cloudflare Worker + D1 + R2 + KV + Queue，远端资源创建并部署。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check`、`npm audit --audit-level=moderate` 全部通过。
- 浏览器：Playwright fallback 验证本地和线上桌面首屏、移动端无横向溢出、核心交互流程通过。
- 性能：示例图转为 WebP，`public/samples` 约 72KB，`dist/client` 约 332KB。
- 修复：去除外链示例图依赖、图片失败兜底、去除遮挡 UI 的固定演示身份浮层、Worker Env 改为从 Wrangler 生成类型派生。

### 第 2 轮：后台访问风险修订

- 发现：`/api/admin/metrics` 只要求登录，缺少管理员白名单。
- 修复：新增 `ADMIN_USER_IDS` 环境变量和 `requireAdminUser`，生产环境必须命中白名单才能访问后台指标接口。
- 验证：`npm run cf:types`、`npm run typecheck`、`npm run build`、`npm run cf:check` 通过。
- 部署：Cloudflare API 恢复后已补推上线。

### 第 3 轮：Turnstile 可选接入

- 发现：投递表单缺少商业上线常用的人机校验入口。
- 修复：新增 `TurnstileWidget`、`verifyTurnstile`、`TURNSTILE_SITE_KEY`、`TURNSTILE_REQUIRED` 与 `TURNSTILE_SECRET_KEY` 说明；后端在投递接口调用 Cloudflare `siteverify`。
- 验证：本地 Playwright 在无 Turnstile key 的预览配置下完成投递，`security.turnstileRequired=false`，无 console error、无失败请求。
- 部署：已部署到 Workers 预览地址。

### 第 4 轮：后台默认拒绝与错误响应

- 发现：线上预览环境 `ENVIRONMENT=development` 且 `ADMIN_USER_IDS` 为空时，`/api/admin/metrics` 仍返回数据。
- 修复：移除开发环境空白名单放行逻辑；增加 Hono `app.onError`，确保 API 错误返回 JSON。
- 验证：本地与线上 `/api/admin/metrics` 未授权均返回 403 `admin_required`；`npm run typecheck`、`npm run build`、`npm run cf:check` 通过。
- 浏览器：线上桌面与移动端 Playwright 验证 8 张卡片、0 图片 fallback、无横向溢出、无 console error、无失败请求。
- 部署：Workers Version ID `fad9c95a-ef0c-476d-b4a9-34fea639ed8a`。

### 第 5 轮：预期拒绝不走异常日志

- 发现：本地 dev server 停止前可见 `/api/admin/metrics` 的预期 403 曾打印 `ApiError` stack。
- 修复：新增 `isAdminUser` 布尔判断，后台未授权在路由内直接返回 JSON 403，删除旧的 `requireAdminUser` helper。
- 验证：`npm run typecheck`、`npm run build`、业务代码危险模式扫描、`npm run cf:check` 通过。
- 线上：`/api/health` 正常，`/api/bootstrap` 正常，`/api/admin/metrics` 未授权返回 403 `admin_required`。
- 部署：Workers Version ID `76baf0a0-290f-41c7-ae14-6164331ba48c`。

### 第 6 轮：Production 环境绑定检查

- 发现：Wrangler 命名环境不会自动继承 bindings；若直接部署 `env.production`，可能缺 D1/R2/KV/Queue。
- 修复：在 `wrangler.jsonc` 的 `env.production` 显式补齐 `d1_databases`、`r2_buckets`、`kv_namespaces`、`queues`。
- 工具：新增 `npm run build:production` 与 `npm run cf:check:production`。
- 验证：`npm run cf:types` 生成的 `ProductionEnv` 包含 `DB`、`BOTTLE_IMAGES`、`GH_CONFIG`、`MODERATION_QUEUE`；`npm run build:production` 与 `npm run cf:check:production` 通过。
- 部署：未部署 production；生产仍需真实 Clerk/Turnstile secrets。

### 第 7 轮：R2 孤儿对象失败路径

- 发现：投递接口先写 R2 图片，再写 D1 元数据；若 D1 写入失败，可能留下无元数据引用的 R2 对象。
- 修复：D1 insert 失败时尝试删除刚写入的 `imageKey`，删除失败时写结构化 `r2_cleanup_failed` 错误日志，并继续抛出原始错误。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check` 通过；业务扫描仅命中新加的 R2 清理代码。
- 部署：已补推上线，Workers Version ID `3eecbaea-0259-4ee7-b098-6d22ddb9a250`。

### 第 8 轮：KV 轻量限流

- 发现：投递、打捞、分享虽有业务配额，但缺少针对脚本刷接口的轻量限速。
- 修复：新增 `worker/lib/rateLimit.ts`，使用 `GH_CONFIG` KV 记录窗口计数；投递限制为用户 12 次/天、IP 60 次/小时；打捞限制为用户 30 次/分钟；分享限制为用户 10 次/小时。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check` 通过。
- 部署：已补推上线，Workers Version ID `3eecbaea-0259-4ee7-b098-6d22ddb9a250`。

### 第 9 轮：运营导出与审核动作

- 发现：活动上线后需要运营导出投递内容，并能调整瓶子的审核状态与精选分。
- 修复：新增 `worker/lib/admin.ts`；新增 `GET /api/admin/export/bottles.csv` 与 `POST /api/admin/bottles/:id/moderation`。
- 安全：两个接口均要求 `ADMIN_USER_IDS` 白名单；CSV 导出校验 `status` 参数、限制 `limit <= 5000`，并对 `= + - @` 开头字段做公式注入防护。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check` 通过；本地 smoke 确认空白名单下导出和审核动作均返回 403 `admin_required`。
- 部署：已补推上线，Workers Version ID `3eecbaea-0259-4ee7-b098-6d22ddb9a250`。

### 第 10 轮：D1 备份与恢复 runbook

- 发现：项目需要上线后的数据库导出、bookmark 和恢复操作说明。
- 修复：新增 `docs/BACKUP.md`、`web/backups/README.md`、`web/backups/.gitignore`；新增 `db:info:remote`、`db:bookmark:remote`、`db:export:local`、`db:export:remote` 脚本。
- 验证：package scripts 可解析；`npm run db:export:local` 成功，生成 `web/backups/d1/guanghe-drift-bottle-db-local-20260606T012726Z.sql`，约 23MB / 133706 行。
- 远端复验：`npm run db:info:remote` 通过，D1 远端库有 9 张表、大小 143 kB；`npm run db:bookmark:remote` 通过，当前 bookmark 为 `00000008-00000000-00005082-cd46bcaac8b9cd9a851bb0c5be407fae`。
- 边界：远端 SQL export 未在本轮执行，避免产生包含用户内容的额外远端备份文件。

### 第 11 轮：R2 存储巡检

- 发现：R2 可能存在无 D1 引用的孤儿图片对象，也可能有 D1 引用但 R2 缺失的图片 key。
- 修复：新增 `GET /api/admin/storage/audit`，只读扫描 R2 `bottles/` 前缀并对比 D1 `bottles.image_key`。
- 安全：接口要求 `ADMIN_USER_IDS` 白名单；`limit` 限制在 1-1000；结果只返回样本和 cursor，不删除对象。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check` 通过；本地 smoke 确认空白名单下返回 403 `admin_required`。
- 部署：已补推上线，Workers Version ID `3eecbaea-0259-4ee7-b098-6d22ddb9a250`。

### 第 12 轮：打捞查询性能优化

- 发现：`POST /api/dredge` 使用 `ORDER BY RANDOM()`，数据变多后会让 D1 对候选集做随机排序。
- 修复：改为先统计 eligible bottle count，再用 Web Crypto 生成随机 offset，按 `created_at DESC` 取一条。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check` 通过；业务扫描确认无 `ORDER BY RANDOM` / `Math.random`；本地 `bootstrap -> dredge` smoke 返回 200 并正确扣减 quota。
- 部署：已补推上线，Workers Version ID `3eecbaea-0259-4ee7-b098-6d22ddb9a250`。

### 第 13 轮：上线验证脚本

- 发现：上线前检查命令分散，补推时容易漏跑。
- 修复：新增 `npm run verify:launch` 与 `npm run verify:production`。
- 验证：`npm run verify:launch` 完整通过，覆盖 `cf:types`、`typecheck`、`build`、`cf:check`、`npm audit --audit-level=moderate`，audit 为 0 vulnerabilities。

### 第 14 轮：前端后台权限对齐

- 发现：“数据”页直接展示 bootstrap metrics，和后端 `/api/admin/metrics` 白名单权限不一致。
- 修复：新增 `ApiClient.adminMetrics()` 与 `AdminMetricsData`；进入“数据”页时调用真实 admin API；403 时展示后台访问受限状态。
- 修复：稳定 demo 与 Clerk token getter，避免 `ApiClient` 每次 render 重建导致 admin 请求循环。
- 验证：`npm run verify:launch` 完整通过；本地 Playwright 确认“数据”页只请求 1 次 `/api/admin/metrics`、返回 403 并展示受限状态。
- 线上：已部署到 Workers Version ID `3eecbaea-0259-4ee7-b098-6d22ddb9a250`；桌面/移动端首屏、admin 受限页和 admin API 默认拒绝均复验通过。

### 第 15 轮：运营后台审核台

- 发现：后端已有审核动作、CSV 导出和 storage audit，但前端后台仍停留在指标列表，管理员无法从 UI 完成运营动作。
- 修复：新增 `GET /api/admin/bottles`，支持 `status=all|approved|pending|rejected` 与 `limit`；前端新增审核列表、状态筛选、精选分输入、公开/待审/下架动作、CSV blob 下载和 storage audit 展示。
- 安全：所有新增和既有 admin 入口继续要求 `ADMIN_USER_IDS`，白名单为空默认 403；本地管理员 UI 仅用临时 `.dev.vars` 验证，验证后已删除。
- 验证：`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 0 vulnerabilities；本地管理员 UI Playwright 验证 11 行、巡检显示、CSV 下载、桌面/移动端无横向溢出。
- 线上：已部署到 Workers Version ID `95ba922f-183a-4bbe-87f1-067bc6080b66`；`/api/health` 通过，`/api/admin/bottles`、CSV 导出、storage audit 未授权均返回 403；线上桌面/移动端 8 张卡、0 图片 fallback、无失败请求、无横向溢出。

### 第 16 轮：预制内容导入工具

- 发现：活动方案需要约 100 条预制内容，现有 `seed.sql` 只有少量演示数据，直接手改 SQL 不利于运营维护。
- 修复：新增 `scripts/preseed-bottles.csv`、`scripts/generate-preseed-sql.mjs`、`scripts/execute-preseed-remote.mjs`、`scripts/README.md`，并加入 `preseed:build`、`db:preseed:local`、`db:preseed:remote` 脚本。
- 校验：CSV 生成器检查必填列、id/author/invite 前缀、分类、状态、精选分、标题/描述长度、图片 URL 和重复 id；导入 SQL 使用 upsert，避免覆盖真实用户内容。
- 验证：`npm run preseed:build` 生成 20 条内容 SQL；`npm run db:preseed:local` 本地 D1 成功执行 3 条 SQL 命令。
- 远端：远端 D1 文件导入路径两次 Cloudflare API 超时，改用分语句远端执行；`npm run db:preseed:remote` 已验证通过。远端 D1 当前 `bottles=29`、`preseed=20`，线上 bootstrap 第一条来自预制内容。

### 第 17 轮：100 条预制内容与远端导入韧性

- 发现：活动内容池仍不足商业活动首屏和随机打捞的真实感；扩展到 100 条后，远端 D1 大语句和小批次执行都可能遇到 Cloudflare API 超时。
- 修复：将 `scripts/preseed-bottles.csv` 扩展到 100 条预制内容；`execute-preseed-remote.mjs` 改为解析生成 SQL 的 `VALUES` 行并分批执行，同时加入最多 3 次重试退避。
- 验证：`npm run preseed:build` 生成 100 条内容 SQL；`npm run db:preseed:local` 本地导入通过；`npm run db:preseed:remote` 远端导入通过，过程中真实触发多次超时并由重试恢复。
- 远端：D1 查询确认 `bottles=109`、`preseed=100`、`approved=109`；线上 `/api/bootstrap` 返回 `metrics.bottles=109`、`participants=113`，最新内容命中新预制瓶。
- 浏览器：Playwright 验证线上桌面/移动端无失败请求、无横向溢出；首页 8 张图片全部加载成功，样本文案可见。
- 质量：`npm run verify:launch` 完整通过，audit 为 0 vulnerabilities。

### 第 18 轮：运营后台批量审核

- 发现：审核台只能逐条公开/待审/下架，100 条内容或真实用户投递增长后运营效率不足。
- 参考：使用 Refero skill 与 MCP；视觉保留 Axiom/Depot 式深色运维控制台，交互借 Rox/n8n 的复选框批量工具条、WordPress/TikTok 的状态筛选审核语义。
- 修复：新增 `POST /api/admin/bottles/moderation/bulk`，一次最多 100 条，去重并校验 id/status；前端表格新增选择列、全选、选中态和批量公开/待审/下架工具条。
- 安全：新批量接口继续要求 `ADMIN_USER_IDS`；空白名单时默认 403。临时 `.dev.vars` 只用于本地验证，验证后已删除并重建确认 dist 无残留。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 本地：临时管理员身份下 API smoke 和 Playwright 均完成 2 条内容“批量待审 -> 批量公开”恢复；桌面/移动端无失败请求、无横向溢出。
- 线上：已部署 Workers Version ID `3e844af5-1ce6-4c19-93a1-62252a359b25`；新批量 endpoint 与审核列表未授权均返回 403；首页图片和后台受限页复验通过。

### 第 19 轮：运营事件流

- 发现：`activity_events` 已记录投递、分享、审核、bootstrap 等行为，但运营后台缺少只读事件流，排查线上行为需要直接查 D1。
- 修复：新增 migration `0002_activity_events_created.sql`，为 `activity_events(created_at DESC)` 建索引；新增 `GET /api/admin/events`，支持 `limit<=100` 与可选 `type` 过滤；前端后台显示最近 20 条事件、用户和 metadata 摘要。
- 安全：事件流接口继续要求 `ADMIN_USER_IDS`；空白名单时默认 403。临时 `.dev.vars` 只用于本地验证，验证后已删除并确认源码/dist 无残留。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 迁移：`npm run db:migrate:local` 与 `npm run db:migrate:remote` 均通过；远端 `PRAGMA index_list('activity_events')` 确认 `idx_activity_events_created` 存在。
- 本地：临时管理员身份下 `/api/admin/events?limit=5` 返回 5 条事件；后台事件流桌面/移动端显示 20 条且无横向溢出。
- 线上：已部署 Workers Version ID `ebf479e0-b5dc-4a9f-a22f-7edacab9c320`；`/api/admin/events` 未授权返回 403；首页 metrics 与后台受限页复验通过。

### 第 20 轮：Cloudflare 绑定健康检查

- 发现：`/api/health` 只返回静态 ok，无法判断 Worker 当前 D1/KV/R2/Queue 绑定是否真的可用。
- 修复：新增 `worker/lib/health.ts`；`/api/health` 并发轻量探测 D1 `SELECT 1`、KV `get`、R2 `list(limit=1)` 和 Queue 绑定存在性，返回 ok、latencyMs 与非敏感错误类型。
- 安全：health 不返回 KV 内容、R2 key、数据库行或 secret；若关键绑定失败则返回 503。
- 验证：`npm run typecheck`、`npm run build`、`npm run cf:check`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 本地：无 `.dev.vars` 情况下 `/api/health` 返回 200，D1/KV/R2/Queue 均 ok。
- 线上：已部署 Workers Version ID `763119a6-a9b9-4c2b-a629-482a8b55b006`；线上 `/api/health` 返回 200，`data.ok=true`，D1/KV/R2/Queue 均 ok。

### 第 21 轮：上线配置体检脚本

- 发现：`verify:launch` 能证明构建和 dry-run 可用，但不能把真实生产缺口和已上线预览状态分开。
- 修复：新增 `scripts/check-launch-readiness.mjs`、`npm run launch:readiness` 与 `npm run launch:readiness:strict`，检查 production D1/R2/KV/Queue、Clerk auth flag、Turnstile required、管理员白名单、Clerk publishable key、Clerk/Turnstile secret 和预制内容数量。
- 安全：secret 默认只做本地存在性提示，不输出 secret 值；strict 模式对任何未通过项返回非 0，适合生产发布前挡板。
- 验证：`node --check scripts/check-launch-readiness.mjs`、`npm run launch:readiness`、`npm run typecheck`、`npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 结果：当前 readiness 输出 `BLOCKED`；production bindings、`CLERK_AUTH_ENABLED=true`、`TURNSTILE_REQUIRED=true` 和 100 条预制内容通过；缺 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY`，Clerk/Turnstile secret 仍需部署验证。

### 第 22 轮：Cloudflare 远端 secret 体检

- 发现：本地 `.env` 无法证明 Cloudflare production Worker 已经拥有 secret。
- 修复：新增 `npm run launch:readiness:remote`，通过 `wrangler secret list --env production --format json` 检查 production Worker 和已部署 secret 名称。
- 安全：只读取 secret 名称，不读取 secret 值；Wrangler 错误会去掉终端颜色并截断，避免把本地日志路径和冗余输出写进长日志。
- 验证：`npm run launch:readiness:remote` 可执行并保持非 strict 退出 0，便于在当前缺 production secret 时继续输出完整报告。
- 结果：本轮当时远端 readiness 仍为 `BLOCKED` 且遇到 Cloudflare API timeout；后续第 31 轮已复验为 production Worker 尚未创建，`CLERK_SECRET_KEY` 与 `TURNSTILE_SECRET_KEY` 尚未部署。

### 第 23 轮：用户举报与自动待审

- 发现：`bottles.report_count` 已存在，但缺少用户举报入口和后端去重记录；UGC 活动商业上线需要基础社区安全反馈闭环。
- 参考：使用 Refero skill 与 MCP；采用 ChatGPT/Klarna 式单选举报原因、Handshake 式可选补充说明、Instagram 式提交后确认，视觉继续保持光核深色面板。
- 修复：新增 migration `0003_bottle_reports.sql`；新增 `worker/lib/reports.ts` 与 `POST /api/bottles/:id/report`；同用户同瓶只允许举报一次，作者不能举报自己，用户每日最多 20 次举报。
- 修复：举报成功后增加 `report_count` 并记录 `bottle_reported` 事件；公开瓶达到 3 次举报时自动转为 `pending`，交给运营后台复核。
- 前端：打捞结果动作栏新增举报图标按钮；新增深色举报 modal、6 个举报原因、500 字补充说明和提交确认；后台审核列表显示 `举报 N`。
- 验证：`npm run db:migrate:local`、`npm run db:migrate:remote`、`npm run typecheck`、`npm run build`、`npm run cf:check`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- API smoke：本地首次举报返回 200，重复举报返回 409，无效原因返回 400，作者自举报返回 400；3 个不同用户举报同一瓶后 `report_count=3` 且状态变为 `pending`。测试后已回滚本地测试举报和状态。
- 浏览器：本地 Playwright 桌面/移动端验证举报 modal 可见、原因可选、说明可填、提交后显示“举报已收到”，无失败请求、无横向溢出；截图在 `/tmp/guanghe-report-desktop.png` 与 `/tmp/guanghe-report-mobile.png`。
- 线上：已部署 Workers Version ID `a94d4e9d-9e4f-40a9-8381-85d0ed81128e`；线上 `/api/health` 200 且 D1/KV/R2/Queue 均 ok；无效举报原因与作者自举报错误路径通过；远端 `bottle_reports` 表存在且当前举报数为 0。

### 第 24 轮：源码审计与性能预算挡板

- 发现：人工扫描危险模式和产物体积容易漏跑，且 `verify:*` 原先只覆盖类型、构建、dry-run 与 npm audit。
- 修复：新增 `scripts/audit-source.mjs` 与 `npm run audit:source`；扫描 `src/`、`worker/`、`migrations/` 和维护脚本中的危险模式。
- 覆盖：禁止 `Math.random()`、`ORDER BY RANDOM()`、`passThroughOnException`、`as unknown as`、`TODO/FIXME`；检查 `.dev.vars` 不在交付输出，`.env.example` 的 secret 项保持空值。
- 性能：检查 `dist/client/assets` 中 JS 原始体积不超过 320KB、CSS 原始体积不超过 80KB；脚本需在 build 后运行。
- 集成：`npm run verify:launch` 与 `npm run verify:production` 已插入 `npm run audit:source`。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 结果：当前 JS 产物 255377 bytes，CSS 产物 22593 bytes，均低于预算；production 验证后已重新运行普通 `npm run build` 恢复本地 dist。

### 第 25 轮：公共接口 smoke 脚本

- 发现：部署后线上复验命令仍偏人工，且需要避免 smoke 过程提交真实举报或污染远端内容。
- 修复：新增 `scripts/smoke-public.mjs`、`npm run smoke:public` 与 `npm run smoke:public:local`。
- 覆盖：检查 `/api/health` 200 且 `data.ok=true`、`/api/bootstrap` 200 且内容数量充足、`/api/admin/metrics` 默认 403、举报无效原因返回 400。
- 安全：举报 smoke 只走无效原因错误路径，不会写入 `bottle_reports`。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run smoke:public`、`npm run smoke:public:local`、`npm run typecheck` 与 `npm run audit:source` 均通过。
- 线上：`npm run smoke:public` 已通过 workers.dev 预览地址，返回 health 200、bootstrap 200、admin metrics 403、report invalid reason 400。

### 第 26 轮：举报后台筛选与事件过滤

- 发现：用户举报已经写入 `bottle_reports` 和 `report_count`，但运营后台只能在普通审核列表里看到小号“举报 N”，缺少按举报内容优先处理的入口。
- 参考：使用 Refero skill 与 MCP；借 Square 的顶部筛选 + 表格模式、LottieFiles 的统计/状态列、Teachable 的状态标签和分组管理语义，继续沿现有深色后台。
- 修复：`/api/admin/bottles` 支持 `status=reported` 特殊筛选，返回 `report_count > 0` 的内容并按举报数倒序；CSV 导出同样支持 `status=reported`。
- 前端：后台筛选新增“被举报”；举报数改为风险徽标；最近事件区新增事件类型输入和过滤按钮，可快速查看 `bottle_reported`。
- API 验证：本地临时管理员身份下，测试举报 `preseed-bottle-014` 后，`/api/admin/bottles?status=reported` 返回举报数 1，`/api/admin/export/bottles.csv?status=reported` 返回对应 CSV，`/api/admin/events?type=bottle_reported` 返回事件。
- 浏览器：本地 Playwright 桌面/移动端验证“被举报”筛选、举报徽标、事件过滤均可见，无失败请求、无横向溢出；截图在 `/tmp/guanghe-admin-reported-desktop.png` 与 `/tmp/guanghe-admin-reported-mobile.png`。
- 清理：本地测试举报、测试事件和 `preseed-bottle-014` 状态已回滚；临时 `.dev.vars` 已删除。
- 质量：`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；当前 JS 产物 256475 bytes，CSS 产物 23360 bytes，低于预算。
- 部署：`npm run deploy` 连续 4 次遇到 Cloudflare API timeout，本轮当时尚未上线；后续第 31 轮已补推到 Workers Version ID `15cb32c6-e4b2-40d2-b4e9-21b0294bcf5c`。

### 第 27 轮：部署重试韧性

- 发现：第 26 轮代码已通过本地、dry-run 和线上旧版本 smoke，但 `npm run deploy` 连续 4 次 Cloudflare API timeout，单次手动重试不可维护。
- 修复：新增 `scripts/deploy-with-retry.mjs` 与 `npm run deploy:retry`，对 Wrangler timeout、网络失败和资源上传 retryable error 做最多 5 次退避重试。
- 文档：更新 `web/scripts/README.md`、`web/README.md` 与 `docs/DEPLOYMENT.md`，把补推命令改为 `npm run deploy:retry`。
- 验证：`node --check scripts/deploy-with-retry.mjs` 与 `npm run audit:source` 通过；`npm run smoke:public` 在线上旧版本通过。
- 部署：`DEPLOY_RETRIES=5 DEPLOY_RETRY_DELAY_MS=4000 npm run deploy:retry` 当时连续 5 次仍遇到 Cloudflare API timeout；后续第 31 轮已用同一脚本补推成功。

### 第 28 轮：安全响应头与 API 缓存边界

- 发现：Worker 已有 CORS 和错误边界，但缺少统一安全响应头；商业上线前应避免 MIME sniffing、嵌入 iframe 和 API 响应被中间层缓存。
- 修复：新增 `securityHeaders` middleware，所有响应统一设置 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`；HTTPS 请求额外设置 HSTS。
- 缓存：`/api/*` 响应统一设置 `Cache-Control: no-store`；`/media/*` 继续保留图片缓存头，不影响 R2 图片加载性能。
- 工具：`smoke-public.mjs` 新增 `EXPECT_SECURITY_HEADERS=true` 严格模式；新增 `smoke:public:headers` 和 `smoke:public:local:headers`。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run typecheck`、`npm run build`、本地 `npm run smoke:public:local:headers`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮当时受 Cloudflare API timeout 影响尚未上线；后续第 31 轮已上线，并补跑 `npm run smoke:public:headers` 通过。

### 第 29 轮：请求追踪与错误日志关联

- 发现：线上错误日志此前只有错误类型和 stack，客服或运营拿到用户反馈时缺少可对齐单次请求的稳定标识。
- 修复：新增 `requestId` middleware，优先沿用安全的 `X-Request-Id`，其次使用 Cloudflare `CF-Ray`，最后生成 UUID；所有响应写回 `X-Request-Id`。
- 日志：未知错误日志新增 `requestId`、method 和 path，便于和用户响应头、Cloudflare 日志和客服记录对齐。
- 工具：严格 header smoke 新增 `x-request-id` 断言。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run typecheck`、本地 `npm run smoke:public:local:headers`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮当时受 Cloudflare API timeout 影响尚未上线；后续第 31 轮已上线，线上 smoke 已确认 `X-Request-Id`。

### 第 30 轮：API 404 响应一致性

- 发现：未知 API 路径如果返回默认 404，前端或 smoke 只能拿到非统一错误体，不利于错误处理和线上排查。
- 修复：新增 `app.notFound`，未知 `/api/*` 返回 JSON 404 `{ error: { code: "not_found" } }`；非 API 路径仍返回普通 404，避免扩大静态资源行为。
- 工具：严格 header smoke 新增 `/api/__missing_smoke`，同时检查 404 JSON、`X-Request-Id`、安全头和 `/api/*` no-store。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run typecheck`、本地 `npm run smoke:public:local:headers`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮当时受 Cloudflare API timeout 影响尚未上线；后续第 31 轮已上线，线上严格 smoke 已确认 API 404 JSON。

### 第 31 轮：补推上线与线上复验

- 发现：第 26-30 轮已通过本地、dry-run 和 production dry-run，但受 Cloudflare API timeout 影响未同步到 workers.dev。
- 部署：Cloudflare API 恢复后，`DEPLOY_RETRIES=5 DEPLOY_RETRY_DELAY_MS=4000 npm run deploy:retry` 首次尝试成功；当前 Workers Version ID `15cb32c6-e4b2-40d2-b4e9-21b0294bcf5c`。
- 线上 smoke：`npm run smoke:public` 与 `npm run smoke:public:headers` 均通过，覆盖 health、bootstrap、admin 默认 403、举报错误路径、API 404、安全头、`X-Request-Id` 和 API no-store。
- 后台边界：线上 `/api/admin/bottles?status=reported`、reported CSV、`/api/admin/events?type=bottle_reported` 均默认 403 `admin_required`，并返回 `X-Request-Id`。
- 浏览器：Playwright 线上桌面/移动端验证通过，无失败请求、无 console error、0 fallback 图片、无横向溢出。
- 生产体检：`launch:readiness` 与 `launch:readiness:remote` 仍为 `BLOCKED`；缺真实 Admin allowlist、Turnstile site key、Clerk publishable key、production Worker、Clerk secret 和 Turnstile secret。

### 第 32 轮：reported/admin smoke 固化

- 发现：第 31 轮手工补验了 reported 审核列表、reported CSV 和 `bottle_reported` 事件过滤默认 403，但这些检查还没进部署后标准 smoke。
- 修复：`smoke-public.mjs` 默认新增 3 个只读/错误路径检查：`/api/admin/bottles?status=reported`、reported CSV、`/api/admin/events?type=bottle_reported`，均预期 403 `admin_required`。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run smoke:public`、`npm run smoke:public:headers` 与 `npm run audit:source` 均通过。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 33 轮：production readiness 指引强化

- 发现：`launch:readiness:remote` 能发现 production Worker 不存在，但原始 Wrangler 错误过长，容易被误读成网络或账号问题。
- 修复：远端 secret 体检识别 `Worker ... not found`，改成明确提示：先设置真实 Clerk、Turnstile 和 admin 配置，再按 `docs/DEPLOYMENT.md` 切换生产。
- 验证：`node --check scripts/check-launch-readiness.mjs`、`npm run launch:readiness:remote` 与 `npm run audit:source` 均通过。
- 结果：当前 blocker 输出清楚列出缺 Admin allowlist、Turnstile site key、Clerk publishable key、production Worker、Clerk secret 和 Turnstile secret。

### 第 34 轮：UGC 图片输入校验

- 发现：后端已校验图片 MIME 和 8MB 上限，但未拒绝 0 字节文件；前端也缺少上传前即时校验和 preview object URL 清理。
- 修复：`validateImage` 对 `file.size <= 0` 返回 400 `image_empty`；前端上传控件即时校验类型、空文件和 8MB 上限，并在预览更新或组件卸载时释放 object URL。
- 本地验证：API 空文件 smoke 返回 400 `image_empty`；Playwright 选择 0 字节 PNG 后表单显示“图片文件不能为空。”，无 console error、无失败请求、无横向溢出。
- 质量：`npm run typecheck`、`npm run build`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；JS 256934 bytes、CSS 23425 bytes，低于预算。
- 部署：`npm run deploy:retry` 第 3 次尝试成功，Workers Version ID `77ec8512-44e0-49ef-8aeb-fae66a44a9d1`。
- 线上：`npm run smoke:public`、`npm run smoke:public:headers` 通过；线上 0 字节图片投递返回 400 `image_empty` 且带 `X-Request-Id`；Playwright 桌面/移动端复验通过。

### 第 35 轮：R2 media key 边界收紧

- 发现：`/media/*` 只拒绝空 key 和 `..`，如果未来 R2 bucket 混入非公开对象，知道 key 的请求仍可能读到。
- 修复：媒体代理只允许 `bottles/` 前缀下的 jpg/png/webp/gif key，限制 key 长度，拒绝 `..` 和双斜杠；公共 smoke 新增 `/media/not-public.webp` 400 检查。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run typecheck`、`npm run build`、本地 `npm run smoke:public:local:headers`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 部署：`npm run deploy:retry` 第 3 次尝试成功，Workers Version ID `2e470c7b-ca0a-4396-8470-aa9501505af9`。
- 线上：`npm run smoke:public`、`npm run smoke:public:headers` 通过，非法 media key 返回 400；Playwright 桌面/移动端复验通过。

### 第 36 轮：Queue consumer ack/retry 硬化

- 发现：`MODERATION_QUEUE` consumer 之前把 `recordEvent` 放进 `ctx.waitUntil` 后立即 `ack`，若 D1 事件写入失败，消息也可能被确认掉。
- 修复：consumer 改为 await `recordEvent` 成功后再 `ack`；失败时输出 `queue_message_failed` 结构化日志并 `retry` 当前消息。
- 验证：`npm run typecheck`、`npm run build`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 部署：`npm run deploy:retry` 第 1 次尝试成功，Workers Version ID `be7c0d06-8b5b-4ada-81ae-cf8b16298d92`。
- 线上：`npm run smoke:public`、`npm run smoke:public:headers` 通过；Playwright 桌面/移动端复验通过。Queue 真实失败分支需在 Cloudflare 运行时通过日志继续观察。

### 第 37 轮：Queue consumer 本地真实 smoke

- 发现：Wrangler 当前没有直接发送测试 Queue 消息的 `queues send` 子命令，但本地投递接口会通过 Worker producer 写入 `MODERATION_QUEUE`。
- 验证：启动本地 Worker，投递测试瓶 `3f52a2b5-e561-4552-99e6-6954ea7c6696`；轮询本地 D1，`activity_events` 出现对应 `moderation_queued` 事件，证明 consumer 成功处理消息。
- 清理：删除本地测试用户、瓶子、事件、quota、相关关系表记录，并删除本地 R2 `bottles/queue-smoke-user/...png`；复查 `users=0`、`bottles=0`、`events=0`。
- 部署：本轮只做真实 smoke 和文档记录，不改变 runtime，无需重新部署。

### 第 38 轮：Queue smoke 脚本固化

- 发现：第 37 轮 Queue smoke 有价值，但手工步骤多，后续容易漏清理本地 D1/R2 测试数据。
- 修复：新增 `scripts/smoke-queue-local.mjs` 与 `npm run smoke:queue:local`，脚本会创建测试瓶、轮询本地 D1 的 `moderation_queued`、删除相关 D1 行和本地 R2 对象。
- 验证：`node --check scripts/smoke-queue-local.mjs`、`npm run smoke:queue:local` 与 `npm run audit:source` 均通过；复查测试 bottle/event 计数为 0。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 39 轮：Queue smoke 自启动脚本

- 发现：`smoke:queue:local` 已经自动清理数据，但仍要求另一个终端先手动启动本地 dev server。
- 修复：新增 `scripts/smoke-queue-local-auto.mjs` 与 `npm run smoke:queue:local:auto`，自动启动本地 Worker、等待 `/api/health`、运行 Queue smoke，再关闭 dev server。
- 验证：`node --check scripts/smoke-queue-local-auto.mjs`、`npm run smoke:queue:local:auto` 与 `npm run audit:source` 均通过；复查无 dev server 残留，测试 bottle/event 计数为 0。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 40 轮：本地全量 smoke 聚合

- 发现：公共本地 smoke 与 Queue smoke 都已自动化，但维护时仍要分开启动或运行，容易漏跑其中一个。
- 修复：新增 `scripts/smoke-local-all.mjs` 与 `npm run smoke:local:all`，自动启动本地 Worker，连续跑公共 header smoke 与 Queue consumer smoke，再关闭 dev server。
- 验证：`node --check scripts/smoke-local-all.mjs`、`npm run smoke:local:all` 与 `npm run audit:source` 均通过；复查无 dev server 残留，测试 bottle/event 计数为 0。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 41 轮：verify:local 聚合验证

- 发现：`verify:launch` 覆盖构建和 dry-run，但不跑本地全量 smoke；`smoke:local:all` 覆盖本地行为，但不跑类型、构建和审计。
- 修复：新增 `npm run verify:local`，串联 `cf:types`、`typecheck`、`build`、`audit:source`、`cf:check`、`smoke:local:all` 和 `npm audit`。
- 验证：`npm run verify:local` 通过，audit 为 0 vulnerabilities；本地 Queue 测试完成并清理，复查无 dev server 残留，测试 bottle/event 计数为 0。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 42 轮：源码审计覆盖面检查

- 发现：`audit-source` 会扫描脚本内容，但不会确认 `package.json` 中 `node scripts/*.mjs` 引用的脚本文件是否真实存在。
- 修复：`audit-source.mjs` 新增 package scripts 目标检查，若 npm script 指向缺失的 `scripts/*.mjs` 会失败。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities；本地全量 smoke 完成并清理，复查无 dev server 残留，测试 bottle/event 计数为 0。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 43 轮：构建产物 hygiene 审计

- 发现：当前 `dist/client` 没有 sourcemap 和 secret 名称，但审计脚本未把这个商业上线边界固化。
- 修复：`audit-source.mjs` 新增 client build hygiene 检查，禁止 `.map`、`sourceMappingURL` 和后端 secret key 名称出现在 `dist/client`。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities；本地全量 smoke 完成并清理，复查无 dev server 残留，测试 bottle/event 计数为 0。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime，无需重新部署。

### 第 44 轮：Production CORS 上线挡板

- 发现：`env.production.ALLOWED_ORIGINS` 若为空，旧 Worker CORS 逻辑会把空 allowlist 当成放行全部 Origin；这对带 credentials 的生产 API 过宽。
- 修复：`env.production.ALLOWED_ORIGINS` 固定为 `https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev`；Worker runtime 在 production 且 allowlist 为空时拒绝跨域 Origin。
- 修复：`check-launch-readiness.mjs` 新增 production CORS origins 检查，要求非空、`https://`、纯 origin、无 wildcard、非 localhost/127.0.0.1。
- 验证：`node --check scripts/check-launch-readiness.mjs`、`npm run launch:readiness`、`npm run launch:readiness:remote`、`npm run verify:local`、`npm run verify:production` 与恢复普通 `npm run build` 均通过预期；audit 为 0 vulnerabilities，本地 Queue smoke 清理完成。
- 部署：`DEPLOY_RETRIES=5 DEPLOY_RETRY_DELAY_MS=4000 npm run deploy:retry` 第 3 次成功，Workers Version ID `6b60d163-1a6f-4b22-afc7-bd0942b198fa`。
- 线上：`npm run smoke:public` 与 `npm run smoke:public:headers` 均通过，覆盖 health、bootstrap、admin/reported 默认 403、非法 media key、举报错误路径、API 404、安全响应头、`X-Request-Id` 和 `/api/*` no-store。

### 第 45 轮：CORS Smoke 固化

- 发现：第 44 轮已收紧 CORS runtime 和 readiness，但部署后 smoke 仍只检查业务路径与安全头，没有直接验证 allowed/denied Origin 行为。
- 修复：`smoke-public.mjs` 新增 `/api/health` preflight 检查：默认 `http://localhost:5173` 应返回 `Access-Control-Allow-Origin`，`https://example.invalid` 不应返回 `Access-Control-Allow-Origin`。
- 配置：可用 `SMOKE_ALLOWED_ORIGIN` 和 `SMOKE_DENIED_ORIGIN` 覆盖默认 Origin，便于后续 production Worker 或自定义域名 smoke。
- 验证：`node --check scripts/smoke-public.mjs`、`npm run audit:source`、线上 `npm run smoke:public`、线上 `npm run smoke:public:headers`、`npm run verify:local`、`npm run verify:production`、`npm run build`、`npm run launch:readiness` 与 `npm run launch:readiness:remote` 均通过预期，audit 为 0 vulnerabilities。
- 部署：本轮只改维护脚本，不改变 Worker runtime；当时 workers.dev 仍是第 44 轮部署版本 `6b60d163-1a6f-4b22-afc7-bd0942b198fa`，后续第 46 轮已补推新版本。

### 第 46 轮：旧 CORS Helper 清理

- 发现：`worker/lib/http.ts` 里仍有未使用的 `applyCors` helper，且保留旧的空 allowlist 放行逻辑；虽然当前没调用，但后续维护可能误用。
- 修复：删除 `applyCors` helper，让 CORS 只由 `worker/index.ts` 的 Hono middleware 管理。
- 验证：`rg "applyCors|allowed.length === 0 || allowed.includes"` 已无命中；`npm run typecheck`、`npm run audit:source`、`npm run verify:local`、`npm run verify:production` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities。
- 部署：`npm run deploy:retry` 第 1 次成功，Workers Version ID `f21b740e-004a-4542-a7fb-1e272351039c`。
- 线上：`npm run smoke:public:headers` 通过，继续覆盖 health、bootstrap、admin/reported 默认 403、非法 media key、举报错误路径、CORS allowed/denied、API 404、安全响应头、`X-Request-Id` 和 `/api/*` no-store。

### 第 47 轮：Production Deploy 前置挡板

- 发现：`deploy-with-retry.mjs` 可以接收任意 Wrangler 参数；如果直接传 `--env production`，可能在真实 Clerk/Turnstile/Admin 还没就绪时误创建或更新 production Worker。
- 修复：`deploy-with-retry.mjs` 检测到 `--env production`、`--env=production`、`-e production` 或 `-e=production` 时，先运行 `node scripts/check-launch-readiness.mjs --strict`；strict readiness 不通过则退出，不执行 Wrangler deploy。
- 工具：新增 `npm run deploy:production:retry`，只用于 production Worker 发布；普通 preview 继续使用 `npm run deploy:retry`。
- 验证：当前真实缺 Clerk/Turnstile/Admin 配置时，`npm run deploy:production:retry` 输出 readiness `BLOCKED` 并停止，未进入 Wrangler deploy；`node --check scripts/deploy-with-retry.mjs`、`npm run audit:source`、`npm run verify:local`、`npm run verify:production` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改维护脚本和 package script，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 48 轮：远端 Strict Readiness 验收命令

- 发现：production 发布需要分两段验收：创建前看本地 strict 配置，创建后还要强制检查 Cloudflare 端 production Worker 和 secret 名称。
- 修复：新增 `npm run launch:readiness:remote:strict`，等价于 `node scripts/check-launch-readiness.mjs --remote-secrets --strict`。
- 验证：当前真实缺 production Worker / Clerk secret / Turnstile secret 时，`npm run launch:readiness:remote:strict` 输出 `BLOCKED` 并以非 0 退出；`npm run deploy:production:retry` 仍按预期被本地 strict readiness 拦住。
- 质量：`npm run audit:source`、`npm run verify:local`、`npm run verify:production`、线上 `npm run smoke:public:headers` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 package script 和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 49 轮：Production Auth Smoke

- 发现：现有 `smoke-public.mjs` 面向预览/demo 身份，不能直接用于 `CLERK_AUTH_ENABLED=true` 的 production Worker；production 未登录业务 API 应该返回 401，而不是 bootstrap 200。
- 修复：新增 `scripts/smoke-production-auth.mjs` 与 `npm run smoke:production:auth`，默认目标为 `https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev`。
- 覆盖：检查 `/api/health` 返回 `environment=production`，未登录 `/api/bootstrap` 和 `/api/admin/metrics` 返回 401 `auth_required`，带 `X-Dev-User` 也不能绕过生产认证，API 404、CORS allowed/denied、安全头和 no-store 正常。
- 验证：`node --check scripts/smoke-production-auth.mjs`、`npm run audit:source`、`npm run verify:local`、`npm run verify:production`、线上 `npm run smoke:public:headers` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities。
- 当前状态：`npm run smoke:production:auth` 因 production Worker 尚未创建而返回 404 并失败，这是预期阻断，证明它不会把未上线 production 误判为可用。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 50 轮：Production Admin Smoke

- 发现：第 49 轮只验证未登录生产认证边界，无法证明真实 Clerk 管理员账号能访问后台只读链路；浏览器手工后台验收前需要一个可重复、不会改生产数据的管理员 smoke。
- 修复：新增 `scripts/smoke-production-admin.mjs` 与 `npm run smoke:production:admin`，默认目标为 `https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev`。
- 覆盖：要求 `SMOKE_ADMIN_BEARER_TOKEN` 或 `SMOKE_ADMIN_COOKIE`；只读检查 `/api/bootstrap`、`/api/admin/metrics`、审核列表、reported 列表、事件流、`bottle_reported` 事件过滤、CSV 导出、storage audit、后台错误路径、CORS allowed/denied、安全头和 no-store。
- 安全：无真实 Clerk 管理员 session 时命令直接失败；脚本不提交投递、举报或审核动作，不会污染 production D1/R2。
- 验证：`npx wrangler --version` 为 `4.98.0`；`node --check scripts/smoke-production-admin.mjs`、`npm run audit:source`、`npm run verify:production` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities。
- 当前状态：未设置管理员 session 时 `npm run smoke:production:admin` 按预期失败并提示需要真实 Clerk 管理员 session；production Worker 尚未创建前该命令不能替代生产验收。
- 清理：本地 Queue smoke 写入并清理测试瓶，复查本地 `queue-smoke-*` bottle/event 计数均为 0；无 `.dev.vars` 与本地 dev server 残留。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 51 轮：Production Admin Allowlist 反向 Smoke

- 发现：第 50 轮能验证真实管理员只读后台链路，但没有把“普通 Clerk 用户不能进后台”固化进同一个生产 smoke。
- 修复：`smoke-production-admin.mjs` 新增可选 `SMOKE_NON_ADMIN_BEARER_TOKEN` / `SMOKE_NON_ADMIN_COOKIE`。
- 覆盖：提供普通用户 session 时，脚本会验证普通用户 `/api/bootstrap` 返回 200 且 `isDemo=false`，但 `/api/admin/metrics` 与 `/api/admin/bottles` 返回 403 `admin_required`。
- 安全：普通用户 session 不是必填项；缺少它时脚本只输出跳过提示。管理员 session 仍是必填项，缺管理员 session 时命令必须失败。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 52 轮：Production Turnstile Missing-Token Smoke

- 发现：readiness 能检查 Turnstile vars 和 secret 名称，但不能证明 production Worker 在真实登录用户投递时会执行 Turnstile 拒绝路径。
- 修复：新增 `scripts/smoke-production-turnstile.mjs` 与 `npm run smoke:production:turnstile`。
- 覆盖：需要 `SMOKE_USER_BEARER_TOKEN` 或 `SMOKE_USER_COOKIE`；先验证 `/api/bootstrap` 返回 `turnstileRequired=true` 和非空 `turnstileSiteKey`，再提交一份缺少 Turnstile token 的有效表单，期望 400 `turnstile_required`。
- 安全：脚本不会创建漂流瓶或 R2 图片；它会像正常登录请求一样触发用户 upsert、activity 事件和限流 KV。缺真实 Clerk 用户 session 时命令必须失败。
- 验证：`node --check scripts/smoke-production-turnstile.mjs`、`npm run audit:source`、`npm run verify:production` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities；`npm run smoke:production:turnstile` 无用户 session 时按预期失败。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 53 轮：商业上线总 Gates

- 发现：现有 readiness、smoke 和 verify 命令各自覆盖一部分上线风险，但缺少一个按商业上线要求汇总的最终总闸门。
- 修复：新增 `scripts/audit-launch-gates.mjs`，并新增 `npm run launch:gates`、`launch:gates:strict`、`launch:gates:remote`、`launch:gates:remote:strict`。
- 覆盖：按项目证据、Cloudflare 栈、production 配置、内容/运营能力、验证命令、人工浏览器证据和远端 Worker/secret 证据分组输出 `READY` / `REVIEW` / `BLOCKED`。
- 人工证据：真实浏览器登录、管理员动作和 Turnstile 投递完成后，需显式设置 `LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true`、`LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true`、`LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true`。
- 验证：`node --check scripts/audit-launch-gates.mjs` 通过；`npm run launch:gates` 输出 `BLOCKED` 且非 strict 退出 0；`npm run launch:gates:strict` 按预期非 0；`npm run launch:gates:remote` 通过 Wrangler 真实确认 production Worker 尚未创建，Clerk/Turnstile secrets 尚未部署；`npm run launch:gates:remote:strict` 按预期非 0；`npm run verify:production`、恢复普通 `npm run build` 与最终 `npm run audit:source` 均通过，audit 为 0 vulnerabilities。
- 当前状态：项目证据、Cloudflare 栈、内容/运营能力和验证命令 gates 已通过；真实 Admin allowlist、Turnstile site key、Clerk publishable key、人工浏览器证据、production Worker 和 production secrets 仍为 blocker。
- 部署：本轮只改维护脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 54 轮：Production Required Secrets 与 Remote Deploy Guard

- 发现：production deploy guard 之前使用本地 strict readiness，容易诱导在本地保存 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY`；同时 `deploy:production:retry` 未显式先跑 production build，存在 stale preview dist 风险。
- 修复：`wrangler.jsonc` 的 `env.production.secrets.required` 声明 `CLERK_SECRET_KEY` 与 `TURNSTILE_SECRET_KEY`；`deploy-with-retry.mjs` 的 production preflight 改为 `check-launch-readiness --remote-secrets --strict`。
- 修复：`deploy:production:retry` 改为先执行 `npm run build:production`，再执行 guarded deploy。
- 覆盖：`check-launch-readiness.mjs` 与 `audit-launch-gates.mjs` 均新增 required secrets declaration 检查。
- 验证：`node --check scripts/check-launch-readiness.mjs`、`node --check scripts/audit-launch-gates.mjs`、`node --check scripts/deploy-with-retry.mjs` 通过；`npm run launch:readiness` 与 `npm run launch:gates` 将 required secrets declaration 标为 OK；`npm run build:production && npm run cf:check:production` 通过；`npm run deploy:production:retry` 先生产构建，再按预期被 remote strict readiness 阻断，未进入 Wrangler deploy；`npm run verify:production`、恢复普通 `npm run build` 与最终 `npm run audit:source` 均通过，audit 为 0 vulnerabilities。
- 边界：Wrangler build 会提示缺本地 required secrets，这是预期警告；生产 secret 值仍只应放在 Cloudflare secrets，不写入本地源码。
- 部署：本轮只改维护脚本、Wrangler 配置和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 55 轮：Dry-run / Deploy Build Freshness

- 发现：第 54 轮已让 production deploy 先构建，但 standalone `cf:check`、`cf:check:production` 与 preview `deploy:retry` 仍可能复用旧 `dist`，让 dry-run 或部署结果滞后于源码。
- 修复：`cf:check` 先执行 `npm run build`，`cf:check:production` 先执行 `npm run build:production`，`deploy:retry` 先执行 `npm run build`；`verify:local`、`verify:launch`、`verify:production` 改为复用这些带 build 的底层脚本。
- 覆盖：`audit-launch-gates.mjs` 新增 preview/production dry-run build freshness 与 preview/production deploy build freshness gate。
- 验证：`node --check scripts/audit-launch-gates.mjs` 通过；`npm run launch:gates` 识别新增 build freshness gates 且按预期保持 `BLOCKED`；`npm run cf:check:production` 先 production build 再 dry-run 并通过；`npm run deploy:production:retry` 先 production build，再按预期被 remote strict readiness 阻断，未进入 Wrangler deploy；`npm run verify:production` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 package scripts、上线 gates 和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 56 轮：Package Script Contract Audit

- 发现：商业上线 gates 已检查 build freshness，但日常 `audit:source` 还不能单独发现 package script 漂移，例如 dry-run、deploy 或 verify 链路绕过构建和审计。
- 修复：`audit-source.mjs` 新增 package script contract 检查，覆盖 `cf:check`、`cf:check:production`、`deploy:retry`、`deploy:production:retry`、`verify:local`、`verify:launch` 与 `verify:production`。
- 覆盖：若后续 `package.json` 删除 build、dry-run、production env、guarded deploy、`audit:source` 或本地 smoke 等关键链路，`npm run audit:source` 会直接失败。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities；production build 的本地 secret warning 仍为预期。
- 部署：本轮只改维护审计脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 57 轮：Production Auth Smoke HTTPS Guard

- 发现：`smoke-production-admin.mjs` 与 `smoke-production-turnstile.mjs` 已默认拒绝非 HTTPS base URL，但 `smoke-production-auth.mjs` 还缺少同样的输入边界。
- 修复：`smoke-production-auth.mjs` 新增 `validateInputs()`，默认要求 base URL 以 `https://` 开头；只有显式设置 `ALLOW_INSECURE_PRODUCTION_SMOKE=true` 时才允许本地诊断。
- 覆盖：防止把非 HTTPS、本地或临时诊断目标误当 production auth smoke。
- 验证：`node --check scripts/smoke-production-auth.mjs` 通过；`node scripts/smoke-production-auth.mjs http://127.0.0.1:8787` 按预期因非 HTTPS 退出；`npm run smoke:production:auth` 按预期失败在 production Worker 尚未创建/未返回生产 API；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 production smoke 脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 58 轮：Production Turnstile Submit CORS Smoke

- 发现：`smoke-production-turnstile.mjs` 已验证 production Turnstile 配置和缺 token 拒绝路径，但未单独验证投递端点 `/api/bottles` 的 POST CORS preflight。
- 修复：新增 `/api/bottles` allowed/denied CORS preflight 检查，并支持 `SMOKE_ALLOWED_ORIGIN` / `SMOKE_DENIED_ORIGIN` 覆盖。
- 覆盖：真实 production Worker 上会同时验证 Turnstile 负向提交与投递端点跨域边界，避免自定义域名或 production origin 切换后漏测 POST CORS。
- 验证：`node --check scripts/smoke-production-turnstile.mjs` 通过；`npm run smoke:production:turnstile` 在未提供真实 Clerk session 时按预期失败；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 production smoke 脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 59 轮：Production Smoke Guard Contract Audit

- 发现：第 57-58 轮补了 production smoke 的 HTTPS 输入保护和 Turnstile CORS 断言，但日常 `audit:source` 还不能发现这些保护被后续改动移除。
- 修复：`audit-source.mjs` 新增 production smoke contract 检查，覆盖 auth/admin/Turnstile smoke 的 HTTPS guard，以及 Turnstile smoke 的 `/api/bottles` CORS allowed/denied 断言。
- 覆盖：如果后续移除 `ALLOW_INSECURE_PRODUCTION_SMOKE` guard、`validateInputs()` 或 Turnstile CORS smoke，`npm run audit:source` 会失败。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改维护审计脚本和文档，不改变 Worker runtime；workers.dev 仍为第 46 轮部署版本 `f21b740e-004a-4542-a7fb-1e272351039c`。

### 第 60 轮：API Vary Origin Cache Boundary

- 发现：`/api/*` 已使用动态 CORS allowlist 和 `Cache-Control: no-store`，但响应头里缺少显式 `Vary: Origin`，缓存层或调试代理可能误复用跨 origin 响应。
- 修复：`securityHeaders` 为 `/api/*` 响应增加 `Vary: Origin`。
- 覆盖：`smoke-public.mjs`、`smoke-production-auth.mjs`、`smoke-production-admin.mjs` 与 `smoke-production-turnstile.mjs` 的安全头检查新增 `/api/*` `Vary: Origin` 断言。
- 验证：脚本语法检查通过；`npm run verify:local`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities；线上 `npm run smoke:public:headers` 通过，确认线上 API 响应带 `Vary: Origin`。
- 部署：`npm run deploy:retry` 第 4 次成功，Workers Version ID `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 61 轮：Security Header Smoke Contract Audit

- 发现：第 60 轮已把 `Vary: Origin` 加入 public / production smoke，但日常 `audit:source` 还不能发现这些安全头断言被后续改动移除。
- 修复：`audit-source.mjs` 新增安全头 smoke contract 检查，覆盖 `smoke-public.mjs`、`smoke-production-auth.mjs`、`smoke-production-admin.mjs` 和 `smoke-production-turnstile.mjs`。
- 覆盖：如果后续移除 `X-Request-Id`、`Cache-Control: no-store`、`Vary: Origin` 或 `Permissions-Policy` 断言，`npm run audit:source` 会失败。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改维护审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 62 轮：Production Smoke Bare-Origin Base URL

- 发现：production smoke 已要求 HTTPS，但如果传入带路径、query 或 hash 的 `PRODUCTION_SMOKE_BASE_URL`，脚本会把 `/api/*` 拼到错误位置，容易产生误诊断。
- 修复：`smoke-production-auth.mjs`、`smoke-production-admin.mjs` 与 `smoke-production-turnstile.mjs` 均新增裸 origin 校验；`audit-source.mjs` 同步检查该 contract。
- 覆盖：production smoke base URL 只能是 `https://your-domain.example` 这种 origin，不允许包含 `/path`、`?query` 或 `#hash`。
- 验证：三个 production smoke 脚本语法检查通过；`node scripts/smoke-production-auth.mjs https://example.com/path` 按预期因非裸 origin 退出；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 production smoke 脚本、审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 63 轮：Launch Gates API Header Contract

- 发现：`audit:source` 和 smoke 已检查 `/api/*` `Vary: Origin`，但商业上线总 gates 还没有把该 runtime contract 作为最终上线维度展示。
- 修复：`audit-launch-gates.mjs` 新增 `/api/*` `Cache-Control: no-store` + `Vary: Origin` runtime 检查，以及 public/prod smoke 的 `Vary: Origin` 覆盖检查。
- 覆盖：最终 `launch:gates` 会在内容/运营能力和验证命令分组中显示 API 响应头 contract 是否完整。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中新增 API header contract 两项均为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 64 轮：Production Smoke CORS Origin Input Guard

- 发现：production smoke 已校验 base URL 是裸 origin，但 `SMOKE_ALLOWED_ORIGIN` / `SMOKE_DENIED_ORIGIN` 仍可能被传入 wildcard、带路径或尾随斜杠的值。
- 修复：三个 production smoke 脚本新增 CORS origin 参数校验；`audit-source.mjs` 同步检查 `validateSmokeOrigin` contract。
- 覆盖：production smoke 的 allowed/denied origin 只能是裸 origin；非 HTTPS 仅允许在显式 `ALLOW_INSECURE_PRODUCTION_SMOKE=true` 的本地诊断中使用。
- 验证：三个 production smoke 脚本语法检查通过；`SMOKE_ALLOWED_ORIGIN='https://*.example.com' node scripts/smoke-production-auth.mjs` 按预期因 wildcard 退出；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 production smoke 脚本、审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 65 轮：Production Credentials Runbook

- 发现：真实 Clerk、Turnstile、管理员白名单和 session token 获取步骤分散在部署文档、脚本说明和项目账本中，不利于最终切 production 时按证据链执行。
- 修复：新增 `docs/PRODUCTION-CREDENTIALS.md`，集中记录生产凭据来源、Cloudflare secret 写入、真实 Clerk session token、production smoke 顺序和人工证据 gates。
- 覆盖：`docs/README.md` 和 `docs/DEPLOYMENT.md` 已链接该 runbook；`audit-launch-gates.mjs` 将它纳入项目证据 gates。
- 验证：`npm run launch:gates` 将 Production credentials runbook 标为 OK，整体仍按预期 `BLOCKED` 在真实生产配置和人工证据；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改 runbook、launch gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 66 轮：Documentation Secret Hygiene Audit

- 发现：新增 production credentials runbook 后，项目需要自动防止真实 secret、session JWT、cookie 或 Cloudflare API token 被写入文档和项目账本。
- 修复：`audit-source.mjs` 新增文档/账本敏感值扫描，覆盖根 README、`PROJECT.md`、`docs/*.md` 和 web 子 README；真实值会失败，`<placeholder>` 占位符允许。
- 覆盖：Clerk secret key、JWT、`__session` cookie、Cloudflare API token、production smoke bearer token 和 cookie 赋值。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 67 轮：Launch Gates Documentation Secret Hygiene

- 发现：`audit:source` 已扫描文档敏感值，但商业上线总 gates 还不能直接发现该审计链路被后续移除。
- 修复：`audit-launch-gates.mjs` 新增 Documentation secret hygiene audit gate，要求 `audit-source.mjs` 保留文档/账本 secret、JWT、session cookie 与 production smoke token/cookie 扫描。
- 覆盖：最终 `launch:gates` 会在验证命令分组中显示文档敏感值审计是否仍存在，避免上线前只看配置而漏掉文档泄密风险。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 新增 gate 为 OK，整体仍按真实生产配置缺口保持 `BLOCKED`。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 68 轮：R2 Media Proxy Launch Gates

- 发现：`/media/*` 已限制只代理 `bottles/` 图片 key 并设置缓存头，但商业上线总 gates 尚未把 R2 公共面作为显式交付边界检查。
- 修复：`audit-launch-gates.mjs` 新增 Media proxy key guard 与 Media proxy cache headers gate。
- 覆盖：检查 `/media/*` 路由、`isSafeMediaKey`、`bottles/` 前缀、路径穿越/双斜杠拒绝、`Cache-Control` 和 `ETag`。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增媒体代理 gates 均为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 69 轮：R2 Media Proxy Source Audit

- 发现：第 68 轮已把媒体代理边界纳入 `launch:gates`，但日常 `verify:launch` 主要依赖 `audit:source`，仍需要常规审计也能拦截该 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkMediaProxyContract()`，检查 `/media/*` 路由、`isSafeMediaKey`、`bottles/` 前缀、路径穿越/双斜杠拒绝、`Cache-Control` 和 `ETag`。
- 覆盖：如果后续改 Worker 时移除 R2 key 边界或缓存头，`npm run audit:source` 会直接失败，并随 `verify:launch` 一起拦住交付。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 70 轮：Queue Consumer Launch Gates

- 发现：Queue consumer 已负责异步审核事件记录，但商业上线总 gates 尚未明确检查成功 `ack` 与失败 `retry` 的消息处理边界。
- 修复：`audit-launch-gates.mjs` 新增 Queue consumer ack/retry gate。
- 覆盖：检查 `queue(batch)`、`moderation_queued` 事件记录、`message.ack()`、`message.retry()` 和 `queue_message_failed` 结构化错误日志。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增 Queue gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 71 轮：Queue Consumer Source Audit

- 发现：第 70 轮已把 Queue consumer 边界纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现异步消息处理 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkQueueConsumerContract()`。
- 覆盖：检查 `queue(batch)`、`moderation_queued` 事件记录、`message.ack()`、`message.retry()` 和 `queue_message_failed` 结构化错误日志。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 72 轮：R2 Create Cleanup Launch Gates

- 发现：投递创建流程先写 R2，再写 D1 元数据；该失败清理边界已经在代码中存在，但商业上线总 gates 尚未显式检查。
- 修复：`audit-launch-gates.mjs` 新增 R2 create cleanup gate。
- 覆盖：检查 `BOTTLE_IMAGES.put(imageKey)`、D1 失败时 `BOTTLE_IMAGES.delete(imageKey)`、`r2_cleanup_failed` 结构化日志和 `throw error;` 保留原失败。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增 R2 create cleanup gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 73 轮：R2 Create Cleanup Source Audit

- 发现：第 72 轮已把 R2 写入失败清理纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现该投递写入 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkR2CreateCleanupContract()`。
- 覆盖：检查 `BOTTLE_IMAGES.put(imageKey)`、D1 失败时 `BOTTLE_IMAGES.delete(imageKey)`、`r2_cleanup_failed` 结构化日志和 `throw error;` 保留原失败。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 74 轮：KV Rate Limit Launch Gates

- 发现：投递、打捞、举报和分享都已走 KV 限流，但商业上线总 gates 尚未显式检查这些可刷入口的限流覆盖。
- 修复：`audit-launch-gates.mjs` 新增 KV rate limit coverage gate。
- 覆盖：检查投递用户每日 12 次、投递 IP 每小时 60 次、打捞用户每分钟 30 次、举报用户每日 20 次、分享用户每小时 10 次的 `enforceRateLimit` 调用。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增 KV 限流 gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 75 轮：KV Rate Limit Source Audit

- 发现：第 74 轮已把关键接口限流纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现限流 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkRateLimitContract()`。
- 覆盖：检查投递用户/IP、打捞用户、举报用户和分享用户的 `enforceRateLimit` 调用。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 76 轮：Cloudflare Binding Health Launch Gates

- 发现：`/api/health` 已探测 D1/KV/R2/Queue 绑定，但商业上线总 gates 尚未检查该健康检查是否仍是真实绑定探测。
- 修复：`audit-launch-gates.mjs` 新增 Cloudflare binding health checks gate。
- 覆盖：检查 D1 `SELECT 1`、KV noop、R2 `list(limit=1)`、Queue binding 存在性、`checkBindings(c.env)` 和绑定失败时 503。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增健康检查 gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 77 轮：Cloudflare Binding Health Source Audit

- 发现：第 76 轮已把绑定健康检查纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现 `/api/health` contract 退化。
- 修复：`audit-source.mjs` 新增 `checkBindingHealthContract()`。
- 覆盖：检查 D1 `SELECT 1`、KV noop、R2 `list(limit=1)`、Queue binding 存在性、`checkBindings(c.env)` 和绑定失败时 503。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 78 轮：Admin CSV Export Safety Launch Gates

- 发现：CSV 导出已做状态校验、行数限制和公式注入防护，但商业上线总 gates 尚未显式检查该运营导出安全 contract。
- 修复：`audit-launch-gates.mjs` 新增 Admin CSV export safety gate。
- 覆盖：检查 `invalid_export_status`、`limit<=5000`、CSV Content-Type、`bottlesToCsv(rows)`、`csvCell`、`= + - @` 公式前缀处理和双引号转义。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增 CSV 安全 gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 79 轮：Admin CSV Export Safety Source Audit

- 发现：第 78 轮已把 CSV 导出安全纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现该导出 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkAdminCsvExportContract()`。
- 覆盖：检查导出 endpoint、状态校验、`limit<=5000`、CSV Content-Type、`bottlesToCsv(rows)`、`csvCell`、公式前缀处理和双引号转义。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 80 轮：Bulk Moderation Safety Launch Gates

- 发现：后台批量审核已做管理员白名单、payload 校验、去重、100 条上限和事件记录，但商业上线总 gates 尚未显式检查该运营写操作安全 contract。
- 修复：`audit-launch-gates.mjs` 新增 Bulk moderation safety gate。
- 覆盖：检查批量审核 endpoint、管理员校验、payload/status 校验、100 条上限、`bulk_moderation_limit`、精选分 clamp、`admin_moderation_bulk_updated` 事件和 helper 内 id 去重。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增批量审核安全 gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 81 轮：Bulk Moderation Safety Source Audit

- 发现：第 80 轮已把批量审核安全纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现该运营写操作 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkBulkModerationContract()`。
- 覆盖：检查批量审核 endpoint、管理员校验、payload/status 校验、100 条上限、`bulk_moderation_limit`、精选分 clamp、事件记录和 helper 内 id 去重。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 82 轮：UGC Report Safety Launch Gates

- 发现：举报入口已做限流、输入校验、去重、自举报拒绝和 3 次自动待审，但商业上线总 gates 尚未显式检查该社区安全 contract。
- 修复：`audit-launch-gates.mjs` 新增 UGC report safety gate。
- 覆盖：检查举报 endpoint、每日 20 次限流、瓶子 id/reason/details 校验、`REPORT_AUTO_REVIEW_THRESHOLD=3`、自举报拒绝、`INSERT OR IGNORE` 去重、重复举报 409、自动转 `pending` 和 `bottle_reported` 事件。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；新增举报安全 gate 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 83 轮：UGC Report Safety Source Audit

- 发现：第 82 轮已把举报安全纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现举报入口 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkUgcReportContract()`。
- 覆盖：检查举报 endpoint、每日 20 次限流、瓶子 id/reason/details 校验、`REPORT_AUTO_REVIEW_THRESHOLD=3`、自举报拒绝、`INSERT OR IGNORE` 去重、重复举报 409、自动转 `pending` 和 `bottle_reported` 事件。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 UGC report safety 继续为 OK。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 84 轮：Image Upload Safety Launch Gates

- 发现：投递链路已做图片必填、MIME 白名单、空文件拒绝、8MB 上限和 R2 `contentType` 写入，但商业上线总 gates 尚未显式检查图片上传安全 contract。
- 修复：`audit-launch-gates.mjs` 新增 Image upload validation gate。
- 覆盖：检查投递路由调用 `validateImage`、R2 通过 `image.stream()` 写入、保留 `contentType: image.type`，以及 `validateImage` 保留 JPG/PNG/WEBP/GIF 白名单、`image_required`、`invalid_image_type`、`image_empty` 和 `image_too_large`。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Image upload validation 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 85 轮：Image Upload Safety Source Audit

- 发现：第 84 轮已把图片上传安全纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现图片校验或 R2 写入 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkImageUploadContract()`。
- 覆盖：检查投递路由调用 `validateImage`、R2 通过 `image.stream()` 写入、保留 `contentType: image.type`，以及 `validateImage` 保留 JPG/PNG/WEBP/GIF 白名单、`image_required`、`invalid_image_type`、`image_empty` 和 `image_too_large`。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Image upload validation 继续为 OK。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 86 轮：Clerk Production Auth Boundary Launch Gates

- 发现：认证层已把 demo 身份限制在 `CLERK_AUTH_ENABLED=false`，production smoke 也覆盖 `X-Dev-User` 被忽略，但商业上线总 gates 尚未显式检查 Clerk 生产认证边界 contract。
- 修复：`audit-launch-gates.mjs` 新增 Clerk production auth boundary gate。
- 覆盖：检查 `@clerk/backend` `verifyToken`、`CLERK_AUTH_ENABLED` 分支、`ENVIRONMENT !== "production"` demo 限制、Bearer/`__session` token 提取、`CLERK_SECRET_KEY`/`CLERK_JWT_KEY` 验证参数、`auth_required`、`invalid_session` 和 production auth smoke 的 dev header ignored 断言。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Clerk production auth boundary 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 87 轮：Clerk Production Auth Boundary Source Audit

- 发现：第 86 轮已把 Clerk 生产认证边界纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现认证 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkClerkAuthBoundaryContract()`。
- 覆盖：检查 `@clerk/backend` `verifyToken`、`CLERK_AUTH_ENABLED` 分支、`ENVIRONMENT !== "production"` demo 限制、Bearer/`__session` token 提取、`CLERK_SECRET_KEY`/`CLERK_JWT_KEY` 验证参数、`auth_required`、`invalid_session` 和 production auth smoke 的 dev header ignored 断言。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Clerk production auth boundary 继续为 OK。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 88 轮：Turnstile Server Validation Launch Gates

- 发现：投递链路已做 Turnstile 服务端校验，production smoke 也覆盖缺 token 路径，但商业上线总 gates 尚未显式检查 Turnstile 服务端 contract。
- 修复：`audit-launch-gates.mjs` 新增 Turnstile server validation gate。
- 覆盖：检查 bootstrap 下发 Turnstile 配置、投递路由读取 `turnstileToken` 并调用 `verifyTurnstile`、`TURNSTILE_REQUIRED`、secret 缺失 `turnstile_not_configured`、缺 token `turnstile_required`、Cloudflare `siteverify` POST、remote IP、`turnstile_unavailable`、`turnstile_failed` 和 production Turnstile smoke 缺 token 断言。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Turnstile server validation 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 89 轮：Turnstile Server Validation Source Audit

- 发现：第 88 轮已把 Turnstile 服务端校验纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现服务端校验 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkTurnstileContract()`。
- 覆盖：检查 bootstrap 下发 Turnstile 配置、投递路由读取 `turnstileToken` 并调用 `verifyTurnstile`、`TURNSTILE_REQUIRED`、secret 缺失 `turnstile_not_configured`、缺 token `turnstile_required`、Cloudflare `siteverify` POST、remote IP、`turnstile_unavailable`、`turnstile_failed` 和 production Turnstile smoke 缺 token 断言。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Turnstile server validation 继续为 OK。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 90 轮：Admin Read Query Safety Launch Gates

- 发现：后台瓶子列表、事件流和 R2 存储审计已做状态/type 校验、limit clamp 和 D1 参数绑定，但商业上线总 gates 尚未显式检查后台只读查询安全 contract。
- 修复：`audit-launch-gates.mjs` 新增 Admin read query safety gate。
- 覆盖：检查后台瓶子列表 `status` 校验与 `limit<=200`、事件 `type` 长度/字符校验与 `limit<=100`、存储审计 `limit<=1000`，以及 admin helper 的 D1 prepared statement bind。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Admin read query safety 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 91 轮：Admin Read Query Safety Source Audit

- 发现：第 90 轮已把后台只读查询安全纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现后台读查询 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkAdminReadQueryContract()`。
- 覆盖：检查后台瓶子列表 `status` 校验与 `limit<=200`、事件 `type` 长度/字符校验与 `limit<=100`、存储审计 `limit<=1000`，以及 admin helper 的 D1 prepared statement bind。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Admin read query safety 继续为 OK。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 92 轮：API Error Response Launch Gates

- 发现：API 已有结构化错误、request id、安全响应头和 API 404 JSON，但商业上线总 gates 尚未显式检查错误响应 contract。
- 修复：`audit-launch-gates.mjs` 新增 API error response contract gate。
- 覆盖：检查 `ApiError`/`jsonError`、`app.onError`、结构化 `api_error` 日志、`internal_error`、API 404 `not_found`、`requestId`、`securityHeaders`、`errorBoundary`、API `Cache-Control: no-store`、`Vary: Origin` 和 public smoke 的 `/api` not-found 断言。
- 验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 API error response contract 为 OK。
- 部署：本轮只改商业上线 gates 和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 93 轮：API Error Response Source Audit

- 发现：第 92 轮已把 API 错误响应纳入 `launch:gates`，但常规 `verify:launch` 仍需要通过 `audit:source` 发现错误响应 contract 退化。
- 修复：`audit-source.mjs` 新增 `checkApiErrorResponseContract()`。
- 覆盖：检查 `ApiError`/`jsonError`、`app.onError`、结构化 `api_error` 日志、`internal_error`、API 404 `not_found`、`requestId`、`securityHeaders`、`errorBoundary`、API `Cache-Control: no-store`、`Vary: Origin` 和 public smoke 的 `/api` not-found 断言。
- 验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 API error response contract 继续为 OK。
- 部署：本轮只改源码审计脚本和文档，不改变 Worker runtime；workers.dev 已停留在第 60 轮版本 `2f271fae-1baf-40be-86fd-65d8272c1fd8`。

### 第 94 轮：Production Dry-run Verification

- 发现：完成第 93 轮后需要重新确认 production build 与 Wrangler production dry-run。
- 修复：无代码修改，本轮为验证切片。
- 覆盖：`npm run verify:production` 覆盖 `cf:types`、`typecheck`、production build、Wrangler production dry-run、`audit:source` 与 npm audit。
- 验证：命令通过，audit 为 0 vulnerabilities；production build 提示缺 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY`，这是当前真实生产外部配置 blocker，dry-run 本身通过。
- 部署：本轮不创建 production Worker，不改变 workers.dev 预览版本。

### 第 95 轮：Local Production Readiness

- 发现：需要重新确认本地 production readiness blocker 是否准确集中在真实配置。
- 修复：无代码修改，本轮为验证切片。
- 覆盖：`npm run launch:readiness` 检查 production D1/R2/KV/Queue、auth/Turnstile 开关、required secrets 声明、production CORS、Admin allowlist、Turnstile site key、Clerk publishable key 和预制内容体量。
- 验证：命令正常执行并输出 `BLOCKED`；Cloudflare 绑定、生产开关、required secrets 声明、production CORS 和预制内容为 OK，真实 blocker 为 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY` 与待部署的 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY`。
- 部署：本轮不创建 production Worker，不改变 workers.dev 预览版本。

### 第 96 轮：Remote Production Readiness

- 发现：需要确认 Cloudflare 远端 production Worker 与 secret 名称当前真实状态。
- 修复：无代码修改，本轮为验证切片。
- 覆盖：`npm run launch:readiness:remote` 在本地 readiness 基础上调用 Wrangler 检查 production Worker 与已部署 secret 名称。
- 验证：命令正常执行并输出 `BLOCKED`；本地 production 绑定和 CORS 仍为 OK，远端真实 blocker 为 production Worker `guanghe-drift-bottle-production` 尚未创建，且 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY` 尚未作为 Cloudflare production secrets 部署。
- 部署：本轮不创建 production Worker，不改变 workers.dev 预览版本。

### 第 97 轮：Remote Commercial Launch Gates

- 发现：需要确认商业上线总 gates 在远端 production Worker/secret 缺失状态下的最终 blocker 归因。
- 修复：无代码修改，本轮为验证切片。
- 覆盖：`npm run launch:gates:remote` 覆盖项目证据、Cloudflare 栈、production 配置、内容运营、安全 contract、验证命令、人工证据和远端 Worker/secret 名称。
- 验证：命令正常执行并输出 `BLOCKED`；项目证据、Cloudflare 栈、内容运营、安全 contract 与验证命令均为 OK，真实 blocker 为 Admin allowlist、Turnstile site key、Clerk publishable key、真实 Clerk/Admin/Turnstile 人工浏览器证据、production Worker 与 production secrets。
- 部署：本轮不创建 production Worker，不改变 workers.dev 预览版本。

### 第 98 轮：Preview Public Security Smoke

- 发现：收尾阶段需要确认线上 preview 公共 API、安全头和 CORS 仍可用。
- 修复：无代码修改，本轮为验证切片。
- 覆盖：`npm run smoke:public:headers` 覆盖线上 health、bootstrap、admin/reported 默认 403、CSV/events 默认 403、media invalid key、举报 invalid reason、CORS allowed/denied、API not-found 与安全响应头。
- 验证：命令通过，目标为 `https://guanghe-drift-bottle.adwardhuanguca.workers.dev`。
- 部署：本轮不改变 workers.dev 预览版本。

### 第 99 轮：Code Quality And Performance Audit

- 发现：最终收口前需要确认源码审计、危险模式扫描、产物体积、临时配置残留和本地 dev server 状态。
- 修复：无代码修改，本轮为验证和文档切片。
- 覆盖：`npm run audit:source`、`npm run launch:gates`、危险模式 `rg` 扫描、`dist/client` 与 Worker bundle 目录体积检查、`.dev.vars` 残留检查、本地 Vite/Worker dev server 进程检查。
- 验证：`npm run audit:source` 通过；`npm run launch:gates` 正常执行并按预期输出 `BLOCKED`，OK 项覆盖项目证据、Cloudflare 栈、内容运营、安全 contract 与验证命令；危险模式扫描无命中；`dist/client` 为 356K，Worker bundle 目录为 144K；无 `.dev.vars` 残留，无本地 dev server 运行。
- 边界：本轮确认 blocker 仍为真实生产配置和人工证据，不能把 preview 状态写成 production 已验收。

### 第 100 轮：Final Verification And Review Close

- 发现：100 轮收口需要同时确认 preview 发版链路、production dry-run、线上 preview smoke、远端商业上线 gates 和交付现场卫生。
- 修复：无运行时代码修改，本轮为最终验证、整体代码质量审查、性能审查和文档收口。
- 覆盖：`npm run verify:production`、`npm run verify:launch`、`npm run smoke:public:headers`、`npm run launch:gates:remote`、`.dev.vars` 残留检查、本地 dev server 进程检查、`dist/client` 与 Worker bundle 目录体积检查。
- 验证：`verify:production` 与 `verify:launch` 均通过，npm audit 为 0 vulnerabilities；`smoke:public:headers` 通过；`launch:gates:remote` 正常执行并按预期输出 `BLOCKED`，OK 项覆盖项目证据、Cloudflare 栈、内容运营、安全 contract 与验证命令；`dist/client` 为 356K，Worker bundle 目录为 144K。
- 代码质量结论：源码审计、危险模式扫描、发布脚本 contract、Cloudflare 绑定健康检查、Clerk/Turnstile 生产边界、UGC 举报、后台导出/批量审核、R2 媒体代理、Queue ack/retry、API 错误响应与响应头 contract 均有自动挡板。
- 剩余风险：真实 production 仍缺 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY`、production Worker、Cloudflare production secrets 和真实浏览器验收证据。

### 第 101 轮：Public Repository Privacy Cleanup

- 发现：项目目录不是 Git 仓库，准备首次同步 GitHub 并转公开前，需要先删除原始方案文档、本地 D1 备份、生成 SQL、Wrangler 本地缓存等不该进入公开仓库的文件。
- 修复：新增根 `.gitignore`，覆盖依赖、构建产物、环境变量、Wrangler 缓存、原始文档、数据库导出和生成 SQL；删除本地私有/生成文件。
- 覆盖：`光核安利漂流瓶：活动方案.doc`、`web/backups/d1/*.sql`、`web/scripts/preseed.generated.sql`、`web/.wrangler/`、`.env*`、`.dev.vars`、`node_modules/`、`dist/`。
- 验证：`npm run preseed:build` 可重新生成 `preseed.generated.sql`；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；Git dry-run 提交清单未包含原始文档、备份 SQL、生成 SQL、`.wrangler`、`dist` 或 `node_modules`；staged 高风险 token/私钥/JWT 扫描无真实密钥命中。
