# 代码审查记录（2026-09-22）

> 本文保留当日基线、发现和测试数量。当前问题状态与验证结果见 [2026-10-01 全量审查](./CODE_REVIEW_2026-10-01.md)。

## 结论

当前工作树的类型化 API、CI 聚合检查和近期文档改动整体可用，但仍有 4 个需要处理的实现/安全问题，以及 1 个文档边界问题：同城入口可能请求错误分区，通知正文存在兼容字段丢失，认证状态写入失败不可见且仍以明文文件保存，遥测移除说明遗漏 Sentry 清理步骤。

本轮已确认并不再作为问题记录：

- Android/iOS 的 Secret 差异已在 `docs/TELEMETRY.md`、`docs/RELEASING.md` 和 `DEVELOPMENT.md` 中修正；Android 需要 `EXPO_TOKEN` 加 4 个 telemetry Secret，iOS 需要 4 个 telemetry Secret。
- README 中的 GitHub Actions 专节已删除，提交前验证仍保留 `npm run check`。

## 基线与范围

- 分支：`main`，审查提交：`ef39370`（合并 PR #97，类型化知乎 API 响应）。
- 工作树原本已有 `.github/workflows/ci.yml`、`AGENTS.md`、`BUILD_WINDOWS.md`、`README.md`、`docs/RELEASING.md`、`docs/TELEMETRY.md` 和新增的 `DEVELOPMENT.md` 改动；这些不是本轮代码审查产生的。当前轮只删除了 README 的 GitHub Actions 说明，并重组本审查记录。
- 范围：PR #97 的 API 响应类型与调用方、登录持久化、同城 Feed、通知渲染，以及 CI、开发、发布和 telemetry 文档的一致性。
- 前次记录：[2026-09-05 代码审查](./CODE_REVIEW_2026-09-05.md)。

## 验证结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm run check` | 通过 | 类型检查、Biome、9 组测试及富文本 fixture 分析全部完成 |
| `npm run typecheck` | 通过 | strict TypeScript 无编译错误 |
| `npm run lint` | 通过 | 检查 235 个文件，无 error/warning |
| `npm test` | 通过 | 74 个测试通过 |
| `npm run analyze:rich-content` | 通过 | 7 个已登记 fixture 校验为 `ok` |
| `git diff --check` | 通过 | 当前差异无空白错误 |

未执行 Android/iOS 原生构建、真机登录、真实知乎 API 响应回放或文件系统故障注入。`apiClient.get<T>()` 的泛型只提供编译期约束，不能替代运行时响应验证。

## 发现与建议

### P2：同城入口会接受任意非空 `section_id`

位置：[`api/zhihu/feed.ts`](../src/api/zhihu/feed.ts)，第 642–645 行。

`sections.find()` 的条件是“名称包含同城，或 `section_id` 非空”。只要普通分区排在同城分区前面，就会提前命中普通分区，随后请求错误的 Feed，并把错误名称保存为 `localCityName`。这会让同城入口的结果依赖接口返回顺序。

建议：先按明确的同城名称或服务端标记匹配，再校验 `section_id`；找不到同城分区时使用显式回退。补充“普通分区在前、同城分区在后”和“不含同城分区”的测试。

### P2：通知正文的旧格式字段被类型收紧后丢失

位置：[`app/notifications/index.tsx`](../src/app/notifications/index.tsx)，第 216–219 行；[`types/zhihu.ts`](../src/types/zhihu.ts)，第 516–524 行。

当前渲染只读取 `extend.text`、`target.text`、`item.target.content` 和字符串 `content`。`ZhihuNotificationContent` 没有旧接口可能返回的 `text`、`title`、`sub_text` 字段；当 `item.content` 是不含这些新字段的对象时，会直接显示“新的动态”，用户看不到实际通知内容。

建议：把兼容字段加入类型，并保留旧字段的显示回退；补充覆盖 `extend`、`text/title/sub_text`、嵌套 target 和字符串 content 的脱敏响应测试。

### P2：认证持久化写入失败不会反馈给登录流程

位置：[`store/useAuthStore.ts`](../src/store/useAuthStore.ts)，第 18–49 行；[`app/login/index.tsx`](../src/app/login/index.tsx)，第 71–92 行。

文件存储适配器吞掉了 `writeAsStringAsync` 异常，`addAccount` 更新内存状态后，登录流程仍会清缓存、提示“登录会话已保存”并跳转。磁盘写入失败时，内存状态与重启后的状态可能不一致，账号可能在重启后恢复旧值或消失。

建议：让持久化返回可等待的成功/失败结果，登录流程在持久化成功后再报告成功；失败时保留页面状态并提供重试。补充文件系统写入失败及重试成功测试。

### P2：包含 Cookie 的认证文件仍未静态加密

位置：[`store/useAuthStore.ts`](../src/store/useAuthStore.ts)，第 8–10 行；[`DEVELOPMENT.md`](./DEVELOPMENT.md)，第 128 行。

多账号认证状态直接写入应用沙箱中的 `auth-storage.json`。应用沙箱提供隔离，但文件本身没有静态加密；一旦备份、调试导出或其他本地泄露路径暴露该文件，Cookie 可被直接读取。

建议：采用 SecureStore 保存加密密钥、文件保存加密 payload，并提供旧明文文件的一次性迁移；迁移成功后再清理旧文件，保留多账号和旧 SecureStore Cookie 的兼容读取。

### P3：telemetry 的“移除方式”遗漏 Sentry 清理

位置：[`docs/TELEMETRY.md`](../docs/TELEMETRY.md)，第 55–57 行；[`app/_layout.tsx`](../src/app/_layout.tsx)，第 6、36–38、326 行。

文档只要求删除 telemetry 适配层、两个 Firebase 依赖和相关配置，但根布局仍直接导入 `@sentry/react-native` 并调用 `Sentry.wrap`，`app.json` 仍有 Sentry config plugin，`package.json` 仍有 Sentry 依赖，构建工作流也仍需要 Sentry DSN 和 Auth Token。照文档操作会留下未清理的 Sentry 集成；同一文档“产品代码不应直接导入 Sentry”的表述也与根布局现状不完全一致。

建议：移除说明同时列出 Sentry 依赖、config plugin、根布局 wrapper、构建环境变量和 CI Secret；或者明确说明 Sentry 保留，只移除 Firebase Analytics，并解释根布局 wrapper 是特例。

## 待验证风险

`app/login/index.tsx:55–56` 仍将 `hasZseCk` 固定为 `true`，因此缺少 `__zse_ck` 的等待分支不可达。历史提交说明这是为避免登录永久等待而有意跳过，但当前注释、日志和实际检查不一致。需要真机验证知乎当前服务端行为后，再决定是否恢复检查；不能仅凭静态代码推断缺少该 Cookie 会导致所有 API 失败。

## 前次问题状态

| 问题 | 当前状态 |
| --- | --- |
| 请求日志输出 Cookie/Axios config | 已关闭；当前只记录 method、脱敏 path、status 和 request id |
| 登录与 URL 解析日志输出完整 URL | 已关闭；当前使用 origin/path 或固定失败标记 |
| 同城分区选择条件过宽 | 仍存在，见本记录 P2 |
| 通知正文兼容字段缺失 | 仍存在，见本记录 P2 |
| 认证文件未加密 | 仍存在，见本记录 P2 |
| 认证持久化失败无反馈 | 仍存在，见本记录 P2 |
| CI 缺少质量门禁 | 已关闭；CI 使用 `npm ci` 后执行 `npm run check` |
| `npm run lint` 会修改文件 | 已关闭；写入行为已移到 `lint:fix` |

## 建议处理顺序

1. 修正同城分区选择并补回归测试。
2. 恢复通知正文的旧字段回退并补响应样本测试。
3. 让认证持久化失败可观察、可重试，并设计加密文件迁移。
4. 修正文档中的 telemetry 移除步骤，明确 Firebase-only 与完整 telemetry removal 两种路径。
5. 真机验证 `__zse_ck` 的必要性，再决定是否调整登录成功判定。
