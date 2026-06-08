# web

Cloudflare 全栈应用目录，包含 React 前端和 Worker API。

## 结构

- `src/`：React 前端、组件、样式、API client。
- `worker/`：Cloudflare Worker 后端。
- `migrations/`：D1 schema migration。
- `scripts/`：本地/远程 seed 与维护脚本。
- `wrangler.jsonc`：Cloudflare Worker、D1、R2、KV、Queue 绑定。

## 常用命令

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run build:production
npm run cf:check
npm run cf:check:production
npm run audit:source
npm run verify:local
npm run verify:launch
npm run verify:production
npm run smoke:public
npm run smoke:production:auth
npm run smoke:production:admin
npm run smoke:production:turnstile
npm run smoke:public:local:headers
npm run launch:readiness
npm run launch:readiness:remote
npm run launch:readiness:remote:strict
npm run launch:gates
npm run launch:gates:remote
npm run launch:gates:remote:strict
npm run deploy:retry
npm run deploy:production:retry
npm run db:migrate:local
npm run db:seed:local
npm run preseed:build
npm run db:preseed:local
npm run db:preseed:remote
```

## 当前部署

- Workers 预览：https://guanghe-drift-bottle.adwardhuanguca.workers.dev
- 远端 D1/R2/KV/Queue 已创建，绑定见 `wrangler.jsonc`。
- 当前预览使用演示身份；Clerk keys 配置后可切换真实登录。
- 当前预览后台接口默认拒绝未列入 `ADMIN_USER_IDS` 的用户；为空时所有用户都不能访问 `/api/admin/*`。
- 最近部署版本：`2f271fae-1baf-40be-86fd-65d8272c1fd8`。
- 远端 D1 当前有 100 条 `preseed-bottle-*` 预制内容，总瓶数 109。
- `npm run launch:readiness` 当前状态为 `BLOCKED`，production CORS origin 已通过；真实生产仍缺 Clerk publishable/secret、Turnstile site/secret 和管理员 Clerk user id。
- `npm run audit:source` 当前通过；JS 产物 256934 bytes，CSS 产物 23425 bytes，均低于预算，交付目录无 `.dev.vars` 残留。
- 远端 D1 已有 `bottle_reports` 举报表；线上错误路径验证未提交真实举报，当前举报数为 0。
- 第 100 轮最终复验已完成：`verify:production`、`verify:launch`、线上 `smoke:public:headers` 通过；远端 `launch:gates:remote` 按预期 `BLOCKED` 于真实生产配置、production Worker、secret 和人工证据。
- 第 26-100 轮小步修订已完成；workers.dev 当前已更新到第 60 轮预览版本，第 61-100 轮只改维护审计、production smoke、launch gates 脚本、production runbook 和收尾验证，无需 Worker 版本变更。

## 开发原则

- Worker API 使用 Cloudflare 绑定访问 D1/R2/KV，不从 Worker 内调用 Cloudflare REST API。
- 前端保持真实可交互，不做静态营销页。
- 新增 API 时同步更新 `worker/lib/types.ts`、前端 `src/lib/api.ts` 和文档。
- 新增 API 时默认走 `requestId` 和 `securityHeaders`，保持 `X-Request-Id`、安全响应头一致，并让 `/api/*` 返回 `Cache-Control: no-store`。
- Production CORS 必须使用 `ALLOWED_ORIGINS` 白名单；空 allowlist 在 production 下默认拒绝跨域 Origin，不能放行全部。
- 未知 `/api/*` 应返回 JSON `not_found`，不要回退到不可解析的文本错误体。
- 改 Worker 行为后优先跑 `npm run verify:local`；部署前继续跑 `verify:launch` / `verify:production` 和线上 smoke。
- `npm run cf:check`、`npm run cf:check:production`、`npm run deploy:retry`、`npm run deploy:production:retry` 都必须先构建当前 bundle，不能用旧 `dist` 做 dry-run 或部署。
- 改动数据库结构时新增 migration，不直接改旧 migration。
- 生产开启 Turnstile 时，同时设置 `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` 与 `TURNSTILE_REQUIRED=true`，并跑一次真实投递验证。
- 生产发布前先跑 `npm run launch:readiness`；部署 production Worker 后再跑 `npm run launch:readiness:remote:strict` 验证 Cloudflare 端 secret 名称和 production CORS origin。
- Production Worker 创建后跑 `npm run smoke:production:auth`，验证未登录 API 401、`X-Dev-User` 不绕过认证、production CORS 和安全头。
- Production Worker 创建并拿到真实 Clerk 管理员 session 后跑 `SMOKE_ADMIN_BEARER_TOKEN=<clerk-admin-session-jwt> npm run smoke:production:admin`，只读验证后台 metrics、审核列表、事件流、CSV 导出和 storage audit；可同时设置 `SMOKE_NON_ADMIN_BEARER_TOKEN` 验证普通用户后台 403。
- Production Worker 创建并拿到真实 Clerk 普通用户 session 后跑 `SMOKE_USER_BEARER_TOKEN=<clerk-normal-session-jwt> npm run smoke:production:turnstile`，验证缺 Turnstile token 的投递被拒绝为 `turnstile_required`。
- Production Worker、secret、真实浏览器登录、管理员动作和 Turnstile 投递全部验收后跑 `npm run launch:gates:remote:strict`；人工证据用 `LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true`、`LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true`、`LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true` 显式传入。
- 发布 production Worker 使用 `npm run deploy:production:retry`，不要直接给普通 `deploy:retry` 手动追加 production env；脚本会先 `build:production`，再跑 remote strict readiness。普通 `deploy:retry` 也会先 `build` 再部署预览 Worker。生产 secret 只声明名称并放在 Cloudflare secrets，不把 secret 值写进本地源码。
- 本地验证管理员 UI 可临时设置非敏感 `.dev.vars`，但提交/交付前必须恢复空白名单默认拒绝边界。
- 管理员 UI 支持单条和批量审核；批量接口仍只允许白名单用户调用，且一次最多处理 100 条。
- 打捞结果支持用户举报；重复举报、作者自举报和无效原因必须返回明确错误。
- UGC 图片上传前端和后端都要校验类型、空文件和 8MB 上限；前端预览 object URL 需要释放。
- 运营预制内容通过 `scripts/preseed-bottles.csv` 维护，先生成 SQL 再导入 D1；远端导入脚本已做分批和重试，适合反复 upsert。
