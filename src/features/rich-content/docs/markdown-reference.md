# Zhihu++ Markdown 参考记录

本轮根据用户提供的本地 Zhihu++ 仓库补充 Renderer V2 内容模型。参考路径为 `shared/src/commonMain/kotlin/com/github/zly2006/zhihu/markdown/`，其中 `MdAst.kt` 负责 HTML/Markdown 转 AST，`RenderMarkdown.kt` 负责渲染与图片画廊，`MarkdownRuntime.kt` 负责平台字体和资源加载。知识点高亮另参考 `util/SegmentHighlightUtils.kt` 与 `ui/components/SegmentHighlight.kt`。2026-09-30再次核对本地HEAD `5d12475b`，相关参考目录无未提交修改，并补查 `shared/src/tiqianMarkdownMain/kotlin/com/github/zly2006/zhihu/markdown/TiqianMarkdownRenderer.kt`。

2026-09-30已初步实现HTML → `ZhihuDocument`、Text Flow Island / Rich Text IR编译与Android原生adapter；2026-10-01新增iOS UIKit/TextKit初步adapter，两端共享语义模型与编译器。完整知乎dialect、Markdown parser和编辑器序列化尚未接入，双端平台验收仍待完成。Enriched运行链路已正式移除，下面的模型参考继续供[本地Native V2](./renderer-v2-experiment-03-native-flow.md)使用。

根据 [Issue #40 当前方向](https://github.com/huamurui/zhihu-minus-minus/issues/40) 和 [早期候选讨论](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992)，这些参考用于中立语义层与adapter。`ZhihuDocument` 不规定WebView或逐块虚拟化；现有native IR将连续段落合成flow，把复杂媒体保留为独立block。Zhihu++的Tiqian实践继续帮助研究排版语义；Tiqian本身未接入，其iOS集成路径也未验证，现有UIKit/TextKit模块属于独立系统后端。

## 结构映射

| 参考结构 | 当前模型 | 保留的语义 |
| --- | --- | --- |
| Table / TableHead / TableBody / TableRow / TableCell | `table.head/body/foot → row.cells → cell.blocks` | 表头/表体/表尾、标题、对齐、单元格合并与嵌套块 |
| FootnoteReference / FootnoteDefinition | `footnoteReference` + `document.footnotes` | 展示编号、定义稳定 ID、重复引用与独立定义内容 |
| Image / Figure | `inlineImage` / `image` | 段落内图文顺序、正文图、图注、尺寸与预览资源 |
| InlineCode / KeyboardInput | `inlineCode` / `keyboardInput` | 代码文本、键盘输入语义 |
| Strikethrough / Highlight / Subscript / Superscript | 对应格式容器 run | 嵌套行内格式；另外补充 `underline` |
| SegmentHighlight | `segmentHighlight` | 虚线划线、片段 IDs、跨段文本、反应、来源和交互位置 |
| NativeBlock 视频 | `video` + 可选 `lensId/videoId/resource` | Lens 播放 ID 与 zvideo 页面 ID 分开保存，可直接传媒体资源 |
| InlineMath / MathBlock | `inlineFormula` / `blockFormula` | 原始 LaTeX、图片资源以及行内/块级排版语义 |

视频等业务节点保留数据结构，平台加载和交互由 renderer 承担。资源模型只存 URL、尺寸、媒体类型和离线 URI；Cookie、请求头或认证数据属于资源加载器，不进入文档模型。

## 本轮可执行能力

- `walkZhihuDocument` 使用显式栈进行前序遍历，访问所有块/行内内容，包含图注、表格单元格和末尾脚注定义。脚注引用作为叶节点，不沿引用再访问定义。
- `getZhihuDocumentPreviewImages` 收集正文块图和行内图，以去掉首尾空白、补全协议后的 URL 去重，保留首次出现顺序。头像、公式、视频封面、卡片缩略图和非 HTTP(S) 图片不进入画廊；输出投影资源模型允许的字段。
- `parseZhihuSegmentHighlight` 从不确定属性对象中识别完整的 `highlight-wrap` class token，投影有效元数据。有效 wrapper 没有业务属性时仍返回空元数据，后续规范化器仍可生成视觉划线 run。

上述函数从模块公共入口导出，测试不依赖React Native或WebView。Native V2的初步规范化与adapter已使用这些语义；现有RNRH/DOM组件仍接收HTML。

## 媒体宿主与首载稳定性补充

| 参考行为与源码位置 | 本仓当前对应与差异 |
| --- | --- |
| `MdAst.kt:101–110`递归收集整篇Figure/Image并去重；`RenderMarkdown.kt:100–114`从整篇画廊定位当前图 | 本仓已有文档图片收集能力；Native宿主已从单图预览扩展为整篇正文画廊，并按当前图传入initialIndex；不属于画廊的资源仍单独预览 |
| `RenderMarkdown.kt:139–184`长按提供查看、浏览器打开、保存、分享；菜单从选择宿主中隔离 | 本仓复用既有图片预览及保存/复制链接面板；分享和浏览器入口属于共享图片交互的后续增强，不能视作仅V2的回归 |
| `RenderMarkdown.kt:191–236`视频为16:9封面和中心播放按钮，跳转本地视频页面 | 本仓保留封面和中心播放提示，按 Lens ID 或 zvideo 页面详情解析实际媒体，由原生播放器播放；旧视频网页入口已删除 |
| `TiqianMarkdownRenderer.kt:265–332`按URL保留图片自然尺寸及最终Success/Error，重进视口时不退回Loading | 本仓的文字流首载包含JS估算高度、native精确测量与SVG附件几何更新；图片结果缓存可减少重复进入后的高度翻转，不能单独证明首次测量已稳定 |
| `TiqianMarkdownRenderer.kt:213–228`行内图片具有明确占位尺寸与底边基线；`:167–172`配置数学字体和display滚动宿主 | 本仓有ReplacementSpan/SVG图源与基线，未知图源尺寸仍需异步校准；尚无参考实现的本地LaTeX排版与数学字体工具链 |

用户已经报告Native V2首次加载抖动。本轮把它作为阅读显示问题追查，不等待Release性能基准：优先核对估算高度切换、附件尺寸重排和独立表格的自然高度更新。是否修复须以具体代码及真机结果为准，参考实现本身不能证明本仓已经稳定。

## 后续 normalization 约定

### 文本、标识与空白

普通文本需要保留两个行内格式节点之间的有效空白，避免合并成连写单词。代码块和行内代码需要保留原始换行与缩进，不能共用普通文本的空白折叠规则。

同一文档中的节点 ID 应唯一；重复解析相同输入应稳定。`paragraphId` 保留知乎 `data-pid`，`videoId` 保留页面业务 ID，`lensId` 保留播放身份，脚注 `label` 保留展示编号；这些标识与节点 ID 分开。遍历顺序号不能当作原始 HTML 行号或全文选择偏移。

脚注定义只存一份。多次引用同一定义时保留不同的引用节点 ID，共用 `definitionId`。编号缺失、定义冲突或引用悬空时应产生规范化诊断与可见 fallback，不能直接数值转换后抛错或丢正文。

### 公式

原始 LaTeX 保持原样，包括空白、注释和转义；取tex、识别排版和渲染是不同步骤。`eeimg`是识别和显式display提示，不足以单独决定排版：`eeimg=2`保留独立公式，`eeimg=1`或缺少标记的公式还会检查LaTeX语义。有效的 `\tag`（不要求顶层）、顶层 `\\` 行分隔符或顶层 `align/align*` 环境会提升为display；matrix等环境、花括号组和注释中的行分隔符不会因此提升。

知乎图片公式先验证资源URL，以有效图片上的eeimg=1/2或equation URL识别公式；只有非标准emimg但URL可识别的短公式仍按默认行内处理。短的纯公式段落、figure容器或较宽的图源本身不构成display语义。行内附件在当前视觉行放不下时，系统仍可自然换行，这与独立公式block是不同层次。深层strong/span/link等包装中的display公式也要提取到独立block，同时保留前后文字格式、段落身份和源offset；仅紧邻display的br被吸收以免多一个空行，其他br保留。

这次补齐新增6项合成测试，覆盖10种HTML结构输入；8个稳定fixture分析通过，345/78处行内公式数量保持。没有运行参考app或引入本地TeX。

随后真机反馈暴露了宿主结构问题：article的公式类型全部inline，但裸列表项中的img被通用blocks分组单独切成paragraph，仍会让短公式另起一行。修复后，列表项内前后文字与公式共同编入一个段落；bare li/quote/div/root、display与普通图边界及真实article原句均有回归。该案例10个列表项的内部段落从25恢复10，全篇paragraph从95恢复80，单公式段从8变0。用户已确认短公式行内修复。WebView使用KaTeX且对矩阵采用更宽的display策略，Native继续保留源数学语义，不能把公式类型数量相同当作完整视觉一致。

参考 `MdAst.kt:548–680` 除上述规则外，还将LaTeX源长度大于4096的公式提升为独立可滚动块，服务于其本地TeX与超长图源容错。本仓没有照搬该阈值，也没有实现完整显示数学横滚：当前以SVG/图片资源显示公式，独立公式仍缩放到可用宽度，没有本地LaTeX排版工具链。超长URL或失败图源的完整数学呈现仍是差异，语义扫描不能替代数学引擎。

### 知识点高亮

三种结构具有不同来源：普通 `highlight` 对应 `mark` 背景高亮；`segment` 对应接口 `segment_infos` 中的范围标记；`segmentHighlight` 对应已嵌入 HTML 的 `highlight-wrap` 划线。

业务元数据不完整时仍保留 `segmentHighlight.children`，不能把视觉划线降级为普通背景高亮。`target` 的内容 ID/类型与 `location` 的段落 ID/范围各自成组验证；计数缺失不等于 0，点赞状态缺失不等于 false。

局部属性解析只确认 offset 是非负安全整数且 `start < end`，空范围不会生成可交互位置。段落实际长度、端点越界和文本对应需要完整规范化层结合段落内容校验。

`displayText` 可以是跨段菜单/复制文本。当前片段的 `children` 和本段 UTF-16 半开范围 `[start, end)` 仍单独保留，不能依据全量 `displayText` 重算段内偏移。后续交互应根据具体动作验证目标、片段 IDs 和位置；缺失字段不能补造为空 ID 或 0 偏移。

### 容错与运行时边界

HTML 解析、链接协议验证、未知节点诊断和资源校验应集中在规范化层。一次解析所需的脚注与上下文应作为局部状态传递，避免全局可变文档状态影响并发处理。类型声明和局部属性解析不代表完成了 HTML 清洗。

各候选 backend 通过 adapter 复用 `ZhihuDocument` 的语义和资源边界。连续文字进一步编译为 Rich Text IR，由所选文本引擎负责排版；图片画廊与遍历仍复用同一套内容语义，平台字体、主题、选择宿主、资源请求和业务 mutation 留在运行时层。

编译层需将段落内 UTF-16 offset 映射为 flow 全局范围，保留插入的换行、列表标记与 `U+FFFC` attachment 占位。原生选择和知识点动作必须经 source map 返回原始节点/段落位置；现有段内范围和 WebView 选择类型不等于这一协议已经实现。文本 flow 合并和媒体边界的选择能力见 [Renderer V2 计划](./renderer-v2-plan.md)。
