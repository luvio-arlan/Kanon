# KANON Editorial Craft & Interaction Constitution

> 最高准绳：**极度克制、零跳动丝滑、边界自洽、光学零容错。** 凡标有 `[guard]` 的条款均由 `pnpm check` 机械拦截，AI 写完代码即刻自验。

## 1. 文案极简与减法布局（Zero Ornamental Microcopy & Subtraction）

- **删无可删**：屏幕上的每个字都必须直接服务于用户当下操作；删掉后意图不变的文字一律删除。
- **严禁凑字与复杂化**：禁止页脚技术标签与交易标语堆砌（如 `SEC XBRL / +86 独立加密存储`、工作台底部铁律标语）、工作台重复营销口号与英文装饰眉题、主标题下方冗余解释副文案、内部版本号与路线图年份（`v4.0` / `未来十年`）、以及注册/首屏里的非必要配置开关。
- **严禁泄露底层研发术语** `[no-user-facing-db-jargon]`：面向用户的客户端功能层（`apps/web/src/features/**`）禁止出现 `Postgres`、`PostgreSQL`、`落库` 等基础设施术语，统一使用自然中文（「保存」「创建」）。
- **顶栏减法与卡片三层上限**：工作台顶栏只保留核心主入口（搜索 / 工具收纳菜单 / 主题 / 主行动按钮 / 账号）；风险信号仅在存在真实预警或买点时内联浮现；总览卡片严禁堆砌长篇假设折叠墙，最多保留「身份进度 + 估值锚点 + 精简信号与下一步直达」三层结构，深度信息下沉至右侧 `Sheet` 抽屉或五步画布。
- **新手引导与步骤连续性**：首访或研究尚未闭环时展示可一键收起的三步引导卡（以服务端读取的 Cookie 持久化状态，零闪屏、零布局抖动）；卡片行动按钮直达该标的下一个未完成步骤（`/thesis/[id]?step=N`），画布侧栏静默同步 `?step=N`。
- **职责唯一**：`kanon.hk` 是唯一品牌官网；`app.kanon.hk` 是纯净工作台（未登录 HTTP 307 直达极简登录门户），应用内不维护第二套营销页，品牌 Logo 直接点击回官网，不额外堆放「返回官网」文字链。

## 2. 零跳动丝滑切换（Zero-Jump Silky Transitions）

- **固定顶部锚点与舒适视觉重心**：同组高度不同的 Tab 视图（如 `登录 | 注册`）**必须**采用固定上边距（`items-start pt-[clamp(48px,15vh,148px)]`），兼顾登录态重心稳定与切换注册态零垂直跳动，严禁 `items-center` 导致 Tab 行随内容高度上下跳动。
- **锁定滚动条槽位防横向抖动** `[css-scrollbar-gutter-stable]`：`packages/ui/src/styles/theme-bridge.css` 的 `html` 必须声明 `scrollbar-gutter: stable`，防止不同高度的 Tab 视图在滚动条显隐瞬间引起居中版面左右跳动 15px。
- **严禁 Tab 高度塌陷与模糊重绘** `[no-mode-wait-tab-collapse]` `[no-filter-blur-transition]`：客户端功能层严禁对 Tab/步骤面板使用导致空白塌陷帧的 `<AnimatePresence mode="wait">` 或触发 GPU 重绘的 `filter: "blur(...)"`；统一使用容器 `min-h` 托底 + 零位移透明度淡入（`KANON_LENS_VARIANTS`）+ 过阻尼滑块（`KANON_TAB_TRANSITION`）。
- **焦点轮廓层级纪律** `[css-layered-focus-visible]`：`packages/ui/src/styles/editorial.css` 的全局 `:focus-visible` 规则必须包在 `@layer base` 内，严禁无层级规则覆盖 Tailwind `focus-visible:outline-none` 导致点击 Tab 叠出双层橙框。
- **0ms 即时切换 + 静默 URL 同步**：同域高频模式切换（如 `登录 ↔ 注册`、画布 `Step 1–5`）使用本地状态瞬切并保留已填公共字段（如手机号），用 `window.history.replaceState` 同步地址栏，杜绝跨路由网络往返、整屏白闪与外层舞台重播动画。
- **禁止顶部闪烁进度条** `[no-route-progress-bar]`：严禁挂载全局顶部红条/加载条组件（`RouteProgressBar` / `NextTopLoader`）。

## 3. 表单与密码边界纪律（Bounded Inputs & Auth Policy）

- **浏览器自动填充去蓝底** `[css-autofill-hygiene]`：`packages/ui/src/styles/editorial.css` 必须统一覆盖 `:-webkit-autofill` / `:autofill`（使用 `--autofill-bg` 与 `--ink-primary` 语义变量），所有透明画布下划线输入框必须挂载 `.kanon-input-canvas`，确保浅色暖白与深色暗夜下均彻底消除浏览器默认蓝底。
- **密码输入框强制截断** `[bounded-password-input]`：所有密码 `<input>` 必须声明 `maxLength={PASSWORD_MAX_LENGTH}`（并在 `onChange` 中同步截断），杜绝超长输入溢出下划线框。
- **强密码统一契约**（`auth-contracts.test.ts` 校验）：长度 `8–24` 位，必须同时包含 **英文字母 + 数字 + 符号**，前后端 Zod 与实时强度条共享单一真源。

## 4. 官网与 SVG 光学精度（Optical Motion Precision）

- **配色克制**：95% 暖纸白 / 暗夜黑曜石 + 天然钛金中性灰，仅在核心结论或主行动点使用单一珊瑚橙（`--accent-coral`）。
- **禁止圆点变形** `[svg-no-distorted-circles]`：含 `<circle>` 的 `<svg>` 严禁使用 `preserveAspectRatio="none"`，并为端点光晕预留安全 `viewBox` 边距与 `overflow: visible`。
- **禁止动画飞出** `[svg-beacon-fill-box]`：所有带动画且使用 `transform-origin: center` 的 SVG 子元素样式**必须**同时声明 `transform-box: fill-box`。
- **禁止描边截断** `[svg-pathlength-draw]`：所有 `stroke-dashoffset` 描边动画路径**必须**声明 `pathLength="100"`（配 `stroke-dasharray: 100`），严禁手填像素估算值；关联阴影与端点圆点须与主曲线共享缓动并编排时序。
