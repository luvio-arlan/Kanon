# KANON — 美股投资逻辑操作系统（PRD v6.0）

> 版本：v6.0（机构买方级全栈投研闭环） | 日期：2026-11-25 | 定位：Linear 级美股深度研究、财务法证与交易纪律操作系统 | 形态：桌面优先 Web 应用

## 1. 品牌定稿、视觉标识与产品定位

- **品牌名称**：`KANON`（中文名：**卡农**）
- **英文 Slogan**：`Conviction, composed.` / `Quiet precision for long-term minds.`
- **中文宣传语**：**在噪音里，谱出自己的确定性。**
- **产品定位**：面向严肃个人价值投资者与买方投研团队的 **基本面投资逻辑操作系统（Investment Thesis OS）**——把听来的观点，炼成自己算出来的底气。
- **视觉气质**：Swiss Editorial（瑞士编辑级极简）+ Apple Natural Titanium（苹果原色钛金属）工业克制，95% 单色中性画布 + 暖珊瑚橙唯一焦点强调色，支持暖白纸面（Light）与暗夜黑曜石（Dark）双主题。

### 硬边界（Non-Goals — 坚决不做什么）

1. 不做实时盯盘 K 线终端或券商下单通道（仅提供按需收盘参考价校准，拒绝盘中噪音）。
2. 不做「直接给买卖建议」的算命聊天框（所有 AI 能力均证据优先、人机共审）。
3. 不做打卡徽章或连击分数游戏化（拒绝虚假安全感）。
4. 不做社交喊单社区（保持独立思考的安静空间）。

## 2. 核心投研闭环（v4.0）

`Smart Ticker 智能建档 → Step 1 商业质量评估 & 预期差/逆向推演 → Step 2 3–5 条可证伪假设 & 反向质询 → Step 3 14 项 SEC 财务法证 / 8 季 10-Q 拐点 / 原文划词精读 / 双向产业链互证 → Step 4 双引擎估值（PE + 营收拆解 + EV/Owner-FCF + Reverse-DCF + TSR 归因 + 5×5 敏感度） → Step 5 零杠杆交易纪律 / 季度财报复盘 / 认知演进 Diff / 一页纸 IC Memo → 组合风控与并排对比`

## 3. 核心能力模块

### 3.1 全局驾驶舱与组合风控（Cockpit & Portfolio）

- **Bento 卡片与赔率矩阵双视图**：支持按默认编号、赔率比、CAGR、安全边际排序，并支持按需一键校准最新收盘参考价（无密钥降级适配）。
- **组合风控、信号雷达与压力测试矩阵（Attention Radar & Stress Test）**：聚合已配仓位、现金缓冲、赛道集中度（>35% 提醒）、单票超上限提醒与 HHI 集中度，提供 4 种宏观压力情景（基准、估值杀跌 -20%、共振熊市、重仓赛道回撤）及半凯利资金配置阶梯抽屉。
- **仓位纪律编辑器与半凯利建议**：在驾驶舱快捷抽屉中管理 `watchlist / starter / core / exited` 仓位角色、当前权重、单票上限与持仓成本，并提供受个人上限约束的零杠杆半凯利保守建议区间。
- **2–3 只标的并排对比抽屉**：从赔率矩阵勾选 2–3 只标的，在宽幅抽屉中同屏对比买点、CAGR、安全边际、赔率比、成熟度、仓位、核心预期差与未来 18 个月争论。
- **组合认知校准与 IC 投研周报（Portfolio Calibration & Weekly Digest）**：聚合全仓决策情绪归因（冷静/犹豫/FOMO/恐慌胜率与平均偏离）、季度裁决分布、Half-Kelly 建议与未实现盈亏对照，并一键生成与复制 Markdown 格式周报（`GET /api/portfolio/calibration`）。
- **数据可携带性与 MCP Server v2**：支持导出全量 `archive.json`（含 `catalysts / quarterlyReviews / copilotOutputs / agentRuns` lossless v3）与 `POST /api/import/thesis`；提供基于 `read` / `read_write` 分级 PAT 的 Streamable HTTP MCP Server（6 只读 + 3 读写工具）。

### 3.2 五步引导式研究画布（零丢失草稿引擎）

所有可编辑步骤共享统一的零丢失草稿引擎（`localStorage` 自动备份、12 步撤销、`⌘S` 快捷保存、远端版本同步及切换步骤未保存拦截）：

1. **Step 1 商业质量评估与买方脚手架**：四维商业质量评估 + 市场一致预期 / 核心预期差（Variant Perception）/ 18 个月核心分歧 / 逆向压力推演（Downside Scenario）+ SEC 基本盘速览。
2. **Step 2 弹性 3–5 条核心可证伪假设**：支持增删与上下排序，嵌入「反向质询（Counter-Thesis）」一键生成证伪路径并带入 Step 5 离场条件。
3. **Step 3 法证 SEC XBRL、原文精读与双向产业链互证**：
   - 14 项法证年度财报解析（ROIC、ROIIC 增量资本回报、Rule of 40、Sloan 应计项占比、OCF/净利润、Owner FCF = FCF - SBC、SBC/OCF、股本稀释、净现金、0–100 机构级法证质量评级与 6 项风险警示）、近 8 季 10-Q 同比拐点表，以及 `10-K/10-Q/20-F/8-K/DEF 14A` 原文索引。
   - **一阶原文精读器（Source Clipper）**：支持按「资本开支 / 毛利定价 / 订单库存 / 现金流回购」分类筛选并自动高亮买方信号词，划词一键摘录至 Step 3 产业链互证或 Step 5 离场条件。
   - **双向产业链互证联动**：支持关联库内其他标的档案，并在被关联标的画布中自动聚合「来自库内关联标的的双向互证」。
4. **Step 4 双引擎估值与反向预期工作台**：
   - 三情景估值滑块 + 单调性防错 + 5×5 EPS/PE 敏感度矩阵。
   - 渐进披露三视角切换：`核心三情景 | 营收拆解 / EV-FCF | Reverse-DCF & TSR`（支持自上而下营收/净利率/股本回填中性 EPS、EV/Owner-FCF 股权桥接、二分法 Reverse-DCF、TSR 三因子归因、10%/15%/20%/25% IRR 买点阶梯与凯利盈亏平衡胜率 `p*`）。
5. **Step 5 交易纪律、季度复盘、IC Memo 与演进 Diff**：
   - 交易前强制零杠杆约束（未勾选零杠杆后端返回 400 拦截）。
   - **季度财报复盘闭环**：逐条判定核心假设「强化 / 持平 / 削弱」并自动同步更新 Step 2 状态。
   - **跨季度认知演进 Diff**：基于不可篡改的版本快照，可视化对比任意历史节点与当前的现价、目标价、赔率、成熟度与假设状态迁移。
   - **一页纸 IC Memo & 印刷级 PDF**：支持 `@media print` 干净排版打印与多格式导出。

### 3.3 多角色投委会 Agent（SSE 持久化 + 人机共审 Diff）

- 依次调度 9 大工具（含 SEC 财务法证评分与 CCC 现金转换周期、BM25 原文段落检索 `search_sec_filing_excerpts`、Reverse-DCF 压力测试、假设盲区、产业链口径分歧、仓位与零杠杆纪律、季度复盘与目标价漂移审计、实时盘前/盘后体制校准、催化剂与价值陷阱核查），通过 SSE 实时展示可中止工具轨迹与历史运行回放，开展四角色投委会辩论并支持多轮投委会追问（`POST /api/ai/agent/ask`），以及 `PE / EV-FCF` 双主锚模型、假设-印证双向血缘挂载与原件持久化缓存（`sec_filing_documents_cache`）。
- 审计结果持久化存储于 PostgreSQL（`agent_runs`），通过事务级 `POST /api/ai/agent/apply` 支持单条或一键批量人机共审原子回写 Step 1 / Step 2 / Step 3 / Step 5（含数值溯源校核与 `expectedUpdatedAt` OCC 并发冲突保护）。

## 4. 视觉设计系统与唯一组件库契约

- **唯一组件体系**：`HeroUI v3` (`@heroui/react` + `@heroui/styles`) + `React Aria` + `NumberFlow` + `Recharts` + `Tabler Icons`（统一 `stroke={1.5}`），全部封装于 `packages/ui`。
- **色彩与排版**：语义 CSS 变量统一定义于 `packages/ui/src/styles/tokens.css` 与 `theme-bridge.css`（业务代码严禁硬编码 Hex）；数字、代码、比率强制 `JetBrains Mono` + `tabular-nums`；正文最低字号 `12px`。

## 5. 技术架构与 AI-Native Garden 代码库门禁

- **Monorepo**：`Turborepo + pnpm`（`apps/web` + `packages/ui` + `packages/core` + `packages/ai`）
- **数据层**：PostgreSQL（支持外部 `DATABASE_URL` 或本地持久化 PGlite）+ Drizzle ORM + 严格 Expand-Only 版本化迁移 + 动态反射 1:1 DDL 校验。
- **全自动机械门禁（零豁免、零回退）**：
  - `pnpm check`：`Biome` + `tsc --noEmit` + `dependency-cruiser` + AST 规模与审美守卫（`<= 250` 行/文件、`<= 50` 行/函数、嵌套 `<= 3`、单目录 `<= 12` 文件、零未校验 JSON 强转、零静默空 `catch`、零客户端 `@kanon/ai` 运行时导入、文档同步校验）+ `knip` 死代码清零。
  - `pnpm test`：Vitest 金融数学 Golden 测试、1:1 动态 DDL 校验、零杠杆铁律与 AI/DB 契约测试。
  - `pnpm test:api`：动态盘点全部 30 个 API 路由并在隔离数据库实例中端到端校验 HTTP 契约、CSRF、OCC、MCP 作用域与 SSR 渲染。
