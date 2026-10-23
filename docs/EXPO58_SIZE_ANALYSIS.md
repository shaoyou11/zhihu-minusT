# Expo SDK 58 包体积核对

核对日期：2026-10-23。结论来自已经完成的 CI 产物解包，以及相同 JavaScript 输入的 Hermes 编译对照，没有通过重新构建推测发布包大小。

## 对照范围

- 旧版：Expo SDK 55，`73aefd7e6753164ba079c525d0e3094ecb852818`，[构建 39560332700](https://github.com/huamurui/zhihu-minus-minus/actions/runs/39560332700)。
- 新版：Expo SDK 58，`917e483d18f53c6792577b493a886acdfa6e4f62`，[构建 39891251999](https://github.com/huamurui/zhihu-minus-minus/actions/runs/39891251999)。
- 两次均为相同工作流的 Release 单 ABI APK 和未签名 IPA，应用版本均为 `0.9.3`。
- 旧版是可取得的最近一次 SDK 55 构建，并非分支起点 `main` 的 `5f29692`。两者之间还包含 telemetry 脱敏与 Sentry source map 配置修复。因此下面是实际交付产物的差异，不能把全部差值严格归入 SDK 升级这一项改动。

GitHub artifact ZIP 会再次压缩 APK/IPA；其 `size_in_bytes` 不是用户安装包大小。下表使用从 artifact 中取出的 APK/IPA 文件大小，单位为字节，MB 按 1,000,000 字节计算。

| 产物 | SDK 55 | SDK 58 | 增量 |
| --- | ---: | ---: | ---: |
| Android arm64-v8a | 24,418,936 | 26,261,867 | +1,842,931（1.84 MB） |
| Android armeabi-v7a | 23,384,432 | 25,130,413 | +1,745,981（1.75 MB） |
| Android x86 | 25,127,672 | 27,128,349 | +2,000,677（2.00 MB） |
| Android x86_64 | 24,985,962 | 26,591,902 | +1,605,940（1.61 MB） |
| iOS 未签名 IPA | 16,035,913 | 18,606,399 | +2,570,486（2.57 MB） |

## Android：主要增加在 Hermes 字节码和原生库

以下是 arm64 APK 各 ZIP entry 的压缩后大小之和；字节码和 `resources.arsc` 实际使用 ZIP stored，因此压缩前后相同。ZIP 文件头、签名和对齐开销不计入这些 entry 合计。

| 内容 | SDK 55 包内大小 | SDK 58 包内大小 | 增量 |
| --- | ---: | ---: | ---: |
| `assets/index.android.bundle` | 7,105,492 | 8,978,364 | +1,872,872 |
| `lib/arm64-v8a/*.so` 合计 | 7,822,130 | 9,039,283 | +1,217,153 |
| 全部 DEX 合计 | 5,988,802 | 5,347,050 | -641,752 |
| `resources.arsc` | 1,733,936 | 1,310,432 | -423,504 |
| `res/` 合计 | 1,362,089 | 1,214,395 | -147,694 |

原生库解压后合计由 23,053,304 增至 26,856,184 字节；DEX 解压后合计由 14,433,824 降至 11,372,144 字节。安装占用与 APK 下载大小不可混用。

主要原生库变化（压缩后的包内字节）：

| 原生库 | 增量 | 对应变化 |
| --- | ---: | --- |
| `libzstd-kmp.so` | +276,362 | Expo Android 新增 `com.squareup.zstd:zstd-kmp-okio` 依赖 |
| `libreactnative.so` | +257,398 | React Native 0.83.10 → 0.88.0 |
| `libhermesvm.so` | +248,882 | Hermes 运行时升级 |
| `libexpo-modules-v2.so` | +145,190 | Expo Modules 新增原生库 |
| `libreact_codegen_rngesturehandler_codegen.so` | +127,147 | Gesture Handler 3 codegen 原生库 |
| `libreanimated.so` | +124,545 | Reanimated 4.2.3 → 4.7.1 |
| `libworklets.so` | +92,995 | Worklets 0.7.4 → 0.13.0 |
| `libreact_codegen_rnscreens.so` | +92,414 | Screens 4.23.0 → 4.30.0 |
| `libavif_android.so` | -435,915 | 新产物中不再包含 |
| `libanimation-decoder-gif.so` | -89,159 | 新产物中不再包含 |

Pager View 8 → 9 确实将 Android 实现迁移到 Compose，引入 foundation、runtime、ui 等依赖；这会改变原生依赖图。但实际全部 DEX 和 Android 资源的净大小下降，因此不能把这次 APK 的 1.84 MB 净增长直接归因于 Compose。要量化 Compose 的独立成本，需要只改变 Pager View 的受控构建，本次没有做这一实验。

### 相同 JS 输入的 Hermes 对照

直接比较产物中的 bundle，会混合应用代码、依赖代码、Metro 转换和字节码编译器变化。为隔离编译器，另取本地已保存、兼容旧编译器的生产 JavaScript 导出，用两个版本编译完全相同的输入：

- 输入大小：7,326,011 字节。
- 输入 SHA-256：`3dd7189c6875707f8aeed593a5a5258cee886ed1b40a8081ad2a2a644965d91f`。
- 参数：`hermesc -w -O -output-source-map -emit-binary -out <output.hbc> <input.js>`。
- `-O -output-source-map` 与 React Native Gradle 插件的默认 Release 参数一致；`-w` 只关闭诊断输出。

| 编译器 | HBC 格式版本 | 输出字节数 |
| --- | ---: | ---: |
| `hermes-compiler@0.14.1` | 96 | 7,001,212 |
| `hermes-compiler@260318099.0.4` | 99 | 8,334,952 |
| 差值 | | +1,333,740（19.05%） |

这证明相同 JS 内容仅更换这两个编译器就会显著增加当前构建参数下的字节码体积。它能解释实际 Android bundle 增长的大部分量级，但不能从实际差值中机械扣减 1,333,740 字节：实验输入并非两个 CI 产物共同使用的同一源码版本。SDK 58 导出的新 JS 含旧 Hermes 不支持的私有字段，不能直接用旧编译器做等价对照。

两次实际产物的 bundle 函数数量为 37,385 → 36,915，说明字节码增长也不能简单解释成业务函数增加。两份 APK 与两份 IPA 内均未发现 `.map` 文件，没有 source map 误打包的证据。

## iOS：新增 Expo 预编译 framework，加上 Hermes 和字节码变化

以下包含对应目录中的二进制和少量附属文件，单位同样为 ZIP entry 压缩后的字节：

| 内容 | SDK 55 包内大小 | SDK 58 包内大小 | 增量 |
| --- | ---: | ---: | ---: |
| `Frameworks/Expo*.framework/` 合计 | 0 | 2,494,456 | +2,494,456 |
| 主可执行文件 `app` | 7,696,915 | 6,841,779 | -855,136 |
| `Frameworks/hermesvm.framework/` | 1,259,376 | 1,693,021 | +433,645 |
| `main.jsbundle` | 3,420,858 | 3,842,044 | +421,186 |
| `Frameworks/React*.framework/` 合计 | 3,289,474 | 3,316,227 | +26,753 |
| 其余内容 | 334,758 | 341,596 | +6,838 |

新产物包含 ExpoModulesCore、ExpoModulesJSI、ExpoModulesWorklets、ExpoVideo、ExpoFileSystem、ExpoMediaLibrary、ExpoPrint 和 ExpoFont 等独立 framework。SDK 58 的 `expo-build-properties` 默认 `ios.usePrecompiledModules: true`，与实际新增 vendored framework 的结构一致。旧版相应代码包含在主可执行文件中，因此必须同时看主可执行文件的下降：两项合计净增加 1,639,320 字节，而不是将新增 framework 的 2.49 MB 全部当作新增业务功能。

`main.jsbundle` 解压后由 7,025,360 增至 8,904,148 字节，但 IPA 对它进行压缩，实际下载增量为 421,186 字节。Hermes framework 解压后由 4,821,773 增至 6,340,355 字节。IPA 全部 entry 解压后合计由 54,989,554 增至 66,190,090 字节。

本次没有关闭预编译模块重建 iOS，尚未证明改为源码构建可以回收多少空间，也没有据此改变构建配置。是否关闭预编译模块应另外权衡体积、编译耗时与原生链接兼容性。

## 已排除及复核方法

- `app.json` 的 Release minify、shrinkResources、`useLegacyPackaging` 和单 ABI splits 配置在该分支没有关闭。
- `withAndroidBuildMemory` 仅调整 Gradle/Kotlin JVM 堆、并发与 worker 数量，不向包内添加运行时资源。
- 两份 KaTeX JSON 资源源码总计只增加 1,320 字节，gzip 合计只增加 293 字节，不能解释 MB 级差异。
- 原生生成目录、测试文件和 `package-lock.json` 的文本行数增长不能直接作为包体增长证据。

复核时从上述两个 run 下载 `android-apks` 与 `ios-unsigned-ipa`，先解开 GitHub artifact 外层 ZIP，再使用 Python `zipfile.ZipFile(...).infolist()` 比较同一 ABI 的 APK 或同类 IPA。`ZipInfo.file_size` 是解压后大小，`ZipInfo.compress_size` 是该 entry 对下载包大小的贡献；需合计全部 DEX，不能只比较 `classes.dex`，因为分片边界发生了变化。

以上为历史产物测量结论，不以包体分析代替首屏白屏、文本选择和 iOS 多列表 tab 收起的真机验证。后续缩减实验和采用的配置另记于下节。

## 后续缩减实验与采用的配置

同日继续用相同工作区的生产导出比较缩减方案。下面的本地基线包含当前修复工作，与前面的历史 CI 产物不是同一个输入，不能把两组绝对大小混用。

采用 `@sentry/react-native/metro` 提供的 `includeWebReplay: false` 和 `includeWebFeedback: false`。应用只使用 Sentry 错误捕获，没有使用浏览器录屏或浏览器反馈控件，且 `telemetry.ts` 已将 replay 采样率设为 0。两个选项从 Metro 图中去掉 `@sentry/replay`、`@sentry/replay-canvas`、`@sentry/feedback` 及两个 browser feedback wrapper；Sentry 错误捕获、原生 SDK 模块、Debug ID 和 source map 链路保留。

| 相同 Android 工作区输入 | 原配置 | 排除未使用的 Sentry 浏览器功能 | 减少 |
| --- | ---: | ---: | ---: |
| Metro 生产 JS | 7,485,819 | 7,294,585 | 191,234 |
| Hermes HBC（默认 Release 参数） | 8,859,568 | 8,605,356 | 254,212 |
| 上述 HBC 的 raw DEFLATE level 6 对照 | 3,892,569 | 3,757,065 | 135,504 |

Android 继续将 HBC stored 打包，因此预计 APK 可回收约 0.25 MB，不额外增加解压或启动开销；最终 APK 总大小仍需以新构建为准。DEFLATE 行仅用于说明压缩后的量级，不代表已经启用 Android bundle 压缩，也不能当作实测 iOS IPA 节省量。

未采用的方案：

- **Android bundle 压缩**：历史 SDK 58 HBC 的 raw DEFLATE level 6 为 3,897,996 字节，相比 stored 的 8,978,364 可省约 5.08 MB。但 React Native Gradle 插件明确说明 stored bundle 可直接 mmap，有利于启动；缺少同设备启动时间和内存对照时不修改此默认值。
- **Hermes debug 等级**：对前文相同 JS 实验输入，`-g0`、`-g1`、`-g2` 配合 `-output-source-map` 均得到 8,334,952 字节，与默认相同，未取得收益。
- **Hermes `-O4`**：相同输入只减少 2,272 字节，不增加自定义编译参数。
- **Hermes `-fstrip-function-names`**：相同输入减少 874,980 字节，但涉及函数名与离线错误栈信息，不能只以 source map 文件仍存在就认为诊断无损；本次保留默认。
- **开发路由与 fixture**：确认 production Metro 图仍包含 `src/app/dev/` 及部分测试样本，页面仅由开发 layout 在运行时重定向。未改动路由发现逻辑，避免把开发入口、typed routes 和平台路由匹配混入这次体积优化。

验证：`tests/metroSourcemaps.test.js` 实际运行 Sentry/NativeWind Metro serializer 和 resolver，覆盖 Debug ID、source content、源码位置、CSS 重定向、未使用包排除与错误模块保留；与 `tests/telemetrySdk.test.ts`、`tests/telemetryPrivacy.test.ts` 合计 3 组、26 项测试通过。`metro.config.js` 和该测试文件通过只读 Biome。这里没有新增 Android 完整 Release 构建或启动性能测试。

### iOS：包装前去除局部原生符号

对前文 SDK 58 的 CI 未签名 IPA 另做受控实验：在临时副本上对 12 个 arm64 Mach-O 执行 `xcrun strip -x`，然后用同一 ZIP 写入器和 DEFLATE level 6 分别重新包装原始内容和裁剪内容。实验没有重编译、更换依赖或修改 JavaScript，也不包含上面的 Sentry Metro 优化。

| 同一 CI IPA 输入 | 字节数 |
| --- | ---: |
| 下载的原始 IPA | 18,606,399 |
| 原内容用实验 ZIP 写入器重新包装 | 18,594,975 |
| 去除局部符号后用相同写入器包装 | 14,572,317 |
| 相同写入器的实际减少 | **4,022,658（4.02 MB，21.63%）** |

原始 IPA 与重新包装基线相差 11,424 字节，来自 ZIP 包装差异，未计入优化收益。12 个二进制的解压后体积合计减少 27,032,760 字节。压缩后收益主要来自主可执行文件（1,811,365 字节）、React（856,916）、Hermes（503,392）和 ExpoModulesCore（298,496）；其余 framework 合计减少 552,489 字节。这是已有 CI 产物的实测缩减，不等于新提交完整构建后的最终大小。

已接入 [`scripts/build-unsigned-ipa.sh`](../scripts/build-unsigned-ipa.sh) 与 [CI 包装步骤](../.github/workflows/build.yaml)。两者在构建完成后只处理临时 `Payload` 内的 `.app`，调用 [`scripts/strip-ios-app.py`](../scripts/strip-ios-app.py)：

- 先检查整包，只接受未签名的 thin arm64 Mach-O；遇到 `_CodeSignature`、`LC_CODE_SIGNATURE`、符号链接或不支持的 Mach-O 格式会停止。上述 CI 包的 12 个二进制没有残留 ad-hoc 签名，能通过此检查。
- 在另一个临时目录裁剪，每个二进制核验 UUID、导出 trie、外部/未定义符号、dyld 绑定与 chained fixups、依赖库以及代码/数据 section 内容。全部通过后才替换 `Payload` 中的副本；脚本失败不覆盖本地旧版同版本 IPA。
- 原始构建产物和 dSYM 不修改；构建阶段现有 Sentry source map 与原生 debug files 上传先于包装完成。已独立确认 12 个二进制的运行时元数据相同，包内其余 270 个非 Mach-O 文件逐字节相同。

局部符号名被去除后，没有匹配 dSYM 的离线原生错误栈会减少函数名。保留 UUID 使匹配 dSYM 仍可用于服务端或本地符号化，但不能把保留 UUID 理解为无需 dSYM 就能保持原来的诊断信息。JavaScript/Hermes bundle 及其 source map 不参与本次裁剪，JS 错误栈映射链路不变。

本次没有修改 Expo 预编译开关、Firebase 静态链接或 Hermes 编译参数。普通 `xcodebuild ... build` 的 `COPY_PHASE_STRIP=YES` 不等于所有最终链接产物都已去掉局部符号，因此将本轮优化明确放在包装副本上。已经签名的真机包不能直接运行该脚本：需另取临时副本，保留 entitlement 和 provisioning profile，移除副本签名，裁剪后按 framework/扩展到主 app 的顺序重新签名；正常签名构建输出仍保留。

自动化验证由 `tests/ios-strip.test.js` 调用 Python 测试，覆盖路径含空格、嵌套 framework、资源/权限/dSYM 保留、签名与格式拒绝、裁剪失败回滚，以及 UUID、代码、exports、fixups 和外部符号变化拒绝；`tests/ios-build-script.test.js` 覆盖包装副本及裁剪失败保留旧 IPA。还对全新解包的 CI IPA 实际执行正式脚本，12 个二进制全部通过校验。真机安装、启动与滚动行为验证单独记录，不能用二进制等价检查替代。

### 本地 Release 与 SE3 验证

同日使用 Xcode 26.6 构建当前工作区 Release，包含 Sentry Metro 优化和 Screens 多列表绑定补丁。对该构建的去签名临时副本使用同一 ZIP 写入器对照：

| 本地 Release 输入 | 字节数 |
| --- | ---: |
| 裁剪前 IPA | 18,414,068 |
| 裁剪后 IPA | 14,392,334 |
| 减少 | **4,021,734（4.02 MB）** |

12 个二进制通过正式脚本校验，解压体积减少 26,997,288 字节。该对照两侧保留同一份资源及 provisioning profile；本地使用 `EXPO_NO_DOTENV=1` 并关闭 Sentry 上传，因此绝对大小不与启用 telemetry 的 CI 产物混比。

裁剪后副本使用用户的 Personal Team 重新签名，校验主应用及嵌套 framework 签名后安装到已连接的 iPhone SE（第三代，iOS 27.0）。应用启动成功，设备截图确认热榜正常显示；用户随后确认连续左右切换关注、推荐、热榜、日报并上下滚动时，底部 tab 均能跟随当前列表收起和展开。此次未新增 Android 真机安装验证。

最终 `npm run check` 通过：类型检查、只读 Biome、187 组 / 2,111 项测试及 18 个富文本 fixture 分析。Biome 仍有原有的 2 条 warning 和 1 条 info，没有 error。
