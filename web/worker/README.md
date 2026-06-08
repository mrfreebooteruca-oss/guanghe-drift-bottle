# worker

Cloudflare Worker 后端，负责 `/api/*`、`/media/*`、Queue consumer 和所有 Cloudflare 绑定访问。

## 主要模块

- `index.ts`：Hono 路由、CORS、错误处理、Queue consumer。
- `lib/http.ts`：JSON 响应、请求追踪、错误边界、安全响应头和通用 HTTP 工具。
- `lib/health.ts`：D1/KV/R2/Queue 绑定健康检查。
- `lib/auth.ts`：Clerk / 演示身份认证、管理员白名单判断。
- `lib/db.ts`：D1 查询与业务数据转换。
- `lib/content.ts`：投递内容、图片、敏感词校验。
- `lib/turnstile.ts`：Cloudflare Turnstile server-side 校验。
- `lib/rateLimit.ts`：基于 KV 的轻量限流。
- `lib/reports.ts`：漂流瓶举报、去重、举报计数和自动转待审逻辑。
- `lib/admin.ts`：运营审核列表、事件流、CSV 导出、单条/批量审核动作和 R2/D1 存储巡检。

## 维护原则

- 访问 D1/R2/KV/Queue 时使用 Worker bindings，不从 Worker 内调用 Cloudflare REST API。
- Queue consumer 处理消息时先完成关键 D1 写入再 `ack`；失败要结构化记录并 `retry`，不要把未落库消息提前确认。
- 所有路由默认经过 `requestId` 与 `securityHeaders`；新增自定义 `Response` 时不要覆盖掉 `X-Request-Id` 和安全头，`/api/*` 应保持 `Cache-Control: no-store` 与 `Vary: Origin`。
- `/api/*` CORS 只允许 `ALLOWED_ORIGINS` 中的 origin；production 下如果 allowlist 为空，必须默认拒绝跨域 Origin，不要回退成放行全部。
- 未知 `/api/*` 路径统一返回 JSON 404 `not_found`；不要让 API 客户端收到文本 404。
- 新增管理员接口必须先检查 `isAdminUser`，空白名单时默认拒绝。
- 健康检查只返回绑定状态与 latency，不返回 KV/R2/D1 具体内容。
- 新增可下载导出时要限制最大行数，并防止 CSV 公式注入。
- `reported` 只作为后台/CSV 特殊筛选使用，不写入 `bottles.status`。
- 新增审核列表接口时要限制 `limit`，不要把全量内容一次性返回到前端。
- 新增批量操作时要限制单次处理数量，并保持空白 `ADMIN_USER_IDS` 默认拒绝。
- 新增 UGC 反馈接口时要做用户级限流、重复提交保护和活动事件记录；不要让普通用户直接删除内容。
- 图片写入 R2 前必须先校验 MIME、空文件和大小上限；无效图片不应产生 R2 对象或 D1 行。
- `/media/*` 只代理 `bottles/` 前缀下的图片 key；不要把任意 R2 对象暴露到公共 media 路由。
- 改数据库结构时新增 migration，不直接修改旧 migration。
- 改 `wrangler.jsonc` 后运行 `npm run cf:types`，再跑 `npm run typecheck`、`npm run build`、`npm run cf:check`。
