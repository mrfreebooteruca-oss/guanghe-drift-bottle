# scripts

维护脚本与运营数据源目录。

## 文件

- `seed.sql`：首批演示数据，适合快速初始化本地或远端 D1。
- `preseed-bottles.csv`：运营预制漂流瓶内容源，字段契约固定；当前维护 100 条 `preseed-bottle-*` 内容。
- `generate-preseed-sql.mjs`：读取 CSV、校验字段、去重并生成 `preseed.generated.sql`。
- `execute-preseed-remote.mjs`：远端 D1 分批导入脚本，绕开大文件上传检查超时；会拆分生成 SQL 的 `VALUES` 行，并对 Cloudflare API 超时做重试；导入语句是幂等 upsert。
- `check-launch-readiness.mjs`：上线前配置体检脚本，检查 production bindings、production CORS origin、Clerk/Turnstile/Admin 配置、production Worker/secret 状态和预制内容数量。
- `audit-launch-gates.mjs`：商业上线总 gates 审计脚本，按项目证据、Cloudflare 栈、production 配置、Cloudflare 绑定健康检查、Clerk 生产认证边界、Turnstile 服务端校验、运营能力、后台只读查询安全、UGC 举报安全、批量审核安全、CSV 导出安全、图片上传安全、KV 限流覆盖、Queue consumer ack/retry、R2 写入失败清理、R2 媒体代理边界、API 错误响应 contract、验证命令、API 响应头 contract、文档敏感值审计、真实浏览器证据和远端 Worker/secret 分组输出 `READY` / `REVIEW` / `BLOCKED`。
- `audit-source.mjs`：源码和产物体检脚本，检查危险模式、临时 `.dev.vars` 残留、空 secret 样例、文档/账本敏感值、package script 发布契约、production smoke guard、安全头 smoke contract、Clerk 生产认证边界 contract、Turnstile 服务端校验 contract、R2 媒体代理 contract、Queue consumer contract、R2 写入失败清理 contract、图片上传安全 contract、KV 限流 contract、Cloudflare 绑定健康检查 contract、后台只读查询安全 contract、API 错误响应 contract、Admin CSV 导出安全 contract、批量审核安全 contract、UGC 举报安全 contract 和前端资产体积预算。
- `smoke-public.mjs`：线上/本地公共接口 smoke，检查 health、bootstrap、admin/reported 后台默认拒绝、举报错误路径和 CORS allowed/denied preflight，不提交真实举报；设置 `EXPECT_SECURITY_HEADERS=true` 时额外检查安全响应头、`Cache-Control: no-store` 与 `Vary: Origin`。
- `smoke-production-auth.mjs`：production Worker 认证边界 smoke，检查 health 为 production、未登录业务 API 返回 401、`X-Dev-User` 不能绕过认证、CORS 和安全头正常；默认只允许 HTTPS base URL。
- `smoke-production-admin.mjs`：production Worker 真实管理员 smoke，需要 Clerk 管理员 session；只读验证 bootstrap、后台 metrics、审核列表、事件流、CSV 导出、R2 storage audit、后台错误路径、CORS 和安全头；可选传入普通用户 session 验证后台白名单反向边界。
- `smoke-production-turnstile.mjs`：production Worker Turnstile 负向 smoke，需要 Clerk 用户 session；验证 production bootstrap 下发 Turnstile 配置、缺少 Turnstile token 的投递被拒绝为 `turnstile_required`，并检查 `/api/bottles` POST CORS allowed/denied preflight。
- `smoke-queue-local.mjs`：本地 Queue consumer smoke，需要本地 dev server 正在运行；会创建测试瓶、等待 `moderation_queued`，并清理本地 D1/R2。
- `smoke-queue-local-auto.mjs`：一键本地 Queue smoke，会自动启动本地 dev server、等待 health、运行 Queue smoke 并关闭 server。
- `smoke-local-all.mjs`：一键本地全量 smoke，会自动启动本地 dev server，连续跑公共 header smoke 和 Queue smoke，再关闭 server。
- `deploy-with-retry.mjs`：Wrangler deploy 重试脚本，用于 Cloudflare API timeout 或资产上传抖动时自动退避重试；package scripts 会先构建当前 bundle 再调用它，如果目标是 production env，还会先跑 remote strict readiness，不通过则不会部署。
- `preseed.generated.sql`：由脚本生成的 D1 导入文件，不要手工编辑；公开仓库中保持 gitignored，需要时运行 `npm run preseed:build` 重新生成。

## 命令

```bash
npm run preseed:build
npm run db:preseed:local
npm run db:preseed:remote
npm run audit:source
npm run verify:local
npm run smoke:public
npm run smoke:production:auth
npm run smoke:production:admin
npm run smoke:production:turnstile
npm run smoke:public:local
npm run smoke:public:local:headers
npm run smoke:queue:local
npm run smoke:queue:local:auto
npm run smoke:local:all
npm run deploy:retry
npm run deploy:production:retry
npm run launch:readiness
npm run launch:readiness:remote
npm run launch:readiness:remote:strict
npm run launch:gates
npm run launch:gates:remote
npm run launch:gates:remote:strict
```

远端导入可按需调整批大小和重试次数：

```bash
PRESEED_REMOTE_BATCH_SIZE=20 PRESEED_REMOTE_RETRIES=3 npm run db:preseed:remote
```

## 维护原则

- 新增预制内容先改 CSV，再运行 `npm run preseed:build`。
- 生成 SQL、数据库导出、Wrangler 本地缓存和环境文件不进入公开仓库。
- `id` 使用 `preseed-bottle-*`，`author_id` 使用 `preseed-user-*`，避免覆盖真实用户内容。
- `image_url` 暂可复用 `/samples/*.webp`；如果换成远端图片，必须使用 `https://`。
- 远端导入前先本地导入验证，确认无字段校验错误和重复 id。
- 如果远端导入过程中出现 Cloudflare API timeout，优先重新运行 `npm run db:preseed:remote`；脚本是幂等 upsert，重试不会制造重复数据。
- `npm run cf:check` 与 `npm run cf:check:production` 会先分别执行 preview / production build，再执行 Wrangler dry-run，避免 dry-run 使用 stale `dist`。
- `npm run audit:source` 需要在构建后执行，才能检查 `dist/client/assets` 的 JS/CSS 体积预算；它已经挂入 `verify:launch` 与 `verify:production`，并位于 dry-run build 之后。它也会检查文档/账本敏感值、关键 `package.json` scripts、production smoke guard、安全头 smoke contract、Clerk 生产认证边界 contract、Turnstile 服务端校验 contract、R2 媒体代理 contract、Queue consumer contract、R2 写入失败清理 contract、图片上传安全 contract、KV 限流 contract、Cloudflare 绑定健康检查 contract、后台只读查询安全 contract、API 错误响应 contract、Admin CSV 导出安全 contract、批量审核安全 contract 和 UGC 举报安全 contract，防止真实 secret/JWT/cookie 写入文档，并防止 dry-run、deploy、verify、生产 smoke、认证边界、Turnstile 服务端校验、`/media/*`、Queue、投递写入、图片上传、高频接口、`/api/health`、后台读查询、API 错误响应、CSV 导出、批量审核或举报链路绕过构建、审计、HTTPS 输入保护、Turnstile CORS 断言、关键响应头断言、Clerk token 验证、R2 key 边界、ack/retry 边界、失败清理边界、图片类型和大小挡板、限流挡板、绑定探测、查询输入校验、结构化错误、公式注入防护、运营写操作上限、去重、自举报拒绝和自动待审。
- `npm run smoke:public` 默认检查 workers.dev 预览地址；也可以传入自定义 base URL，例如 `node scripts/smoke-public.mjs https://example.com`。
- `npm run smoke:production:auth` 默认检查 production workers.dev；可用 `PRODUCTION_SMOKE_BASE_URL=https://your-domain.example SMOKE_ALLOWED_ORIGIN=https://your-domain.example npm run smoke:production:auth` 覆盖。`PRODUCTION_SMOKE_BASE_URL`、`SMOKE_ALLOWED_ORIGIN` 与 `SMOKE_DENIED_ORIGIN` 必须是裸 origin，不能带路径、query、hash、尾随斜杠或通配符。它默认拒绝非 HTTPS base URL；只有本地诊断时才设置 `ALLOW_INSECURE_PRODUCTION_SMOKE=true`。当前 production Worker 未创建时该命令应失败。
- `npm run smoke:production:admin` 默认检查 production workers.dev；运行前设置 `SMOKE_ADMIN_BEARER_TOKEN` 为真实 Clerk 管理员账号的 session JWT，或设置 `SMOKE_ADMIN_COOKIE`。如果同时设置 `SMOKE_NON_ADMIN_BEARER_TOKEN` 或 `SMOKE_NON_ADMIN_COOKIE`，脚本会验证普通用户能登录但不能访问 `/api/admin/*`。`PRODUCTION_SMOKE_BASE_URL`、`SMOKE_ALLOWED_ORIGIN` 与 `SMOKE_DENIED_ORIGIN` 必须是裸 origin。这个 smoke 只做只读后台验收，不会提交投递、举报或审核变更。当前未提供管理员 session 或 production Worker 未创建时该命令应失败。
- `npm run smoke:production:turnstile` 默认检查 production workers.dev；运行前设置 `SMOKE_USER_BEARER_TOKEN` 为真实 Clerk 普通用户账号的 session JWT，或设置 `SMOKE_USER_COOKIE`。脚本会提交一份缺少 Turnstile token 的有效表单并期望 400 `turnstile_required`，同时验证 `/api/bottles` POST CORS allowed/denied preflight；不会创建漂流瓶或 R2 图片。`PRODUCTION_SMOKE_BASE_URL`、`SMOKE_ALLOWED_ORIGIN` 与 `SMOKE_DENIED_ORIGIN` 必须是裸 origin。它会触发正常登录用户 upsert、activity 事件和限流 KV。当前未提供用户 session 或 production Worker 未创建时该命令应失败。
- CORS smoke 默认允许 origin 为 `http://localhost:5173`、拒绝 origin 为 `https://example.invalid`；对 production Worker 或自定义域名跑 smoke 时，用 `SMOKE_ALLOWED_ORIGIN=https://your-domain.example npm run smoke:public` 覆盖。
- `npm run smoke:public:local:headers` 会对本地 Worker 额外断言 `nosniff`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-Request-Id`、`/api/*` 的 `Cache-Control: no-store` 与 `Vary: Origin`；线上新版本发布后再运行 `npm run smoke:public:headers`。
- `npm run smoke:queue:local` 需要另一个终端先运行 `npm run dev -- --host 127.0.0.1 --port 8787`；脚本只使用本地 D1/R2，并在 finally 中清理测试数据。
- `npm run smoke:queue:local:auto` 会自己启动和关闭本地 dev server，适合在维护窗口快速验证 Queue producer/consumer 闭环。
- `npm run smoke:local:all` 会自己启动和关闭本地 dev server，适合改 Worker 后一次性验证公共 API、安全头、reported/admin 默认拒绝、media key、API 404 和 Queue producer/consumer。
- `npm run verify:local` 会先跑 Cloudflare dry-run build、源码审计，再运行 `smoke:local:all`，适合改 Worker/API 后做一次完整本地验收。
- `npm run deploy:retry` 会先执行 `npm run build`，再最多重试 5 次；可用 `DEPLOY_RETRIES=8 DEPLOY_RETRY_DELAY_MS=6000 npm run deploy:retry` 调整。
- `npm run deploy:production:retry` 会先执行 `npm run build:production`，再执行 `node scripts/check-launch-readiness.mjs --remote-secrets --strict`；当前真实 Clerk/Turnstile/Admin 配置、production Worker 或远端 secret 名称未齐时，它应该失败并阻止 production deploy。Production secrets 使用 `env.production.secrets.required` 声明名称，不应把 secret 值写入本地源码。
- `npm run launch:readiness` 默认只做本地配置、production CORS origin 与 Wrangler production binding 体检；`npm run launch:readiness:remote` 会额外调用 Wrangler 检查 production Worker 和已部署 secret 名称，不会读取 secret 值。若 production Worker 尚未创建，先补真实 Clerk/Turnstile/Admin 配置，再按 `docs/DEPLOYMENT.md` 切换生产。
- `npm run launch:readiness:remote:strict` 用于 production Worker 创建后的强制验收；当前缺 production Worker 或 secret 名称时必须返回非 0。
- `npm run launch:gates` 是商业上线总闸门，会把代码/配置/文档/Cloudflare 绑定健康检查/Clerk 生产认证边界/Turnstile 服务端校验/后台只读查询安全/UGC 举报安全/批量审核安全/CSV 导出安全/图片上传安全/KV 限流/Queue consumer/R2 写入失败清理/R2 媒体代理边界/API 错误响应 contract/验证命令/文档敏感值审计/人工验收证据集中输出；当前缺真实 Clerk/Turnstile/Admin、远端 production Worker 和人工浏览器确认时应显示 `BLOCKED`。
- `npm run launch:gates:remote` 会额外调用 Wrangler 检查 production Worker 与 `CLERK_SECRET_KEY`、`TURNSTILE_SECRET_KEY` secret 名称；不读取 secret 值。
- `npm run launch:gates:remote:strict` 用于最终发布前或 CI；只要任一 gate 未通过就返回非 0。真实浏览器验收完成后，可用 `LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true`、`LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true`、`LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true` 提供人工证据。
- Production `ALLOWED_ORIGINS` 必须是逗号分隔的 `https://` 纯 origin；不要使用 `*`、localhost、127.0.0.1、路径、query、hash 或尾随斜杠。绑定自定义域名后先同步这里，再跑 readiness。
