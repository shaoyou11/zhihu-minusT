# 全量代码与文档审查（2026-10-01）

## 范围与基线

- 起始分支 `main`，提交 `4c0d9a7`，工作树干净；本轮通过 `codex/full-cr-optimizations-2026-10-01` 分支交付。
- 覆盖 API/认证、Zustand/SQLite、查询与 mutation、页面与交互、发布编辑器、富文本三个后端与原生模块，以及 Expo plugins、构建发布流程、测试和现有 29 份 Markdown 文档。
- 基线 `npm run check` 通过：33 suites、486 tests、8 个正文 fixture；Biome 有两个 optional-chain warning 和一处 schema 版本提示，本轮已处理。
- 外部 API 的真实响应、原生手势与 Release 性能仍需单独验收；静态类型和模拟测试不能证明这些行为全部正确。

## 初轮 CR 修复

| 优先级 | 触发场景与后果 | 修复与回归 |
| --- | --- | --- |
| P1 | 登录 A 后新增 B，`setCookies(B)` 仍保留 A 的活动账号，响应 Cookie 可覆盖 A；退出/切换后旧请求还能回写或再次认证 | 新登录会话先与旧账号脱离，未完成资料验证的会话退出保留既有账号，删除其他已保存账号保留当前会话；加入仅内存的会话版本，旧请求、刷新和登录/profile 回调按原会话校验。未改变持久格式 |
| P1 | 正文和元数据直接嵌入 WebView script，`</script>` 可截断脚本；执行节点、事件属性和脚注 HTML 可越过正文边界 | 标签/属性/样式/URL 白名单、脚本字符串转义、脚注纯文本构造和桥接二次校验；登记合成 fixture |
| P1 | 切账号时首页旧启动缓存可作为新账号 query 的 initialData，旧异步读取还可回写 | 共享 scoped async hook 同步隐藏旧值，并拒绝旧加载/刷新回写；曝光快照同样按 scope 隔离 |
| P2 | Axios 重发会复制 config，WeakSet 重试标记丢失；持续 401 可反复刷新，匿名 `d_c0` 又可让游客被当作登录 | 使用可随 Axios config merge 保留的一次重试标记；过期 Cookie 正确删除，仅含有效 `z_c0` 的响应进入认证状态 |
| P2 | 认证文件并发写入可让旧快照最后落盘；写失败被吞掉，登录页仍显示成功 | 文件写入/删除串行化，登录等待当前完整快照成功落盘；失败保留显式重试入口。覆盖并发、写入/删除失败及重试，保持原文件格式 |
| P2 | telemetry SDK 加载跨越关闭开关，事件仍可发出；慢 enable 可覆盖后来的 disable | 发事件前重新校验开关与世代；原生 collection 设置串行化；Sentry event/transaction 清除请求、extra 和 breadcrumbs，手动异常保留安全分类与栈帧，不传用户设备名 |
| P2 | 乐观 mutation 等待取消或网络响应时切换详情，回滚/成功回调作用于新 query；同缓存并发回滚可覆盖另一操作 | 每次调用保存完整 options 快照；本 hook 重复点击合并，同一缓存的不同操作完整排队，不同缓存并行；等待期间保持 pending |
| P2 | 分页正则会把 `end_offset`、`moment_start_offset` 当作实际 `offset` | 按 URL query 精确读取并验证安全整数，缺失或非法时停止分页 |
| P2 | 收藏状态只读取第一页，后续收藏夹漏显/漏删；切到另一内容后旧 selector mutation 更新了新内容 | 拉取完整分页，拒绝无进展分页；mutation variables 保存原内容 id/type，按原 query 校准状态 |
| P2 | 图片批量上传一项失败即清忙状态，其余仍在运行，成功图片也丢失 | 等待整批 settled，保留成功图片并提示部分失败；避免未结束时再次触发 |
| P2 | 阅读 hook 在同一实例切换内容后沿用旧高度、offset 和恢复标记 | layout cleanup 先保存旧内容，再重置新身份的测量与定时器；补切换回归 |
| P2 | 同城分区匹配接受任意非空 `section_id`，普通分区在前时请求错误 Feed | 先匹配同城名称再验证 id；覆盖普通分区在前和找不到同城两种情况 |
| P2 | 通知旧 `text/title/sub_text` 格式显示“新的动态”，手工 split 链接遗漏内容类型和嵌套回答 | 兼容旧正文类型，用公共 URL 解析器统一通知跳转 |
| P2 | 编辑既有回答丢失代码、标题、引用与有序列表；inline code 被解析为强调/链接 | 支持已有编辑器格式的序列化 round-trip，并覆盖嵌套占位符恢复，防止内部 token 成为发布正文 |
| P2 | KaTeX CDN 缺失或渲染异常阻断 WebView 后续高度和交互；元素端点选区偏移错误 | 公式失败后继续初始化；Range 统一文字/元素端点的 UTF-16 偏移；跨出真实段落时清理旧选择 |
| P2 | Scene 插件遇到生成标记即返回，Swift 源更新不能进入已有 AppDelegate | 刷新插件拥有的生成块，保留外围代码；拒绝截断/重复块。Firebase 开/关干净 prebuild 均检查 |
| P2 | 本地 IPA 脚本跳过已有工程 prebuild、写入本地 Xcode 配置，并删除其他版本 IPA/用户 Payload | 每次同步工程和 Pods，发现唯一 workspace/app，用独立临时目录打包；保留其他产物和配置。CI iOS 去掉重复 Pods 安装 |
| P3 | 聊天发送失败时已清空的草稿丢失；登录回跳的 `tab` 参数锁住首页滑动 | 未输入新文字时恢复失败草稿；初始 tab 同步不再由每次页面变化重新触发 |
| P2 | FlashList 回收卡片后，旧点赞/反对/关注响应更新新内容的本地状态；相同初始数值不能触发重置 | 回调按内容身份校验，本地提交同步去重，身份变化明确重置互动状态；覆盖复用和重复触发 |
| P3 | 登录 URL 解析失败的日志仍含 fragment；JSON 解析异常可能含输入片段，日报错误日志转发原 message；正文可直接开启任意外部 scheme | URL/JSON 失败只记固定标记，日报只记安全 status；外部链接只开放 HTTP(S)，内部知乎链接继续由路由解析器处理 |

初轮保持原有 schema 和持久格式。用户随后授权实施清单的高、中优先级项目；以下实现已新增 SQLite migration 4、加密账号文件外层 v1，以及阅读进度文件迁移。应用版本和生产发布状态未改变。

## 初轮实施的优化

原生富文本 JSON 只传 NativeFlow 读取的布局字段，sourceMap 仍由 JS 维护。两个既有样本的序列化体积分别从 276,584 降为 145,926 字节、从 259,146 降为 140,899 字节，约减少 47% 和 46%。这些是桌面序列化测量，尚不能视为启动时间、内存或帧率改善的真机结论。

收藏状态改为每页 20 条后完整读取；仅在确有下一页时继续。共享异步值、收藏切换和通知解析被抽成 typed hook/utility，便于重用并覆盖竞态。

## 初轮文档核验与修正

| 文档 | 处理 |
| --- | --- |
| README | 更新为 0.7.0；修正 iOS 安装命令工作目录；说明 Android 链接选择与 iOS 自定义协议边界，未宣称配置 Universal Links |
| DEVELOPMENT、AGENTS | 修正测试文件/命令说明、iOS Pods 命令；补本地 IPA 脚本行为；保持生成目录、迁移与验证要求 |
| BUILD_WINDOWS | prebuild 限定 Android，命令块标为 PowerShell；修正 split APK 路径和本地 Sentry 上传说明；删除手改生成版本建议及过期体积/提速说法；说明 ABI 参数同时控制编译与 split，并提醒核对旧产物残留 |
| TELEMETRY | 分别补完整移除和仅移除 Firebase 的步骤，说明根布局 wrapper 特例；记录 Firebase CocoaPods 后续升级边界 |
| DESIGN_TOKENS | 核对实际锁定依赖，撤回旧 RN/NativeWind 参数及缓存缺陷仍存在于当前版本的说法 |
| THEME_CUSTOMIZATION | 更新实际设置入口，并在后续实施中同步运行时颜色、对比度和后端边界 |
| 富文本与原生模块 README、fixture README、Renderer V2 计划 | 同步 WebView 输入边界、合成 fixture 和 NativeFlow JSON/sourceMap 契约 |
| 旧 CR、实验、抓包与个人开发记录 | 保留历史数字和已记录环境；旧 CR 指向本报告，抓包记录明确 ARM64 前提与脱敏边界；不把历史 todo 当作当前状态 |
| RELEASING、ZHIHU_APP_API 及其余富文本文档 | 对照现有 workflow/API/实验边界，无需改动的内容保留 |

已扫描 Markdown 和 HTML 本地文件链接（排除示例代码），未发现遗留失效路径。关键外部平台依据核对了 [GitHub Dependabot 配置](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)、[Expo Scene 生命周期](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md) 与 [Firebase CocoaPods 迁移公告](https://firebase.google.com/docs/ios/cocoapods-deprecation)；未对所有外链作在线存活性保证。

## 初轮验证记录

- 最终 `npm run check` 通过：类型检查、只读 Biome（310 个文件，无 warning）、51 个测试套件 / 589 个测试、9 个富文本 fixture 均通过。测试收集增加普通 `tests/**/*.test.tsx`，覆盖登录保存重试组件。
- `npm test -- features/rich-content/tests --runInBand`、构建脚本/Scene 插件及认证/查询/发布/收藏/回收交互专项均通过；Swift Foundation 原生 flow smoke 17 项通过。
- `git diff --check` 和 `bash -n build-unsigned-ipa.sh` 通过；构建、CI 与 Dependabot YAML 解析通过；30 份 Markdown 的本地链接检查无失效路径。未重新安装依赖，本轮没有更改 dependency/lockfile。
- `npx expo prebuild --platform ios --no-install` 与 `pod install --project-directory=ios` 通过；隔离临时项目分别验证 Firebase 关闭、合成 Firebase 配置开启的干净 iOS prebuild，以及 Android prebuild。合成配置检查不代表真实 Firebase 服务验证。
- `xcodebuild -workspace ios/app.xcworkspace -scheme app -configuration Debug -destination 'id=<connected-device>' -derivedDataPath build/code-review-ios COMPILER_INDEX_STORE_ENABLE=NO build` 通过，已设置 `SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_NO_UPLOAD=1`。Xcode 输出包含第三方弃用和脚本输出依赖 warning；没有构建错误。生成的 `ios/`、`android/` 保持 ignored，未进入本轮 diff 或提交。
- 连接的 iPhone SE（第 3 代，iOS 27.0）已通过 CoreDevice 安装 0.7.0 Debug 应用并成功启动，保留原应用数据；Metro 成功打包并向设备提供代码。合成富文本测试页面的冷/热启动链接均成功送达，冷启动后进程仍在运行。命令行成功送达链接不能证明页面显示或手势正确，尚未获得屏幕交互证据。
- 一轮与原生编译并行的聚合检查出现两项 5 秒超时；编译结束后完整重跑通过，后续日志收敛修改后的最终完整检查再次通过。首次 Metro 的 CI 模式未监听新文件，清缓存并重启为正常开发模式后 bundle 成功。

初轮结束时尚未运行 Android 原生编译、双端 Release 构建、真实账号刷新/发布和真实磁盘故障注入，也未验收选区拖柄、复制、暗色旋转与长文性能；后续已完成的构建与实测见最终验证。没有触发 GitHub 构建/发布 workflow，真机安装不等于这些功能全部通过。

## 授权后的高、中优先级优化

| 原优先级 | 项目 | 当前实现与验证边界 |
| --- | --- | --- |
| 高 | 账号原子保存与恢复 | 新本地原生模块，Android `AtomicFile.openRead` 恢复 `.bak`，iOS 原子替换；损坏时恢复当前备份。登录、退出、切换、删除账号都有保存失败反馈；首次恢复前禁止账号修改，读取及merge均拒绝旧会话快照，取消登录拒绝迟到回调。读取失败禁止空状态覆盖。见 [账号保存与恢复](./AUTH_STORAGE.md) |
| 高 | SecureStore 密钥与账号加密迁移 | AES-256-GCM 外层 v1，密钥独立 SecureStore；兼容旧明文 v0/v1/v2与多账号。密钥不可用保留旧文件，明确重置才清除。测试覆盖篡改、损坏、写入中断、密钥失败与串行重置 |
| 高 | 双端 Release 正文和系统手势基准 | 两端 Release 构建通过；iOS Debug 合成页系统复制、父滚动和旋转布局通过，拖柄保留未验收。后续 Android 真机完成合成选区拖柄、父滚动与后台恢复；系统复制和横屏正文重排仍未验收。双端 Release 基准的范围见后文 |
| 高 | 自动 telemetry 异常脱敏 | SDK `beforeSend` 白名单重建事件、固定异常正文、限制帧名/context并丢弃附件。实际 JS SDK 合成 transport 测试通过；暂关闭绕过 JS 边界的 Sentry 原生 crash/缓存，保留 JS 自动异常。见 [telemetry 边界](./TELEMETRY.md) |
| 中 | 样式边界 sweep line | 保持样式身份/顺序的扫描线，密集合成样本桌面中位数从约 89 ms 到 6.4 ms；这是布局身份计算测量，不能外推真机 FPS。见 [富文本优化](../src/features/rich-content/docs/optimizations-2026-10-01.md) |
| 中 | KaTeX 离线资源 | 从锁定版本生成 JS/CSS/20 个 WOFF2，统一 MathView/WebView 资源与许可证；约 649 KiB 原始资源。增加离线公式 fixture 与资源一致性检查 |
| 中 | 附件 viewport 与严格范围 | 双端一屏预取窗口，离屏/后台取消与释放、revision 拒绝迟到结果；Android UTF-16 整数、surrogate 边界及复制语义对齐，低内存通知清理全局缓存。JVM/Foundation专项通过，实际手势仍单列 |
| 中 | 持久容量与淘汰 | 阅读进度从 SecureStore迁移到最多100条/128Ki字符的双快照文件；成功两次提交才删旧值。Feed缓存24小时/20上下文/256KiB每上下文/10项；曝光30天保留、每15分钟维护，并在事务内限5000/上下文、20000/全局 |
| 中 | 复杂正文无损编辑 | 未修改段和复杂锁定块保留原始HTML；仅安全往返的普通块开放编辑，复杂原块只能预览或经确认移除。补修原块边界/尾部换行保留；不宣称提供任意HTML结构编辑 |
| 中 | 草稿、离开确认、媒体重试 | SQLite v4账号/目标/revision隔离草稿、保存失败留页、读取失败禁止覆盖；媒体持久副本、9张/3并发、单项重试与取消、卸载与账号移除防迟到回写。真实发布未执行。见 [发布说明](../src/features/publishing/README.md) |
| 中 | 运行时主题与可读性 | NativeWind根vars、旧Colors兼容入口、Navigation与三个正文后端同palette；生成onPrimary/link、阅读纯色表面至少4.5:1。不覆盖内容自带颜色、图片和任意透明/渐变表面；见 [主题说明](./THEME_CUSTOMIZATION.md) |
| 中 | SDK patch偏差与SPM评估 | 偏差来自月度patch批次，保留版本并做兼容构建；SPM预编译RN候选安装失败，改源码构建后隔离prebuild/pod install成功。正式配置保留，迁移门槛与未验证范围见 [依赖评估](./DEPENDENCY_REVIEW_2026-10-01.md) |
| 中 | 列表与聊天资源 | 主题/预取设置精确订阅；回答邻页预取按焦点门禁及短GC；聊天只轮询head、失焦/后台取消，历史查询短GC与小窗口。没有硬截断活动聊天历史，避免消息断层 |
| 中 | 更新下载校验 | GitHub响应unknown规范化、本仓库URL/受信CDN、请求15秒/下载5分钟超时，支持取消；512MiB上限，发行digest或SHA256SUMS +实际长度 +原生流式SHA256/ZIP头通过才交给安装器。44项竞态/校验回归通过；真实Android安装器尚需设备验收 |

额外修复了单ABI构建问题：split插件原先写死四种ABI，使单ABI参数仍触发其他ABI编译。改为读取实际Gradle参数，默认仍四种；更新已有生成块且保留外围配置，并验证空/非法参数拒绝。剪贴板、保存图片、方向锁定和本地缓存失败日志也改为固定分类，避免原始原生异常携带路径或内容。

## 已提交版本及原生构建的验证

- 最终 `npm ci` 通过，既有 patch、新增解码器回植与离线 KaTeX 生成成功。随后 `npm run check` 通过：TypeScript、只读 Biome（368 文件，无 warning）、73 suites / 777 tests、11 个富文本 fixture。该轮 Jest 本机耗时 7.8 秒，先前轮次约 15 秒；不是 CI 或原生构建的耗时保证。
- [PR #109 的首轮 GitHub CI](https://github.com/huamurui/zhihu-minus-minus/actions/runs/36815154494/job/110218504597) 通过：TypeScript、Biome 与全部测试，耗时 59 秒；质量门禁与代码审查分别记录，不将门禁通过视作审查完成。该结果对应 `e84e2f1`，以下后续补修另外运行本地门禁。
- `npm test -- features/rich-content/tests --runInBand` 通过：23 suites / 350 tests；认证延迟恢复与 JSON 解码后的 merge 竞态、取消登录后的迟到回调另有真实 store/组件回归。
- 测试复核合并了两处重复覆盖，净减少 1 suite、2 tests。相对起始 33 suites / 486 tests，增量主要覆盖账号加密与恢复、隐私反馈、APK 校验/取消、草稿数据丢失及跨账号/跨页面竞态；没有批量生成 snapshot。
- `git diff --check`、`bash -n build-unsigned-ipa.sh` 通过；CI/build/Dependabot YAML 可解析，32 份 Markdown 的本地链接无失效路径。
- iOS Release 已构建成功，安装到连接的 iPhone SE3 后进程启动并持续存活。Android ARM64 Release 构建成功，最终源码实际重打 JS/资源，产物只有目标 ABI，27,037,614 字节；APK 内 Hermes bundle 与本轮生成文件逐字一致，两份 SourceMap 中解码器代码也与已回植源码逐字一致。重装依赖后的首轮打包遇到 Watchman 解析缓存异常；确认依赖完整后通过临时 Metro 配置绕过 Watchman，7 分 50 秒重试成功，仓库构建配置未修改。插件 6 项回归通过，incremental prebuild 前后生成的 Gradle 内容一致。
- iPhone SE3 的合成页面已确认原生布局、离线公式与字体，以及 SecureStore、AES Unicode 往返与篡改拒绝、原子替换、缺失文件返回空、沙箱路径拒绝、明文迁移、备份恢复、退出后保持空状态、原生流式 SHA-256。Debug 与关闭 Metro 的本地 Release 验证副本均完成核心检查；只读取测试生成的布尔结果，不读取真实账号文件。Release 副本使用 `__DEV__=false` 和 Hermes `-O`，仅在隔离前端副本开放固定测试路径，54 个原生代码/数据区与正式包一致，没有修改产品路由规则。
- 个人开发账号签名的独立 XCTest runner 在 Debug 合成页确认系统长按复制（原生选区回调有效，复制文本匹配合成正文）、父滚动和横屏宽度增大/正文布局非零。拖柄定位一轮跳过，独立重试未取得选区变化证据，仍未验收；没有把前置失败或跳过计为通过。临时测试不加入仓库 Jest 套件，也不读取既有剪贴板内容。
- Release 合成页通过独立滚动用例：12 次往返、24 次 swipe，动作持续 64.24 秒。这是交互稳定性结果，不是帧率。Instruments 未识别目标 PID，改用唯一 bundle identifier 的采样获准但设备连接超时，未取得有效 trace；通用进程名附加和广泛进程清单读取被自动审批拒绝，未执行，因此没有 FPS 或卡顿数值，也没有优化前后性能结论。
- Android API 36.1 模拟器使用隔离临时 userdata，在 APK 安装前因 `super` 设备缺失、首阶段挂载失败而 kernel panic；这属于模拟器启动故障，不能记作应用崩溃或生命周期/热链接验证通过。测试实例及临时数据已清理，原 AVD 数据保留。
- 原生生成目录和临时 UI runner 不进入提交；没有使用真实账号提交内容，也没有触发发布工作流。
- 最终源码再次完成双端 Release 打包，iPhone 已恢复生产开发路径关闭的正式 Release，保留应用数据；独立 runner 已卸载，Metro 已停止。
- 依赖审计保留 22 个包条目告警（16 moderate、6 high）；当前未发现 gRPC 服务端/uuid 受影响方法的可达调用。旧 URL 解码器回植官方线性算法，保留 CommonJS 和旧加号语义，以一条真实 query-string/坏编码回归验证。当前 Router 入站解析使用 `URL.searchParams`，不宣称已经存在可利用的应用攻击链；完整约束与后续消除条件见 [依赖评估](./DEPENDENCY_REVIEW_2026-10-01.md)。

## 后续补修与安卓真机验证

以下补修先按用户要求留在工作区核对，用户随后授权提交推送至 [PR #109](https://github.com/huamurui/zhihu-minus-minus/pull/109)。CodeRabbit 已完成此前提交 `e84e2f1` 的审查，发布两条有效意见；其成功状态表示该轮审查运行完成，不代表已审查后续补修。

| 来源 | 已验证的问题 | 本地修复 |
| --- | --- | --- |
| Android 真机 | Expo AES 的 Android `fromCombined` 原生桥接要求字节数组；传入 base64 文本时解密在此处失败 | 生产解密与合成检查共用 base64 → `Uint8Array` helper；保留密钥、AAD 和既有密文格式。诊断逐阶段定位到该调用，替换输入后往返通过 |
| CodeRabbit | 同账号响应轮换 Cookie 时，会话版本未变；排队的原生同步因旧 Cookie 快照不匹配而中止，可能留下上一账号的原生 Cookie | 按会话版本拒绝跨账号写入；执行时读取当前 Cookie，同版本轮换跨过异步写入时完整清空并重同步，避免混合快照 |
| CodeRabbit | 图片失败状态同时锁住格式工具栏、持续显示上传 spinner，发布提示仍称正在上传 | 区分上传/选择进行中与发布阻塞状态；失败图片继续阻止发布，但允许格式编辑，并提示重试或移除 |

- 最终本地 `npm run check` 通过：TypeScript、只读 Biome、73 suites / 781 tests、11 个 fixture；Jest 本机耗时 4.181 秒，0 snapshot。本次补修仅新增 4 个实际故障回归用例，没有新增 suite；媒体行为在原用例中补断言。首轮 GitHub CI 的 777 项结果不涵盖这些补修。
- V2509A / Android 16（API 36，ARM64）使用隔离合成 Release 副本，通过 14 项核心检查：SecureStore 密钥、AES Unicode 往返与篡改拒绝、原子替换、缺失文件返回空、沙箱外写入拒绝、旧格式迁移、备份恢复、退出保持空状态、原生流式 SHA-256、完整存储检查、原生布局、离线公式及字体。只读取固定合成结果，不读取真实账号文件。
- Android 原生选区从 `3..4` 经拖柄变为 `3..10`，选区回调变化且正文边界不变；父滚动、进入后台再回到本应用通过。旋转后 ScrollView 宽度变化，原系统旋转设置已恢复；正文位于屏幕外，未据此宣称原生正文横屏重排通过。系统复制的有限尝试未获得成功证据，保留未验收。
- Android Release 合成页 12 次往返 / 24 次 swipe 动作持续 19.881 秒；本应用 `gfxinfo` 聚合结果为 3444 帧、0 janky，另一次短探针确认计数器 reset 后为 0。没有有效逐帧数据，不能计算 P50/P95/FPS，也不构成优化前后或跨平台对比。
- 最终正式 Android APK 为 27,028,530 字节，生产 Hermes bytecode 6,725,100 字节；重新导出使用原构建的 `-O -output-source-map`，避免将调试映射嵌入 bytecode。复制包保留原签名密钥及 v2 签名方案，全部非 JS 原生/资源内容不变。iOS 正式副本也已按当前源码生成并通过已有个人账号的严格签名与原生区核对。临时副本、SourceMap 和安装脚本没有加入仓库测试或提交。
- Android 已覆盖安装上述正式 Release，设备 APK 的 SHA-256 与交付包 `4b77d41c082b47de046fb255d38d889d1bce0d0f715835c12e6239635b84819a` 一致，保留应用数据。用户查看后要求停止追加安卓验证；About 冷启动命令成功但未取得页面固定标记，不计为 UI 通过，热启动、开发路径运行时拒绝和手动更新检查按此要求跳过。安装及 UI 脚本均已结束，手机不再保留合成验证包。
- 这次 AES 输入 helper 修改后的 iOS 真机重验未完成：对唯一已配对 iPhone 的一次安装返回 CoreDevice 4016，设备隧道不可用；未安装新测试副本。前述 iOS 14 项通过记录属于修改前的包，手机保留此前正式 Release；本次已签名的正式副本可待连接恢复后验证。

## 保留的低优先级项目

- 按行为边界继续拆分首页、问题页和个人页的请求/动画/列表编排；本次只抽取了对应热点的typed hooks，未进行大页面重写。
- 收藏map后续改为内容类型加ID并迁移；补剩余图标按钮可访问性与重复下拉刷新一致性。
- 图标生成工具直接声明其使用的 `pngjs`，避免依赖传递安装。

真实账号刷新/发布与图库、已有 SQLite 数据升级、真实物理磁盘故障、应用内更新下载到 Android 安装器的完整链路、Android 系统复制/横屏正文重排及上述跳过的页面检查、iOS 选区拖柄及本次 AES 补修重验，以及完整 Release 性能矩阵仍需要独立验收。ADB 安装成功不能证明应用内更新链路；模拟测试、JVM/Foundation烟测和合成页面实测只能证明各自覆盖的边界。
