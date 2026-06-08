# 光核安利漂流瓶项目账本

## 项目目标

把“光核安利漂流瓶”活动做成可上线的商业级网页项目。首版先不购买域名，使用 Cloudflare 全栈能力承载前后端：Workers Static Assets + Worker API、D1、R2、KV，并预留 Queue、Turnstile、Clerk 登录注册和后续生产部署配置。

## 背景 / 栈 / 架构概览

- 活动核心：玩家用一张图投递游戏安利，随机打捞陌生人的安利瓶，把喜欢的内容保存到个人安利墙。
- 社交定位：一次性善意传递，不做长期关注关系。
- 视觉基调：参考“光核”的克制、硬核、真诚社区感；深色内容优先界面，图片作为主要情绪载体。
- 前端：`web/` 内 React + Vite + TypeScript。
- 后端：同一 Cloudflare Worker 承载 `/api/*` 与 `/media/*`，静态资源由 Workers Static Assets 提供。
- 数据：D1 存用户、漂流瓶、打捞记录、安利墙、任务和活动日志；R2 存上传图片；KV 存配置、敏感词与轻量缓存；Queue 预留异步审核与数据处理。
- 登录注册：按用户要求使用 sleck，当前实现按 Clerk 处理，前端集成 `@clerk/clerk-react`，Worker 使用 Clerk token 校验入口；无密钥的本地开发可用演示身份。

## 进度日志

### 2026-06-06

- 读取活动方案文档，提炼出投递、打捞、安利墙、任务、审核、数据导出等核心需求。
- 使用 Refero 研究深色游戏/媒体发现界面、上传表单、图片墙和邮箱注册登录流。
- 生成三张视觉概念图：主页、投递表单、打捞/安利墙管理。
- 用户明确要求后端改为 Cloudflare 全套，架构从传统服务器转为 Cloudflare Worker + D1 + R2 + KV。
- 创建项目账本与首轮 Cloudflare 全栈工程规划。
- 完成 `web/` React + Vite + Cloudflare Worker 全栈应用。
- 完成 Worker API：健康检查、bootstrap、投递、打捞、保存安利墙、分享任务、用户墙、运营数据、R2 图片代理。
- 完成 Cloudflare 远端资源：D1 `guanghe-drift-bottle-db`、KV `GH_CONFIG`、R2 `guanghe-drift-bottle-images`、Queue `guanghe-drift-bottle-moderation`。
- 完成远端 D1 migration 与 seed，KV 写入敏感词配置。
- 已部署到 Workers 预览地址：https://guanghe-drift-bottle.adwardhuanguca.workers.dev
- 完成首轮浏览器验证：本地和线上桌面截图、移动端无横向溢出、投递/打捞/保存安利墙核心流程通过。
- 完成首轮性能优化：示例图从 PNG 转为 WebP，总量约从 1.6MB 降到 72KB，移除首页外部示例图依赖。
- 完成首轮代码质量审查：`npm run typecheck`、`npm run build`、`npm run cf:check`、`npm audit --audit-level=moderate` 均通过；业务代码扫描未发现 TODO/FIXME、`Math.random`、`passThroughOnException`、unsafe cast 或业务 `any`。
- 完成第 2 轮安全修订：新增 `ADMIN_USER_IDS` 与后台指标接口管理员白名单。类型检查、构建、Cloudflare dry-run 通过；部署重试时 Cloudflare API 连续超时，当前线上仍为上一版可用部署，待网络恢复后重试推送第 2 轮。
- 完成第 3 轮安全接入：新增 Cloudflare Turnstile 可选校验，`/api/bootstrap` 下发 `security` 配置，投递接口后端调用 `siteverify`；无 secret 的预览环境保持可提交，生产可切 `TURNSTILE_REQUIRED=true`。
- 完成第 2、3 轮部署补推：Cloudflare API 恢复后部署成功，Workers 预览地址更新到包含 Admin 白名单与 Turnstile 接入的版本。
- 完成第 4 轮后台默认拒绝修订：`ADMIN_USER_IDS` 为空时 `/api/admin/metrics` 默认 403，不再因预览环境 `ENVIRONMENT=development` 放行；新增 Hono `app.onError` 全局错误处理，确保返回 JSON 错误体。
- 完成线上复验：`/api/health`、`/api/bootstrap` 正常；`/api/admin/metrics` 未授权返回 403；Playwright 验证线上桌面/移动端无 console error、无失败请求、0 图片 fallback、无横向溢出。
- 完成第 5 轮错误路径修订：后台未授权改成显式 JSON 403 返回，不再把预期权限拒绝走异常抛出路径；删除旧的 `requireAdminUser` helper。当前 Workers Version ID：`76baf0a0-290f-41c7-ae14-6164331ba48c`。
- 完成第 6 轮生产环境绑定修订：按 Wrangler 命名环境不自动继承 bindings 的规则，为 `env.production` 显式补齐 D1、R2、KV、Queue；新增 `build:production` 与 `cf:check:production` 脚本，production dry-run 验证通过。
- 完成第 7 轮代码修订并补推上线：投递流程在 R2 图片写入后、D1 元数据写入失败时会清理刚写入的 R2 对象，降低孤儿对象风险。
- 完成第 8 轮代码修订并补推上线：新增 KV 轻量限流，投递按用户/IP 限制、打捞按用户短窗口限制、分享按用户限速。
- 完成第 9 轮代码修订并补推上线：新增运营 CSV 导出 `/api/admin/export/bottles.csv` 与审核动作 `/api/admin/bottles/:id/moderation`，均受 `ADMIN_USER_IDS` 白名单保护；导出 CSV 做参数校验与公式注入防护。
- 完成第 10 轮备份恢复修订：新增 `docs/BACKUP.md`、`web/backups/README.md` 与 D1 info/bookmark/export 脚本；本地 `npm run db:export:local` 验证通过，生成 SQL 导出文件。远端导出和 bookmark 仍依赖 Cloudflare API，待 API 稳定后复验。
- 完成第 11 轮代码修订并补推上线：新增只读 R2 存储巡检 `/api/admin/storage/audit`，对比 `bottles.image_key` 与 R2 `bottles/` 前缀对象，返回孤儿对象样本、缺失对象样本和分页 cursor；接口受 `ADMIN_USER_IDS` 白名单保护。
- 完成第 12 轮代码修订并补推上线：将打捞查询从 `ORDER BY RANDOM()` 改为 count eligible + Web Crypto offset + indexed created_at order，降低 D1 全量随机排序风险；本地 bootstrap -> dredge smoke 通过。
- 完成第 13 轮验证流程修订：新增 `verify:launch` 与 `verify:production` 脚本；`npm run verify:launch` 完整通过，覆盖 `cf:types`、`typecheck`、`build`、`cf:check`、`npm audit --audit-level=moderate`。
- 完成第 14 轮前端后台权限修订并补推上线：前端“数据”页改为调用真实 `/api/admin/metrics`，未在白名单时展示后台访问受限，不再用公开 bootstrap metrics 冒充后台；修复 demo/Clerk token getter 不稳定导致 admin 请求循环的问题。当前 Workers Version ID：`3eecbaea-0259-4ee7-b098-6d22ddb9a250`。
- 完成第 14 轮线上复验：`/api/health` 与 `/api/bootstrap` 通过；`/api/admin/metrics`、CSV 导出、storage audit、moderation 路由未授权均返回 403；线上桌面/移动端 Playwright 无破图、无横向溢出、无失败请求；后台页只触发 1 次 admin 403 并显示受限状态。
- 补充第 10 轮远端复验：`npm run db:info:remote` 通过，D1 远端库 `guanghe-drift-bottle-db` 有 9 张表，大小 143 kB；`npm run db:bookmark:remote` 通过，当前 bookmark 为 `00000008-00000000-00005082-cd46bcaac8b9cd9a851bb0c5be407fae`。
- 完成第 15 轮运营后台修订并补推上线：新增 `GET /api/admin/bottles` 审核列表接口，前端“数据”页接入状态筛选、精选分编辑、公开/待审/下架行级动作、CSV 下载和 R2 storage audit 展示；本地临时管理员演示验证后删除 `.dev.vars`，默认环境仍 403。当前 Workers Version ID：`95ba922f-183a-4bbe-87f1-067bc6080b66`。
- 完成第 15 轮验证：`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；本地管理员 UI Playwright 验证 11 行、巡检显示、CSV 下载、桌面/移动端无横向溢出；线上 `/api/health` 通过，所有 admin 入口默认 403，线上桌面/移动端 8 张卡、0 图片 fallback、无失败请求。
- 完成第 16 轮预制内容导入工具：新增 `scripts/preseed-bottles.csv`、CSV 校验/SQL 生成器、远端分语句导入脚本和 `web/scripts/README.md`；`npm run preseed:build` 与 `npm run db:preseed:local` 通过。
- 完成第 16 轮远端导入：远端 D1 导入 20 条 `preseed-bottle-*` 内容；文件上传路径两次 Cloudflare API 超时后，改用 `execute-preseed-remote.mjs` 分语句 upsert 并验证 `npm run db:preseed:remote` 通过。远端 D1 当前 `bottles=29`、`preseed=20`，线上 bootstrap 第一条为预制内容。
- 完成第 17 轮预制内容扩容：`scripts/preseed-bottles.csv` 从 20 条扩展到 100 条，覆盖场景、剧情、人物、外观、战绩和截图类安利；`npm run preseed:build` 与 `npm run db:preseed:local` 均通过。
- 完成第 17 轮远端导入与脚本韧性修订：远端 D1 大语句和小批次均遇到 Cloudflare API 超时后，将 `execute-preseed-remote.mjs` 改为按 INSERT values 分批执行并加入重试退避；`npm run db:preseed:remote` 通过，远端 D1 当前 `bottles=109`、`preseed=100`、`approved=109`。
- 完成第 17 轮线上复验：线上 `/api/bootstrap` 返回 `metrics.bottles=109`、`participants=113`；Playwright 复验桌面/移动端无失败请求、无横向溢出，8 张首页图片全部加载成功；`npm run verify:launch` 通过，audit 为 0 vulnerabilities。
- 完成第 18 轮批量审核修订：按 Refero style/screen 参考锁完成运营后台批量选择与批量公开/待审/下架；新增 `POST /api/admin/bottles/moderation/bulk`，一次最多处理 100 条，继续受 `ADMIN_USER_IDS` 白名单保护。
- 完成第 18 轮本地验证：临时 `.dev.vars` 管理员身份下，API smoke 和 Playwright 均完成 2 条内容“批量待审 -> 批量公开”恢复；桌面/移动端无请求失败和横向溢出。验证后删除 `.dev.vars`，重建确认源码与 dist 均无临时配置残留。
- 完成第 18 轮部署与线上复验：已部署 Workers Version ID `3e844af5-1ce6-4c19-93a1-62252a359b25`；线上新批量 endpoint、审核列表均默认 403；线上首页 8 张图片加载成功，后台受限页桌面/移动端显示正确；`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 完成第 19 轮运营事件流：新增 D1 migration `0002_activity_events_created.sql`，为 `activity_events(created_at DESC)` 建索引；新增 `GET /api/admin/events` 只读事件流接口，前端后台展示最近 20 条事件和 metadata 摘要。
- 完成第 19 轮迁移与验证：`npm run db:migrate:local`、`npm run db:migrate:remote` 均通过，远端 `PRAGMA index_list('activity_events')` 确认 `idx_activity_events_created` 存在；本地临时管理员 UI 显示 20 条事件且桌面/移动端无溢出。
- 完成第 19 轮部署与线上复验：已部署 Workers Version ID `ebf479e0-b5dc-4a9f-a22f-7edacab9c320`；线上 `/api/admin/events` 默认 403，首页 metrics 仍为 `bottles=109`；线上后台受限页桌面/移动端显示正确；`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。
- 完成第 20 轮健康检查硬化：新增 `worker/lib/health.ts`，`/api/health` 会轻量探测 D1、KV、R2 与 Queue 绑定，返回各绑定 ok 与 latency，不暴露具体数据或对象名。
- 完成第 20 轮验证与部署：本地 `/api/health` 探测 D1/KV/R2/Queue 均 ok；`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；已部署 Workers Version ID `763119a6-a9b9-4c2b-a629-482a8b55b006`。
- 完成第 20 轮线上复验：线上 `/api/health` 返回 200，`data.ok=true`，D1/KV/R2/Queue 均 ok；预览环境仍为 `CLERK_AUTH_ENABLED=false` 和空 `ADMIN_USER_IDS` 默认拒绝后台。
- 完成第 21 轮上线配置体检：新增 `scripts/check-launch-readiness.mjs`、`launch:readiness` 与 `launch:readiness:strict`，检查 production D1/R2/KV/Queue、Clerk/Turnstile/Admin 配置和 100 条预制内容密度；当前输出 `BLOCKED`，明确缺 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY` 与已部署 secret。
- 完成第 21 轮验证：`node --check scripts/check-launch-readiness.mjs`、`npm run launch:readiness`、`npm run typecheck` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮未部署 Worker，因为只改维护脚本、环境样例和文档。
- 完成第 22 轮远端 secret 体检：新增 `launch:readiness:remote`，会调用 `wrangler secret list --env production --format json` 检查 production Worker 与 secret 名称，不读取 secret 值；当前远端体检仍为 `BLOCKED`，真实 Clerk/Turnstile secret 尚未验证存在，Cloudflare API 连续返回 timeout。
- 完成第 23 轮 UGC 举报闭环：新增 `bottle_reports` D1 migration、`POST /api/bottles/:id/report`、用户级举报限流、重复举报保护、作者自举报拦截、3 次举报自动转待审和 `bottle_reported` 活动事件。
- 完成第 23 轮前端与 Refero 验证：按 Refero report modal/flow 参考，在打捞结果动作栏新增举报按钮和深色举报弹窗；本地 Playwright 验证桌面/移动端 modal 可见、提交成功、无横向溢出。
- 完成第 23 轮部署与线上复验：本地与远端 `0003_bottle_reports.sql` migration 均通过；`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；已部署 Workers Version ID `a94d4e9d-9e4f-40a9-8381-85d0ed81128e`；线上 `/api/health` 通过，举报无效原因和作者自举报错误路径通过，远端 `bottle_reports` 当前为 0。
- 完成第 24 轮源码审计与性能预算挡板：新增 `scripts/audit-source.mjs` 与 `npm run audit:source`，检查危险模式、`.dev.vars` 残留、`.env.example` secret 空值和前端 JS/CSS 体积预算；已挂入 `verify:launch` 与 `verify:production`。
- 完成第 24 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities；当前 JS 产物 255377 bytes，CSS 产物 22593 bytes，低于预算。
- 完成第 25 轮公共接口 smoke 固化：新增 `scripts/smoke-public.mjs`、`npm run smoke:public` 与 `npm run smoke:public:local`，检查 health、bootstrap、admin 默认 403 和举报错误路径，不提交真实举报。
- 完成第 25 轮验证：`node --check scripts/smoke-public.mjs`、`npm run smoke:public`、`npm run smoke:public:local`、`npm run typecheck` 与 `npm run audit:source` 均通过；线上 workers.dev 预览地址公共 smoke 通过。
- 完成第 26 轮举报后台工作台代码与本地验证：按 Refero 筛选/报表/状态标签参考，`/api/admin/bottles` 与 CSV 导出新增 `status=reported` 特殊筛选，后台新增“被举报”筛选、举报风险徽标和事件类型过滤输入。
- 完成第 26 轮验证：本地临时管理员 `.dev.vars` 下，API smoke 验证 reported 列表、reported CSV、`bottle_reported` 事件过滤均通过；Playwright 验证桌面/移动端后台“被举报”筛选、举报徽标、事件过滤可见且无横向溢出。测试数据和临时 `.dev.vars` 已清理。
- 第 26 轮部署状态：`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；但当时 `npm run deploy` 连续 4 次遇到 Cloudflare API timeout，后续第 31 轮已补推上线。
- 完成第 27 轮部署韧性修订：新增 `scripts/deploy-with-retry.mjs` 与 `npm run deploy:retry`，对 Cloudflare API timeout、网络失败和资源上传 retryable error 做最多 5 次退避重试；`node --check scripts/deploy-with-retry.mjs` 与 `npm run audit:source` 通过。
- 第 27 轮远端状态：`DEPLOY_RETRIES=5 DEPLOY_RETRY_DELAY_MS=4000 npm run deploy:retry` 当时连续 5 次仍遇到 Cloudflare API timeout；后续第 31 轮使用同一脚本补推成功。
- 完成第 28 轮安全响应头修订：新增全局 `securityHeaders` middleware，所有响应带 `X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`，HTTPS 请求带 HSTS，`/api/*` 统一 `Cache-Control: no-store`。
- 完成第 28 轮验证：新增 `smoke:public:headers` 与 `smoke:public:local:headers`；本地 Worker 严格 header smoke 通过，`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。后续第 31 轮已发布到 workers.dev。
- 完成第 29 轮请求追踪修订：新增 `requestId` middleware，每个响应带 `X-Request-Id`，并在未知错误日志里记录 `requestId`、method 与 path，方便线上排障和客服回溯。
- 完成第 29 轮验证：严格 header smoke 已断言 `X-Request-Id`；`node --check scripts/smoke-public.mjs`、`npm run typecheck`、本地 `npm run smoke:public:local:headers`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities。普通 dist 已恢复。
- 完成第 30 轮 API 404 一致性修订：新增 `app.notFound`，未知 `/api/*` 返回 JSON 404 `not_found`，非 API 仍保留普通 404；严格 header smoke 增加未知 API 路径检查。
- 完成第 30 轮验证：`node --check scripts/smoke-public.mjs`、`npm run typecheck`、本地 `npm run smoke:public:local:headers`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；`.dev.vars` 无残留，普通 dist 已恢复。
- 完成第 31 轮补推上线与线上复验：Cloudflare API 恢复后，`DEPLOY_RETRIES=5 DEPLOY_RETRY_DELAY_MS=4000 npm run deploy:retry` 首次尝试成功，当前 Workers Version ID `15cb32c6-e4b2-40d2-b4e9-21b0294bcf5c`。
- 完成第 31 轮线上验证：`npm run smoke:public`、`npm run smoke:public:headers` 均通过；线上 reported 审核列表、reported CSV、`bottle_reported` 事件过滤默认 403 且带 `X-Request-Id`；Playwright 桌面/移动端无失败请求、无 console error、0 fallback 图片、无横向溢出。
- 完成第 31 轮上线体检复验：`npm run launch:readiness` 与 `npm run launch:readiness:remote` 均可执行；Cloudflare bindings、Clerk auth flag、Turnstile required 和 100 条预制内容 OK；仍缺真实 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY`、production Worker、`CLERK_SECRET_KEY` 与 `TURNSTILE_SECRET_KEY`。
- 完成第 32 轮 smoke 覆盖修订：`smoke-public.mjs` 默认新增 reported 审核列表、reported CSV 和 `bottle_reported` 事件过滤默认 403 检查，把第 26 轮后台边界固化进部署后 smoke。
- 完成第 32 轮验证：`node --check scripts/smoke-public.mjs`、`npm run smoke:public`、`npm run smoke:public:headers` 与 `npm run audit:source` 均通过。本轮只改维护脚本和文档，不需要重新部署 Worker。
- 完成第 33 轮 production readiness 指引强化：`launch:readiness:remote` 在 production Worker 不存在时改为明确提示先设置真实 Clerk、Turnstile 和 admin 配置，再按 `docs/DEPLOYMENT.md` 切换生产。
- 完成第 33 轮验证：`node --check scripts/check-launch-readiness.mjs`、`npm run launch:readiness:remote` 与 `npm run audit:source` 均通过；当前 blocker 输出为 production Worker 未创建、Clerk/Turnstile secrets 未部署和真实前端/Admin/Turnstile 配置缺失。
- 完成第 34 轮 UGC 图片输入校验修订：后端拒绝 0 字节图片并返回 `image_empty`；前端上传控件即时校验类型、大小和空文件，并释放预览 object URL，减少无效上传和本地内存泄漏。
- 完成第 34 轮验证与上线：本地 API 空文件 smoke 返回 400 `image_empty`，本地 Playwright 验证空图片提示可见且无溢出；`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；已部署 Workers Version ID `77ec8512-44e0-49ef-8aeb-fae66a44a9d1`。
- 完成第 34 轮线上复验：`npm run smoke:public`、`npm run smoke:public:headers` 通过；线上 0 字节图片投递返回 400 `image_empty` 且带 `X-Request-Id`；Playwright 桌面/移动端无失败请求、无 console error、0 fallback 图片、无横向溢出。
- 完成第 35 轮 R2 media key 边界修订：`/media/*` 只允许读取 `bottles/` 前缀下的 jpg/png/webp/gif key，拒绝其他 R2 对象路径；公共 smoke 新增非法 media key 400 检查。
- 完成第 35 轮验证与上线：本地 `smoke:public:local:headers`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities；已部署 Workers Version ID `2e470c7b-ca0a-4396-8470-aa9501505af9`。线上 `smoke:public`、`smoke:public:headers` 和 Playwright 桌面/移动端复验均通过。
- 完成第 36 轮 Queue consumer ack/retry 硬化：`MODERATION_QUEUE` 消费者改为 `recordEvent` 成功后再 ack，失败时记录 `queue_message_failed` 并 retry，避免异步事件写失败后消息被提前确认。
- 完成第 36 轮验证与上线：`npm run typecheck`、`npm run build`、`npm run verify:launch` 与 `npm run verify:production` 均通过，audit 为 0 vulnerabilities；已部署 Workers Version ID `be7c0d06-8b5b-4ada-81ae-cf8b16298d92`。线上 `smoke:public`、`smoke:public:headers` 和 Playwright 桌面/移动端复验均通过。
- 完成第 37 轮 Queue consumer 本地真实 smoke：本地投递测试瓶后，Queue consumer 写入 `moderation_queued` 事件；测试后清理本地 D1 `users/bottles/activity_events` 等相关行和本地 R2 测试对象，复查计数归零。
- 完成第 38 轮 Queue smoke 脚本固化：新增 `scripts/smoke-queue-local.mjs` 与 `npm run smoke:queue:local`，可在本地 dev server 下自动创建测试瓶、等待 `moderation_queued`、清理本地 D1/R2 并验证无残留。
- 完成第 38 轮验证：`node --check scripts/smoke-queue-local.mjs`、`npm run smoke:queue:local` 与 `npm run audit:source` 均通过；复查本地测试 bottle/event 计数为 0。本轮只改维护脚本和文档，无需重新部署。
- 完成第 39 轮 Queue smoke 自启动脚本：新增 `scripts/smoke-queue-local-auto.mjs` 与 `npm run smoke:queue:local:auto`，自动启动本地 Worker、等待 `/api/health`、运行 Queue smoke，并关闭本地 dev server。
- 完成第 39 轮验证：`node --check scripts/smoke-queue-local-auto.mjs`、`npm run smoke:queue:local:auto` 与 `npm run audit:source` 均通过；复查无本地 dev server 残留，测试 bottle/event 计数为 0。本轮只改维护脚本和文档，无需重新部署。
- 完成第 40 轮本地全量 smoke 聚合：新增 `scripts/smoke-local-all.mjs` 与 `npm run smoke:local:all`，自动启动本地 Worker，连续跑公共 header smoke 与 Queue consumer smoke，再关闭 server。
- 完成第 40 轮验证：`node --check scripts/smoke-local-all.mjs`、`npm run smoke:local:all` 与 `npm run audit:source` 均通过；复查无本地 dev server 残留，测试 bottle/event 计数为 0。本轮只改维护脚本和文档，无需重新部署。
- 完成第 41 轮 `verify:local` 聚合验证：新增 `npm run verify:local`，覆盖 `cf:types`、`typecheck`、`build`、`audit:source`、`cf:check`、本地全量 smoke 和 `npm audit`。
- 完成第 41 轮验证：`npm run verify:local` 通过，audit 为 0 vulnerabilities；本地全量 smoke 内的 Queue 测试完成并清理，复查无本地 dev server 残留，测试 bottle/event 计数为 0。本轮只改维护脚本和文档，无需重新部署。
- 完成第 42 轮源码审计覆盖面修订：`audit-source.mjs` 新增 package scripts 目标检查，确认 `package.json` 中 `node scripts/*.mjs` 引用的维护脚本真实存在，避免坏 npm 命令进入交付。
- 完成第 42 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities；本地全量 smoke 完成并清理，复查无 dev server 残留，测试 bottle/event 计数为 0。本轮只改维护脚本和文档，无需重新部署。
- 完成第 43 轮构建产物 hygiene 审计：`audit-source.mjs` 新增 `dist/client` 检查，禁止交付 sourcemap、`sourceMappingURL` 和后端 secret key 名称出现在 client build 中。
- 完成第 43 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities；本地全量 smoke 完成并清理，复查无 dev server 残留，测试 bottle/event 计数为 0。本轮只改维护脚本和文档，无需重新部署。
- 完成第 44 轮生产 CORS 上线挡板：`env.production.ALLOWED_ORIGINS` 已固定为 `https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev`；Worker runtime 在 production 且 allowlist 为空时不再放行任意 Origin。
- 完成第 44 轮 readiness 修订：`check-launch-readiness.mjs` 新增 production CORS origin 检查，要求非空、`https://`、无 wildcard、非 localhost/127.0.0.1，且必须是纯 origin。
- 完成第 44 轮验证与补推上线：`node --check scripts/check-launch-readiness.mjs`、`npm run launch:readiness`、`npm run launch:readiness:remote`、`npm run verify:local`、`npm run verify:production`、`npm run build` 均通过预期；`npm run deploy:retry` 第 3 次成功，Workers Version ID `6b60d163-1a6f-4b22-afc7-bd0942b198fa`；线上 `npm run smoke:public` 与 `npm run smoke:public:headers` 均通过。
- 完成第 45 轮 CORS smoke 固化：`smoke-public.mjs` 新增 `/api/health` preflight allowed/denied origin 检查，默认验证 `http://localhost:5173` 被允许、`https://example.invalid` 不返回 `Access-Control-Allow-Origin`；可用 `SMOKE_ALLOWED_ORIGIN` / `SMOKE_DENIED_ORIGIN` 覆盖。
- 完成第 45 轮验证：`node --check scripts/smoke-public.mjs`、`npm run audit:source`、线上 `npm run smoke:public`、线上 `npm run smoke:public:headers`、`npm run verify:local`、`npm run verify:production`、`npm run build`、`npm run launch:readiness` 与 `npm run launch:readiness:remote` 均通过预期；线上 smoke 已覆盖 CORS allowed/denied。由于只改维护脚本，本轮无需重新部署 Worker。
- 完成第 46 轮旧 CORS helper 清理：删除未使用的 `applyCors` helper，避免后续误用旧的“空 allowlist 放行”语义；`rg "applyCors|allowed.length === 0 || allowed.includes"` 已无命中。
- 完成第 46 轮验证与补推上线：`npm run typecheck`、`npm run audit:source`、`npm run verify:local`、`npm run verify:production`、`npm run build` 均通过，audit 为 0 vulnerabilities；`npm run deploy:retry` 第 1 次成功，Workers Version ID `f21b740e-004a-4542-a7fb-1e272351039c`；线上 `npm run smoke:public:headers` 通过。
- 完成第 47 轮 production deploy 前置挡板：`deploy-with-retry.mjs` 检测到 `--env production` / `--env=production` / `-e production` 时，会先运行 `node scripts/check-launch-readiness.mjs --strict`；未 strict-ready 时直接退出，不进入 Wrangler deploy。
- 完成第 47 轮验证：新增 `npm run deploy:production:retry`；当前真实缺 Clerk/Turnstile/Admin 时运行该命令会输出 readiness `BLOCKED` 并停止，证明生产部署被拦截；`node --check scripts/deploy-with-retry.mjs`、`npm run audit:source`、`npm run verify:local`、`npm run verify:production` 与 `npm run build` 均通过，audit 为 0 vulnerabilities。本轮只改维护脚本和 package script，无需重新部署 Worker。
- 完成第 48 轮远端 production strict readiness 命令：新增 `npm run launch:readiness:remote:strict`，用于 production Worker 创建后强制验收 Cloudflare 端 Worker 与 secret 名称；当前真实缺口下该命令以非 0 退出并列出 production Worker、Clerk secret、Turnstile secret 等 blocker。
- 完成第 48 轮验证：`npm run audit:source`、`npm run launch:readiness:remote:strict` 的预期阻断、`npm run deploy:production:retry` 的预期阻断、`npm run verify:local`、`npm run verify:production`、线上 `npm run smoke:public:headers` 与恢复普通 `npm run build` 均通过预期，audit 为 0 vulnerabilities。本轮只改 package script 和文档，无需重新部署 Worker。
- 完成第 49 轮 production auth smoke 命令：新增 `scripts/smoke-production-auth.mjs` 与 `npm run smoke:production:auth`，用于 production Worker 创建后验证 `/api/health` 为 production、未登录 `/api/bootstrap` 和 `/api/admin/metrics` 返回 401、`X-Dev-User` 在 production 下不能绕过认证、API 404/安全头/CORS allowed-denied 正常。
- 完成第 49 轮验证：`node --check scripts/smoke-production-auth.mjs`、`npm run audit:source`、`npm run verify:local`、`npm run verify:production`、线上 `npm run smoke:public:headers` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities；当前 `npm run smoke:production:auth` 按预期失败为 production Worker 未创建导致 404，不会误报生产验收通过。本轮只改维护脚本和文档，无需重新部署 Worker。
- 完成第 50 轮 production admin smoke 命令：新增 `scripts/smoke-production-admin.mjs` 与 `npm run smoke:production:admin`，用于 production Worker 创建并取得真实 Clerk 管理员 session 后，只读验证 bootstrap、后台 metrics、审核列表、reported 列表、事件流、CSV 导出、R2 storage audit、后台错误路径、CORS 和安全头；无管理员 session 时必须失败，避免 demo 身份或缺 production Worker 被误报为通过。
- 完成第 50 轮验证：`npx wrangler --version` 确认 Wrangler `4.98.0`；`node --check scripts/smoke-production-admin.mjs`、`npm run audit:source`、`npm run verify:production`、`npm run verify:local` 均通过，audit 为 0 vulnerabilities；`npm run smoke:production:admin` 在未设置 `SMOKE_ADMIN_BEARER_TOKEN` / `SMOKE_ADMIN_COOKIE` 时按预期失败并提示需要真实 Clerk 管理员 session。本地 Queue smoke 写入并清理测试瓶，复查本地 `queue-smoke-*` bottle/event 计数均为 0；无 `.dev.vars` 与本地 dev server 残留。本轮只改维护脚本和文档，无需重新部署 Worker。
- 完成第 51 轮 production admin smoke 反向边界增强：`smoke-production-admin.mjs` 支持可选 `SMOKE_NON_ADMIN_BEARER_TOKEN` / `SMOKE_NON_ADMIN_COOKIE`，在真实生产验收时可同时证明普通 Clerk 用户能通过 `/api/bootstrap`，但访问 `/api/admin/metrics` 与 `/api/admin/bottles` 会返回 403 `admin_required`。
- 第 51 轮状态：当前仍未提供真实 Clerk session，因此 admin smoke 的必填管理员 session 阻断保持不变；普通用户 session 只是额外反向验收，不会让缺 production Worker / secret 的状态误报通过。本轮只改维护脚本和文档，无需重新部署 Worker。
- 完成第 52 轮 production Turnstile 负向 smoke 命令：新增 `scripts/smoke-production-turnstile.mjs` 与 `npm run smoke:production:turnstile`，用于 production Worker 创建并取得真实 Clerk 普通用户 session 后，验证 `/api/bootstrap` 下发 `turnstileRequired=true` 与非空 `turnstileSiteKey`，并验证缺少 Turnstile token 的有效投递表单会返回 400 `turnstile_required`。
- 完成第 52 轮验证：`node --check scripts/smoke-production-turnstile.mjs`、`npm run audit:source`、`npm run verify:production` 与恢复普通 `npm run build` 均通过，audit 为 0 vulnerabilities；`npm run smoke:production:turnstile` 在未设置 `SMOKE_USER_BEARER_TOKEN` / `SMOKE_USER_COOKIE` 时按预期失败并提示需要真实 Clerk 用户 session。
- 第 52 轮状态：该 smoke 不会创建漂流瓶或 R2 图片，但会触发正常登录用户 upsert、activity 事件和限流 KV；当前仍未提供真实 Clerk 用户 session 且 production Worker 尚未创建，因此命令应保持失败，不得误报生产 Turnstile 验收通过。本轮只改维护脚本和文档，无需重新部署 Worker；无 `.dev.vars` 与本地 dev server 残留。
- 完成第 53 轮商业上线总 gates：新增 `scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`launch:gates:strict`、`launch:gates:remote` 与 `launch:gates:remote:strict`，按项目证据、Cloudflare 栈、production 配置、内容/运营能力、验证命令、人工浏览器证据和远端 Worker/secret 证据分组输出 `READY` / `REVIEW` / `BLOCKED`。
- 完成第 53 轮验证：`node --check scripts/audit-launch-gates.mjs` 通过；`npm run launch:gates` 输出 `BLOCKED` 且非 strict 退出 0；`npm run launch:gates:strict` 按预期非 0；`npm run launch:gates:remote` 通过 Wrangler 真实确认 production Worker 尚未创建，`CLERK_SECRET_KEY` 与 `TURNSTILE_SECRET_KEY` 尚未部署；`npm run launch:gates:remote:strict` 按预期非 0；`npm run verify:production`、恢复普通 `npm run build` 与最终 `npm run audit:source` 均通过，audit 为 0 vulnerabilities。当前已通过项目证据、Cloudflare 栈、运营能力和验证命令 gates；仍缺真实 Admin allowlist、Turnstile site key、Clerk publishable key、人工浏览器验收证据、production Worker 与 production secrets。
- 完成第 54 轮 production secret 与部署 guard 修订：在 `env.production.secrets.required` 声明 `CLERK_SECRET_KEY` 与 `TURNSTILE_SECRET_KEY`，只记录 secret 名称不记录值；`deploy:production:retry` 改为先 `build:production`，再由 `deploy-with-retry.mjs` 执行 `check-launch-readiness --remote-secrets --strict`，避免生产部署依赖本地保存 secret 值或使用 stale preview dist。
- 完成第 54 轮验证：`node --check scripts/check-launch-readiness.mjs`、`node --check scripts/audit-launch-gates.mjs`、`node --check scripts/deploy-with-retry.mjs` 通过；`npm run launch:readiness` 与 `npm run launch:gates` 已把 required secrets declaration 标为 OK；`npm run build:production && npm run cf:check:production` 通过并确认 production 绑定；`npm run deploy:production:retry` 先生产构建，再按预期被 remote strict readiness 阻断，未进入 Wrangler deploy；`npm run verify:production`、恢复普通 `npm run build` 与最终 `npm run audit:source` 均通过，audit 为 0 vulnerabilities。Wrangler 构建会提示缺本地 required secrets，这是预期警告，不要求把 secret 值写入源码。
- 完成第 55 轮 dry-run / deploy 构建新鲜度修订：`cf:check` 与 `cf:check:production` 分别先跑 preview / production build 再 Wrangler dry-run；`deploy:retry` 先跑 preview build 再进入重试部署；`verify:local`、`verify:launch`、`verify:production` 复用这些底层命令，避免重复构建同时避免 stale `dist`。
- 完成第 55 轮 gates 覆盖：`audit-launch-gates.mjs` 新增 preview/production dry-run build freshness 与 preview/production deploy build freshness 检查，确保商业上线总闸门会发现绕过构建的发布脚本。
- 完成第 55 轮验证：`node --check scripts/audit-launch-gates.mjs` 通过；`npm run launch:gates` 识别新增 build freshness gates 且按预期保持 `BLOCKED`；`npm run cf:check:production` 先 production build 再 dry-run 并通过；`npm run deploy:production:retry` 先 production build，再按预期被 remote strict readiness 阻断，未进入 Wrangler deploy；`npm run verify:production` 与 `npm run verify:local` 均通过，audit 为 0 vulnerabilities。
- 完成第 56 轮源码审计契约修订：`audit-source.mjs` 增加 package script contract 检查，覆盖 `cf:check` / `cf:check:production` 的先构建再 dry-run、`deploy:retry` / `deploy:production:retry` 的先构建再 guarded deploy，以及 `verify:local` / `verify:launch` / `verify:production` 必须包含对应 dry-run 和 `audit:source`。
- 完成第 56 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run verify:launch`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities；production build 的本地 secret warning 仍为预期。
- 完成第 57 轮 production auth smoke 输入边界修订：`smoke-production-auth.mjs` 增加 HTTPS base URL 保护，默认拒绝非 HTTPS production auth smoke；仅本地诊断时可显式设置 `ALLOW_INSECURE_PRODUCTION_SMOKE=true`。
- 完成第 57 轮验证：`node --check scripts/smoke-production-auth.mjs` 通过；`node scripts/smoke-production-auth.mjs http://127.0.0.1:8787` 按预期因非 HTTPS 退出；`npm run smoke:production:auth` 按预期失败在 production Worker 尚未创建/未返回生产 API；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 58 轮 production Turnstile CORS smoke 修订：`smoke-production-turnstile.mjs` 增加 `/api/bottles` POST CORS allowed/denied preflight 验收，并支持 `SMOKE_ALLOWED_ORIGIN` / `SMOKE_DENIED_ORIGIN` 覆盖。
- 完成第 58 轮验证：`node --check scripts/smoke-production-turnstile.mjs` 通过；`npm run smoke:production:turnstile` 在未提供真实 Clerk session 时按预期失败；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 59 轮 production smoke guard 审计修订：`audit-source.mjs` 增加 production smoke contract 检查，确保 auth/admin/Turnstile smoke 保留 HTTPS guard，且 Turnstile smoke 保留 `/api/bottles` CORS allowed/denied 断言。
- 完成第 59 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 60 轮 API CORS 缓存边界硬化：`securityHeaders` 为 `/api/*` 响应增加 `Vary: Origin`，并把 public / production smoke 的安全头检查同步扩展到 `Vary: Origin`。
- 完成第 60 轮验证与补推上线：脚本语法检查通过；`npm run verify:local`、`npm run verify:production` 均通过，audit 为 0 vulnerabilities；`npm run deploy:retry` 第 4 次成功，Workers Version ID `2f271fae-1baf-40be-86fd-65d8272c1fd8`；线上 `npm run smoke:public:headers` 通过，确认线上 API 响应带 `Vary: Origin`。
- 完成第 61 轮安全头 smoke contract 审计修订：`audit-source.mjs` 增加 public/prod smoke 安全头断言检查，确保 smoke 脚本持续覆盖 `X-Request-Id`、`Cache-Control: no-store`、`Vary: Origin` 和 `Permissions-Policy`。
- 完成第 61 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 62 轮 production smoke base URL 输入边界修订：`smoke-production-auth.mjs`、`smoke-production-admin.mjs` 与 `smoke-production-turnstile.mjs` 均要求 `PRODUCTION_SMOKE_BASE_URL` 是裸 origin，不允许 path、query 或 hash；`audit-source.mjs` 同步检查该契约。
- 完成第 62 轮验证：三个 production smoke 脚本语法检查通过；`node scripts/smoke-production-auth.mjs https://example.com/path` 按预期因非裸 origin 退出；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 63 轮商业上线总 gates 响应头 contract 修订：`audit-launch-gates.mjs` 新增 `/api/*` `Cache-Control: no-store` + `Vary: Origin` runtime 检查，以及 public/prod smoke 的 `Vary: Origin` 覆盖检查。
- 完成第 63 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中新增 API header contract 两项均为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 64 轮 production smoke CORS origin 输入边界修订：三个 production smoke 脚本均校验 `SMOKE_ALLOWED_ORIGIN` / `SMOKE_DENIED_ORIGIN` 为裸 origin，不允许 wildcard、path、query、hash 或尾随斜杠；`audit-source.mjs` 同步检查该契约。
- 完成第 64 轮验证：三个 production smoke 脚本语法检查通过；`SMOKE_ALLOWED_ORIGIN='https://*.example.com' node scripts/smoke-production-auth.mjs` 按预期因 wildcard 退出；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 65 轮生产凭据与真实 smoke runbook：新增 `docs/PRODUCTION-CREDENTIALS.md`，集中记录 Clerk publishable/secret、Turnstile site/secret、管理员白名单、真实 Clerk session token、production smoke 顺序和人工证据 gates；`audit-launch-gates.mjs` 将该 runbook 纳入项目证据。
- 完成第 65 轮验证：`npm run launch:gates` 将 Production credentials runbook 标为 OK，整体仍按预期 `BLOCKED` 在真实生产配置和人工证据；`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 66 轮文档/账本敏感值审计修订：`audit-source.mjs` 扫描 `README.md`、`PROJECT.md`、`docs/*.md` 和 web 子 README，阻止真实 Clerk secret、JWT、session cookie、Cloudflare API token 或 smoke token/cookie 赋值进入文档；`<placeholder>` 占位符保持允许。
- 完成第 66 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities。
- 完成第 67 轮商业上线总 gates 文档敏感值审计修订：`audit-launch-gates.mjs` 新增 Documentation secret hygiene audit gate，要求 `audit:source` 保留文档/账本 secret、JWT、session cookie 与 production smoke token/cookie 扫描。
- 完成第 67 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中新增文档敏感值 gate 为 OK，整体仍因真实 Clerk/Turnstile/Admin 与 production Worker 证据保持 `BLOCKED`。
- 完成第 68 轮 R2 媒体代理上线 gates 修订：`audit-launch-gates.mjs` 新增 Media proxy key guard 与 Media proxy cache headers，检查 `/media/*` 只代理安全的 `bottles/` 图片 key，拒绝路径穿越/双斜杠，并保留 bounded public cache 与 ETag。
- 完成第 68 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中新增媒体代理两项均为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 69 轮 R2 媒体代理源码审计修订：`audit-source.mjs` 新增 media proxy contract 检查，日常 `verify:launch` 也会拦截 `/media/*` 路由、`bottles/` key guard、路径穿越拒绝、缓存头或 ETag 被移除的情况。
- 完成第 69 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮不改变 Worker runtime，无需重新部署。
- 完成第 70 轮 Queue consumer 上线 gates 修订：`audit-launch-gates.mjs` 新增 Queue consumer ack/retry gate，检查异步审核队列保留 `moderation_queued` 事件记录、成功 `ack`、失败结构化日志和 `retry`。
- 完成第 70 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Queue consumer gate 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 71 轮 Queue consumer 源码审计修订：`audit-source.mjs` 新增 queue consumer contract 检查，日常 `verify:launch` 也会拦截 `queue(batch)`、`moderation_queued`、`ack`、`retry` 或结构化失败日志被移除的情况。
- 完成第 71 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮只改维护审计和文档，无需 Worker 版本变更。
- 完成第 72 轮 R2 写入失败清理上线 gates 修订：`audit-launch-gates.mjs` 新增 R2 create cleanup gate，检查投递创建流程保留 R2 put 后 D1 insert 失败时的 `BOTTLE_IMAGES.delete(imageKey)`、`r2_cleanup_failed` 结构化日志和原错误继续抛出。
- 完成第 72 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 R2 create cleanup 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 73 轮 R2 写入失败清理源码审计修订：`audit-source.mjs` 新增 R2 create cleanup contract 检查，日常 `verify:launch` 也会拦截 R2 put、D1 失败清理、结构化 cleanup 日志或原错误抛出被移除的情况。
- 完成第 73 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮只改维护审计和文档，无需 Worker 版本变更。
- 完成第 74 轮 KV 限流上线 gates 修订：`audit-launch-gates.mjs` 新增 KV rate limit coverage gate，检查投递用户/IP、打捞用户、举报用户和分享用户限流仍保留。
- 完成第 74 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 KV rate limit coverage 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 75 轮 KV 限流源码审计修订：`audit-source.mjs` 新增 rate limit contract 检查，日常 `verify:launch` 也会拦截投递、打捞、举报或分享入口限流被移除。
- 完成第 75 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮只改维护审计和文档，无需 Worker 版本变更。
- 完成第 76 轮 Cloudflare 绑定健康检查上线 gates 修订：`audit-launch-gates.mjs` 新增 Cloudflare binding health checks gate，检查 `/api/health` 保留 D1、KV、R2、Queue 绑定探测，并在绑定失败时返回 503。
- 完成第 76 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Cloudflare binding health checks 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 77 轮 Cloudflare 绑定健康检查源码审计修订：`audit-source.mjs` 新增 binding health contract 检查，日常 `verify:launch` 也会拦截 `/api/health` 退化成静态 ok 或移除 D1/KV/R2/Queue 探测。
- 完成第 77 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮只改维护审计和文档，无需 Worker 版本变更。
- 完成第 78 轮 Admin CSV 导出安全上线 gates 修订：`audit-launch-gates.mjs` 新增 Admin CSV export safety gate，检查导出状态校验、`limit<=5000`、CSV Content-Type、`bottlesToCsv`、公式注入前缀处理和双引号转义。
- 完成第 78 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Admin CSV export safety 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 79 轮 Admin CSV 导出安全源码审计修订：`audit-source.mjs` 新增 admin CSV export contract 检查，日常 `verify:launch` 也会拦截导出状态校验、行数限制、CSV MIME、`bottlesToCsv` 或公式注入防护被移除。
- 完成第 79 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮只改维护审计和文档，无需 Worker 版本变更。
- 完成第 80 轮后台批量审核安全上线 gates 修订：`audit-launch-gates.mjs` 新增 Bulk moderation safety gate，检查管理员白名单、payload/status 校验、id 去重、100 条上限、精选分 clamp 和批量审核事件记录。
- 完成第 80 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Bulk moderation safety 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 81 轮后台批量审核安全源码审计修订：`audit-source.mjs` 新增 bulk moderation contract 检查，日常 `verify:launch` 也会拦截管理员校验、payload/status 校验、100 条上限、精选分 clamp、事件记录或 helper 去重被移除。
- 完成第 81 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source` 与 `npm run verify:launch` 均通过，audit 为 0 vulnerabilities；本轮只改维护审计和文档，无需 Worker 版本变更。
- 完成第 82 轮 UGC 举报安全上线 gates 修订：`audit-launch-gates.mjs` 新增 UGC report safety gate，检查举报限流、瓶子 id/reason/details 校验、重复举报去重、自举报拒绝、3 次自动待审和举报事件记录。
- 完成第 82 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 UGC report safety 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 83 轮 UGC 举报安全源码审计修订：`audit-source.mjs` 新增 `checkUgcReportContract()`，日常 `verify:launch` 也会拦截举报 endpoint、限流、输入校验、去重、自举报拒绝、自动待审或事件记录被移除。
- 完成第 83 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 UGC report safety 继续为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 84 轮图片上传安全上线 gates 修订：`audit-launch-gates.mjs` 新增 Image upload validation gate，检查投递必须调用 `validateImage`、R2 通过 `image.stream()` 写入并保留 `contentType`，且图片校验保留必填、MIME 白名单、空文件拒绝和 8MB 上限。
- 完成第 84 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Image upload validation 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 85 轮图片上传安全源码审计修订：`audit-source.mjs` 新增 `checkImageUploadContract()`，日常 `verify:launch` 也会拦截图片必填、MIME 白名单、空文件拒绝、8MB 上限、R2 stream 写入或 `contentType` 被移除。
- 完成第 85 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Image upload validation 继续为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 86 轮 Clerk 生产认证边界上线 gates 修订：`audit-launch-gates.mjs` 新增 Clerk production auth boundary gate，检查生产不接受 `X-Dev-User` demo 绕过、只通过 Bearer/`__session` 获取 token、调用 Clerk `verifyToken`、缺登录返回 `auth_required`、无效会话返回 `invalid_session`，并确认 production auth smoke 覆盖 dev header ignored。
- 完成第 86 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Clerk production auth boundary 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 87 轮 Clerk 生产认证边界源码审计修订：`audit-source.mjs` 新增 `checkClerkAuthBoundaryContract()`，日常 `verify:launch` 也会拦截 demo header、Clerk token 验证、`auth_required`/`invalid_session` 或 production auth smoke 边界断言被移除。
- 完成第 87 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Clerk production auth boundary 继续为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 88 轮 Turnstile 服务端校验上线 gates 修订：`audit-launch-gates.mjs` 新增 Turnstile server validation gate，检查 bootstrap 下发 Turnstile 配置、投递调用 `verifyTurnstile`、缺 token 拒绝、secret 缺失时阻断、Cloudflare `siteverify` POST、remote IP 传递、不可用/失败错误码，以及 production Turnstile smoke 的缺 token 断言。
- 完成第 88 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Turnstile server validation 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 89 轮 Turnstile 服务端校验源码审计修订：`audit-source.mjs` 新增 `checkTurnstileContract()`，日常 `verify:launch` 也会拦截 Turnstile bootstrap、投递 token、siteverify、remote IP、缺 token、secret 缺失、不可用/失败错误码或 production smoke 断言被移除。
- 完成第 89 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Turnstile server validation 继续为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 90 轮后台只读查询安全上线 gates 修订：`audit-launch-gates.mjs` 新增 Admin read query safety gate，检查后台瓶子列表、事件流、R2 存储审计保留状态/type 校验、limit 上限，以及 admin helper 继续使用 D1 参数绑定。
- 完成第 90 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Admin read query safety 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 91 轮后台只读查询安全源码审计修订：`audit-source.mjs` 新增 `checkAdminReadQueryContract()`，日常 `verify:launch` 也会拦截后台列表/事件/存储审计输入校验、limit 上限或 D1 参数绑定被移除。
- 完成第 91 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 Admin read query safety 继续为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 92 轮 API 错误响应上线 gates 修订：`audit-launch-gates.mjs` 新增 API error response contract gate，检查 `ApiError`/`jsonError` 结构、`onError`、API 404 `not_found`、`X-Request-Id`、API `no-store`/`Vary: Origin` 与 public smoke 的 not-found 断言。
- 完成第 92 轮验证：`node --check scripts/audit-launch-gates.mjs`、`npm run launch:gates`、`npm run audit:source` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 API error response contract 为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 93 轮 API 错误响应源码审计修订：`audit-source.mjs` 新增 `checkApiErrorResponseContract()`，日常 `verify:launch` 也会拦截结构化错误、API 404 JSON、request id、安全头、API no-store 或 public smoke not-found 断言被移除。
- 完成第 93 轮验证：`node --check scripts/audit-source.mjs`、`npm run audit:source`、`npm run launch:gates` 与 `npm run verify:launch` 均通过预期，audit 为 0 vulnerabilities；`launch:gates` 中 API error response contract 继续为 OK，整体仍因真实生产配置和人工证据保持 `BLOCKED`。
- 完成第 94 轮 production dry-run 验证：`npm run verify:production` 通过，覆盖 `cf:types`、`typecheck`、production build、Wrangler production dry-run、`audit:source` 与 npm audit；生产构建提示缺 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY` 属于预期外部 blocker，dry-run 本身通过。
- 完成第 95 轮本地 production readiness 验证：`npm run launch:readiness` 正常执行并按预期输出 `BLOCKED`；Cloudflare production D1/R2/KV/Queue、生产 auth/Turnstile 开关、required secrets 声明、production CORS 与预制内容数量为 OK，真实 blocker 为 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY` 和待部署的 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY`。
- 完成第 96 轮远端 production readiness 验证：`npm run launch:readiness:remote` 正常执行并按预期输出 `BLOCKED`；本地 production 绑定和 CORS 仍为 OK，远端真实 blocker 为 production Worker `guanghe-drift-bottle-production` 尚未创建，且 Cloudflare production secrets `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY` 名称尚未部署。
- 完成第 97 轮远端商业上线总 gates 验证：`npm run launch:gates:remote` 正常执行并按预期输出 `BLOCKED`；项目证据、Cloudflare 栈、内容运营、安全 contract 与验证命令均为 OK，真实 blocker 为 Admin allowlist、Turnstile site key、Clerk publishable key、真实 Clerk/Admin/Turnstile 人工浏览器证据、production Worker 与 production secrets。
- 完成第 98 轮线上 preview 安全头 smoke：`npm run smoke:public:headers` 通过，覆盖线上 health、bootstrap、admin/reported 默认 403、CSV/events 默认 403、media invalid key、举报 invalid reason、CORS allowed/denied、API not-found 与安全响应头。
- 完成第 99 轮代码质量与性能审查：`npm run audit:source` 通过，`npm run launch:gates` 正常执行并按预期输出 `BLOCKED`；项目证据、Cloudflare 栈、内容运营、安全 contract 与验证命令均为 OK，真实 blocker 仍集中在 Admin allowlist、Turnstile site key、Clerk publishable key、真实 Clerk/Admin/Turnstile 人工浏览器证据、production Worker 与 production secrets。
- 完成第 99 轮收尾巡检：危险模式扫描未命中 `Math.random()`、`ORDER BY RANDOM()`、`passThroughOnException`、`as unknown as`、`TODO/FIXME`；`dist/client` 为 356K、Worker bundle 目录为 144K；项目内无 `.dev.vars` 残留，无本地 Vite/Worker dev server 运行。
- 完成第 100 轮最终验证与商业上线门禁收口：`npm run verify:production`、`npm run verify:launch` 与线上 `npm run smoke:public:headers` 均通过，npm audit 为 0 vulnerabilities；production dry-run 仍提示缺 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY`，这是当前真实外部配置 blocker，不影响 dry-run 通过。
- 完成第 100 轮整体代码质量与性能收口：`npm run launch:gates:remote` 正常执行并按预期输出 `BLOCKED`；项目证据、Cloudflare 栈、内容运营、安全 contract 与验证命令均为 OK；真实 blocker 为 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY`、真实 Clerk/Admin/Turnstile 浏览器证据、production Worker `guanghe-drift-bottle-production` 未创建，以及 Cloudflare production secrets `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY` 未部署。最终复查确认项目内无 `.dev.vars`、无本地 dev server，`dist/client` 为 356K、Worker bundle 目录为 144K。
- 完成第 101 轮公开仓库隐私清理：新增根 `.gitignore`，排除本地依赖、构建产物、Wrangler 缓存、环境文件、原始方案文档、数据库导出和生成 SQL；删除本地 `光核安利漂流瓶：活动方案.doc`、`web/backups/d1/guanghe-drift-bottle-db-local-20260606T012726Z.sql`、`web/scripts/preseed.generated.sql` 与 `web/.wrangler/`，避免首次公开提交误带私有资料或生成物；`npm run preseed:build`、`npm run audit:source` 与 `npm run verify:launch` 均通过，Git dry-run 提交清单确认私有/生成文件不会提交。

## 已知问题和风险

- Clerk 密钥、Turnstile 密钥、管理员 Clerk user id 等生产 secrets 尚未由用户提供；`npm run launch:readiness` 会显式标记这些 blocker。
- 当前线上地址为可用预览环境，顶层部署 `CLERK_AUTH_ENABLED=false`，走演示身份。需要接入 Clerk keys 后切换生产环境或把顶层变量改成真实登录注册。
- `/api/admin/*` 已默认拒绝未列入 `ADMIN_USER_IDS` 的用户；若要本地或预览查看后台，需要显式设置管理员 Clerk user id 或演示 user id。
- 活动方案要求约 100 条预制内容；当前已上线 100 条 `preseed-bottle-*` 内容。后续如替换为真实玩家文案或活动官方截图，继续通过 CSV -> SQL -> D1 upsert 流程维护。
- 图片自动审核先做基础格式/大小/敏感词/字数规则，深度图像审核需后续接入 Cloudflare AI 或第三方审核服务。
- 举报达到 3 次会自动把公开漂流瓶转为待审；这只是轻量社区安全挡板，深度审核仍需后续接入图像/文本审核。
- “sleck”按上下文暂解释为 Clerk。如用户指另一个认证服务，需要替换认证适配层。
- 当前 Worker 使用同一服务同时承载预览与 API；正式商业上线建议添加自定义域名、真实 Clerk secret、Turnstile site/secret key、生产环境变量和管理员 Clerk user id。
- `npm run launch:readiness:remote` 已可检查 Cloudflare 端 secret 名称；当前真实结果是 production Worker `guanghe-drift-bottle-production` 尚未创建，且 Clerk/Turnstile secrets 尚未部署。
- Production CORS origin 已在配置和 readiness 中收紧；如果未来绑定自定义域名，必须同步更新 `env.production.ALLOWED_ORIGINS`，否则真实浏览器跨域请求会被拒绝。
- 第 26-101 轮小步修订已完成；workers.dev 预览站已更新到 `2f271fae-1baf-40be-86fd-65d8272c1fd8`，第 60 轮已补推 Worker runtime header 硬化，第 61-100 轮只改维护审计、production smoke、launch gates 脚本、production runbook 和收尾验证，第 101 轮做公开仓库隐私清理，无需 Worker 版本变更。正式 production 环境仍需真实 Clerk/Turnstile/Admin 配置后再创建和验收。

## 经验记录

- 新项目目录起步时先建立 `PROJECT.md`，后续每轮 meaningful change 都更新这里。
- Cloudflare 新项目优先使用 `wrangler.jsonc` 和最近的 `compatibility_date`；不要手写过期 TOML。
- Worker 中优先使用绑定访问 D1/R2/KV，不从 Worker 内调用 Cloudflare REST API。
- `verify:launch` 与 `verify:production` 已包含 `audit:source`；后续新增危险模式白名单时要改脚本，不要绕过验证命令。
- 线上部署后优先跑 `npm run smoke:public`，它覆盖不会提交真实用户内容的公共路径、错误路径和 CORS allowed/denied preflight。
- 第 29 轮后，本地新版本可跑 `npm run smoke:public:local:headers` 验证安全响应头和 `X-Request-Id`；线上新版本发布后再跑 `npm run smoke:public:headers`。
- 如果 `npm run deploy` 遇到 Cloudflare API timeout，先确认 `verify:launch`/`verify:production` 与当前线上 `smoke:public`，再记录为外部部署待重试，不要说线上已有新版本。
- Production CORS 不允许空 allowlist 放行全部 Origin；`ALLOWED_ORIGINS` 必须写成逗号分隔的 `https://` origin，不能带路径、通配符或本地主机。
- `smoke-public.mjs` 默认会验证一个允许 origin 和一个拒绝 origin；如果对 production/custom domain 跑 smoke，按实际 CORS 配置设置 `SMOKE_ALLOWED_ORIGIN`。
- `/api/*` 必须同时返回 `Cache-Control: no-store` 与 `Vary: Origin`，避免动态 CORS 响应被缓存层跨 origin 复用。
- API 错误响应必须保持结构化 JSON、`X-Request-Id` 和 API no-store；未知 `/api/*` 不能退回纯文本。
- `audit:source` 同步检查 API 错误响应 contract；常规验证也应防止错误响应退回无 request id 或纯文本。
- `deploy:production:retry` 会先跑 production build 与 remote strict readiness；如果真实 Clerk/Turnstile/Admin 配置、production Worker 或远端 secret 名称未就绪，它应当失败并阻止 production deploy。Production secrets 通过 `env.production.secrets.required` 声明名称并存放在 Cloudflare secrets，不应把 secret 值写入本地源码。
- `cf:check`、`cf:check:production`、`deploy:retry`、`deploy:production:retry` 都应当先构建当前 bundle，再 dry-run 或部署；商业上线 gates 已把这一点作为发布链路新鲜度检查。
- `audit:source` 同步检查关键 package script contract；后续改 `package.json` 发布/验证脚本时，必须同时保持 build、dry-run、deploy guard 和源码审计链路。
- `audit:source` 会扫描文档/账本敏感值；真实 secret、session JWT、cookie 和 Cloudflare token 只能放在外部平台或当前 shell，不得写入 Markdown。
- `launch:gates` 会确认文档敏感值审计仍挂在 `audit:source` 中；商业上线总闸门不能只检查配置，也要确认后续维护不会把真实 token 写回文档。
- `launch:gates` 也会检查 `/media/*` 的 R2 代理边界；公共图片路由必须只暴露 `bottles/` 图片 key，并保留缓存头与 ETag。
- `audit:source` 同步检查 R2 媒体代理 contract；这样常规 `verify:launch` 也能发现 `/media/*` key 边界或缓存头退化。
- `launch:gates` 会检查 Queue consumer 的成功 `ack` 与失败 `retry` contract；异步审核消息不能在关键记录失败时被吞掉。
- `audit:source` 同步检查 Queue consumer contract；常规验证也应发现异步审核队列被移除 `ack`/`retry` 或失败日志。
- `launch:gates` 会检查 R2 写入失败清理 contract；D1 元数据插入失败时必须删除刚写入的 R2 对象，避免孤儿图片增长。
- `launch:gates` 会检查图片上传安全 contract；投递图片必须保留类型白名单、空文件拒绝、8MB 上限和 R2 `contentType`。
- `audit:source` 同步检查图片上传安全 contract；常规验证也应防止投递图片校验或 R2 `contentType` 写入退化。
- `audit:source` 同步检查 R2 写入失败清理 contract；常规验证也应防止投递写入链路留下孤儿对象风险。
- `launch:gates` 会检查关键可刷接口的 KV 限流覆盖；投递、打捞、举报和分享不能在商业上线前失去速率挡板。
- `audit:source` 同步检查关键可刷接口的 KV 限流 contract；常规验证也应防止高频接口被误改成无限制。
- `launch:gates` 会检查 `/api/health` 的 Cloudflare 绑定探测 contract；健康检查不能退化成静态 ok，必须覆盖 D1、KV、R2 和 Queue。
- `launch:gates` 会检查 Clerk 生产认证边界；生产不能接受 demo header 绕过，必须通过 Clerk token 验证。
- `launch:gates` 会检查 Turnstile 服务端校验；生产投递不能只依赖前端组件，必须服务端验证 token。
- `audit:source` 同步检查 Turnstile 服务端校验；常规验证也应防止投递校验退化成只依赖前端。
- `audit:source` 同步检查 Clerk 生产认证边界；常规验证也应防止 demo header 或 Clerk token 验证边界退化。
- `audit:source` 同步检查 `/api/health` 的 Cloudflare 绑定探测 contract；常规验证也应发现健康检查退化。
- `launch:gates` 会检查 Admin CSV 导出安全 contract；运营导出必须保留状态/limit 校验、CSV MIME 和公式注入防护。
- `launch:gates` 会检查后台只读查询安全 contract；后台列表/事件/存储审计必须保留输入校验、limit 上限和 D1 参数绑定。
- `audit:source` 同步检查后台只读查询安全 contract；常规验证也应防止后台查询输入校验或参数绑定退化。
- `audit:source` 同步检查 Admin CSV 导出安全 contract；常规验证也应防止运营导出失去公式注入防护或行数限制。
- `launch:gates` 会检查后台批量审核安全 contract；批量审核必须保留管理员白名单、payload 校验、去重、100 条上限和事件记录。
- `audit:source` 同步检查后台批量审核安全 contract；常规验证也应防止运营写操作失去上限、去重或事件记录。
- `launch:gates` 会检查 UGC 举报安全 contract；举报入口必须保留限流、去重、自举报拒绝和自动待审。
- `audit:source` 同步检查 UGC 举报安全 contract；常规验证也应防止举报入口失去限流、去重、自举报拒绝、自动待审或事件记录。
- `audit:source` 也检查 production smoke guard；后续改 production smoke 脚本时，不得移除 HTTPS 输入保护或 Turnstile 投递端点 CORS 断言。
- `audit:source` 还检查安全头 smoke contract；后续改 smoke 脚本时，不得移除 `X-Request-Id`、`Cache-Control`、`Vary: Origin` 或 `Permissions-Policy` 断言。
- `launch:readiness:remote:strict` 用于 production Worker 创建后验收 Cloudflare 端 Worker 和 secret 名称；它在当前缺 production Worker / secret 时必须失败。
- `smoke:production:auth` 用于 production Worker 创建后验收认证边界；它在当前缺 production Worker 时必须失败，而不是像 preview smoke 那样通过 demo 身份。
- `smoke:production:auth` 默认必须跑 HTTPS base URL；本地诊断需要显式设置 `ALLOW_INSECURE_PRODUCTION_SMOKE=true`，避免把非生产目标误当生产 smoke。
- 三个 production smoke 的 `PRODUCTION_SMOKE_BASE_URL` 都必须是裸 origin；不要带 `/path`、query 或 hash。
- production smoke 的 `SMOKE_ALLOWED_ORIGIN` / `SMOKE_DENIED_ORIGIN` 也必须是裸 origin；生产验收不接受通配符或带路径的 Origin。
- `smoke:production:admin` 用于 production Worker 创建后验收真实管理员只读后台链路；可选普通用户 session 会额外验收 admin allowlist 反向边界。它在当前缺 Clerk 管理员 session 或 production Worker 时必须失败，不能用 demo 身份替代。
- `smoke:production:turnstile` 用于 production Worker 创建后验收 Turnstile 生产配置和缺 token 拒绝路径；它在当前缺 Clerk 用户 session 或 production Worker 时必须失败，不能用 preview demo 行为替代。
- `smoke:production:turnstile` 还会验证 `/api/bottles` POST CORS allowed/denied preflight；自定义域名上线后需用实际 origin 运行。
- `launch:gates:remote:strict` 是商业上线最终总闸门；真实浏览器验收完成后，必须显式设置 `LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true`、`LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true`、`LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true` 才能让人工证据 gate 通过。
- `launch:gates` 同步检查 `/api/*` 响应头 contract 和 smoke 覆盖；不要只靠线上 smoke 事后发现响应头退化。
## 下一步

1. 接入真实 Clerk 应用：写入 `VITE_CLERK_PUBLISHABLE_KEY`、部署 `CLERK_SECRET_KEY`，设置 `ADMIN_USER_IDS`。
2. 接入真实 Turnstile：设置 `TURNSTILE_SITE_KEY`、部署 `TURNSTILE_SECRET_KEY`，再确认 `TURNSTILE_REQUIRED=true`。
3. 跑 `npm run launch:readiness:remote:strict`，确认 production Worker、Clerk secret、Turnstile secret 和 production CORS origin 都存在且通过。
4. 补齐真实管理员验收：设置 `ADMIN_USER_IDS` 后先用 `SMOKE_ADMIN_BEARER_TOKEN=<clerk-admin-session-jwt> SMOKE_NON_ADMIN_BEARER_TOKEN=<clerk-normal-session-jwt> npm run smoke:production:admin` 验证只读后台正反边界，再用真实 Clerk 管理员账号在浏览器里验证审核动作。
5. 获取真实 Clerk/Turnstile/Admin 配置后，确认 `ALLOWED_ORIGINS` 指向 production workers.dev 或自定义域名，部署 production secrets，创建 production Worker，并跑 `launch:readiness:remote:strict`、`smoke:production:auth`、`smoke:production:admin`、`smoke:production:turnstile`、真实登录、真实 Turnstile 和管理员后台验收。
6. 真实浏览器验收完成后，设置人工证据环境变量并运行 `npm run launch:gates:remote:strict`，确认商业上线总 gates 通过。
7. 取得真实 Clerk/Turnstile/Admin 配置并完成 production Worker 创建后，跑 `launch:readiness:remote:strict`、`smoke:production:auth`、`smoke:production:admin`、`smoke:production:turnstile` 和 `launch:gates:remote:strict` 做最终 production 验收。
8. 如运营提供官方截图或真实安利文案，按 `scripts/preseed-bottles.csv` 继续替换预制内容并重新导入远端 D1。

## 当前交付状态

- 预览地址已上线。
- 首轮功能闭环完成。
- 首轮审查与性能优化完成。
- 100 轮小步检查修订：已完成第 1-100 轮代码/验证；第 1-36 轮已上线到 workers.dev，第 37-43 轮为本地 Queue/公共 smoke、验证脚本与审计覆盖固化，第 44 轮已补推 workers.dev 并收紧 production CORS 上线挡板，第 45 轮把 CORS allowed/denied 固化进 smoke，第 46 轮清理旧 CORS helper 并补推 workers.dev，第 47 轮加上 production deploy strict readiness 挡板，第 48 轮加上远端 strict readiness 验收命令，第 49 轮加上 production auth-boundary smoke，第 50 轮加上 production admin read-only smoke，第 51 轮加上普通用户非 admin 反向 smoke，第 52 轮加上 production Turnstile missing-token smoke，第 53 轮加上商业上线总 gates，第 54 轮加上 production required secrets 声明和 remote-secret deploy guard，第 55 轮加上 dry-run/deploy 构建新鲜度挡板，第 56 轮把发布/验证脚本契约纳入 `audit:source`，第 57 轮统一 production auth smoke 的 HTTPS 输入保护，第 58 轮补齐 Turnstile 投递端点 CORS smoke，第 59 轮把 production smoke guard 纳入 `audit:source`，第 60 轮加上 `/api/*` 的 `Vary: Origin` 缓存边界，第 61 轮把安全头 smoke contract 纳入 `audit:source`，第 62 轮收紧 production smoke base URL 裸 origin 校验，第 63 轮把 API 响应头 contract 纳入商业上线总 gates，第 64 轮收紧 production smoke CORS origin 参数校验，第 65 轮新增生产凭据与真实 smoke runbook，第 66 轮把文档/账本敏感值扫描纳入 `audit:source`，第 67 轮把该文档敏感值审计纳入商业上线总 gates，第 68 轮把 R2 媒体代理安全 key 与缓存头纳入商业上线总 gates，第 69 轮把 R2 媒体代理 contract 纳入 `audit:source`，第 70 轮把 Queue consumer ack/retry 纳入商业上线总 gates，第 71 轮把 Queue consumer contract 纳入 `audit:source`，第 72 轮把 R2 写入失败清理纳入商业上线总 gates，第 73 轮把 R2 写入失败清理 contract 纳入 `audit:source`，第 74 轮把关键接口 KV 限流纳入商业上线总 gates，第 75 轮把关键接口 KV 限流纳入 `audit:source`，第 76 轮把 Cloudflare 绑定健康检查纳入商业上线总 gates，第 77 轮把 Cloudflare 绑定健康检查 contract 纳入 `audit:source`，第 78 轮把 Admin CSV 导出安全纳入商业上线总 gates，第 79 轮把 Admin CSV 导出安全 contract 纳入 `audit:source`，第 80 轮把后台批量审核安全纳入商业上线总 gates，第 81 轮把后台批量审核安全 contract 纳入 `audit:source`，第 82 轮把 UGC 举报安全纳入商业上线总 gates，第 83 轮把 UGC 举报安全 contract 纳入 `audit:source`，第 84 轮把图片上传安全纳入商业上线总 gates，第 85 轮把图片上传安全 contract 纳入 `audit:source`，第 86 轮把 Clerk 生产认证边界纳入商业上线总 gates，第 87 轮把 Clerk 生产认证边界 contract 纳入 `audit:source`，第 88 轮把 Turnstile 服务端校验纳入商业上线总 gates，第 89 轮把 Turnstile 服务端校验 contract 纳入 `audit:source`，第 90 轮把后台只读查询安全纳入商业上线总 gates，第 91 轮把后台只读查询安全 contract 纳入 `audit:source`，第 92 轮把 API 错误响应 contract 纳入商业上线总 gates，第 93 轮把 API 错误响应 contract 纳入 `audit:source`，第 94 轮完成 production dry-run 验证，第 95 轮完成本地 production readiness 验证并确认真实配置 blocker，第 96 轮完成远端 production readiness 验证并确认 production Worker / secrets blocker，第 97 轮完成远端商业上线总 gates 验证并确认真实生产 blocker，第 98 轮完成线上 preview 安全头 smoke，第 99 轮完成代码质量与性能审查，第 100 轮完成最终验证、远端 gates、整体代码质量和性能收口。正式 production 环境仍待真实 Clerk/Turnstile/Admin 配置。
