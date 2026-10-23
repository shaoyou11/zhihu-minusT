# Renderer V2：连续文本流与真实正文试用

2026-10-01按用户选择将引擎命名为 `tiqian-super-mini`。界面采用此名字，早期记录中的Native V2指同一后端；内部 `native-v2` renderer值、原生模块名和持久偏好保留兼容。当前文字布局仍使用Android TextView与iOS TextKit，Tiqian源码用于规则研究。

2026-09-30开始。本轮先实现各项能力的最小可见版本，随后按用户要求开放真实正文的可选入口；性能门槛、长文本基准与全量默认迁移暂不展开。排版策略依据 [Tiqian 评估](./tiqian-typography-strategies.md)，架构依据 [V2 计划](./renderer-v2-plan.md)。首先使用Android系统TextView/Spannable，2026-10-01开始增加iOS UIKit/TextKit adapter；两者均未接入Tiqian排版引擎。Android阶段的已验证结果与新增iOS验证分别记录。

本文按时间保留早期实验和验证记录；下文历史阶段的 RNRH 默认值与 fallback 描述不代表当前实现。现行入口、后端与设置迁移以本节说明为准。

## 入口与数据链路

开发构建：“我的 → 富文本测试案例（开发）→ tiqian-super-mini 原型”，路由 `/dev/rich-content/prototype`。六组本地合成内容覆盖跨段选择、装饰线、行内附件、知识点、媒体与表格、中西混排。案例不包含真实账号或对象，不提交点赞等业务操作。

真实内容入口为“设置 → 外观与阅读 → 正文排版 → tiqian-super-mini”；“功能开关 → 正文排版”也会进入同一页面。该选项在正常业务页面使用，不需要开发案例入口；网页排版仍可随时切回。原型和稳定fixture的后端切换仅保留在当前页面，不写入生产偏好。

```text
HTML + segment_infos / 想法 content 分段数组
  → normalizeZhihuDocument / normalizeZhihuContentSegments
  → ZhihuDocument
  → compileZhihuDocument
  → RichTextFlow（UTF-16 text / spans / paragraphs / decorations / attachments / sourceMap）
  → ZhihuRichText（Android TextView / iOS UITextView）
  + React Native 独立媒体 block
```

公开能力从 `@/features/rich-content` 导入。原生实现位于 [`modules/zhihu-rich-text`](../../../../modules/zhihu-rich-text/README.md)。业务默认读取 `richContentRenderer`，也可显式传 `renderer="native-v2"` 覆盖；当前新安装默认采用 tiqian-super-mini（`native-v2`）。未包含新模块或Android/iOS以外的平台使用完整 WebView fallback，保留保存的偏好；原型页标明可用性。RNRH 已删除，开发对照只保留 tiqian-super-mini / WebView。

推荐通过 `ZhihuContent` 使用该能力，默认采用正文设置，其交互外壳已经提供完整 WebView fallback；需要固定后端时显式传 `renderer="native-v2"`。直接挂载 `ZhihuNativeContent` 必须传入 `renderFallback: () => React.ReactNode`；功能原型宿主同样提供 WebView adapter，复用图片预览和链接分流。模块不反向导入外壳，避免fallback循环依赖。V2源选区和知识点事件仅在native可用时运行。

实验初期的 settings version 13 将旧 `useWebView=true` 迁移为 `webview`，其他旧值为 `rnrh`，当时 Native V2 仅由用户选择。当前 settings version 为 16；version 15 移除 RNRH，将旧 `rnrh` 或未设置偏好迁移为 `native-v2`，保留显式 WebView 选择及旧 `useWebView=true`；version 16 另为回答阅读方式补齐默认 `detail`，不改变正文后端选择。

信息流外层 `FeedExcerpt` 按用户最终决定保留原有React Native `Text`摘要，单独回退，不跟随Native正文后端。预览弹层加载及首测阶段仍可保留已有摘要placeholder，最终正文按所选后端显示。本轮未保留独立NativeRichTextExcerpt或模块maxLines/ellipsis扩展。

## 本轮初步能力与实现难度

| 能力 | 初步实现 | 后续难点 |
| --- | --- | --- |
| 中立语义模型 | 解析段落、标题、格式、列表、引用、图片、公式、表格、脚注、卡片、视频及知识点；危险节点/URL过滤，未知结构保留诊断或文本 | 全量知乎 dialect、深层异常结构及完整内容一致性仍需扩充；中等 |
| 同一流跨段选择 | 标题、段落、简单列表/引用共享一个可选择 TextView；选择事件携带 flowId、textVersion 和 UTF-16 范围 | 跨媒体/独立流的文章级选择、Pager手势和无障碍；高 |
| source map 与复制 | 区分真实文本、生成换行/列表符号、U+FFFC附件；映回段落局部范围；附件复制替换为alt/LaTeX | 编辑、跨流选区、复杂嵌套与源范围校准；中到高 |
| 装饰线 | 知识点范围独立于文字样式，按视觉行绘制实线、虚线、点线、波浪线；字号/宽度变化重排 | 双向文字的非连续视觉范围、重叠装饰、点击容差；中到高 |
| 行内图片/公式 | ReplacementSpan进入相同文字流，异步加载图片/SVG后重排；SVG尺寸/vertical-align可参与基线 | 多种SVG单位、字体匹配、复杂数学布局、暗色适配；高 |
| 块级公式 | eeimg=2或真实LaTeX display语义形成独立block；图源显示，无图源时LaTeX文本fallback | 本地LaTeX排版、超长源容错和完整公式工具链；中到高 |
| 知识点 | segment_infos和highlight-wrap转换为范围装饰；开发原型显示本地菜单，真实回答中精确匹配源文本且身份完整的标记可进入已有业务菜单 | 跨段知识点、元数据变化与选区冲突；中 |
| 媒体与复杂block | 图片预览/长按、链接卡片、视频页面入口、横向表格/代码、脚注面板；表格新增跨行/跨列占位和内容高度约束 | 视频播放资源与播放器、媒体viewport回收、复杂嵌套交互；中到高 |
| 基础排版 | 字号与行高成比例、段距、系统换行、可切换系统双齐和整字版心；媒体保留完整宽度 | 完整禁则、标点压缩与autospace统一预算需要更强布局后端；高 |

表格使用占位网格安排colspan/rowspan，保留多个表头/表尾行与空格子；rowspan限制于所属行组。每格内层的自然高度形成行高约束，合并格按覆盖行的总高放置。纯几何逻辑已有存量案例及合成跨度测试，复杂合并格的真机显示仍需人工核对。视频只有页面或资源入口，尚无独立播放器。纯LaTeX而无图片的行内公式目前显示替代文本，不宣称已实现数学排版。

## 存量知乎格式审计

用户要求优先接全知乎功能后，逐项核对现有RNRH/WebView、`ZhihuDocument`与8个稳定fixture。此次检查重点是原有内容和交互在V2是否仍存在，而不是只检查六组合成演示。

| 存量输入 | 查出的关键差异与修补范围 | 证据与覆盖边界 |
| --- | --- | --- |
| 编辑器链接卡片 | 仅有 `data-draft-type="link-card"` 的anchor也必须形成独立卡片；保留 `card_open_url`、title、HTML描述与嵌套图片元数据 | heavy案例包含一个没有LinkCard class/data-draft-title的真实卡片；旧实现还提供站内缺失信息查询和统一跳转 |
| 知乎脚注 | `sup[data-text][data-numero]`从属性生成正文定义，安全data-url保留为链接；重复编号共用定义 | formula-table案例有10个引用、9个定义，没有独立section.footnotes；不能只支持合成的footnote-ref语法 |
| 公式与普通图片 | 公式结合eeimg和LaTeX语义识别行内/display，普通figure保留块图；忽略noscript的重复图片，保留caption和日报头像角色 | article案例有345处行内公式；formula-table有78处行内公式、14张普通块图；这两个案例没有块级公式 |
| 表格 | 保留每格嵌套blocks、header、对齐及合并关系，不能先压成纯文本 | 存量表格为6行2列、2个header、12个单元格，无rowspan和格内公式；跨度与格内格式/附件需合成案例补充 |
| 嵌套正文和注释 | 图片caption、表格单元格、引用/列表与脚注面板应复用富文本流，保留链接、强调和附件 | 语义模型已有这些children/blocks；旧纯文本拼接会丢失格式和交互，不能作为最终adapter |
| 想法分段数组 | JSON中的text/image/link_card须按原顺序混排，不能只用HTML字段判断覆盖 | 3个pin案例的图片/卡片可能存于content数组；Native normalization与原有完整结构化fallback分别核对 |

补齐后的宿主已让结构化想法分段使用Native V2 normalization，并保留原有完整结构化RNRH fallback。卡片复用现有LinkCard的元数据、站内信息查询与链接分流；图注、表格单元格、列表/引用和脚注面板复用原生富文本流。普通图片按已知或加载后的自然比例显示，移除480px高度上限，点击按当前索引打开整篇正文画廊；日报头像沿用40px圆形规则。块级公式复用居中的原生附件，保留图源比例、基线与LaTeX复制文本；超宽图仍缩放到可用宽度，尚未实现参考方案中的完整显示数学横滚宿主。Kotlin对齐配置变化需要重新编译原生构建。

目前8个稳定fixture没有videoBox或pre/code，也没有跨行合并格；这些功能的初步语义与布局由合成用例验证。视频播放器、媒体回收、纯LaTeX数学排版和跨媒体选择继续留在后续范围。真实正文的完整视觉和菜单回归需要逐项真机查看，结构统计与单元测试不能代替它。

用户随后明确指出eeimg=1/2不足以完整决定公式换行，本轮再次对照本地Zhihu++规则。图片资源先经过safeURL解析，以有效图片上的eeimg=1/2或equation URL识别公式；eeimg=2是显式display提示，eeimg=1或缺值还检查有效tag（含tag*、不限group深度）、顶层行分隔符及顶层align/align*。strong/span/link等深层wrapper中也会提取独立公式，保留前后格式、段落身份和源offset，仅吸收紧邻display的br以免多一个空行。matrix、group或comment中的行分隔符不误升，短纯公式段和figure容器也不单独改变模式。图片宽度只影响系统文字布局中的自然换行，不用于猜测display。参考的4096源长度阈值未照搬，因为本仓没有其本地TeX与超长图源容错；完整数学横滚仍待实现。

article-formula-heavy真机反馈随后指出部分短公式仍另起一行。实际原因是裸列表项的通用blocks分组遇到img就切段：公式节点虽然是inline，宿主却另包一个paragraph，compiler据此插入换行和段距。70个HTML段落未变，但10个li被错误拆成25个内部段落，产生8个单公式段，其中7个短式。修复让li/quote/div/root的混合文字与公式一起进入段落，真实display和普通块图继续保留边界。列表内部段落恢复10，全篇paragraph从95恢复80，单公式段8变0；345个行内附件、0个display公式及12个flow保持。新增6项回归覆盖四种裸容器、边界和article三处原句，用户已真机明确确认短公式修好。公式类型数量正确不能代替宿主结构和视觉正确；WebView的KaTeX矩阵display策略仍与Native源语义策略不同。

暗色公式统一使用正文textColor绘制，普通图片不变。真实匿名Ax=b SVG返回currentColor fill/stroke且没有rect/image；合成公式另有浅色底板，故只对formula检查四个5%内缩角落，至少三个近白不透明时先转为灰度alpha mask去底，再用独立Paint的SRC_IN滤镜着色。缓存保留未染主题色的glyph/mask，key包含kind，主题切换不改变几何。此为单色公式阅读策略，彩色公式分色与任意SVG背景识别尚未实现。

用户随后提供的本地Zhihu++ Markdown路径也已逐项核对，重点差异与源码位置见 [媒体宿主与首载稳定性参考](./markdown-reference.md#媒体宿主与首载稳定性补充)。原有图片预览、长按面板和视频页面可以复用；整篇图片画廊、图片几何保留与首次文字测量要分别处理。已收到Native V2首次加载抖动反馈，定位JS估算高度切换、native精确测量及附件几何更新，具体改动与验收边界见下面的首载处理记录。

## 真实业务交互边界

知识点业务动作只允许回答对象中的精确标记。对于当前 `segment_infos`，段落ID、UTF-16半开范围、源切片文本及现有reaction IDs均须对应，明确 `is_span=true` 不进入本段业务分支。HTML `highlight-wrap`必须具有完整当前回答target、片段ID、反应和位置，并与唯一源段落及实际包裹文本一致，跨段标记不进入此业务分支。无效或不完整的元数据保留本地复制与经过验证的来源URL；跨段displayText仅在target和完整ID集合一致时用于本地复制，不生成API位置。文章/想法/问题不调用回答专属接口。开发原型继续使用本地演示菜单，不提交业务请求。

同一flow的系统跨段选择、复制与原生范围事件已经可用，回答宿主也已接回旧有选区菜单。`resolveNativeAnswerSelection`逐片验证IR source map、UTF-16连续偏移、源切片文本和唯一真实段落ID；API若提供同PID段落文本，还须全文一致。普通正文/引用及相邻段落的纯文本选择可进入业务菜单。整段包含附件、br、脚注、未支持语义、标题/列表，或缺失/重复PID、跨独立block、非相邻段落、错误源映射时返回null，保留系统选择与复制。不能为附件替代文本或生成字元补造API范围。

赞同和撤销使用完整片段ID集合，新建reaction响应的segId先按unknown验证再使用。新建reaction还固定提交时的回答来源与选区快照：提交A期间改选B不会清除B，切换正文来源后不刷新旧来源或清除新选区，非法回答来源不发送请求。该竞态新增5项测试，已纳入最终完整检查。回答段评链接带原始片段内容、pid和起止offset；当前评论页的根段评和直接回复在完整source存在时调用段评接口。旧链接若缺少pid/range/text仍可阅读，但发段评需重新选择原文；文章不会调用回答段评接口。独立replies页仍保留原有comment-ID回复，本轮不扩展。

这轮测试不提交真实点赞、评论或新建reaction；业务入口已接通与服务端操作已真机验收分别记录。

## 排版策略如何试用

原型调节提供字号、行高、双齐、整字版心和装饰线。字号不写入用户设置，便于直接对照后端。行高修正为 `17 × fontSizeScale × lineHeightScale`，解决大字号下相对行高逐渐收紧的问题；标题沿用共享指标。

整字版心按当前可用宽度和一个中文em向下取整，Android计入系统fontScale。它只调窄并居中文字容器，不通过插入空格改变选区偏移。系统TextView负责shaping、字体fallback和断行，双齐使用系统justification；这不等同于Tiqian的完整禁则和分级压缩策略。

WebView对照使用同一套字号/行高，并可实验 `line-break: strict`、`text-autospace` 和 `text-spacing-trim`。后两项取决于设备WebView的CSS支持，浏览器可能忽略；尚未为原生流实现中西文间距预算和标点几何压缩。代码保持起始对齐和无自动间距。

## 原生事件与范围边界

`selection` / `height` / `action` 都带flowId与textVersion。JS忽略过期版本；selection清除使用负偏移。action查找当前IR中的节点、范围和URL，不直接信任事件URL来导航。native不接收任意HTML，不执行脚本。

2026-10-01为首载反馈补充了 `layoutKey`：高度事件还回传当前布局身份，宽度、字体和配置变化后的旧posted measurement不会覆盖新布局。native的高度去重包含该key，更新key会重测，即使新旧实际高度相同也能确认本次输入。

附件加载完成后按动画帧统一回填ReplacementSpan、重建TextView布局并发送高度，保留当前选区偏移；generation和dispose后丢弃旧更新。解码后的图片/SVG资源使用按bitmap.byteCount计算的24MB进程LRU缓存，避免文字流重新挂载时重复从占位尺寸开始。资源失败不阻塞正文首测，不等待所有网络公式完成。JS宿主等待容器实测宽度和所有顶层flow的当前layoutKey高度，再做一次可见切换；此前使用主题浅色骨架或业务placeholder隐藏估算排版。RNRH只在模块缺失或平台不支持时降级，避免首测时先出现经典正文再切换样式。不能据此承诺未知intrinsic尺寸加载后完全不重排。

两个正文预览宿主在数据获取和native准备阶段保留同一个ready callback，每次打开只执行一次open animation，后续frame重测仅更新关闭目标，不重复fade。回答详情在两个阶段都保留同一200px加载提示。renderer与预览测试验证native等待不调用fallback、宽度/布局key一致后单次切换与动画不重播；Jest已纳入富文本 `.test.tsx`。真机合成原型已确认标题及native正文出现、骨架退出，新layoutKey桥生效；更多实际内容的首载变化仍需继续核对。

阅读进度还定位到一个可重复的问题：数据返回即设置ready，会在短placeholder停留超过180ms时，把已保存的1200px位置提前截为0；随后长正文出现也不再恢复。修补通过公开 `onLayoutReady` 在最后一个有效flow测高与正文揭开的同一event batch通知，再开启回答页恢复；阅读进度hook还要求就绪后的新contentSize，撤销ready会取消旧恢复计时。正文就绪按原始内容、对象/变体及宽度配置保持；同一文字、段落指标、有效字形样式和附件资源/尺寸可沿用已验证的精确高度。仅节点、action、decoration或反应元数据变化不会让可见正文退回骨架，也不会让尚在首测的其他flow丢失有效测量。过期事件仍按当前身份拒绝，新的有效高度仍可校正。不支持的平台/模块不可用继续按原有回答数据就绪路径运行。不修改持久schema，也不把未知附件的最终尺寸作为首测前置条件。

就绪与阅读进度两组Jest测试共16项已通过：短placeholder延迟1秒期间保留保存位置，正文新测量后恢复1200px；撤销ready取消旧180ms计时；无保存位置不触发滚动。另覆盖旧宽度/配置/正文事件不通知、无flow文档通过实际容器layout通知、仅反应元数据更新保持正文挂载可见、知识点mark改变版本后保留已验证高度并拒绝旧事件，以及首测中另一flow元数据更新时保留未变flow的测量。TypeScript及改动文件Biome检查通过；这些测试保证首次正文布局门禁，真机阅读位置及所有异步媒体最终高度尚未据此验收。

段距来自LineHeightSpan，不写入额外空行；段间只保留一个语义换行。DOM的br和图片不推进段落textContent偏移，flow里的换行/附件分别以synthetic/attachment记录。带格式的知识点按范围拆分并保留格式。

## 原型实现时的验证记录（Enriched删除和真实正文入口之前）

- Android prebuild完成，Expo autolinking识别本地模块；arm64 Debug `assembleDebug`通过。
- `npm run typecheck`、改动TS/JSON的Biome检查通过；`npm test -- src/features/rich-content/tests --runInBand`通过11个suite/207项测试，`npm run analyze:rich-content`校验8个稳定案例。中立模型/编译器新增19项短内容语义测试，覆盖URL过滤、格式保留、公式分类、脚注、知识点及选择源映射。
- 原型实现阶段的 `npm run check`通过19个suite/259项测试/8个fixture；Biome仍有仓库原有2项optional-chain warning与schema版本info。当时未修改Enriched staged patch；随后按用户决定正式删除，删除后的验证单独记录。生成android目录未登记到版本控制。
- vivo V2509A / Android API36，字体缩放1.0：新模块APK更新安装成功，应用数据保留；原型页可直接打开。
- 真机长按与系统全选成功：标题、两段正文、引用、列表共享选区，JS面板收到UTF-16 `[0, 198)`和对应源节点。单词选择也映回 `selection-a:[7, 9)`。自由拖柄的精确落点还需后续更细的手势验收。
- 合成24px行内图、两处SVG行内公式和独立块公式均显示；行内图片点击打开预览并可返回正文。
- `segment_infos`与`highlight-wrap`显示原生跨行虚线；点击“稳定范围”打开本地知识点菜单，源范围为 `segment-a:[9, 13)`。四种线型的全部调节组合、长按附件、复制内容、脚注与复杂表格交互尚未逐项人工验收。
- 本轮不进行Release性能门槛、长文本压力、iOS原生实现或生产默认切换。真机截图仅用于合成页面的本地查看，不登记真实知乎正文。

Android原型阶段优先根据真机反馈修复交互和显示；后续新增iOS TextKit adapter，构建与平台验证单独记录。是否引入Tiqian仍由系统布局的实际缺口决定。不要用这轮功能原型替代[V2完整验收](./renderer-v2-plan.md#第一阶段验收)。

## 真机试用后的路线调整

用户认为在当前重点功能上，Native V2的显示效果明显优于Enriched与现有RNRH，并随后明确要求正式删除Enriched。后续优先投入直接消费IR的本地原生后端。RNRH继续用于现有业务正文和迁移fallback。

2026-09-30正式移除范围：Enriched组件、后端专属dialect normalizer及其测试、依赖与锁文件条目、native patch、公共属性与开发入口。当时Native V2仅有Android实现，其他平台/缺模块客户端回退RNRH，现存对照为Native V2 / RNRH / WebView。实验01保留历史依据，Enriched不再是运行后端或fallback。

当时确定的后续重点为附件基线、复杂公式与背景语义、装饰命中及更多实际正文结构，再补iOS adapter；不为维持已删除候选重复实现能力。

## 正式移除后的验证

- npm卸载和随后 `npm ci` 已通过；npm卸载报告移除51个包，锁文件相对原HEAD移除48个package条目，没有新增条目或存活包版本变化。Enriched专属Tiptap overrides一并移除。
- `npm ci` 仅应用保留的react-native-screens patch，不再安装或应用Enriched patch。
- 删除后的 `npm run check` 已通过：19个suite、244项测试、8个稳定fixture。Enriched专属测试删除，共享行高比例回归迁移为独立suite；这里的244项与删除前259项分别记录。
- Android / iOS prebuild已通过；删除后的Android `:app:assembleDebug` 成功，约7分12秒、659个tasks。生成工程未提交；iOS仅验证prebuild，尚未重新编译或真机验收。
- APK以 `adb install --no-streaming -r` 更新成功并保留应用数据；生成Android autolinking不再包含Enriched。重装依赖后曾出现Metro入口404，使用 `expo start --clear` 重启后bundle恢复，三个合成后端页面可打开，用户确认应用正常。

真实正文设置入口、业务交互与存量格式补齐的变更发生在上述检查之后，最终完整检查和当前真机范围另行记录如下。

公式判定与裸容器拆段回归已纳入检查，article/formula-table的345/78处行内公式数量保持；短公式修补时rich-content专项17个suite/308项通过。参考源码只读比较，没有运行参考app。

2026-10-01首载处理模块完成native prebuild、arm64 Debug构建及APK更新安装，真机合成原型的标题和native正文出现、骨架退出。信息流原生摘要扩展已精准撤回，FeedExcerpt保留原Text。其后的暗色公式绘制另行完成Android prebuild和最终arm64 Debug构建（约10秒）；编译产物更新时间晚于最后源码修改。约50.5MB的 `app-arm64-v8a-debug.apk` 通过 `adb install --no-streaming -r` 更新安装成功，设备为vivo / API36。mask边界和65,536组alpha/gray不变量通过纯Kotlin验证，公式尺寸与分类不变。

Android阶段最终 `npm run check` 退出码0：类型检查通过，Biome检查279个文件（保留2项原有warning），29个suite/424项测试通过，8个稳定fixture分析通过。此次检查包含生产后端设置迁移、知乎存量格式、知识点/选区/段评边界、就绪与阅读进度、公式规则、裸容器拆段以及reaction快照竞态。

已确认真机范围为冷重启dev client后打开合成功能原型：页面标题出现，同一个TextView包含标题和第一/第二段连续正文，未出现“不支持”提示或加载骨架。该轮清空崩溃缓冲后的检查为FATAL EXCEPTION 0、native fatal signal 0；真实article的短公式行内问题获用户确认修复。安装最终着色APK后，用户明确确认暗色SVG公式修复。普通图片保持原色由回归与native kind guard验证，不冒充全部图源的真机验收。未量化白闪/抖动幅度，也未提交真实赞同、段评或新建reaction；业务服务端操作和所有实际正文的完整视觉仍需后续逐项验收。首次正文就绪不等于所有媒体已完成，未知intrinsic尺寸及表格自然高度仍可能带来后续布局变化。

上述Android阶段没有开展Release性能与iOS真机验收，当时尚无iOS原生adapter。新增iOS实现不沿用这些Android构建与真机结果作为平台验收。


## 2026-10-01：初步 iOS 原生文字流

按用户要求，Native V2开始补齐iOS系统后端：Expo本地模块注册Apple端的 `ZhihuRichTextModule`，JS延迟加载允许Android和iOS；不支持的平台、旧客户端缺模块或native view加载失败仍返回不可用，由正文宿主使用完整RNRH fallback。共享正文偏好不需要新增迁移，新安装仍默认经典排版；iOS与Android使用同一设置和开发案例入口。

iOS直接接收现有Rich Text IR，使用 `NSAttributedString`、一个内部不滚动的 `UITextView` 和TextKit 1视觉行布局；不增加另一份HTML parser或公共AST。范围样式、标题/引用/列表、四种装饰、系统选区与附件语义复制沿用flow坐标。`UIFontMetrics`的系统比例统一应用到字体、行高、段距和附件，SVG ex/em使用已缩放字体。媒体、表格、脚注和业务身份/范围验证继续复用JS宿主。`flowJson`、`configJson`、`contentWidth`、`layoutKey`、`selectable`与选择/高度/action事件沿用既有契约；高度仍须回传当前layoutKey，正文首测与阅读进度门禁不会因平台开启而绕过。

iOS SVG由podspec声明的 `SDWebImageSVGCoder@1.7.0` raster显示，支持根节点ex/em/viewBox与baseline，单边显式尺寸保留自然比例；普通bitmap由ImageIO限尺寸解码。匿名下载有4MiB流式上限与超时，缓存保留主题无关资源，公式使用正文前景色与近白底mask，普通图片不染色。更新以当前generation和取消状态守护，重新布局保留有效选区。装饰、附件、字体缩放、父滚动与系统拖柄的完整视觉/交互仍须独立平台验收。

完整app构建还发现原有Expo Router在iOS15.1 target下调用当前SDK的iOS16 `UIAction.subtitle`。只读SDK与最小Swift编译核对后，新增持久patch-package补丁为该赋值加availability guard；保留最低15.1，不通过提高全局target绕过问题。原型同时增加安全caseId deeplink，以便CLI模拟器打开六个合成案例；正文不来自query，生产开发入口边界保持。

JS模块可用性回归已通过1个suite/9项测试：Android与iOS的懒加载、桥props原样传递、缺模块fallback、Web/其他平台不请求native，以及view加载失败和Expo注册。`bash modules/zhihu-rich-text/tests/run-model-smoke.sh`直接编译iOS纯Foundation模型，17项UTF-16范围与复制断言通过；Swift语法、podspec，以及models/config/layoutManager的独立UIKit类型检查也已通过。

iOS实现最终 `npm run check` 退出码0：31个suite/439项测试、Biome281个文件（保留2项原有warning）、8个稳定fixture通过，包含模块可用性和新增开发deeplink回归。rich-content专项补跑19个suite/325项、fixture分析8个案例通过。`patch-package --error-on-fail`成功应用现有screens与新增router两个补丁。

完整iOS Simulator app的 `xcodebuild` 已 `BUILD SUCCEEDED`：使用iOS27 SDK，deployment target保持15.1，验证设备为专用iOS26.3模拟器。应用已安装启动，Native V2跨段案例的标题、正文、链接、引用线与列表可见，正文加载占位退出。

实际附件用例发现并修复一处TextKit事务崩溃：`NSTextStorage.beginEditing()`期间调用 `NSLayoutManager.invalidateLayout` 会触发布局洞填充并产生SIGABRT。现在编辑事务只更新附件与storage属性，结束编辑后再失效布局/显示、恢复选区并重测。修复后重新prebuild、完整构建与31/439检查通过；附件专项XCUI运行25.8秒通过前台断言，小图、两处行内公式、短I和独立公式实际可见，页面保持运行。

六个合成案例的首屏已逐项截图核对：连续段落、默认跨行虚线与样式、两种知识点来源、行内附件、图片/卡片/视频占位，以及中西混排显示正常。暗色通过专用模拟器的Hermes开发调试接口调用既有 `setThemeMode('dark')` 和Expo Router导航核对：两处行内公式、短I与独立公式为浅色，普通绿色小图保持原色；随后恢复跟随系统模式。截图只覆盖可见区域，未宣称表格/脚注等所有离屏内容及菜单交互已验收。

此包以 `CODE_SIGNING_ALLOWED=NO` 构建，SecureStore写入会报告缺少Keychain entitlement；主题验证使用内存状态，签名安装后的持久化与系统外观实时跟随需另验。这属于当前模拟器构建环境的边界，未为测试修改产品持久化代码或生产入口。

这份模拟器的emoji显示为缺字方框。独立UIKit/CoreText程序以标准系统字体运行相同字符串，同样报告注册的 `Fonts/Core/AppleColorEmoji.ttc` 不存在、回退LastResort；当前runtime另有CoreAddition字体文件，但未修复系统注册路径。源字符和UTF-16范围检查保持通过，emoji视觉需在完整runtime或真机复验。

系统选区拖柄/长按与父滚动的完整手势组合、iOS真机和双端Release仍未据此验收。

## 2026-10-01：iOS 真机安装与启动兼容

用户连接 iPhone SE（第三代，iOS 27.0）后，使用个人 Team 的开发签名完成 `iphoneos` Debug 构建；签名验证通过、profile 包含目标设备，覆盖安装 0.6.3，不卸载原有 0.6.2 或读取登录态。此开发包仍需连接 Metro，不是独立 Release 包。

首次启动在 UIKit 创建界面时发生 SIGTRAP，两份系统报告均定位到 `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`，尚未进入 Native V2。该现象与 [Apple 的 Scene 生命周期要求](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) 一致：使用 iOS 27 SDK 构建的应用须采用 Scene。当前 Expo SDK 55 尚无官方现成 Scene adapter，因此通过仓库配置插件补齐单主 Scene、真实 `UIWindow(windowScene:)`、冷启动链接参数，以及原 Expo AppDelegate 的链接和前后台事件转发；没有改 SDK 版本或使用私有 API 绕过检查。

插件及 Swift 源码存于 `plugins/`，prebuild 自动注入；只迁移已知 SDK 55 模板，拒绝覆盖未知模板或自定义 Scene 配置。重复执行与冲突拒绝等 12 项回归通过，完整 `npm run check` 通过 32 个 suite / 451 项测试、283 个文件的只读 Biome（2 项既有 warning）与 8 个 fixture 分析。

修复后再次完成 iOS prebuild、真机签名构建、成品签名与 Scene manifest 核验、覆盖安装及 CLI 启动。启动后的 app 进程保持运行，重新读取设备崩溃目录没有新增同类报告；这里只确认原生启动兼容，Metro 连接和 Native V2 各项真机交互仍单独验收。原始系统报告只留本机临时目录，不提交设备信息或原始日志。

## 2026-10-01：正文二次加载与 CI 类型修复

用户反馈Android与iOS从FeedCard打开回答时，缓存正文先出现，详情请求完成后又短暂闪白或显示加载动画。Feed缓存使用相同的 `answer-detail` query key，`updatedAt: 0` 有意让详情请求补齐信息；保留这个请求与缓存语义。此次定位到两处重新加载：回答ID列表从一页扩展时改变Pager key、连带卸载正文；同一对象内容字符串改变后，原生宿主再次退回首载placeholder。

Pager的React身份改为问题与排序，不再随列表初次到达变化；当前页按回答ID保持，列表暂时缺失正在阅读的答案时保留该页。拖动/settling期间冻结已渲染列表，idle按最终选中ID应用最新列表，避免刷新改变手势中的index含义。列表顺序改变后使用无动画定位，并拒绝过期列表的事件；只有当前页index实际迁移才开启门控，目标零offset、正常新导航等信号可结束门控，同index追加无需等待可能不会发出的selected回调。iOS依赖内部仍会在children数量变化时重建SwiftUI TabView宿主，所以保留React实例不能视为原生Pager完全不重建，实际翻页与列表并发更新需要平台验证。

原生正文外壳保留最近完成首测的内容及其高度，同一对象的新版本在绝对定位、透明且不参与交互/无障碍的候选层准备。候选实际宽度和全部顶层flow的当前布局高度确认后，直接晋升同一个React实例并移除旧层，不重挂候选或重复显示占位。等待期间关闭旧内容的选择、链接、图片及知识点业务动作，过期回调还须通过当前对象与版本校验。更快到达的新响应取代旧候选，不能让迟到的测量覆盖新内容；不同对象独立首载，避免串出旧正文。等价的新想法分段JSON数组沿用原引用与已验证布局，反应等元数据仍正常更新。

新增合成回归覆盖两条flow分批完成测量、保持旧正文与高度、旧交互/旧测量拒绝、连续响应覆盖、候选晋升不重挂、对象切换及等价结构化数组。测试验证就绪协议与React实例生命周期，不能代替双端真实候选测量和视觉切换；媒体未知尺寸的后续变化仍遵循此前边界。

CI的 `NodeRequire.context` 错误来自干净checkout没有本地忽略的 `expo-env.d.ts`，因而缺少Metro的类型扩展。fixture loader现在显式引用 `expo/types/metro-require`，保持字面量 `require.context`、开发构建门禁和动态案例发现不变。使用TypeScript完整Program排除 `expo-env.d.ts` 与 `.expo` 后复现原TS2339，修复后246个源文件入口、0项诊断；不依赖生成文件补齐CI类型。

本轮最终 `npm run check` 退出码0：33个suite / 468项测试、284个文件的只读Biome（保留2项既有warning）、8个fixture通过；另跑 `npm test -- src/features/rich-content/tests --runInBand`，19个suite / 329项通过。Pager共13项回归包括手势先开始再到达列表、idle早于selected、多次列表更新、索引重排、当前页暂缺、无确认回调和辅助导航。这轮只修改共享JS与界面文案，不变更原生模块、依赖或持久schema，无需为此重新prebuild。

专用iOS模拟器重新加载最新JS后，原型标题、后端按钮与提示显示 `tiqian-super-mini`，真实原生正文和可见层已挂载，首载占位正常退出。合成A→B替换的远程调试评估失败，未将其记为平台切换验收；重新加载清理临时调试override，不改真实缓存或业务数据。用户随后真机试用反馈二次加载闪白已明显减轻；仍不宣称所有页面完全无闪白，双端全部翻页/刷新组合与未知媒体尺寸的后续布局继续需要验证。

## 2026-10-01：附件并发与同高度正文的阅读恢复

合并前复核发现Android每个含未缓存附件的文字流持有自己的两个worker，挂载多个flow或表格单元格时会增加线程和并发下载；完成态LRU也不能合并进行中请求。改为全进程共享两个worker和资源key登记表，空闲30秒回收线程，保持24MB主题无关缓存。每个span/view使用独立取消订阅，只有最后一个订阅取消时才中断底层任务；任务完成、缓存写入、取消及同key重试以登记身份校验，旧结果不能移除新任务或错误回填。匿名网络读取检查中断，view仍保留generation、dispose及按帧更新门禁。

阅读恢复的缺口发生在首次180ms恢复尚未完成时：详情刷新撤销ready并取消计时，随后新正文与旧正文总高度相同，ScrollView可能不再发出尺寸变化，原先的测量门禁因此一直关闭。现在在正文就绪提交后主动测量ScrollView内容View，实际高度必须匹配当前contentKey、正文来源、聚焦周期与最新测量请求。相同高度也可以重新确认布局；在ready之前收到的普通尺寸事件不能认证原生正文，过期异步结果不能覆盖新布局。普通后端保持原有尺寸回调路径，已经恢复的位置不会二次滚动，持久schema不变。

本轮 `npm run check` 通过：33个suite / 482项测试、285个文件的只读Biome（2项既有warning）与8个fixture分析；rich-content专项19个suite / 329项通过。阅读进度共23项测试，新增14项覆盖同高度替换、尺寸先于ready、旧来源/对象/聚焦周期/请求、保存几何及普通后端。Android重新prebuild后，`./gradlew :zhihu-rich-text:testDebugUnitTest :app:assembleDebug -PreactNativeArchitectures=arm64-v8a`通过，8项JVM测试覆盖共享并发预算、进行中去重、独立取消、排队取消、迟到结果、失败重试与回调隔离。

arm64 Debug已覆盖安装到V2509A（API 36），保留应用数据，通过USB连接Metro。真机合成附件页的小图、两处行内公式、短I和独立公式在暗色中可见；切换跨段、附件、装饰案例后进程保持运行，当前进程无fatal crash记录，附件worker采样为0/2/2/2。用户试用反馈问题不大。同高度阅读恢复依赖上述合成回归，本轮没有单独在双端真机复现该竞态；未重建iOS或验证Release。

## 2026-10-05：Android 引用与触摸焦点静态修正

按用户要求，本轮只进行源码审查和静态检查，不启动模拟器、真机或原生应用。

Android 引用线原先直接使用 `LeadingMarginSpan` 的整行 `top..bottom`；段落高度 span 把段后间距加入末行 descent，引用线因此多画了段距。当时增加了连续引用最后一段的末行段距扣除，但使用绘制回调的可见 end 判断段尾，后续核查发现引用后还有段落时该判断无法生效，修正见下节。引用内部相邻段落的线仍连续；没有新增换行或改动选区/source map。

点击正文时的瞬间滚动有明确的静态路径：可选择 TextView 在触摸中取得焦点，本地 RN 0.83 的 `ReactScrollView.requestChildFocus` 会立即滚动到整个 focused 子视图；一个 flow 可跨越多屏。最初向祖先传递空 focused 的修正引入了闪退：用户连接的安卓真机崩溃日志显示 `ReactAndroidHWInputDeviceHelper.onFocusChanged` 不接受 null，调用栈直接经过本地 `RichTextView.requestChildFocus`。现在撤销该 override，始终传递真实焦点；`FlowTextView.getDrawingRect` 仅在同步普通触摸内返回触点矩形，避免外层尝试显示整个 flow。长按、已有选区、拖动、键盘和无障碍请求仍使用正常矩形；延迟布局也恢复正常矩形。附件列表为空时，逐帧同步提前返回，省去祖先滚动容器和屏幕可见范围查找。

详情正文的透明候选层已设置 `pointerEvents="none"` 并隐藏其无障碍子节点，阅读滚动指示器也不接收触摸；底部按钮位于正文 ScrollView 之外。静态检查没有找到能明确解释“极少数首次进入后整条底栏无法点击、重进恢复”的稳定遮罩或禁用路径，因此未凭推测重写 Pager、底栏或选择生命周期。修正后的 `:zhihu-rich-text:compileDebugKotlin --offline` 已通过；只读取了现有真机崩溃日志，未安装或启动应用。修正后的触摸、引用末端视觉、长按拖柄与父滚动组合、底栏偶发故障、iOS 和 Release 性能仍须后续平台复验。

## 2026-10-05：引用末行范围修正

再次核查引用底部延长问题时，确认前一节的段距裁剪存在边界错误。compiler 在段间只追加一个语义换行，并将前段的 `range.end` 扩展到换行之后；Android `Layout.drawText` 传给 `drawLeadingMargin` 的 end 却来自 `getLineVisibleEnd`，会排除换行与末尾空白。例如 `引用\n后文` 的引用范围 end 是 3，绘制回调 end 是 2，原先 `end >= range.end` 无法识别末行。本地 SDK 30 和 36.1 的源码均保留这一行为。

引用竖线现在通过 `layout.getLineEnd(layout.getLineForOffset(start))` 取得完整行结束位置，再判断段落末行并扣除外部段距。段距仍由 `ParagraphHeightSpan` 加入末行 descent，普通段落默认 14dp 并随系统字体缩放；本次只修正竖线边界。软折行与显式段内换行保留连线，高附件保留完整内容高度，连续引用段落内部仍跨段距连接。相邻独立 blockquote 的区分仍受现有 IR 只保留 quote kind、未保留容器身份的限制，本次未改变分组规则。

新增合成 `quote-paragraph-spacing-001`，先经 inbox 分析再移入 cases/manifest，覆盖单段引用后正文、多段引用、长句、末尾空白与显式 br。JS 契约测试确认引用范围包含合成段间换行，br 留在同一段并保持源选择偏移；normalization 会清除普通段尾 ASCII 空格，因此 native 末尾空白用例由 JVM 测试直接构造。新增 8 项引用几何回归覆盖上述范围差异、连续引用、flow 末段、高附件与过大段距。这些测试验证范围与裁剪计算，不替代实际 Android Layout 和 Canvas 的视觉验收。

本轮 `CI=1 npm run prebuild -- --platform android --no-install`、`./gradlew :zhihu-rich-text:compileDebugKotlin :zhihu-rich-text:testDebugUnitTest --offline` 均通过，最终原生测试共 20 项；`npm test -- src/features/rich-content/tests --runInBand` 的 25 个 suite / 412 项通过。`npm run check` 通过类型检查、501 个文件的只读 Biome、127 个 suite / 1402 项测试与 17 个 fixture 分析；Biome 保留 1 项既有 info。本轮未安装或运行真机/模拟器，未验证 iOS 或 Release；该改动需重新编译原生包后查看，Fast Refresh 不会更新 Kotlin 实现。
