# KANON Editorial Craft & Interaction Constitution

> 最高准绳：**极度克制、零跳动丝滑、边界自洽、光学零容错。** 凡标有 `[guard]` 的条款均由 `pnpm check` 机械拦截，AI 写完代码即刻自验。

## 1. 文案极简（Zero Ornamental Microcopy）

- **删无可删**：屏幕上的每个字都必须直接服务于用户当下操作；删掉后意图不变的文字一律删除。
- **严禁凑字与复杂化**：禁止页脚技术标签堆砌（如 `SEC XBRL / +86 独立加密存储`）、主标题下方冗余解释副文案、内部版本号与路线图年份（`v4.0` / `未来十年`）、以及注册/首屏里的非必要配置开关。
- **职责唯一**：`kanon.hk` 是唯一品牌官网；`app.kanon.hk` 是纯净工作台（未登录 HTTP 307 直达极简登录门户），应用内不维护第二套营销页，品牌 Logo 直接点击回官网，不额外堆放「返回官网」文字链。

## 2. 零跳动丝滑切换（Zero-Jump Silky Transitions）

- **固定顶部锚点，禁止垂直跳动**：同组高度不同的 Tab 视图（如 `登录 | 注册`）**必须**采用固定上边距（如 `items-start pt-[clamp(24px,9vh,88px)]`），严禁 `items-center` 垂直居中导致 Tab 行随内容高度上下跳动。
- **0ms 即时切换 + 静默 URL 同步**：同域高频模式切换（如 `登录 ↔ 注册`）使用本地状态瞬切并保留已填公共字段（如手机号），用 `window.history.replaceState` 同步地址栏，杜绝跨路由网络往返、整屏白闪与外层舞台重播动画。
- **丝滑微动效**：Tab 行单行排布，激活线用 `layoutId` + `KANON_SPRING` 弹簧滑行；内容区用 `AnimatePresence mode="popLayout"` 做轻柔方向横移（`~220ms`，`cubic-bezier(0.22, 1, 0.36, 1)`）。
- **禁止顶部闪烁进度条** `[no-route-progress-bar]`：严禁挂载全局顶部红条/加载条组件（`RouteProgressBar` / `NextTopLoader`）。

## 3. 表单与密码边界纪律（Bounded Inputs & Auth Policy）

- **密码输入框强制截断** `[bounded-password-input]`：所有密码 `<input>` 必须声明 `maxLength={PASSWORD_MAX_LENGTH}`（并在 `onChange` 中同步截断），杜绝超长输入溢出下划线框。
- **强密码统一契约**（`auth-contracts.test.ts` 校验）：长度 `8–24` 位，必须同时包含 **英文字母 + 数字 + 符号**，前后端 Zod 与实时强度条共享单一真源。

## 4. 官网与 SVG 光学精度（Optical Motion Precision）

- **配色克制**：95% 暖纸白 / 暗夜黑曜石 + 天然钛金中性灰，仅在核心结论或主行动点使用单一珊瑚橙（`--accent-coral`）。
- **禁止圆点变形** `[svg-no-distorted-circles]`：含 `<circle>` 的 `<svg>` 严禁使用 `preserveAspectRatio="none"`，并为端点光晕预留安全 `viewBox` 边距与 `overflow: visible`。
- **禁止动画飞出** `[svg-beacon-fill-box]`：所有带动画且使用 `transform-origin: center` 的 SVG 子元素样式**必须**同时声明 `transform-box: fill-box`。
- **禁止描边截断** `[svg-pathlength-draw]`：所有 `stroke-dashoffset` 描边动画路径**必须**声明 `pathLength="100"`（配 `stroke-dasharray: 100`），严禁手填像素估算值；关联阴影与端点圆点须与主曲线共享缓动并编排时序。
