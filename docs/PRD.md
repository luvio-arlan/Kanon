# KANON — 全球基本面投资逻辑操作系统（PRD v7.0）

> 版本：v7.0（机构买方级深度投研操作系统） | 日期：2026-11-25 | 定位：Linear 级全球基本面深度研究、财务法证与交易纪律操作系统 | 形态：桌面优先 Web 应用

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

## 2. 核心投研闭环（v7.0）

`Smart Ticker 智能建档 → Step 1 商业质量评估 & 预期差/逆向推演（支持直达财务事实/隐含预期） → Step 2 可证伪假设 & 机读 KPI 自动校验 & 反向质询 → Step 3 全球 10-K/20-F 财务法证（多币种/ADR/Q4 反推/Form 4 XML）/ 全球手动 5Y 录入 / 多季研究资料库 / 原文精读 / 双向产业链互证 → Step 4 四视角估值工作台（三情景 + 联动经营模型/SOTP + RONIC Reverse-DCF + 5Y 估值分位与同业卖方预期） → Step 5 零杠杆硬闸门 / 交易↔持仓原子联动 / 季度复盘 / 演进 Diff / 一页纸 IC Memo → 因子簇压力测试与 Brier/Alpha 校准`

## 3. 核心能力模块

### 3.1 全局驾驶舱与组合风控（Cockpit & Portfolio）

- **Bento 卡片与赔率矩阵双视图**：支持按默认编号、赔率比、CAGR、安全边际排序，并支持按需一键校准最新收盘参考价（无密钥降级适配）；视图 / 筛选 / 排序静默同步为 `?view=&filter=&sort=`，刷新、分享链接或从画布返回都落在原视图。
- **零点击智能建档**：输入代码后失焦即自动识别公司、实时报价、最新 SEC EPS 与 6 个月走势；常用样本与空态一键建档同样先拉取实时报价，绝不使用过期预设价。
- **组合风控、因子簇压力测试与信号雷达（Attention Radar & Factor Stress）**：聚合已配仓位、现金缓冲、赛道集中度（>35% 提醒）、单票超上限提醒与 HHI 集中度，识别隐藏的**真实因子暴露簇**（AI 算力/半导体、云软件久期、利率敏感、消费周期、地缘/ADR 等）并运行宏观压力情景及半凯利资金配置阶梯抽屉。
- **仓位纪律编辑器与交易台账联动**：在驾驶舱抽屉与 Step 5 画布内直接管理 `watchlist / starter / core / exited` 仓位角色、当前权重、单票上限与持仓成本；记录 `buy / add / trim` 交易动作时支持原子级自动重算持仓权重与加权成本。
- **2–3 只标的并排对比抽屉**：从赔率矩阵勾选 2–3 只标的，在宽幅抽屉中同屏对比买点、CAGR、安全边际、赔率比、成熟度、仓位、核心预期差与未来 18 个月争论。
- **去水分认知校准与 IC 投研周报（Honest Calibration & Weekly Digest）**：零杠杆作为 0/1 硬闸门（不充作虚假加分），基于真实决定的 **Brier 校准分**、**相对 SPY 基准超额 Alpha**、目标价漂移率与情绪归因计算真实投资纪律评分，并一键生成与复制 Markdown 格式周报（`GET /api/portfolio/calibration`）。
- **数据可携带性与 MCP Server v2**：支持导出全量 `archive.json`（含 `catalysts / quarterlyReviews / copilotOutputs / agentRuns / researchNotes` lossless v3）与 `POST /api/import/thesis`；提供基于 `read` / `read_write` 分级 PAT 的 Streamable HTTP MCP Server（6 只读 + 3 读写工具）。

### 3.2 五步引导式研究画布（零丢失草稿引擎）

五步名称（商业质量评估 · 核心假设与催化剂 · 一阶资料印证 · 三情景估值与赔率 · 纪律与备忘录）由 `@kanon/core` 的 `RESEARCH_STEP_META` 统一提供，侧栏、顶栏、翻页、卡片 CTA 与命令面板完全一致；画布内 `[` / `]` 切换标的保持当前步骤。

所有可编辑步骤共享统一的零丢失草稿引擎（`localStorage` 自动备份、12 步撤销、`⌘S` 快捷保存、远端版本同步及切换步骤未保存拦截）：

1. **Step 1 商业质量评估与买方脚手架**：四维商业质量评估 + 市场一致预期 / 核心预期差（Variant Perception）/ 18 个月核心分歧 / 逆向压力推演（Downside Scenario）+ 一键跳转「先看财务事实 → / 先看隐含预期 →」适应非线性的真实研究流。
2. **Step 2 弹性 3–5 条核心可证伪假设（活体 KPI 校验）**：支持增删、排序、绑定**机读 KPI 证伪规则**（按最新 SEC 财务事实自动计算实绩并一键同步强化/削弱状态），以及「反向质询（Counter-Thesis）」一键生成证伪路径并带入 Step 5 离场条件。
3. **Step 3 全球财务法证、多季研究资料库与双向产业链互证**：
   - 14 项法证年度财报解析（支持 10-K 与多币种外企 20-F 自动 FX 折算 + ADR 比例对齐、Q4 单季现金流 `FY - 9M` 反推、Form 4 XML 内部人买卖及 10b5-1 计划识别、ROIC/ROIIC/Rule of 40/Sloan 应计项/Owner FCF/净现金），并支持**全球非美股手动 5Y 财报录入**（`PUT /api/sec/[ticker]`，按租户隔离写入 `user_sec_overrides`）。
   - **持久研究资料库（Research Notes Library）**：按财报电话会 / 渠道调研 / 行业纪要 / 竞品备忘持续沉淀多季度研究笔记（`GET/POST/PATCH/DELETE /api/theses/[id]/notes`），并直接纳入 BM25 原文检索语料。
   - **一阶原文精读器（Source Clipper，6 MB 预算 + 去目录噪声）**：支持按「资本开支 / 毛利定价 / 订单库存 / 现金流回购」分类筛选并高亮买方信号词，划词一键摘录至 Step 3 产业链互证或 Step 5 离场条件。
   - **双向产业链互证联动**：支持关联库内其他标的档案，并在被关联标的画布中自动聚合「来自库内关联标的的双向互证」。
4. **Step 4 四视角估值、联动经营模型与同业基准工作台**：
   - `三情景`：三情景估值滑块 + 单调性防错 + 5×5 EPS/PE 敏感度矩阵。
   - `驱动 / SOTP`：三情景联动经营模型（营收→EBIT→NOPAT→SBC→CapEx→Owner FCF→累计净现金与股本→EPS/EV-FCF/EV-EBIT 估值）+ 多业务线分部加总（SOTP + 净现金 + 控股折价）+ 自上而下 EPS 拆解一键回填。
   - `Reverse DCF`：引入 **RONIC（增量投资资本回报率）再投资率约束**的真 Reverse-DCF，输出隐含再投资率、CAP 竞争优势期、TSR 三因子归因、10%/15%/20%/25% IRR 买点阶梯与凯利盈亏平衡胜率 `p*`。
   - `同业与预期`：实时拉取 5 年历史估值分位带（PE/EV-FCF）、卖方一致预期对照与真实行业可比公司估值/增长/毛利率横评（`GET /api/market/benchmarks`）。
5. **Step 5 交易纪律、仓位联动、季度复盘与 IC Memo**：
   - 交易前强制零杠杆约束（未勾选零杠杆后端返回 400 拦截）；画布内直接集成仓位纪律编辑器，记录增/减仓时自动同步当前仓位与加权成本并记录同期 SPY 基准价。
   - **季度财报复盘闭环**：逐条判定核心假设「强化 / 持平 / 削弱」并自动同步更新 Step 2 状态。
   - **跨季度认知演进 Diff**：基于不可篡改的版本快照，可视化对比任意历史节点与当前的现价、目标价、赔率、成熟度与假设状态迁移。
   - **一页纸 IC Memo & 印刷级 PDF**：支持 `@media print` 干净排版打印与多格式导出。

### 3.3 自主调工具多角色投委会 Agent（跨语言检索 + SSE 持久化 + 人机共审 Diff）

- 结合 9 项确定性底稿工具 + Vercel AI SDK **自主多步 Tool-Calling 循环（最多 4 步）**，Agent 可按需自主调用 `search_primary_filings`（支持中英金融同义词扩展与 `¶N` 段落坐标，同时检索 10-K/10-Q 与研究资料库）、`inspect_financial_history`、`audit_guidance_credibility` 与 `check_peers_and_consensus`，将完整研究档案与自主取证上下文送入四角色投委会辩论及 **Ask IC 多轮追问**（`POST /api/ai/agent/ask`）。
- 审计结果持久化存储于 PostgreSQL（`agent_runs`），通过事务级 `POST /api/ai/agent/apply` 支持单条或一键批量人机共审原子回写 Step 1 / Step 2 / Step 3 / Step 5（含数值溯源校核与 `expectedUpdatedAt` OCC 并发冲突保护）。

## 4. 视觉设计系统与唯一组件库契约

- **唯一组件体系**：`HeroUI v3` (`@heroui/react` + `@heroui/styles`) + `React Aria` + `NumberFlow` + `Recharts` + `Tabler Icons`（统一 `stroke={1.5}`），全部封装于 `packages/ui`。
- **色彩与排版**：语义 CSS 变量统一定义于 `packages/ui/src/styles/tokens.css` 与 `theme-bridge.css`（业务代码严禁硬编码 Hex）；数字、代码、比率强制 `JetBrains Mono` + `tabular-nums`；正文最低字号 `12px`。

## 5. 技术架构与 AI-Native Garden 代码库门禁

- **Monorepo**：`Turborepo + pnpm`（`apps/web` + `packages/ui` + `packages/core` + `packages/ai`）
- **数据层**：PostgreSQL（支持外部 `DATABASE_URL` 或本地持久化 PGlite）+ Drizzle ORM + 严格 Expand-Only 版本化迁移 + 动态反射 1:1 DDL 校验。
- **全自动机械门禁（零豁免、零回退）**：
  - `pnpm check`：`Biome` + `tsc --noEmit` + `dependency-cruiser` + AST 规模/安全/审美守卫（`<= 250` 行/文件、`<= 50` 行/函数、嵌套 `<= 3`、单目录 `<= 12` 文件、逐 Handler AST CSRF 门禁、递归 Expand-Only 迁移检查、零 `active:scale-*`、零未校验 JSON 强转、零静默空 `catch`、零客户端 `@kanon/ai` 运行时导入、文档同步校验）+ `knip` 死代码清零。
  - `pnpm test`：Vitest 金融数学 Golden 测试、1:1 动态 DDL 校验、零杠杆铁律与 AI/DB 契约测试。
  - `pnpm test:api`：动态盘点全部 32 个 API 路由并在隔离数据库实例中端到端校验 HTTP 契约、CSRF、OCC、MCP 作用域与 SSR 渲染。
