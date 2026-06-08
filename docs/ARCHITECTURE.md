# 架构说明

## 产品闭环

1. 用户注册/登录后进入活动首页。
2. 用户投递漂流瓶：上传图片、标题、游戏名、推荐理由、分类。
3. Worker 校验内容并把图片写入 R2、元数据写入 D1。
4. 用户获得每日规则内的打捞次数。
5. 用户打捞漂流瓶：D1 随机选择一个自己未投递、未打捞过、已通过审核的瓶子。
6. 用户可把瓶子保存到 4 宫格或 9 宫格安利墙。
7. 用户可举报打捞到的不合适内容，Worker 记录去重举报并在达到阈值后转待审。
8. 运营后台读取实时数据，用于审核、复盘和导出。

## Cloudflare 分工

- Workers Static Assets：托管 React 构建产物。
- Worker API：处理 `/api/*`、`/media/*`，执行认证、校验、业务逻辑、图片响应。
- D1：关系型活动数据，包含用户、瓶子、举报、打捞、安利墙、任务、事件。
- R2：用户上传图片对象。
- KV：敏感词、功能开关、轻量缓存、临时限流计数。
- Queues：预留异步审核、精选评选、数据汇总任务。
- Turnstile：投递场景的人机校验。预览环境可关闭，生产环境通过 `TURNSTILE_SITE_KEY` 与 `TURNSTILE_SECRET_KEY` 强制校验。
- Web Analytics / Observability：部署后用于访问与 Worker 日志观测。

## 认证

前端使用 Clerk 组件完成登录注册。API 请求携带 Clerk session token，Worker 使用 Clerk 后端校验方法解析用户身份。无 Clerk 密钥时，本地开发允许演示用户模式，方便 UI 和业务流程验证。后台接口必须命中 `ADMIN_USER_IDS` 白名单；白名单为空时默认拒绝。

## 数据策略

- 内容默认 `approved`，首版以规则审核为主；后续可切成 `pending` 并由审核后台放行。
- 用户举报写入 `bottle_reports`；同一用户对同一瓶只记一次，公开瓶累计 3 次举报后自动转 `pending`。
- `reported` 是运营后台筛选条件，不是新的瓶子状态；真实状态仍为 `approved`、`pending`、`rejected`。
- 同一账号不会重复打捞同一个瓶子。
- 每日打捞次数上限为 4；投递、分享、拉新等任务发放次数写入 D1。
- 图片不直接暴露 R2 公共桶地址，由 Worker `/media/*` 代理并加缓存头。

## 运营接口

- `/api/health`：公开健康检查，轻量探测 D1/KV/R2/Queue 绑定可用性，不返回敏感数据。
- `/api/bottles/:id/report`：用户举报入口，要求登录或演示身份，做原因校验、重复举报保护和用户级限流。
- `/api/admin/metrics`：运营数据概览，要求 `ADMIN_USER_IDS` 白名单。
- `/api/admin/bottles`：运营审核列表，支持 `status=all|reported|approved|pending|rejected` 与 `limit`。
- `/api/admin/events`：最近运营事件流，支持 `limit` 与可选 `type` 过滤，要求 `ADMIN_USER_IDS` 白名单。
- `/api/admin/export/bottles.csv`：投递内容 CSV 导出，支持 `status=all|approved|pending|rejected` 与 `limit`。
- `/api/admin/bottles/:id/moderation`：更新瓶子审核状态与精选分，写入 `activity_events` 追踪。
- `/api/admin/bottles/moderation/bulk`：批量更新瓶子审核状态，一次最多 100 条，写入 `activity_events` 追踪。
- `/api/admin/storage/audit`：只读巡检 R2 图片对象与 D1 `image_key` 引用关系，返回异常样本。

## 商业级后续增强

- 接入 Cloudflare AI 或专门内容安全服务做图片/文本深度审核。
- 后台增加精选专栏、R2 异常对象处理和告警。
- 使用 Queue 异步生成缩略图、指标汇总和复盘快照。
- 生产环境开启 Turnstile、WAF、自定义域名、错误监控和告警。
