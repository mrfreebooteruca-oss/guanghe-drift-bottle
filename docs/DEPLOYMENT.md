# 部署与运行

## 本地开发

```bash
cd web
npm install
npm run dev
```

默认开发地址由 Vite/Cloudflare 插件输出。没有 Clerk 密钥时，前端会使用本地演示身份，便于完整体验投递、打捞和安利墙流程。

## 环境变量

复制 `web/.env.example` 为 `web/.env.local`，按需填入：

- `VITE_CLERK_PUBLISHABLE_KEY`：Clerk 前端 publishable key。
- `CLERK_SECRET_KEY`：Clerk 后端 secret key，部署时使用 `wrangler secret put CLERK_SECRET_KEY`。
- `CLERK_JWT_KEY`：可选，Clerk JWT PEM public key，支持无网络校验。
- `TURNSTILE_SITE_KEY`：Turnstile 前端 site key，写在 Wrangler vars 或前端环境中。
- `TURNSTILE_SECRET_KEY`：Turnstile 后端 secret key，部署时使用 `wrangler secret put TURNSTILE_SECRET_KEY`。
- `TURNSTILE_REQUIRED`：是否强制投递前完成 Turnstile，生产建议为 `true`。
- `ADMIN_USER_IDS`：生产后台管理员 Clerk user id，多个用英文逗号分隔；为空时后台接口默认拒绝所有用户。
- `ALLOWED_ORIGINS`：生产 API CORS allowlist，多个 origin 用英文逗号分隔；必须是 `https://` 纯 origin，不能使用通配符、本地主机、路径或尾随斜杠。当前 production 默认指向 `https://guanghe-drift-bottle-production.adwardhuanguca.workers.dev`。

## Cloudflare 资源

首版 Wrangler 配置声明了 D1、R2、KV 等绑定。使用新版本 Wrangler 时，本地开发会模拟资源；生产部署前建议显式创建资源：

```bash
cd web
npx wrangler d1 create guanghe-drift-bottle-db
npx wrangler r2 bucket create guanghe-drift-bottle-images
npx wrangler kv namespace create GH_CONFIG
npx wrangler queues create guanghe-drift-bottle-moderation
```

创建后把 Wrangler 输出的资源 ID 写入 `wrangler.jsonc` 对应绑定。

当前已创建并写入配置：

- D1：`guanghe-drift-bottle-db` / `c924c040-0d04-40f5-b45b-d7681ef7f844`
- KV：`GH_CONFIG` / `9c6976fd3bba481396bf9f4db3368932`
- R2：`guanghe-drift-bottle-images`
- Queue：`guanghe-drift-bottle-moderation`

## 数据库迁移

```bash
cd web
npm run db:migrate:local
npm run db:seed:local
npm run preseed:build
npm run db:preseed:local
npm run db:info:remote
npm run db:bookmark:remote
```

生产环境：

```bash
cd web
npm run db:migrate:remote
npm run db:preseed:remote
```

远端预制内容导入脚本会按 `INSERT ... VALUES` 行分批执行，并对 Cloudflare API 超时做重试退避。可用环境变量调整：

```bash
PRESEED_REMOTE_BATCH_SIZE=20 PRESEED_REMOTE_RETRIES=3 npm run db:preseed:remote
```

## 构建与部署

```bash
cd web
npm run typecheck
npm run build
npm run build:production
npm run cf:check
npm run cf:check:production
npm run launch:gates
npm run launch:gates:remote
npm run launch:readiness
npm run launch:readiness:remote:strict
npm run deploy:retry
npm run deploy:production:retry
npm run smoke:production:auth
npm run smoke:production:admin
npm run smoke:production:turnstile
npm run smoke:public
npm run smoke:public:headers
```

若暂时没有域名，可以直接使用 `workers.dev` 预览地址。购买域名后在 Cloudflare Workers 路由或自定义域中绑定。

`npm run cf:check` 与 `npm run cf:check:production` 会先构建当前 preview / production bundle，再执行 Wrangler dry-run；`npm run deploy:retry` 与 `npm run deploy:production:retry` 也会先构建再进入 guarded deploy，避免发布链路复用旧 `dist`。

当前预览地址：

```text
https://guanghe-drift-bottle.adwardhuanguca.workers.dev
```

## 上线体检

```bash
cd web
npm run launch:readiness
npm run launch:readiness:remote
```

- `launch:readiness` 检查本地 production 配置、Wrangler bindings、production CORS origin、Clerk/Turnstile/Admin 必填项和 100 条预制内容数量。
- `launch:readiness:remote` 会额外调用 Cloudflare Wrangler 检查 production Worker 和已部署 secret 名称，只读取 secret 名称，不读取 secret 值。
- `launch:readiness:remote:strict` 用于 production Worker 创建后的最终验收；只要 production Worker 或 secret 名称缺失就返回非 0。
- `launch:readiness:strict` 适合 CI 或最终发布前使用，只要有任一未通过项就返回非 0。
- `launch:gates` 是商业上线总闸门，按项目证据、Cloudflare 栈、production 配置、Cloudflare 绑定健康检查、内容/运营能力、UGC 举报安全、批量审核安全、CSV 导出安全、KV 限流覆盖、Queue consumer ack/retry、R2 写入失败清理、R2 媒体代理边界、验证命令、文档敏感值审计、人工浏览器证据和远端 Worker/secret 证据分组输出 `READY` / `REVIEW` / `BLOCKED`。
- `launch:gates:remote` 会额外用 Wrangler 检查 production Worker 与 `CLERK_SECRET_KEY`、`TURNSTILE_SECRET_KEY` secret 名称，不读取 secret 值。
- `launch:gates:remote:strict` 是最终发布前强挡板；真实浏览器验收完成后，使用 `LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true`、`LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true`、`LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true` 提供人工证据。
- 部署后运行 `npm run smoke:public`，确认 workers.dev 或自定义域的公开路径可用；该脚本不会提交真实举报。
- `smoke:public` 会检查 CORS allowed/denied preflight；默认允许 origin 是 `http://localhost:5173`。如果对 production Worker 或自定义域名跑 smoke，使用 `SMOKE_ALLOWED_ORIGIN=https://your-origin.example npm run smoke:public`。
- `smoke:production:auth` 专门用于 `CLERK_AUTH_ENABLED=true` 的 production Worker，检查未登录业务 API 返回 401、`X-Dev-User` 不能绕过认证、生产 CORS、安全头、`Cache-Control: no-store` 与 `Vary: Origin` 正确；`PRODUCTION_SMOKE_BASE_URL`、`SMOKE_ALLOWED_ORIGIN` 与 `SMOKE_DENIED_ORIGIN` 必须是裸 origin，默认拒绝非 HTTPS base URL，只有本地诊断时才设置 `ALLOW_INSECURE_PRODUCTION_SMOKE=true`。
- `smoke:production:admin` 专门用于真实 Clerk 管理员账号验收。运行前设置 `SMOKE_ADMIN_BEARER_TOKEN` 为 Clerk `getToken()` 取得的 session JWT，或设置 `SMOKE_ADMIN_COOKIE`；脚本只读检查后台 metrics、审核列表、reported 列表、事件流、CSV 导出、storage audit、后台错误路径、CORS 和安全头。若同时设置 `SMOKE_NON_ADMIN_BEARER_TOKEN` 或 `SMOKE_NON_ADMIN_COOKIE`，脚本会验证普通用户能登录但不能访问后台。`PRODUCTION_SMOKE_BASE_URL`、`SMOKE_ALLOWED_ORIGIN` 与 `SMOKE_DENIED_ORIGIN` 必须是裸 origin。
- `smoke:production:turnstile` 专门用于真实 Clerk 用户账号下的 Turnstile 负向验收。运行前设置 `SMOKE_USER_BEARER_TOKEN` 为 Clerk `getToken()` 取得的普通用户 session JWT，或设置 `SMOKE_USER_COOKIE`；脚本会提交缺少 Turnstile token 的有效表单并要求后端返回 400 `turnstile_required`，同时验证 `/api/bottles` POST CORS allowed/denied preflight，证明 production 已开启 Turnstile 且投递跨域边界正确。`PRODUCTION_SMOKE_BASE_URL`、`SMOKE_ALLOWED_ORIGIN` 与 `SMOKE_DENIED_ORIGIN` 必须是裸 origin。该脚本不会创建漂流瓶或 R2 图片，但会触发正常登录用户 upsert、activity 事件和限流 KV。
- 第 29 轮后，新版本部署成功再运行 `npm run smoke:public:headers`，确认线上 API 响应带安全头、`X-Request-Id`、`Cache-Control: no-store` 和 `Vary: Origin`。
- `npm run deploy:retry` 用于当前 workers.dev 预览 Worker，会先运行 `build`；`npm run deploy:production:retry` 用于 production Worker，会先运行 `build:production`，再跑 remote strict readiness，不通过则不会执行 Wrangler deploy。生产 secret 只通过 `env.production.secrets.required` 声明名称和 Cloudflare secret 存储，不把 secret 值写入本地源码。

## 生产切换清单

真实 Clerk、Turnstile、管理员白名单和 smoke token 获取步骤见 `docs/PRODUCTION-CREDENTIALS.md`；不要把 secret、session JWT 或 cookie 写入源码。

1. 在 Clerk 创建应用，填入 `VITE_CLERK_PUBLISHABLE_KEY`。
2. 使用 `npx wrangler secret put CLERK_SECRET_KEY --env production` 写入后端密钥。
3. 设置 `ADMIN_USER_IDS` 为真实 Clerk user id，多个用英文逗号分隔。
4. 设置 `TURNSTILE_SITE_KEY`，并使用 `npx wrangler secret put TURNSTILE_SECRET_KEY --env production` 写入后端密钥。
5. 确认 `CLERK_AUTH_ENABLED=true`、`TURNSTILE_REQUIRED=true`、`env.production.secrets.required` 包含 `CLERK_SECRET_KEY` / `TURNSTILE_SECRET_KEY`，且 production `ALLOWED_ORIGINS` 指向 production workers.dev 或自定义域名。
6. 执行 `npm run launch:readiness`，清掉本地配置 blocker。
7. 执行 `npm run cf:check:production`，确认 production bundle 和绑定完整。
8. 执行 `npm run deploy:production:retry` 创建或更新 production Worker；该命令会先跑 production build 和 remote strict readiness。
9. 执行 `npm run launch:readiness:remote:strict`，确认 production Worker 与两个 secret 名称可被 Wrangler 看到。
10. 执行 `npm run smoke:production:auth`，确认未登录生产 API 被拒绝，且 production CORS/安全头正确。
11. 设置真实 Clerk 管理员 session 后执行 `SMOKE_ADMIN_BEARER_TOKEN=<clerk-admin-session-jwt> npm run smoke:production:admin`，确认只读后台验收通过；建议同时设置 `SMOKE_NON_ADMIN_BEARER_TOKEN=<clerk-normal-session-jwt>` 验证普通用户不能访问后台。
12. 设置真实 Clerk 普通用户 session 后执行 `SMOKE_USER_BEARER_TOKEN=<clerk-normal-session-jwt> npm run smoke:production:turnstile`，确认缺 Turnstile token 的投递被拒绝。
13. 用真实 Clerk 管理员账号在浏览器里完成审核动作，并用普通账号完成真实 Turnstile 投递验证。
14. 设置 `LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true` 后执行 `npm run launch:gates:remote:strict`，确认商业上线总 gates 通过。
15. 购买并绑定自定义域名；绑定后同步更新 `ALLOWED_ORIGINS` 并重新跑 readiness、production dry-run、`smoke:production:auth`、`smoke:production:admin`、`smoke:production:turnstile`、`launch:gates:remote:strict` 和真实浏览器验证。

## 当前线上复验

- Workers 预览版本：`2f271fae-1baf-40be-86fd-65d8272c1fd8`
- `GET /api/health`：通过，返回 D1/KV/R2/Queue 绑定 ok 与 latency。
- `GET /api/bootstrap`：通过，返回 8 条最近瓶、9 条精选瓶和预览环境 security 配置；当前指标 `bottles=109`、`participants=113`。
- 远端 D1 内容：`bottles=109`，其中 `preseed-bottle-*` 为 100 条，`approved=109`。
- 远端 D1 举报表：`bottle_reports` 已存在，当前举报数为 0。
- `POST /api/bottles/:id/report`：线上无效原因返回 400 `invalid_report_reason`；作者自举报返回 400 `cannot_report_own_bottle`。
- `POST /api/bottles`：线上 0 字节图片返回 400 `image_empty`，不会写入 R2/D1。
- `GET /media/not-public.webp`：线上非法 media key 返回 400 `invalid_media_key`，R2 公共代理只允许 `bottles/` 图片 key。
- `GET /api/admin/metrics`：未授权返回 403 `admin_required`。
- `GET /api/admin/bottles`：未授权返回 403 `admin_required`。
- `GET /api/admin/events`：未授权返回 403 `admin_required`。
- `GET /api/admin/export/bottles.csv`：未授权返回 403 `admin_required`。
- `GET /api/admin/storage/audit`：未授权返回 403 `admin_required`。
- `POST /api/admin/bottles/:id/moderation`：未授权返回 403 `admin_required`。
- `POST /api/admin/bottles/moderation/bulk`：未授权返回 403 `admin_required`。
- 线上 reported 后台边界：`GET /api/admin/bottles?status=reported`、`GET /api/admin/export/bottles.csv?status=reported`、`GET /api/admin/events?type=bottle_reported` 均未授权返回 403 `admin_required`，且带 `X-Request-Id`。
- 线上 Playwright：桌面/移动端无横向溢出、无失败请求、无 console error；0 张 fallback 图片；后台受限页默认拒绝未授权访问。当前 demo 用户打捞额度已用完，线上未提交真实举报；举报 modal、reported 后台 UI 与空文件上传提示已在本地桌面/移动端完成浏览器验证。
- `npm run verify:launch`：通过，覆盖 `cf:types`、`typecheck`、带 preview build 的 `cf:check`、`audit:source` 与 `npm audit --audit-level=moderate`。
- `npm run verify:production`：通过，覆盖带 production build 的 `cf:check:production`、`audit:source`、production dry-run 绑定 D1/R2/KV/Queue 和 npm audit。
- `npm run smoke:public`：通过，覆盖线上 health、bootstrap、admin 默认 403、举报错误路径和 CORS allowed/denied preflight。
- `npm run smoke:public:headers`：通过，额外覆盖线上安全响应头、`X-Request-Id`、API 404 JSON、CORS allowed/denied preflight 和 `/api/*` no-store。
- `npm run audit:source`：通过，当前 JS 产物 256934 bytes，CSS 产物 23425 bytes，均低于预算；交付目录无 `.dev.vars`。
- `npm run launch:readiness`：通过执行但状态为 `BLOCKED`；production CORS origin 已通过，当前真实生产仍缺 `ADMIN_USER_IDS`、`TURNSTILE_SITE_KEY`、`VITE_CLERK_PUBLISHABLE_KEY` 和已部署 Clerk/Turnstile secret。
- `npm run launch:readiness:remote`：通过执行但状态为 `BLOCKED`；production CORS origin 已通过，当前 production Worker `guanghe-drift-bottle-production` 尚未创建，`CLERK_SECRET_KEY` 与 `TURNSTILE_SECRET_KEY` 尚未部署。
- `npm run launch:readiness:remote:strict`：当前按预期返回非 0，阻止把缺 production Worker/secret 的状态当作验收通过。
- `npm run smoke:production:auth`：当前按预期失败，原因是 production Worker 尚未创建；该命令不能替代 preview smoke。
- `npm run smoke:production:admin`：当前按预期失败，因为需要真实 Clerk 管理员 session 且 production Worker 尚未创建；该命令只读，不会提交投递、举报或审核变更。
- `npm run smoke:production:turnstile`：当前按预期失败，因为需要真实 Clerk 用户 session 且 production Worker 尚未创建；该命令不会创建漂流瓶或 R2 图片。
- `npm run launch:gates` 与 `npm run launch:gates:remote`：当前按预期输出 `BLOCKED`；已通过项目证据、Cloudflare 栈、运营能力、安全 contract 和验证命令 gate，但缺真实 Admin allowlist、Turnstile site key、Clerk publishable key、人工浏览器证据、production Worker 与 production secrets。
- 第 100 轮最终复验：`npm run verify:production`、`npm run verify:launch`、`npm run smoke:public:headers` 均通过，`npm run launch:gates:remote` 按预期 `BLOCKED`；项目内无 `.dev.vars`，无本地 dev server，`dist/client` 为 356K，Worker bundle 目录为 144K。
- 第 26-100 轮小步修订已完成；workers.dev 当前为 `2f271fae-1baf-40be-86fd-65d8272c1fd8`，第 60 轮已补推 Worker runtime header 硬化，第 61-100 轮只改维护审计、production smoke、launch gates 脚本、production runbook 和收尾验证，无需 Worker 版本变更。正式 production Worker 等真实 Clerk/Turnstile/Admin 配置齐后再创建，避免部署出不可用生产站。
