# Production Credentials And Real Smoke Runbook

本 runbook 用于补齐真实 Clerk、Turnstile、管理员白名单和 production smoke token。不要把任何 secret、session JWT、cookie 或个人账号信息写入源码、文档或 `PROJECT.md`。

`npm run audit:source` 会扫描文档和项目账本中的真实 secret/JWT/cookie 形态；示例只能使用 `<placeholder>`。

## 生产配置来源

- Clerk publishable key：写入本地生产构建环境，例如 `.env.production` 或一次性 shell env 的 `VITE_CLERK_PUBLISHABLE_KEY`。
- Clerk secret key：只通过 `npx wrangler secret put CLERK_SECRET_KEY --env production` 写入 Cloudflare。
- 管理员 Clerk user id：写入 `wrangler.jsonc` 的 `env.production.vars.ADMIN_USER_IDS`，多个 id 用英文逗号分隔。
- Turnstile site key：写入 `wrangler.jsonc` 的 `env.production.vars.TURNSTILE_SITE_KEY`。
- Turnstile secret key：只通过 `npx wrangler secret put TURNSTILE_SECRET_KEY --env production` 写入 Cloudflare。
- Production CORS origin：写入 `env.production.vars.ALLOWED_ORIGINS`，必须是 `https://` 裸 origin。

## 写入 Cloudflare Secrets

```bash
cd web
npx wrangler secret put CLERK_SECRET_KEY --env production
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
```

写入后验证 secret 名称，不读取 secret 值：

```bash
npm run launch:readiness:remote
```

## 真实 Clerk Session Token

production smoke 需要真实浏览器会话取得的 Clerk session JWT。推荐只在当前 shell 临时设置，命令结束后关闭终端或清理变量。

```bash
export SMOKE_ADMIN_BEARER_TOKEN="<clerk-admin-session-jwt>"
export SMOKE_NON_ADMIN_BEARER_TOKEN="<clerk-normal-session-jwt>"
export SMOKE_USER_BEARER_TOKEN="<clerk-normal-session-jwt>"
```

也可以用 cookie 变量替代 bearer token：

```bash
export SMOKE_ADMIN_COOKIE="<browser-cookie-header>"
export SMOKE_NON_ADMIN_COOKIE="<browser-cookie-header>"
export SMOKE_USER_COOKIE="<browser-cookie-header>"
```

## Production Smoke 顺序

```bash
cd web
npm run launch:readiness:remote:strict
npm run smoke:production:auth
SMOKE_ADMIN_BEARER_TOKEN="<clerk-admin-session-jwt>" \
SMOKE_NON_ADMIN_BEARER_TOKEN="<clerk-normal-session-jwt>" \
npm run smoke:production:admin
SMOKE_USER_BEARER_TOKEN="<clerk-normal-session-jwt>" \
npm run smoke:production:turnstile
```

自定义域名上线后，所有 production smoke 的 base URL 和 CORS origin 都必须是裸 origin：

```bash
PRODUCTION_SMOKE_BASE_URL="https://your-domain.example" \
SMOKE_ALLOWED_ORIGIN="https://your-domain.example" \
npm run smoke:production:auth
```

## 人工证据 Gate

真实浏览器验收完成后，再设置人工证据变量运行最终 gates：

```bash
LAUNCH_CONFIRMED_REAL_CLERK_LOGIN=true \
LAUNCH_CONFIRMED_REAL_ADMIN_ACTION=true \
LAUNCH_CONFIRMED_REAL_TURNSTILE_SUBMISSION=true \
npm run launch:gates:remote:strict
```

这些变量只表示本次验收证据，不替代真实 Clerk、Turnstile、production Worker 和 Cloudflare secret 配置。
