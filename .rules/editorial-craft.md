# KANON Editorial Craft & Interaction Constitution

> 最高准绳：**极度克制、零跳动丝滑、边界自洽、光学零容错。** 凡标有 `[guard]` 的条款均由 `pnpm check` 机械拦截，AI 写完代码即刻自验。

## 1. 文案极简与减法布局（Zero Ornamental Microcopy & Subtraction）

- **删无可删**：屏幕上的每个字都必须直接服务于用户当下操作；删掉后意图不变的文字一律删除。
- **严禁凑字与复杂化**：禁止页脚技术标签与交易标语堆砌（如 `SEC XBRL / +86 独立加密存储`、工作台底部铁律标语）、工作台重复营销口号与英文装饰眉题/斜体副标题（如 `STEP 01`、`Quality Assessment`、`IC Framework`）、主标题/弹窗/抽屉下方冗余解释副文案、内部版本号与路线图年份（`v4.0` / `未来十年`）、以及注册/首屏里的非必要配置开关。
- **严禁泄露底层研发术语** `[no-user-facing-db-jargon]`：面向用户的客户端功能层（`apps/web/src/features/**`）禁止出现 `Postgres`、`PostgreSQL`、`落库` 等基础设施术语，统一使用自然中文（「保存」「创建」）。
- **买方机构级典雅文案纪律** `[institutional-copy-hygiene]`：面向投资者的界面、导出文档与 AI 提示词严禁出现口语、惊悚、戏谑或生硬直译词（如 `事前验尸`、`商业模式滤镜`、`商业滤镜`、`水电煤`、`死因链条`、`红队挑刺`、`红队拷问`、`苛刻空头`、`恐慌想割`、`法证体检`、`法证排雷`、`印钞机`、`烧钱黑洞`、`拍脑袋`、`一票否决`、`真·反向`），统一使用克制、典雅的买方投委会专业术语（如「商业质量评估」「逆向压力推演」「反向质询」「财务法证」「暂不纳入」「离场条件」）。
- **正文术语静默排版** `[no-jarring-inline-mono-glossary]`：行内术语解释触发器（`GlossaryPopoverCard`）必须继承正文衬线/无衬线字体与字号，仅以克制点状细下划线提示可交互，严禁在中文段落中强制插入粗等宽字体（`font-mono`）与橙色虚线破坏阅读流。
- **顶栏减法与卡片三层上限**：工作台顶栏只保留核心主入口（搜索 / 工具收纳菜单 / 主题 / 主行动按钮 / 账号）；风险信号仅在存在真实预警或买点时内联浮现；总览卡片严禁堆砌长篇假设折叠墙，最多保留「身份进度 + 估值锚点 + 精简信号与下一步直达」三层结构，深度信息下沉至右侧 `Sheet` 抽屉或五步画布。
- **五步命名单一真源** `[single-source-step-names]`：五步画布的标题、短名与编号只能取自 `@kanon/core` 的 `RESEARCH_STEP_META` / `getResearchStepMeta`（商业质量评估 · 核心假设与催化剂 · 一阶资料印证 · 三情景估值与赔率 · 纪律与备忘录），严禁在侧栏、顶栏胶囊、底部翻页、卡片 CTA 或命令面板里自建标签映射。
- **视图状态可回溯**：工作台视图 / 筛选 / 排序以 `?view=&filter=&sort=` 静默同步地址栏并在会话内记忆，从画布返回、刷新或分享链接都落在原视图；画布内 `[` / `]` 切换标的保持当前步骤。
- **零新手引导与步骤连续性**：严禁在工作台堆砌新手引导教程卡或说教文案；卡片行动按钮直达该标的下一个未完成步骤（`/thesis/[id]?step=N`），画布侧栏静默同步 `?step=N`。
- **职责唯一**：`kanon.hk` 是唯一品牌官网；`app.kanon.hk` 是纯净工作台（未登录 HTTP 307 直达极简登录门户），应用内不维护第二套营销页，品牌 Logo 直接点击回官网，不额外堆放「返回官网」文字链。

## 2. 零跳动丝滑切换（Zero-Jump Silky Transitions）

- **固定顶部锚点与舒适视觉重心**：同组高度不同的 Tab 视图（如 `登录 | 注册`）**必须**采用固定上边距（`items-start pt-[clamp(48px,15vh,148px)]`），兼顾登录态重心稳定与切换注册态零垂直跳动，严禁 `items-center` 导致 Tab 行随内容高度上下跳动。
- **锁定滚动条槽位防横向抖动** `[css-scrollbar-gutter-stable]`：`packages/ui/src/styles/theme-bridge.css` 的 `html` 必须声明 `scrollbar-gutter: stable`，防止不同高度的 Tab 视图在滚动条显隐瞬间引起居中版面左右跳动 15px。
- **严禁 Tab 高度塌陷与模糊重绘** `[no-mode-wait-tab-collapse]` `[no-filter-blur-transition]`：客户端功能层严禁对 Tab/步骤面板使用导致空白塌陷帧的 `<AnimatePresence mode="wait">` 或触发 GPU 重绘的 `filter: "blur(...)"`；统一使用容器 `min-h` 托底 + 零位移透明度淡入（`KANON_LENS_VARIANTS`）+ 过阻尼滑块（`KANON_TAB_TRANSITION`）。
- **焦点轮廓层级纪律** `[css-layered-focus-visible]`：`packages/ui/src/styles/editorial.css` 的全局 `:focus-visible` 规则必须包在 `@layer base` 内，严禁无层级规则覆盖 Tailwind `focus-visible:outline-none` 导致点击 Tab 叠出双层橙框。
- **0ms 即时切换 + 静默 URL 同步**：同域高频模式切换（如 `登录 ↔ 注册`、画布 `Step 1–5`）使用本地状态瞬切并保留已填公共字段（如手机号），用 `window.history.replaceState` 同步地址栏，杜绝跨路由网络往返、整屏白闪与外层舞台重播动画。
- **禁止顶部闪烁进度条与装饰红条** `[no-route-progress-bar]`：严禁挂载全局顶部红条/加载条组件（`RouteProgressBar` / `NextTopLoader`），并禁止在顶栏胶囊底边、侧栏或卡片顶部叠放多余珊瑚红进度细条。
- **用户无感自动保存**：五步画布（商业质量、核心假设、催化剂、交叉验证、三情景估值）均在编辑停顿后静默防抖自动保存（采用键序无关规范比对 + 已落盘哈希去重 + 160ms 延迟微指示 + 15s 超时兜底）并在切换步骤时自动刷新落盘；同一编辑会话 5 分钟内的同步骤修订在服务端合并为单条演进日志，严禁弹出刺眼的「未保存草稿横幅」「离开确认弹窗」或频繁成功 Toast，顶栏同步状态锁定固定宽度槽位（零横向位移），仅在网络较慢或失败时轻声提示并提供重试入口。
- **纸面细线写作网格与结论先行 Agent 抽屉**：多栏投研写作区（如预期差四象限、投资论点、假设编辑卡）采用 `1px` 细线分隔的纸面无框输入（`variant="editorial"`），悬停/聚焦时渐显示例与管理控件，杜绝白卡内套多层灰框输入框的廉价表单感；投委会 Agent 抽屉以「综合裁决 → 四角色细线辩论 → 修订提案 → 默认折叠的极简核验轨迹」结论先行编排，杜绝双层叠卡、刺眼亮绿进度条与毫秒级开发日志噪音。
- **同心圆角几何系统** `[semantic-radius-only]` `[css-concentric-tokens-and-motion]`：所有嵌套圆角必须满足光学同心法则 `R_inner = max(6px, R_outer - padding)`，严禁在组件中散落裸 Tailwind 圆角（`rounded-sm/md/lg/xl/2xl/3xl`），统一消费 6 级语义圆角令牌：`rounded-card (20px)` → `rounded-panel (14px)` → `rounded-control (10px)` → `rounded-item (8px)` → `rounded-badge (6px)` → `rounded-pill`。
- **统一阻尼曲线与入慢出快纪律** `[css-concentric-tokens-and-motion]`：交互过渡统一收敛到 `--ease-kanon (0.22, 1, 0.36, 1)`、`--ease-overlay (0.32, 0.72, 0, 1)` 与 `--ease-exit (0.4, 0, 1, 1)`；浮层退场时长严格短于入场，按压反馈采用纯色阶加深（禁止缩放抖动），所有关键帧动画必须挂载 `@media (prefers-reduced-motion: reduce)` 兜底。
- **下拉菜单与控件精工标准** `[no-native-select]`：严禁使用浏览器原生 `<select>`；统一下拉采用 `@kanon/ui` `ActionMenu`（`rounded-panel` 面板 + `p-1.5` + `rounded-item` 选项、内置 `selected` 对齐勾选列、`.kanon-chevron` 旋转与 `data-placement` 方向原点）；表单输入采用微凹 `--shadow-input` 质感与 `resize-none`，杜绝卡内叠卡阴影与浏览器默认拖拽斜杠；分段器（`ButtonGroup`）采用微凹托盘 + 仅选中项浮起白卡 + CSS Grid 隐形等宽占位（切换选中态、显隐状态圆点与字重加粗时严格 `0px` 横向抖动）。

- **悬浮提示零裁切纪律** `[no-permanent-clip-path-forwards]` `[no-clipped-floating-overlay]`：使用 `clip-path: inset(...)` 的入场 `@keyframes` 终态**必须**释放为 `clip-path: none`（严禁残留 `inset(0 0 0 0)`）；凡带 `absolute` + 负偏移/上方悬浮（`-top-*` / `bottom-full` / `-translate-y-full`）的提示徽章或浮层，严禁嵌套在 `overflow-hidden` / `overflow-clip` / `kanon-sparkline-reveal` 容器内部，必须置于外层非裁切节点或 Portal。

## 3. 表单与密码边界纪律（Bounded Inputs & Auth Policy）

- **浏览器自动填充去蓝底** `[css-autofill-hygiene]`：`packages/ui/src/styles/editorial.css` 必须统一覆盖 `:-webkit-autofill` / `:autofill`（使用 `--autofill-bg` 与 `--ink-primary` 语义变量），所有透明画布下划线输入框必须挂载 `.kanon-input-canvas`，确保浅色暖白与深色暗夜下均彻底消除浏览器默认蓝底。
- **密码输入框强制截断** `[bounded-password-input]`：所有密码 `<input>` 必须声明 `maxLength={PASSWORD_MAX_LENGTH}`（并在 `onChange` 中同步截断），杜绝超长输入溢出下划线框。
- **强密码统一契约**（`auth-contracts.test.ts` 校验）：长度 `8–64` 位（对齐 NIST 800-63B），必须同时包含 **英文字母 + 数字 + 符号**，前后端 Zod 与实时强度条共享单一真源。

## 4. 官网与 SVG 光学精度（Optical Motion Precision）

- **配色克制**：95% 暖纸白 / 暗夜黑曜石 + 天然钛金中性灰，仅在核心结论或主行动点使用单一珊瑚橙（`--accent-coral`）。
- **禁止圆点变形** `[svg-no-distorted-circles]`：含 `<circle>` 的 `<svg>` 严禁使用 `preserveAspectRatio="none"`，并为端点光晕预留安全 `viewBox` 边距与 `overflow: visible`。
- **禁止动画飞出** `[svg-beacon-fill-box]`：所有带动画且使用 `transform-origin: center` 的 SVG 子元素样式**必须**同时声明 `transform-box: fill-box`。
- **禁止描边截断** `[svg-pathlength-draw]`：所有 `stroke-dashoffset` 描边动画路径**必须**声明 `pathLength="100"`（配 `stroke-dasharray: 100`），严禁手填像素估算值；关联阴影与端点圆点须与主曲线共享缓动并编排时序。

## 5. 前端渲染性能与零冗余加载架构（Instant First Paint & Zero-Waste Runtime）

- **首屏零重型图表库** `[no-recharts-in-cockpit]`：Cockpit 主工作台严禁直接引入 `recharts` 或 `SecFinancialChart`，迷你走势统一使用零依赖纯 SVG 平滑样条组件 `<ValuationSparkline>`，消除首屏 250KB+ 图表依赖与 `ResizeObserver` 抖动。
- **重型浮层与次级视图按需分包**：次级视图、弹窗、抽屉与重型图表统一通过 `next/dynamic(..., { ssr: false })` 按需分包，并配合 `useHasOpened(open)` 延迟挂载，确保首次点击前零 chunk 下载、关闭时退场动画 100% 完整。
- **高频路径记忆化与单波次服务端引导**：`GlossaryText` 词典正则通过 `WeakMap` 跨组件共享编译一次；高密度 Bento 卡片使用 `React.memo` 与稳定回调；服务端鉴权以 `React.cache()` 单请求去重；画布 SSR 引导优先单波次并行查询，避免串联瀑布与无必要的 `@kanon/ai` 运行时加载。
