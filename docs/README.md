# docs

这里存放“光核安利漂流瓶”的架构、部署、运营和维护文档。

## 文件

- `ARCHITECTURE.md`：系统架构、数据流、Cloudflare 产品分工。
- `BACKUP.md`：D1 Time Travel、SQL 导出和恢复 runbook。
- `DEPLOYMENT.md`：本地开发、Cloudflare 资源准备、部署步骤和商业上线 gates。
- `PRODUCTION-CREDENTIALS.md`：真实 Clerk、Turnstile、管理员白名单和 production smoke token runbook。
- `QA.md`：质量审查、性能优化和迭代检查清单。

## 维护方式

当后端绑定、部署命令、数据库 schema、运营流程或质量门槛变化时，优先更新这里。`PROJECT.md` 记录进度和结论，`docs/` 记录可复用操作方法。
