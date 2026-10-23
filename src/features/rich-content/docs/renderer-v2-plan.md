# Renderer V2：原生富文本能力与逐步迁移

## 当前决策与来源

本计划于 2026-09-30 对照 [Issue #40 正文](https://github.com/huamurui/zhihu-minus-minus/issues/40) 和 [候选路线补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992) 更新。Issue 正文是当前目标，早期评论中“单 WebView 原型、随后 Block FlashList”的路线作为历史记录保留。

`react-native-render-html`（RNRH）已于2026-10-05删除，默认采用 tiqian-super-mini，核心为原生 attributed text 能力：连续文本流、可组合的 range 样式、自定义装饰线、行内 attachment，以及可回传到 JS 的选择范围。WebView 可用于对照、fallback 或实验；文本虚拟化由 Release 数据决定。优先验证媒体加载和回收，不把逐段 cell 作为必选架构。

目标链路：

```text
知乎 HTML / 想法分段
  -> 清洗、规范化、资源分类
  -> ZhihuDocument（语义 Block + InlineRun）
  -> Text Flow Island 分组 + Rich Text IR 编译
  -> backend adapter
       ├─ Native Rich Text
       │    ├─ Android：Spannable + TextView/Layout
       │    └─ iOS：NSAttributedString + UITextView/TextKit
       ├─ 独立媒体 / 复杂 block
       │    └─ 图片、视频、表格、卡片、自定义组件
       └─ 可选 fallback / 实验
            └─ tiqian-super-mini 或 WebView backend
```

本分支新增直接消费IR的Android系统TextView后端，2026-10-01开始增加iOS UIKit/TextKit adapter，先逐项展示V2能力，再通过正文排版设置开放真实内容试用；[本轮实现与边界](./renderer-v2-experiment-03-native-flow.md)另行记录。新安装默认采用 tiqian-super-mini。Enriched已正式移除，Tiqian尚未接入，双端完整验收仍待推进。

2026-09-30真机试用后，当前开发主线确定为本地tiqian-super-mini。用户关注的跨段选择、装饰线和行内附件已获得较好的初步效果，并明确要求正式删除Enriched：组件、专属normalizer与测试、依赖、native patch和开发入口均移除，实验记录仅作历史参考。当时 RNRH 承载现有正文和迁移 fallback，现已删除。此选择针对功能原型的后续投入，不代表已经完成双端生产替换或性能比较。

## 当前实现与能力缺口

本地原生后端现名 `tiqian-super-mini`，早期记录中的Native V2指同一实现。对外名字更新，`renderer="native-v2"`及已保存偏好保持兼容；Android/iOS仍以系统文字布局消费IR。

业务 `ZhihuContent` 默认读取 `richContentRenderer` 偏好，设置页提供 tiqian-super-mini（默认）与网页排版。显式 `renderer` 覆盖偏好，缺模块或不支持的平台回退 WebView。开发案例独立切换后端，不写生产偏好。

settings version 15 保留 `webview` / `native-v2`，将旧 `rnrh`、未设置值迁移到 `native-v2`，兼容旧 `useWebView=true`。以下阶段记录中的 RNRH 仅为历史过程，已不提供运行入口。

目前已经完成：

- runtime、脱敏 API JSON fixtures、分析工具、测试和文档集中维护。
- 完整免费回答正文复用、长按预览复用、Pager 相邻预取及未聚焦正文延迟挂载。
- [Android Debug 网络与挂载基线](./android-device-baseline-2026-08-30.md)。
- [`ZhihuDocument` 语义类型](../document.ts)，包括表格、脚注、行内图片/公式与知识点结构。
- [`documentTraversal.ts`](../documentTraversal.ts) 的文档遍历和正文图片收集，以及 [`segmentHighlight.ts`](../segmentHighlight.ts) 的属性局部规范化。
- [`bridge.ts`](../bridge.ts) 对现有六类 WebView 消息的字段验证。
- 共享链接/图片预览外壳与排版指标；fixture工具支持 `question_feed_card` 与 `segment_infos` 范围/元数据校验。
- HTML → Document初步规范化、连续UTF-16 flow与IR编译、选择source map和语义复制。
- 独立Android Expo模块：同一流跨段选择事件、四种视觉行装饰、图片/SVG行内附件，以及JS独立媒体/表格/脚注adapter。
- 初步iOS UIKit/TextKit adapter与Expo Apple注册，共享既有IR、JS正文宿主及fallback；平台验证单独记录。
- 六组合成内容的V2原型入口，tiqian-super-mini / RNRH / WebView三后端对照与本地排版/交互调节；共享字号/行高比例修正。
- 正式删除Enriched运行链路、依赖及native patch，将V2缺模块/不支持平台的fallback改为RNRH。
- 正文设置开放tiqian-super-mini真实内容试用，并迁移旧后端偏好；开发案例切换保持页面局部状态。
- 存量知乎卡片/脚注dialect、结构化想法分段、富文本图注/表格/脚注面板、合并格布局及自然图片比例；回答的知识点和源选区菜单先做精确范围验证。

上述新链路是初步实现，完整知乎dialect、双端完整平台验收、跨媒体选择、复杂公式/双向文字几何、媒体生命周期以及滚动/ready/error协议仍待补齐。现有WebView消息验证也不代表V2协议已完整。

[Enriched 实验记录](./renderer-v2-experiment-01-enriched-html.md)保留已删除候选的历史双端编译结果；新Android模块的构建、真机结果与删除验证记在[实验03](./renderer-v2-experiment-03-native-flow.md)。新原型不能替代双端Release验收。[Tiqian 手册](./renderer-v2-experiment-02-tiqian.md)仅为历史集成草案，是否重新开展PoC由系统布局的实际缺口决定。

### 自定义文字装饰

经典RNRH的知识点样式受 RN `Text` 暴露的能力限制。当前V2以source range定义颜色、粗细、baseline下方偏移和solid/dashed/dotted/wavy线型，并与链接、粗体、背景等样式独立组合。

native backend 的 PoC 应验证能否利用 Android Layout / iOS TextKit 的视觉行几何绘制跨行装饰；精确命中、字号变化与重新布局也必须覆盖。不能仅凭库支持普通 underline 就视为满足要求。

### 连续选择与 Text Flow Island

多个独立 `Text` / TextView 或可回收 cell 会形成不同的 selection context。连续、能够由 attributed-text 模型表达的段落应编译到同一个文本面，例如以换行连接标题、段落、简单列表与引用，并用范围样式表达语义。

Text Flow Island 是一段共享文本 buffer、范围坐标和选择上下文的连续正文。图片、视频、表格、复杂卡片或独立 box layout 可以形成边界；普通 `p`、`span`、粗斜体、链接、行内代码、换行、标题、简单列表/引用和行内 attachment 优先留在 flow 内。

首阶段验收同一 flow 内跨段选择。跨独立 flow 或媒体边界的文章级选择、复制与无障碍顺序需要单独验证并记录能力边界；不能默认逐段虚拟化后仍有连续选择。

### 真正的行内 attachment

公式结合标记和LaTeX语义判定：`eeimg=2`显式使用块级公式，`eeimg=1`或缺值遇到有效tag、顶层行分隔符或顶层align环境时仍可提升。短的纯公式段和图片宽度不单独决定display。小图片、emoji/icon等行内对象也应参与同一个文本布局，不能用横向 `View` 拼接模拟。

Rich Text IR 可用 `U+FFFC` replacement character 表达 attachment，并保留尺寸、baseline offset、alignment、资源和原始节点身份。PoC 应验证 Android replacement span 或 iOS text attachment 路径的实际测量、换行和交互能力。

公式需要独立的视觉 baseline，不能只按图片矩形居中。还需覆盖字号/行高变化、ascent/descent、异步 intrinsic size 的 placeholder/reflow、前后选择 offset、点击/长按和 accessibility。公式语义升级的参考见 [Markdown 记录](./markdown-reference.md#公式)，不得因为旧 renderer 只能渲染 block 就把行内公式强制提升。

## ZhihuDocument 与 Rich Text IR 的边界

`ZhihuDocument` 保留知乎语义、原始节点 ID、`paragraphId`、局部知识点范围、资源、脚注和 fallback。它的 Block 数组既可编译成连续文本流，也可驱动独立媒体；存在 Block AST 本身不意味着必须使用 FlashList。

Rich Text IR的初步布局输入已定义于 `richText.ts`，包含：

| 结构 | 责任 |
| --- | --- |
| Text buffer | 每个 flow 的连续字符串和明确的文本版本 |
| Text spans | 在范围上应用字体、粗斜体、颜色、背景、链接等样式 |
| Paragraph spans | 段落范围、间距、缩进、对齐、列表/引用语义 |
| Decorations | 独立的范围装饰：颜色、粗细、offset、线型 |
| Inline attachments | 占位范围、资源/公式、尺寸、baseline、alignment、节点 ID |
| Source map | flow 全局范围与原始节点、段落 ID、段内偏移的对应 |

范围统一使用 UTF-16 半开区间 `[start, end)`。现有知识点/选择结构是段内 offset，不能直接当作 flow 全局 offset。编译时加入的换行、列表标记、attachment 占位必须纳入 source map；复制 attachment 时使用何种替代文本也需要明确规则。

原生选择事件需返回 flow 身份、对应文本版本及稳定范围，再由 source map 转回业务段落位置。文本更新、字号或宽度变化时，应避免旧选择范围指向新内容；emoji、组合字符、Bidi、换行和 attachment 前后位置均需 fixture 覆盖。

本项目负责 HTML/CSS 语义、range/paragraph 样式、装饰、attachment 和交互映射。基础 shaping、断行、Bidi、字体 fallback 和选择宿主由所选 backend 承担；不另行实现完整排版引擎。

## 当前实施路线与保留研究

早期候选讨论来自 [Issue 路线补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992)。当前实施聚焦本地系统原生后端；Enriched已删除，其方案与代价仅保留在实验01。Tiqian作为排版研究来源，未纳入当前模块。

| 候选 | PoC 接入方式 | 重点待验证项 |
| --- | --- | --- |
| 本地系统TextView / TextKit | Android直接接收Rich Text IR，iOS新增UIKit/TextKit初步adapter；无需后端再次解析HTML | 系统排版能力边界、双端选择/装饰/附件一致性、复杂公式与维护成本 |
| Tiqian | Android 正文经本地原生模块接入；中立模型由 adapter 转成其 article/paragraph 输入，RN 负责页面状态和导航 | RN 宿主的测量/滚动/手势/生命周期、CJK 与公式排版、文章级选择、工具链和最低系统要求、iOS 对应路径 |

Tiqian可参考Zhihu++的正文实践，但已有Kotlin应用的能力不能直接证明RN/Expo宿主集成成立。系统TextView已经展示V2初步能力，后续优先验证并完善此链路及iOS TextKit adapter。

本仓库当前为 Expo SDK 58 / RN 0.88。Issue 提醒 Tiqian 工具链与后续 RN/Expo 基座的关系，正式接入前应对照本仓锁文件和所选上游版本要求逐项核验 Kotlin、AGP、Compose、JDK 与最低系统版本。该讨论不构成本仓已兼容或需要立即升级 SDK 的结论。

若评估 WebView，保留每个详情页至多一个、必要资源离线打包和清洗/导航边界的约束；多段/多公式 WebView，以及持续高度测量的自动增高结构，不能作为已验收的 V2 backend。

## 性能策略：先测文本，优先管理媒体

先补 10 万、30 万、50 万字的纯文本 fixture，以及大量 inline spans / paragraph styles 的变体。与图片、视频、公式附件和复杂 block 分开测试，区分 buffer、编译、layout/reflow、React/Fabric 节点与解码资源成本。`pig.json` 的长图混合案例不能代替纯文本上限。

Release 数据应覆盖首屏、measure/layout、字号和宽度变化后的 reflow、长距离滚动、native/Java heap 或 iOS 对应内存、attributed-text/layout cache 和 selection 响应，详见 [基准计划](./benchmark-plan.md)。

原生行内附件已实现 viewport 上下各一屏预取，离屏、卸载或后台时取消本 view 订阅并释放其图像引用，保留已测尺寸；双端纯模型回归已覆盖请求 revision 与 UTF-16 范围。下一步在 Release 验证滚动、重排和资源驻留；块级图片和视频仍按各自宿主管理。inline attachment 的尺寸和选择映射也须稳定，不能为回收小附件而先拆开连续文本流。

只有数据证明文本布局或内存超出目标，才进一步研究 flow segmentation、lazy paragraph layout、分段 surface、Block 虚拟化或其他 backend。实验需同时量化性能收益和 selection/复制/无障碍的代价。

## 迁移阶段

### Phase A：基线与中立模型

- [x] 集中 runtime、fixtures、工具和文档。
- [x] 登记 API JSON 案例与结构/元数据断言。
- [x] 完成 Android Debug 网络与挂载基线。
- [x] 定义 `ZhihuDocument` 类型草案、遍历、图片收集及知识点属性验证。
- [x] 验证现有六类 WebView 消息字段。
- [x] WebView 正文标签/属性/URL/样式白名单、脚本值转义与导航边界，以及公式失败和 DOM 元素选区边界的合成回归。
- [x] 与锁定依赖同版的 KaTeX 脚本、CSS/WOFF2 离线资源及可重现生成检查。
- [ ] 补纯文本上限、复杂 inline、表格/脚注、恶意 HTML 和深层嵌套案例。
- [ ] 实现完整 HTML normalization / 清洗与语义 fixture 断言。
- [ ] 建立跨 Android/iOS 的 tiqian-super-mini / WebView 视觉与交互对照矩阵。

### Phase B：Rich Text IR 与本地原生 PoC

- [x] Enriched候选完成阶段研究后正式移除运行链路、依赖和patch，保留实验记录。
- [x] 定义 text/paragraph spans、decorations、attachments 和 source map。
- [x] 初步实现 Text Flow Island 分组与连续 UTF-16 buffer 编译。
- [x] 实现Android独立模块与V2合成功能原型入口。
- [x] 提供真实正文的用户可选入口、settings version 13迁移和完整RNRH fallback。
- [ ] 完善Android与初步iOS TextKit adapter，并完成两端布局、选择、装饰及附件的验收。
- [ ] 若系统布局能力不足，再核验Tiqian工具链与宿主/adapter；当前不作为功能原型前置条件。
- [ ] 验证同一 flow 跨段选择、原生事件映射、自定义装饰及 attachment baseline/reflow。
- [ ] 与详情 header/Pager/底栏验证测量、滚动、手势和生命周期。

### Phase C：Release 对照与 backend 决策

- [ ] 对 tiqian-super-mini 和 WebView fallback 运行相同 fixture 矩阵。
- [ ] 记录双端 Release 长文本、span 密集和混合媒体数据。
- [x] 按用户决定选择 tiqian-super-mini 为默认 backend；性能与平台验收继续推进。
- [ ] 用 feature flag 分批接入回答/文章，保留可观测 fallback。
- [ ] 验证媒体 viewport 生命周期；数据有必要时再开展文本分段/虚拟化实验。

### Phase D：默认接管与移除旧链路

- [ ] 两端视觉、选择、字号、暗色、链接、媒体、知识点和无障碍验收通过。
- [ ] Release 数据与 fallback 覆盖满足验收，平台差异有明确处理。
- [x] 默认启用 tiqian-super-mini，静态检查通过后的双端真机验收仍待进行。
- [x] 删除 RNRH renderer、运行入口与依赖；公共入口的兼容转发继续保留。

## 第一阶段验收

- 结合eeimg标记与LaTeX语义识别行内/display公式，覆盖深层格式包装、无标记短公式和matrix/group/comment反例。附件排版、baseline、换行和异步尺寸变化正确；图源较宽导致自然换行不等同于display。
- Android/iOS 原生正文在同一 flow 内支持跨段选择，并向 JS 暴露可映射的稳定范围。
- 装饰支持颜色、粗细、offset 与至少一种自定义线型，能够跨视觉行绘制并与其他 span 组合。
- 普通段落、标题、链接、粗斜体、颜色、背景和段落样式可组合，复杂媒体/block 有明确边界。
- 未支持节点保留可见 fallback 与诊断；HTML 清洗、危险 URL、事件边界和导航有自动化测试。
- 相同设备/内容的 Release 首屏、reflow、滚动、内存和选择数据可重复比较。
- 媒体生命周期与文本选择能够协作，文本虚拟化是否需要由 benchmark 决定。

Debug 数据、桌面 Node 微基准、第三方示例或仅定义类型，均不能代替本仓原生 backend 的真机验收。
