# 光核安利漂流瓶

“光核安利漂流瓶”是一个面向 PC/主机玩家社群的网页活动产品。用户可以上传一张游戏图片与推荐文案投递漂流瓶，随机打捞其他玩家的安利，并把喜欢的内容保存到个人安利墙。

## 目录

- `PROJECT.md`：长期进度账本、风险、经验和下一步。
- `docs/`：架构、部署、运营维护文档。
- `web/`：Cloudflare 全栈应用，包含 React 前端、Worker API、D1 migration、部署脚本。

原始活动方案、环境变量、本地 Wrangler 缓存、数据库导出和生成 SQL 不进入公开仓库。

## 当前技术方向

- 前端：React + Vite + TypeScript。
- 后端：Cloudflare Worker。
- 部署：Workers Static Assets + Wrangler。
- 数据：Cloudflare D1。
- 图片：Cloudflare R2。
- 配置/缓存：Cloudflare KV。
- 登录注册：Clerk。

## 线上预览

已部署到 Cloudflare Workers：

https://guanghe-drift-bottle.adwardhuanguca.workers.dev

当前预览环境使用演示身份；填入 Clerk keys 并切换生产变量后启用真实登录注册。

## 维护说明

每次完成有意义的功能、修复或部署步骤，都要更新 `PROJECT.md`。如果触达 `docs/` 或 `web/` 的主要结构，也同步维护对应目录的 README 或运行说明。
