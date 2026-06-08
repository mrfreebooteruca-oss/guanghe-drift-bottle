# 备份与恢复

## Cloudflare D1

D1 production backend 默认支持 Time Travel，可按时间点或 bookmark 恢复。恢复是破坏性操作，执行前必须记录当前 bookmark，并确认要覆盖的数据库和环境。

## 日常检查

```bash
cd web
npm run db:info:remote
npm run db:bookmark:remote
```

`db:bookmark:remote` 会输出当前可恢复 bookmark。每次迁移、批量审核、导入预制内容或上线前，先记录一次 bookmark 到 `PROJECT.md` 或发布记录。

最近一次复验：

- 时间：2026-06-06
- D1：`guanghe-drift-bottle-db`
- 表数量：9
- 大小：143 kB
- Bookmark：`00000008-00000000-00005082-cd46bcaac8b9cd9a851bb0c5be407fae`

## 导出 SQL

本地导出：

```bash
cd web
npm run db:export:local
```

远端导出：

```bash
cd web
npm run db:export:remote
```

导出文件写入 `web/backups/d1/`。SQL 备份可能包含用户 ID、投递文案和图片 key，不要公开分享或提交到公共仓库。

## 恢复流程

1. 停止可能继续写入的运营动作，例如批量审核或导入。
2. 记录当前 bookmark：

```bash
cd web
npm run db:bookmark:remote
```

3. 按 Cloudflare 输出确认要恢复的 bookmark 或 timestamp。
4. 执行恢复命令前再次确认数据库名是 `guanghe-drift-bottle-db`。
5. 恢复后运行：

```bash
cd web
npm run db:info:remote
curl -sS https://guanghe-drift-bottle.adwardhuanguca.workers.dev/api/health
```

6. 用页面和 `/api/bootstrap` 做 smoke，确认活动可读。

## 风险边界

- Time Travel 恢复会覆盖数据库当前状态。
- SQL 导出是长期留存手段，不替代恢复前 bookmark。
- R2 图片对象不在 D1 SQL 导出中；D1 只保存 `image_key`。
- 第 7 轮之后的线上代码会在 D1 写入失败时尝试清理刚写入的 R2 对象。
