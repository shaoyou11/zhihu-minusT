# 从 Tiqian 提炼的正文排版策略与 Zhihu-- 实现评估

调研日期：2026-09-30。上游：[tiqian-cjk/tiqian](https://github.com/tiqian-cjk/tiqian)，源码固定到 [`7aa7c3d8ada486aecbdfceb0ed461fe775a213d9`](https://github.com/tiqian-cjk/tiqian/tree/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9)。

本文记录规则为什么有效、Tiqian如何实现，以及在 **Zhihu-- Expo 55 / RN 0.83富文本链路**中的落地难度。优先级和难度是工程判断，上游实验数据不能当成本仓真机效果。以下源码调研固定到上述commit；最初调研只记录文档，后续实施状态另列。

2026-09-30后续已建立[本地Native V2原型](./renderer-v2-experiment-03-native-flow.md)，修正共享字号/行高关系，并提供系统双齐、整字版心与WebView CSS对照。Enriched组件、专属normalizer、依赖和native patch已正式移除，[实验01](./renderer-v2-experiment-01-enriched-html.md)仅作为历史依据。当前优先完善系统原生IR后端，Tiqian尚未接入；本文的难度分析不构成恢复Enriched或移植Tiqian的承诺。

## 结论与推荐顺序

Tiqian 最值得借鉴的是：**断行、标点空白和混排间距共享同一份测量与空间预算，两端对齐在这些约束下完成。** 只给正文加 `justify`，或统一增减 `letterSpacing`，不能得到同样的结果。上游先把自动间距与连续标点压缩纳入几何，再断行与禁则修复，之后处理行边空白及双齐；前端负责重放同一份行布局结果。[架构说明][T-ARCH]

从中文正文质量看，最重要的是基础避头尾、合理的标点空间、中西文小间距，以及稳定的行与段落节奏。从本仓投入产出看，建议按下面的顺序做：

| 顺序 | 策略 | 预期收益 | 本仓最低成本路径 | 完整实现难度 |
| --- | --- | --- | --- | --- |
| 1 | 字号、实际行高、段落节奏一致 | 每篇正文都受益；大字号尤其明显 | 修清共享 metrics 的行高语义，让 WebView 消费同一指标 | 字号/行高低；三后端段距完全一致为中 |
| 2 | 基础避头尾，正常西文按词断行 | 消除孤立句号、行尾开括号、普通英文被拆碎 | 先核验系统断行；WebView 设置语言和语义化 CSS | 基础实验低；精确统一禁则与修复高 |
| 3 | 中西文、数字之间小间距 | 混排从拥挤变清晰；技术正文收益高 | WebView CSS 渐进增强 | WebView 实验低；双端原生保真实现中高 |
| 4 | 连续标点压缩，行首/行尾标点空白削减 | 引号、括号密集正文与两端边缘更整洁 | WebView 验证浏览器提供的部分能力 | 等价复刻 Tiqian 高 |
| 5 | 正文版心按整字宽试排 | 纯中文减少为了宽度零头而产生的字距 | 对正文文本容器计算整字宽；先做开发案例对照 | 试验低；准确接入字体缩放与媒体宽度中 |
| 6 | 正文非末行双齐，控制拉伸顺序 | 边缘齐整，行内密度更均匀 | WebView 的浏览器双齐作对照 | 简单开关低；Tiqian 级空间分配高 |

这里的“低”指主要修改共享 TypeScript 指标或 CSS；“中”指涉及原生 paragraph style、宿主测量或坐标映射；“高”指需要实际字形几何、断点修复、统一布局结果或新后端集成。不是以代码行数估计难度，也不是工期承诺。

## 1. 先把字号、行高和段落节奏做好

### 规则与上游实现

行高应相对**实际字号**定义，同时给上下标、公式等可见内容留出空间。段间距、标题前后距离、列表续行缩进应作为段落样式统一管理。不要通过插入空行或全角空格伪造排版。

Tiqian 的 `ParagraphStyle.lineHeight` 是基线到基线的绝对距离，默认按 `1.5em` 解析，并受内容不重叠的下限约束。`1.5` 是该引擎的默认起点，不能当作所有字体、屏幕和用户偏好的唯一最优值。结构化段落还有 `ic` 缩进；行内对象则使用 ascent/descent 与最小净空决定是否需要扩展行距。[TextModel][T-TEXT]、[行内对象与行几何][T-ARCH]

### 本仓现状与具体收益

调研时，[`presentation.ts`](../presentation.ts) 已集中RNRH与当时Enriched的指标，但修正前的计算是：

```ts
fontSize = 17 * fontSizeScale;
lineHeight = 17 * lineHeightScale;
```

[`appearance.tsx`](../../../app/settings/appearance.tsx) 将后者显示为“行高比例”。两者独立计算会让字号放大时，实际行高比例下降；标题也有同样的计算关系。以下数值来自代码计算，尚非真机裁切结论：

| 字号设置 | 行高设置 | 当前字号 | 当前行高 | 实际行高 / 字号 |
| --- | --- | --- | --- | --- |
| 1.0 | 1.5 | 17 | 25.5 | 1.5 |
| 1.5 | 1.5 | 25.5 | 25.5 | 1.0 |

当前实现已按设置页“当前字号的几倍”语义修正为 `lineHeight = scaledFontSize * lineHeightScale`，并由RNRH、WebView及Native V2共享。上表保留修正前的计算关系，不能用作当前真机裁切结论。此修复没有重写用户保存的比例字段；若后续改变持久字段或存储语义，仍须遵守settings store的版本与migration约定。

调研时，[`ZhihuDOMContent.tsx`](../components/ZhihuDOMContent.tsx)的正文、标题、列表和图注使用独立CSS固定值，段落距为20px，而RNRH为14。后续原型已让WebView和Native V2消费共享指标；Native V2的标题字号/行高/上下间距也来自 `presentation.ts`。三后端的实际视觉节奏仍应根据真机效果校准。

**难度边界：**字号与行高统一为低；RNRH / WebView段距调整为低，Native V2以paragraph IR和LineHeightSpan表达间距，不插空行。已删除的Enriched当时缺少段距配置，并需要同时修改显示与Yoga测量，细节保留在[历史记录](./renderer-v2-experiment-01-enriched-html.md)。这些历史代价支持当前直接消费IR的实现选择，不再形成第三方patch待办。

首行缩进可以低成本做阅读风格实验，但不建议默认给每个知乎段落加两字缩进。本仓已有段间距；想法、标题、引用、代码和列表也不是普通书籍正文。Tiqian 结构化 `ParagraphStyle` 默认按行长缩进（小于 14 字缩 1ic，否则 2ic），纯文本入口则关闭首行缩进；应区分入口，不照抄一个“默认两字”的结论。[TextModel][T-TEXT]、[纯文本语义][T-SOURCE]

## 2. 基础避头尾，比一开始追求严格禁则更重要

### 规则与上游实现

最低限度应避免关闭括号、结束引号和句读点号孤立在行首，避免开括号、开始引号留在行尾。连续破折号、省略号作为语义组合保持完整。普通英文优先按词断行；数字、单位和符号是否粘连，应按语义处理，而不是把整串西文一律禁止换行。

Tiqian 使用断点约束和禁则修复，必要时压缩可用空白、悬挂点号或把相邻文字移到另一行。当前 `ClreqProfile` 默认按版心行长选择策略：小于 14 字为 Basic 并允许顿逗句悬挂；14 至 24 字为 Basic、不悬挂；大于 24 至 32 字为 GB；大于 32 字为 Strict。这是上游响应式策略及语料取舍，不是本仓应原样采用的设备阈值。[ClreqProfile][T-PROFILE]、[ADR 0025][T-KINSOKU]

Tiqian 的 UAX #14 支持有明确子集和语言 tailoring 边界，不能把它描述为任意语言完整断行算法。[ADR 0026][T-LINEEND]

### 本仓实现路径

先确认现有系统到底排得如何。应用没有显式传RN的断行策略，但**不代表系统没有处理CJK**。RN 0.83的Android `textBreakStrategy`默认就是 `highQuality`；已删除的Enriched当时在Android Q及以上也设置了高质量断行，Native V2继续使用系统文字布局。重复设置已有策略不应被算作确定的效果提升。[RN Text 文档][RN-TEXT]

RNRH 的试验入口是 [`ZhihuContent.tsx`](../components/ZhihuContent.tsx) 的 `defaultTextProps` 和自定义段落 `Text`：需要分别覆盖，不能只改默认分支。可以对照 iOS 的 `lineBreakStrategyIOS='standard'` 与当前行为，明确保留普通西文的按词断行。RN 的这些参数没有给出 Tiqian 的字符集、分档压缩或悬挂预算，不能据此承诺跨端 CLREQ 一致。

WebView 可先为已知中文正文提供合适的 `lang`，保留已有语言声明，然后试 `word-break: normal`、`line-break: auto`；`strict` 留作对照选项。不要把普通正文设为 `word-break: break-all`。长 URL、hash 等显示文本可单独开放紧急断行；代码块保留原始空白，横向滚动。只有可见长串是技术内容时才使用这类样式，普通链接标题仍按自然语言排版。

**难度边界：**建立样本并核验系统策略为低；剩余禁则若需要稳定的精确修复就是高。用 NBSP、word joiner 或新增换行强行锁住字符，会改变原始范围与复制语义，不是免费的修复手段。

## 3. 中西文小间距：视觉收益大，原生实现未必简单

### 规则与上游实现

例如 `使用React Native开发`、`支持Android 15系统`、`共3个步骤`，汉字与西文字母/数字相接处留一个小间隙，通常比直接贴在一起更易读。它是边界上的空间，不是给所有文字增加字距，也不是要求作者重写正文。

Tiqian 当前默认 `AutoSpacePolicy` 的基准间隙是 `0.125em`，优先拉伸上限是 `1/3em`；另有 `Clreq` 预设为 `1/4em` 至 `1/2em`。默认 Insert 在没有作者空格的适用边界增加布局间隙；已有 U+0020 的适用边界合并为一个 gap，行边去除额外间距，源字符仍保留。应看源码与 ADR amendment，不能沿用早期“默认 Replace、1/4em、Insert 未实现”的文字。[ClreqProfile][T-PROFILE]、[ADR 0009][T-SPACE]

边界分类使用固定修订的 Unicode `East_Asian_Spacing`，并与字体选择分离；不是只用 `[汉字][A-Za-z0-9]` 的正则。引号、标点、组合字符、跨 span 边界和已有空格都需要单独考虑。`1/3em` 是优先拉伸阶段的上限，后续统一字距还可能增加边界空间，不能写成最终视觉间距的绝对上限。[ADR 0009][T-SPACE]、[ADR 0023 修订][T-JUSTIFY]

### 本仓实现路径

**最小可行实验在 WebView。** 对支持的浏览器尝试 `text-autospace: ideograph-alpha ideograph-numeric`，保留原 DOM text。当前 CSS Text 4 草案定义的是约 `0.125ic`，不要求作者插入实际空格。属性解析通过只代表语法被接受；需在本仓支持的 Android WebView / iOS WKWebView 中验证效果，并用 `no-autospace` 作对照，因为默认排版也可能已包含间距。[CSS Text 4][CSS-TEXT]

这条路径可以保持原文和 DOM UTF-16 偏移，比改写 HTML 更适合当前 [`bridge.ts`](../bridge.ts) 的选区契约；仍需确认跨节点选择、知识点和复制结果。Tiqian 的 typed-space 合并语义不自动等于上述 CSS 声明，不能把二者当作完全相同的实现。

RNRH与当前Native V2没有本仓已验证的、对应 `text-autospace` 的通用布局接口。后续可研究spacing span / attributed-text能力扩展，或Tiqian adapter；先验证能否跨span并正确处理行边和选择几何。难度至少是中，达到跨端精确保真通常为中高。

不建议对 HTML 全文运行空格插入正则，也不建议给每个汉字拆一个 RN `Text`。前者会改动代码、链接、公式或知识点 UTF-16 范围；后者增加节点与 shaping 边界，并没有获得正确的全段行布局。

## 4. 标点压缩与边缘削空白，效果明显但不是负字距

### 规则与上游实现

`他说：“可以。”（附注）` 这类文本，连续全宽标点之间容易出现过大的空洞。行首开括号之前、行尾句号之后的空白也会使视觉边缘不齐。值得先处理这些**标点自身的可用空白**，保留汉字自然字距；不要把全角标点替换成 ASCII 标点。

Tiqian 将标点分为墨迹、字身和左右可调整空白；相邻压缩、禁则推入、行边削减共享空间预算，避免一份空白被减两次。几何优先使用字体 `halt` 的 advance / placement，再使用 ink bounds 的安全拟合，缺少证据才用具名 fallback。开明式是可选风格，当前默认并非所有句中标点一律半宽。[ADR 0004][T-PUNCT]、[ADR 0014][T-INK]、[ADR 0010][T-EDGE]、[ADR 0027][T-WIDTH]

### 本仓实现路径

WebView 可针对实际支持的 `text-spacing-trim` 值试验，观察连续标点和行边空白；它只覆盖浏览器提供的能力，不等于移植 Tiqian 的全部标点模型。

RN 全局负 `letterSpacing` 会同时收紧汉字和英文；给标点包负 margin 又不知道它最后是否位于行首/行尾，也可能导致重叠、选区错位和测量高度不一致。当前应用层缺少逐字形墨迹与最终行边界，因此原生精确实现为高难度，宜交给经过验证的排版后端。

悬挂需要段落以外的墨迹仍能显示，涉及容器裁切、触摸与选择几何；不能只加一个 transform。先做好行尾空白处理，再对窄版心评估悬挂价值。

## 5. 整字版心是值得单独试的低成本策略

Tiqian 默认将版心宽度向下取整到字号的整数倍；例如可用宽度为 350、实际字号为 17，试排宽度为 `floor(350 / 17) * 17 = 340`，余下 10 放在正文块外。纯中文行不用为了这 10 个单位均匀拉开字距。这是**整块文本的行长量化**，不代表把混排中的每个字形强制吸附到同一个网格。[ADR 0028][T-GRID]、[TextModel][T-TEXT]

本仓可在开发案例页对纯文本容器试排，保持居左或居中为明确参数。RNRH 的 `contentWidth` 是渲染提示，必须同步实际文本容器宽度，不能只改传入值；图片、表格、代码与卡片不应无意全部变窄。

试验本身为低难度；接入系统字体缩放、当前设置、嵌套引用/列表的实际可用宽度，以及不同字体的汉字 advance 为中。RN dp 与浏览器 CSS px 还需在同一视觉尺度下对照。整字宽不会消除标点禁则、西文混排造成的余量；没有启用双齐时，它本身也不会制造拉伸空间。

可先保留为可关闭实验，观察少于一字的版心损失是否可接受。上游 [ADR 0054][T-GRID-PROPOSAL] 中取消 grid 开关、格数区间预排表等设计仍标为 Proposed；本文依据当前源码里的 `LineLengthGrid.enabled`，不把提案算成已实现能力。

## 6. 两端对齐应在前述规则之后评估

Tiqian 的中文非末行走双齐，末行默认齐行首；普通西文先调整词距，中西边界按策略调整，剩余空间再分配到允许的统一字距。纯西文不会因为存在一个中文标点就把每个英文字母强行拉开。强制换行行与段落末行也要保留其语义。[ADR 0023][T-JUSTIFY]

WebView 的 `text-align: justify; text-align-last: start` 可低成本作视觉对照，但浏览器的空间分配并非 Tiqian 的算法。标题、代码、图注、诗行、短标签和长技术串不应通过正文全局规则强制双齐。

RNRH可以试 `textAlign: 'justify'`，但不保证两端系统使用相同规则；Native V2原型已开放Android系统justification作对照。仅切换对齐方式的成本低，获得稳定的标点预算、分层拉伸和跨端一致性则为高。窄版心尤其要看最大字距、孤立单词与多行密度，而非只检查右边缘是否整齐。

全段动态规划、邻行均摊不是第一轮投入点。上游 [ADR 0041][T-DP] 记录过算法评分改善但目检更松散的情况，默认求解器也没有仅因评分下降就替换。这提醒本仓用真机视觉和交互验收决定效果，不能用单一“对齐率”替代阅读质量。

## 本仓可执行的两级路线

### 第一轮：共享指标与系统能力（已建立功能原型）

1. 共享指标修正已落地：WebView、RNRH与Native V2消费同一字号/行高体系，Native V2的段距不以额外空行表达。继续根据真机效果校准。
2. 在开发案例页增加合成排版样本，对照当前系统断行、iOS standard、WebView 语言与断行样式。已有默认能力也列入基线。
3. WebView 独立试 `text-autospace`、`text-spacing-trim` 与正文双齐，一次只改一项；无支持时保持当前可读正文。不要为了 CSS 小实验加载整套 Tiqian runtime。
4. 试正文整字版心，先覆盖纯中文，再覆盖链接/粗体、引用/列表和大字号；记录收益与损失后决定是否保留。

### 第二轮：系统能力不足时再选原生扩展或 Tiqian

小范围缺口（段落间距、语言、具体 span 能力）优先评估通用原生扩展；需要稳定的禁则修复、标点预算与分层双齐时，再验证 Tiqian。逐条在应用层复制这些算法，会让测量、绘制和选择拥有多份真值。

本仓目标仍是 [Renderer V2 计划](./renderer-v2-plan.md) 的 `HTML → ZhihuDocument → Text Flow Island / Rich Text IR → adapter`。本地Native V2已初步实现这条链路与source map，完整知乎覆盖仍待扩充。后续若接入Tiqian，应复用现有公共AST与IR；已删除的Enriched dialect只属于历史实现。

| 接入路径 | 值得验证的入口 | 本仓难度与尚缺工作 |
| --- | --- | --- |
| Android 原生 View | 上游 `CjkTextView`、`CjkTextSurface`；本地 Expo module 承载 | 高。现有 View 前端可避免第一轮额外引入 Compose 宿主，但仍需核验 Gradle/工具链、RN 测量、滚动/手势、跨段选择、媒体、生命周期与 source map |
| iOS 原生 | 上游 Apple `CJKTextView` / `TiqianUI`、Core Text 路径 | 高。当前上游已有 iOS 只读前端，不能再笼统说上游“没有 iOS”；本仓未接入Tiqian的RN/Expo adapter或完成其兼容验证；现有UIKit/TextKit模块是独立系统后端 |
| WebView 完整引擎 | `@tiqian/prose` 渐进增强现有 HTML | 中高。需处理 runtime/字体资产、动态正文生命周期、降级、消息与选择映射、缓存及长文性能；比几条 CSS 大得多 |

入口信息来自固定版本的 [Android View 指南][T-ANDROID]、[Apple 前端][T-APPLE]、[Web 指南][T-WEB]，不构成本仓兼容矩阵或可直接安装的稳定版本承诺。既有 [Tiqian 集成草案](./renderer-v2-experiment-02-tiqian.md) 继续保留为历史实验路线，正式 PoC 要重新核验当前 API。原生依赖/配置变化必须 prebuild，不提交生成的 `android/`、`ios/`。

## 验收样本与决策标准

以下均可用合成文本，避免将未脱敏的真实知乎正文写入样本。人工调整宽度，使目标标点接近断点；只测试某个固定设备宽度不够。

| 样本 | 重点检查 |
| --- | --- |
| 纯中文多段正文、标题、引用、列表 | 字号放大后行高比例；段落节奏；列表续行对齐；末行不拉伸 |
| `他说：“可以。”（附注）《示例》` | 关闭标点不孤立在行首，开始标点不留行尾；连续标点无大洞且无墨迹重叠 |
| `使用React Native开发，支持Android 15，共3个步骤。` | 小间距只出现在适用边界；英文词内字距自然；行边无额外空白 |
| `中文 React Native 正文`，以及汉字/英文分属 strong、link、知识点的变体 | 作者空格不叠加成双倍间隙；跨 span 的视觉与点击范围正确 |
| 普通英文段、`3.14`、`10 kg`、`20%`、长 URL/hash、inline code | 数字符号保持合理组合；普通英文按词；技术长串不溢出；代码内容不改写 |
| `——`、`……`、emoji/组合字符、行内公式前后标点 | 语义组合不拆坏；grapheme 完整；公式 baseline、行距和断行正确 |
| 多段选择、复制及知识点点击 | 复制保留原文；UTF-16 范围正确；不因排版规则注入空格或额外换行，正常段落分隔与范围映射保持正确 |

在 12 / 14 / 20 / 24 / 32 字左右的版心、字号设置 0.8 / 1.0 / 1.5，以及应用支持的 Android / iOS 真机与系统字体缩放下对照。阈值周边需同时测试两侧，不能将上游 stub 语料的结论直接应用到所有手机。

比较不只看截图：记录禁则违规、溢出/裁切、最大可见间距、行高与总高度、复制文本一致性、知识点/链接命中，以及冷渲染、宽度变化重排和内存成本。排版改善不能靠破坏复制、选择或大字号可读性换取。保留原文与 source/display 区分，也是 Tiqian 可借鉴的基础设计。[ADR 0003][T-DISPLAY]、[ADR 0044][T-OFFSET]

实现阶段应登记 fixture，运行 `npm run analyze:rich-content`、`npm test -- src/features/rich-content/tests --runInBand` 和 `npm run check`；涉及原生扩展再做 prebuild、双端构建及 Release 真机对照。本次文档调研未运行上游构建，也未执行上述真机效果验收。

[T-ARCH]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/architecture.md
[T-TEXT]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/engine/src/commonMain/kotlin/org/tiqian/core/TextModel.kt
[T-PROFILE]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/engine/src/commonMain/kotlin/org/tiqian/clreq/ClreqProfile.kt
[T-SOURCE]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0037-source-faithful-plain-text.md
[T-KINSOKU]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0025-measure-adaptive-kinsoku-default.md
[T-LINEEND]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0026-line-end-kinsoku.md
[T-SPACE]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0009-autospace-policy.md
[T-PUNCT]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0004-punctuation-additive-glue-model.md
[T-INK]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0014-ink-bounds-calibrated-punctuation-geometry.md
[T-EDGE]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0010-line-edge-glue-trim.md
[T-WIDTH]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0027-punctuation-width-styles.md
[T-GRID]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0028-integer-line-length-grid.md
[T-GRID-PROPOSAL]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0054-measure-quantization-and-band-table.md
[T-JUSTIFY]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0023-justification-as-baseline.md
[T-DP]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0041-paragraph-dp-line-breaking.md
[T-ANDROID]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/platforms/android/view/README.md
[T-APPLE]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/platforms/apple/frontend/README.md
[T-WEB]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/platforms/web/client/web-component/README.md
[T-DISPLAY]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0003-prefer-clreq-recommended-codepoints.md
[T-OFFSET]: https://github.com/tiqian-cjk/tiqian/blob/7aa7c3d8ada486aecbdfceb0ed461fe775a213d9/docs/adr/0044-source-offset-glyph-geometry.md
[RN-TEXT]: https://reactnative.dev/docs/0.83/text
[CSS-TEXT]: https://www.w3.org/TR/css-text-4/#text-autospace-property
