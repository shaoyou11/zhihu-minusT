# 数据统计与错误上报

本项目按 Expo 官方推荐的 React Native Firebase 路径接入 Firebase Analytics：使用 Expo Config Plugin、`expo-dev-client` 和 EAS/本地开发构建。Firebase JS SDK 可以在 Expo Go 中使用，但不支持移动端 Analytics，因此不能用于这里的 Analytics 集成。

## 本地启用

1. 在 Firebase 控制台为当前 Android application ID 和 iOS bundle identifier 注册应用。
2. 下载 `google-services.json` 和 `GoogleService-Info.plist` 到项目根目录。这两个文件只包含客户端配置，不是服务端密钥；它们已被 `.gitignore` 排除。
3. 复制 `.env.example` 为 `.env.local`，设置：

   ```text
   EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED=true
   GOOGLE_SERVICES_JSON=./google-services.json
   GOOGLE_SERVICE_INFO_PLIST=./GoogleService-Info.plist
   ```

4. 如果启用 Sentry，设置 `EXPO_PUBLIC_SENTRY_DSN`。DSN 是运行时项目标识，不是 Sentry API 令牌。
5. 运行 `npx expo prebuild`，然后使用 `npx expo run:android`、`npx expo run:ios` 或 EAS Build。Expo Go 不包含这些原生模块。

`EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED` 未设为 `true` 时，prebuild 会跳过 Firebase config plugins，Analytics 也会退化为空实现；因此本地无需准备两个 Firebase 配置文件即可开发、安装 CocoaPods 或生成原生项目。Firebase 原生依赖仍由 React Native 自动链接，但 iOS prebuild 会独立写入 `$RNFirebaseDisableSPM = true`，使其与项目的 static linkage 兼容，且运行时不会启用 Analytics。正式构建启用该变量后仍会使用原有插件和配置文件。未配置 Sentry DSN 时，Sentry 也不会初始化，应用仍可开发和运行。

Firebase 已公告自 2026 年 10 月起停止向 CocoaPods 发布新版本，已有版本仍可安装运行。当前项目保留已验证的 CocoaPods/static linkage 路径；后续原生依赖升级应单独评估 React Native Firebase 的 SPM 兼容性，并同时验证 Expo config plugin 和 Scene 初始化，不能只移除 `disableSPM`。依据见 [Firebase 官方迁移说明](https://firebase.google.com/docs/ios/cocoapods-deprecation)。

## 隐私开关

设置首页的「分享数据（App崩溃报告&匿名数据）」开关使用 SecureStore 持久化。关闭后：

- Firebase Analytics 调用 `setAnalyticsCollectionEnabled(false)`；
- Sentry 不再接受事件，并清理当前用户上下文；
- 已经发送到服务商的数据不会因为关闭开关而自动删除。

业务页面不应直接导入 Firebase 或 Sentry。根布局保留 SDK 的 `Sentry.wrap` 包装，但它不是 React 错误边界；根路由导出的 `AppErrorBoundary` 才负责捕获渲染异常、展示重试和复制日志入口，并通过 `src/utils/telemetry.ts` 上报。需要新增事件时，调用适配层方法，并只传递脱敏的事件名、类型和数值。

## 自动 JS 异常的边界

`beforeSend` 与 `beforeSendTransaction` 重新构造白名单事件。异常正文保留可识别的引擎错误安全摘要和稳定错误码，例如 `Cannot read property 'length' of undefined` / `js.undefined-property`；属性名仅允许固定结构字段，动态属性名替换为 `<redacted>`，未知消息降级为 `Application failure`。不复制任意原始异常消息或其中的表达式、值、请求内容。

允许保留的定位字段包括异常类型、白名单代码路径及栈帧行列、已知 bundle 文件名、`debug_id`，以及应用/系统版本、`buildNumber`、`commit`、`sourceFingerprint`（可用时）。业务上下文仅接受固定枚举 `area` / `operation`；例如关注头像栏通过 `DiagnosticScope` 标注 `following.recent-moments` / `render`，再将同一异常交给根边界统一记录和上报，不使用动态路由或用户 ID。其余设备/context 仅保留明确允许的枚举及数值，清除 user、request、extra、breadcrumbs、任意 tags、路由名、span description/data 和 hint attachments。截图、视图树、replay、profile、SDK logs、session 与 client reports 均关闭。

RN 0.83 的未捕获 React 渲染异常可以直接进入 `ExceptionsManager`，绕过 Sentry 的 `ErrorUtils` 自动捕获入口。根路由的错误边界显式调用 `captureTelemetryException(error, 'react-render')`，覆盖根布局和子页面。遥测偏好在模块级订阅，不依赖根布局成功提交 effect；偏好尚未恢复时，最多暂存 10 条已去除原始消息的错误于内存，恢复为开启后上报，关闭则丢弃，之后开启不会补发关闭期间的事件。

当前 `enableNative: false`：Sentry 原生崩溃通道绕过 JS 脱敏及实时隐私开关，因此暂不启用原生 crash/原生离线缓存。React 错误边界、JS 全局异常和未处理 Promise 的 SDK 捕获仍走 JS 脱敏通道；原生进程退出、系统终止及没有送达 JS 的异常不在覆盖范围内。要恢复原生通道，应先实现并验证等价的原生脱敏与 opt-out，不能直接打开开关。

Firebase 默认自动收集及自动页面上报关闭，collection 只在偏好 hydrate 后启用；手动事件仍须遵守前述脱敏规则。关闭开关会阻止后续事件，不能撤回已发送数据。

## 本机报错日志

“设置 → 报错日志”提供预览、刷新、复制和清空，错误边界也提供复制入口。`src/utils/diagnosticLogs.ts` 在本机同步保留最近 30 条记录，每条最多 12 个代码位置；两份交替快照各不超过 64 KiB，以保留上次完整写入的记录。文件使用独立的 version 1 格式，读回与复制时再次白名单脱敏。存储不可用时退化为本次运行的内存记录，并在界面提示。

日志包含时间、来源和上述安全错误摘要、稳定错误码、固定业务上下文、版本构建标识与代码位置。只保留诊断 manifest 白名单中的仓库相对源码路径和已知 bundle 名；文件位置中的主机、绝对目录、query 和 fragment 不保留，未知代码文件降级为 `source.js`。不保存任意原始异常消息、动态属性名、函数名、任意 URL/路径、账号、Cookie、请求/响应对象或正文。记录与“分享数据”开关独立，不会自动上传日志文件；只有用户主动复制后才进入剪贴板。全局 JS 异常在调用既有 Sentry/平台处理器前同步落盘，SDK 的其他自动异常在 `beforeSend` 内记录，手动上报和渲染边界避免重复记录。清空同时删除两份快照，删除失败会提示，不能宣称历史记录已清除。

诊断 manifest 由 `app.config.ts` 生成，包含固定源码目录下的允许路径和内容指纹；不包含源码内容、用户目录、配置文件、fixture 或账号数据，也不跟随符号链接。`commit` 取当前 Git HEAD，无 Git 元数据时省略；`sourceFingerprint` 反映纳入清单的源码内容，包括这些文件的未提交改动。开发时更改源码后须重启 Metro 并重新加载应用来刷新 manifest，Fast Refresh 本身不会更新指纹。指纹有助于区分源码状态，不能替代 source map：生产 bundle 的栈帧仍须对应同次构建的 source map，并核对 `debug_id`（若有），不能仅凭应用版本套用另一构建的映射。

本机日志不能保证捕获原生崩溃、系统强制结束或 JS 执行前的失败。验证时运行 `npm test -- tests/diagnosticLogs.test.ts tests/diagnosticLogsSettings.test.tsx tests/diagnosticErrorHandler.test.ts tests/diagnosticScope.test.tsx tests/appErrorBoundary.test.tsx tests/errorDiagnostics.test.ts tests/diagnosticsManifest.test.ts tests/telemetryBuildContext.test.ts tests/telemetrySanitizer.test.ts tests/telemetryPreferences.test.ts tests/telemetryPrivacy.test.ts tests/telemetrySdk.test.ts --runInBand`；真机还需检查渲染异常后的重试、复制、重启保留及关闭分享数据后的行为。SDK 测试使用内存 transport，不代表线上 Sentry 已收到事件。

## CI 配置

GitHub Actions 不需要把 Firebase 文件提交到仓库。请在仓库的 `Settings → Secrets and variables → Actions` 中创建以下 Secrets：

- `EXPO_TOKEN`：Expo Access Token，Android 本地 EAS Build 使用；
- `FIREBASE_ANDROID_JSON_B64`：`google-services.json` 的 base64 内容；
- `FIREBASE_IOS_PLIST_B64`：`GoogleService-Info.plist` 的 base64 内容；
- `EXPO_PUBLIC_SENTRY_DSN`：Sentry DSN；
- `SENTRY_AUTH_TOKEN`：Sentry Organization Auth Token，用于构建时上传 source map。

Android job 通过 Expo GitHub Action 使用 `EXPO_TOKEN`，并校验另外 4 个 telemetry Secret；iOS job 只校验这 4 个 telemetry Secret。由于当前 workflow 总是同时运行 Android 和 iOS，完整构建（包括只选择 artifact、不创建 GitHub Release 的模式）仍需要配置全部 5 个 Secret。

本项目的 Sentry 组织位于 DE 区域，配置中的 Sentry URL 已固定为 `https://de.sentry.io/`。

macOS 可以这样生成 base64 内容，再粘贴到对应 Secret：

```bash
base64 < google-services.json | tr -d '\n'
base64 < GoogleService-Info.plist | tr -d '\n'
```

`build.yaml` 会在每个构建 job 中把这两个 Firebase Secret 临时还原为根目录文件，并通过环境变量交给 `app.config.ts`。`.easignore` 会在 EAS 创建临时构建归档时将这两个刚生成的文件包含进去；它们仍被 `.gitignore` 忽略，不会进入 Git。runner 结束后文件随工作区一起销毁。Firebase 客户端文件本身不是服务端私钥，但仍按环境配置管理，不提交到 Git。`SENTRY_AUTH_TOKEN` 只放在 CI/EAS Secret 中，绝不能放进 App 包或提交到仓库。

## Source map 匹配与上传

Metro 使用 `@sentry/react-native/metro` 的 `getSentryExpoConfig`，再应用 NativeWind 配置，让生产 bundle、source map 和运行时异常共享 Debug ID。脱敏事件保留合法的 `debug_meta.images`、栈帧 Debug ID 和相应的 bundle 路径；这些定位字段不能替换为另一构建的值。

Android Gradle 与 iOS Xcode 的 Sentry 上传脚本均采用原生默认标识，运行时上报与其对齐：

| 平台 | release | dist |
| --- | --- | --- |
| Android | `<applicationId>@<versionName>+<versionCode>` | `<versionCode>` |
| iOS | `<CFBundleIdentifier>@<CFBundleShortVersionString>+<CFBundleVersion>` | `<CFBundleVersion>` |

Android 未提供原生构建编号时，运行时回退到 App 配置的 `android.versionCode`；当前构建不使用外部自动递增。未来若启用 EAS 远端版本管理、自动递增或修改原生版本号，须同步调整运行时元数据获取，确保上报使用最终打包的编号。

不要单独覆盖上传时的 `SENTRY_RELEASE` / `SENTRY_DIST`，否则会再次与运行时不一致。CI 与本地未签名 IPA 脚本在上传前清除这两个覆盖值。CI 明确启用上传且不允许忽略上传失败；Android 上传报告直接显示在 EAS/Gradle 日志中。iOS 在前台上传并等待服务端处理，成功构建后还须找到 CLI 的 source map 上传报告，才输出固定成功摘要；不会将整份成功的 Xcode 日志输出。

本地 `bash scripts/build-unsigned-ipa.sh` 没有导出的 `SENTRY_AUTH_TOKEN` 时保留离线构建能力；配置 Token 后默认执行上传并等待处理。需要离线构建可显式设置 `SENTRY_DISABLE_AUTO_UPLOAD=true` 或 `SENTRY_NO_UPLOAD=1`。Token 只通过构建进程环境传递，不应放入 `.xcode.env.local`、App 配置或包内。

变更此链路后重新 prebuild 并构建 Release；在 Android 和 iOS 各触发一条不含用户数据的测试异常，检查新事件的 `release` / `dist` 与上传报告一致、`debug_meta.images[].debug_id` 与同次 source map 一致，并确认堆栈已还原到仓库源码。旧版本已经发出的事件仍保留原来的元数据；不能仅上传新构建的 source map 来修复旧构建的堆栈。

## 移除方式

仅移除 Firebase Analytics 时，删除适配层中的 Firebase 分支、`package.json` 的两个 `@react-native-firebase/*` 依赖、Firebase config plugins、`firebase.json` 和 `app.config.ts` 的 Firebase 配置；同步删去工作流中的 Firebase 文件还原、校验与环境变量，以及 `.easignore` 的配置文件例外。保留 Sentry 分支和隐私开关。

完全移除 telemetry 时，还需删除 `@sentry/react-native` 依赖及 config plugin、根布局的 Sentry 导入和 `Sentry.wrap`、telemetry 初始化与业务调用、`src/utils/telemetry.ts`、`src/store/useTelemetryStore.ts` 及设置页开关。同步清理构建工作流和本地脚本中的 Sentry 上传配置、`.env.example` 与 `app.config.ts` 的 DSN 配置，以及对应 CI Secrets。根布局改为导出未包装的布局组件；业务页面不直接依赖厂商 SDK。

任一原生 SDK 移除后都要同步锁文件、重新 prebuild、安装 Pods 并重新编译两端，不能只依靠 Fast Refresh 验证。
