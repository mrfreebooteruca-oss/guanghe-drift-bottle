# src

React 前端源码目录，负责光核安利漂流瓶的用户流程和运营后台 UI。

## 结构

- `App.tsx`：主视图切换、API 调用、通知状态、举报弹窗、运营后台入口、批量审核工具条和事件流。
- `components/`：投递、打捞、安利墙、任务、图片兜底和顶部导航组件。
- `lib/api.ts`：前端到 Worker `/api/*` 的类型化 client，包含登录 token、演示身份、CSV blob 下载。
- `lib/types.ts`：前后端共享的前端数据契约。
- `styles/app.css`：全局布局、光核视觉基调、响应式断点和运营后台表格样式。

## 维护原则

- 新增 Worker API 后，同步更新 `lib/api.ts` 和 `lib/types.ts`，不要在组件里散落裸 `fetch`。
- 运营后台的可见数据必须来自 `/api/admin/*`，不能用公开 `bootstrap.metrics` 冒充后台权限数据。
- `reported` 是后台内容筛选，不是 `BottleStatus`；前端应使用 `AdminBottleFilter` 承接它。
- 运营后台批量操作必须使用原生 checkbox 或等价可访问控件，完成后清空选择并重新读取列表。
- 用户举报等安全反馈优先使用明确的按钮、单选原因和提交确认；不要把真实举报提交放进无确认的快捷动作里。
- 投递图片选择后要即时校验类型、空文件和 8MB 上限；创建预览时要释放旧的 object URL。
- 默认环境未设置 `ADMIN_USER_IDS` 时，后台页面应显示受限状态；需要本地验证管理员 UI 时，可临时用 `.dev.vars` 设置非敏感演示值，验证后删除。
- 移动端断点必须检查无横向溢出，尤其是表格、按钮组、长标题和 code 样本。
