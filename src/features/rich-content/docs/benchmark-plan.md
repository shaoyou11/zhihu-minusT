# 真机基准计划

## 目的

基准用于区分 HTML normalization、文档/adapter 构造、React reconciliation、原生文本布局、媒体请求和图片/SVG 解码的成本。当前目标是 **native attributed text + Text Flow Island + 独立媒体/复杂 block**：连续文本在同一原生 flow 内排版和选择，图片、视频、复杂卡片等按能力和生命周期独立处理。RNRH 保留为现有基线与 fallback，DOM/WebView 保留为 fallback/实验，不再预设“单 WebView + FlashList”是终态，也不先假定必须虚拟化所有段落。

路线依据 [Issue #40](https://github.com/huamurui/zhihu-minus-minus/issues/40) 及其[候选后端补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992)。所有正式对比都在 Release 构建完成，Debug结果只用于定位问题。目前性能数据只有 [Android Debug 网络与挂载基线](./android-device-baseline-2026-08-30.md)。2026-09-30按用户要求先开展[本地Native V2功能原型](./renderer-v2-experiment-03-native-flow.md)，已初步实现Document/IR/source map与原生范围事件；本计划作为后续验收参考，不阻塞当前功能试用。Enriched组件、依赖和patch已正式删除，[实验01](./renderer-v2-experiment-01-enriched-html.md)仅保留历史依据。Tiqian未接入，双端Release性能对照和iOS真机数据均未完成。

## 当前后端与保留研究的比较边界

| 后端 | 验证方向 | 需要先确认的边界 |
| --- | --- | --- |
| Native V2 | 本地原生模块直接消费Rich Text IR；Android TextView/Spannable初步实现，iOS新增UIKit/TextKit adapter | 连续flow的布局/选择/装饰/附件、异步reflow、系统排版边界与媒体生命周期 |
| Tiqian | Android local native module 接入 article renderer，由中立 document model 经 adapter 转换；验证 CJK 排版、Tiqian Math、inline object 和 article-level selection | RN 宿主的 measurement、scroll、gesture 和 lifecycle；API、Kotlin/AGP/Compose 与项目锁定工具链的兼容性；最低 Android 版本；iOS 能力差异与独立路径 |
| RNRH | 当前行为、网络和挂载成本的对照，覆盖迁移期 fallback | Text/View 数量、跨段选择、公式和媒体行为 |
| DOM/WebView | 复杂内容 fallback 或实验对照 | DOM 布局、bridge 成本、选择和宿主滚动边界 |

本地Native V2尚未完成双端完整验收，Android/iOS以外的平台或缺模块客户端回退RNRH。Tiqian只保留为系统布局能力不足时的研究选项；Zhihu++的排版与选择能力不代表本项目已接入。若重新开展Tiqian PoC，工具链兼容性须以实际锁文件、依赖要求和构建结果确认。

## 测试矩阵

至少覆盖：

| 类型 | 主要压力 | 当前样本 |
| --- | --- | --- |
| 短文本 | 普通段落、链接 | 待补充 |
| 10 万 / 30 万 / 50 万字纯文本 | 连续 flow 的 initial render/layout、reflow、选择和内存；不混入图片/视频/公式请求 | 待补充，现有 `pig.json` 不能替代 |
| 大量 span / paragraph style | 文字数量固定时逐级增加 inline run、链接、粗斜体、段落样式和 decoration，隔离样式复杂度 | 待补充 |
| 公式密集 | inline object、baseline、段落组合、远程 SVG 或 native math 成本 | `article-formula-heavy-001` |
| 图片/视频 | 图片尺寸、解码、媒体卡片、viewport 加载和回收 | 待补充 |
| 长图混合内容 | 大量图片、媒体、链接 | `long-image-heavy-001` |
| 超长混合正文 | 在纯文本基线成立后逐项加入列表、引用、公式和媒体，确认交互与瓶颈变化 | 待补充 |
| 非法/异常 HTML | 清洗、fallback、深层嵌套 | 待补充 |

纯文本和样式压力与媒体压力分开测试，避免把 bitmap 解码、网络等待或缓存占用归因于文本布局。记录字数、UTF-16 长度、段落数、inline run 数、最大单段长度、style/decoration 数、attachment 数与媒体尺寸；字符数与 UTF-16 长度不能混用。选择用例应包含 CJK、拉丁文本、emoji 和非 BMP 字符。

双端候选的每类内容至少在一台 Android 和一台 iOS 真机运行。Tiqian PoC 先记录 Android 结果，iOS 路径未验证时明确标记，不能用 Android 数据推断双端能力。记录设备、系统版本、构建 commit、Release 构建方式、后端/patch 版本、网络条件与冷/热缓存状态。

## 关键时间点

- `content_received`：API 数据进入页面组件。
- `renderer_start`：正文渲染器开始处理内容。
- `document_ready`：normalization 和 adapter 输入准备完成。
- `first_content_layout`：首段或首个可见 block 完成布局。
- `content_layout_stable`：首屏内媒体尺寸稳定，不再发生明显跳动。
- `interactive`：图片、链接、文本选择等交互可响应。

对纯文本额外记录首次完整 flow layout；对字号或可用宽度变化记录 reflow 开始、稳定时间与布局次数。媒体稳定和全文文本布局分别统计，不能用首屏 marker 代替 50 万字全文布局结果。

## 指标

| 维度 | 必须记录 |
| --- | --- |
| 首次渲染与布局 | 数据可用到首段布局、normalization/adapter 构造、首次完整 flow layout、首屏稳定耗时及布局次数 |
| Reflow | 字号、可用宽度变化前后的布局耗时、布局次数、滚动位置稳定性和 selection/attachment 是否仍映射正确 |
| 滚动 | 连续滚动 FPS、JS/UI 掉帧与长任务，标明设备刷新率和帧统计口径 |
| 内存与对象 | 峰值及稳态内存、退出页面后的回收；Android native/Java heap 和对象数，iOS native 对象/内存；文本布局对象、当前挂载 block/View 和离屏媒体资源数量 |
| 缓存 | layout cache 的容量、命中/失效和保留策略，字号/宽度变化、换页、返回页面后的重建与回收 |
| 选择 | 长按到 selection 可见/事件到达 JS 的耗时、跨段拖动响应、同一 flow buffer 的全局 UTF-16 范围，以及经 source map 还原原节点/段内位置的正确性 |
| 行内对象 | attachment 的 baseline、行高、换行、尺寸更新/reflow 次数，以及点击、长按和无障碍回传响应 |
| 媒体与 fallback | 图片/公式 SVG/KaTeX/CSS/字体请求数、解码耗时与缓存占用；WebView bridge 消息数和正文树/TTree 重建次数 |

图片尺寸估算只能作为选样依据。例如 `1080 × 2000 × 4` 约 8 MB 是未计额外开销的 bitmap 理论值，不是本项目实测内存；正式结果应记录实际解码尺寸、同时存活资源和平台内存数据。

## 正确性矩阵

性能更快但内容排错、交互丢失，不视为可替换方案。每个 renderer 都要检查：

| 能力 | 验收重点 |
| --- | --- |
| 连续文本流 | Android/iOS 同一 flow 内的多段文本连续排版和跨段选择；CJK/拉丁/emoji 换行、段落样式和暗色模式一致 |
| Selection 范围 | 向 JS 发出带 flow 标识和文本版本的稳定 UTF-16 range，经 source map 还原原节点/段内位置；复制内容与原节点对应，reflow 后范围仍正确；跨 flow 或媒体边界的文章级选择单独验证 |
| 自定义 decoration | 至少一种自定义装饰跨多视觉行，线型、颜色、粗细、offset、geometry、点击范围与文本选择保持正确 |
| 行内 attachment | 以 `U+FFFC` 占位，具有 size、baselineOffset、alignment；点击/长按/无障碍回到原节点，异步尺寸有 placeholder 并正确 reflow |
| 行内公式 | eeimg与LaTeX语义共同判断；短纯公式段、无标记公式、figure和宽图不会仅凭容器或宽度强制display；bare li/quote/div/root中的前后文字不被错误拆段；参与相邻文字排版，baseline、行高和自然换行稳定；分别验证SVG attachment与native math候选 |
| 块级公式 | `eeimg=2`及有效tag、顶层行分隔符/align环境形成display；深层格式包装可正确提取，matrix/group/comment反例不误升；居中、缩放与横向溢出行为明确 |
| 知识点片段 | Android/iOS 的线型、颜色、点击范围与文本选择 |
| 图片/视频/卡片 | 尺寸稳定、点击/长按、链接和 fallback |
| 排版 | 段落、列表、引用、代码、粗斜体、暗色模式和字号缩放 |
| 安全 | 脚本、事件属性、危险 URL 和非法 bridge 消息被拒绝 |

## 生命周期与分段决策

首先验证媒体的 viewport 生命周期：预留稳定尺寸，只在可见窗口附近加载/解码，离屏释放或限制 bitmap/视频缓存，并验证返回视口时的重载和交互。正文 View 数下降不能单独证明媒体内存已经受控。

先测完整连续 native flow，再按 Release 数据决定文本是否需要分段、Text Flow Island 尺寸上限或虚拟化。只有超长纯文本确实出现布局、heap 或交互瓶颈时，才比较分段方案；同时报告各 flow buffer 的全局 UTF-16 offset 经 source map 还原原节点/段内位置的结果，以及复制、字号/宽度变化和布局缓存受影响的范围。跨 island 或媒体边界的文章级选择作为独立 PoC，记录支持范围与限制。若采用虚拟化，必须给出可见窗口挂载与离屏回收数据，以及选择跨越未挂载内容时的行为，不能只凭列表组件的名称声称解决超长正文。

## 对比规则

- 同一设备、同一内容、同一构建模式至少运行 5 次。
- 冷缓存和热缓存分开记录，不混合取平均值。
- PR 附原始记录和中位数/P95；不只提供主观录屏。
- 视觉和交互回归与性能结果同等重要。
- 对照保持相同 fixture、字号、可用宽度、滚动路径和缓存条件；记录平台、后端和 patch 差异，未实现能力单独列出。
- WebView 实验按“一页最多一个、内部滚动”记录，避免每段/每公式 WebView 让数量掩盖结果；这项实验约束不定义最终架构。
- 媒体 viewport 管理和文本分段/虚拟化分别报告，不能用媒体回收结果代替文本选择与布局验证。
- 性能记录只保留脱敏后的类型、数量、耗时和资源标识，不包含 Cookie、请求头、真实登录 URL 或原始异常 config。

完整架构和分阶段验收见 [Renderer V2 迁移计划](./renderer-v2-plan.md)。
