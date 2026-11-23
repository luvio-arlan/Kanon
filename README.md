<div align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/brand/深色logo.jpeg" />
    <source media="(prefers-color-scheme: light)" srcset="./assets/brand/浅色logo.jpeg" />
    <img alt="KANON（卡农）品牌标志" src="./assets/brand/浅色logo.jpeg" width="96" style="border-radius: 22px;" />
  </picture>

  <h1>KANON · 卡农</h1>

  <p><strong>Conviction, composed.</strong><br />在噪音里，谱出自己的确定性。</p>

  <p>
    面向深度美股个人投资者与买方投研机构的 <strong>Linear 级投资逻辑操作系统（Investment Thesis OS）</strong>。<br />
    帮你真正读懂一家公司、算清安全边际、沉淀跨季度研究记忆，把听来的观点炼成自己算出来的底气。
  </p>

  <p>
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16_App_Router-111113?style=flat-square" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-111113?style=flat-square" />
    <img alt="Tailwind v4 + HeroUI v3" src="https://img.shields.io/badge/UI-HeroUI_v3_+_Tailwind_v4-EA6B4A?style=flat-square" />
    <img alt="PostgreSQL + Drizzle" src="https://img.shields.io/badge/DB-PostgreSQL_+_Drizzle_ORM-16A34A?style=flat-square" />
    <img alt="AI-Native Gates" src="https://img.shields.io/badge/Gates-4--Layer_Zero_Slop-111113?style=flat-square" />
  </p>
</div>

---

## 为什么做 KANON（卡农）

大多数金融软件在制造焦虑：跳动的红绿 K 线、嘈杂的社区喊单、替你算命的聊天机器人。

**KANON** 反其道而行之。名字取自 **Canon（第一性原理与准则）** 与 **卡农（层层递进的复调与产业链交叉印证）**——融合 **Swiss Editorial 杂志级留白** 与 **Apple Natural Titanium（原色钛金属）** 工业克制，只服务一件事：**帮你用顶级买方研究方法，把一家好公司从头到尾看透、算清赔率、守住纪律。**

> **核心克制（Non-Goals）**：不做实时盯盘终端，不做直接给买卖建议的算命聊天框，不做游戏化打卡徽章，不做社交喊单社区，不做流量营销工具——纯粹服务个人投资者与买方投研机构的基本面深度研究、长期记忆复盘与价值投资。

---

## 核心闭环与五大产品能力

```text
新建美股标的 ─▶ Step 1 商业模式一票否决（含 SEC 多年度基本盘） ─▶ Step 2 拆解 3 条可证伪核心假设 + 红队拷问
                                                                          │
    投委会一页纸备忘录 / Google Drive 归档 ◀── Step 5 零杠杆铁律与复盘 ◀── Step 4 三情景估值与 5×5 敏感度 ◀── Step 3 SEC 财报、电话会精读与产业链互证
```

### 1. Swiss Bento 投资驾驶舱与赔率对比矩阵（`/`）

- **极简三层视觉秩序**：公司身份与等宽索引编号（`01 / 02`）→ 36px 估值锚点与去噪走势曲线 → 3 条清晰核心假设状态灯（翠绿验证 / 琥珀观察 / 绯红预警）。
- **卡片 ⇄ 全仓赔率对比矩阵**：一键切换至按赔率比（Upside / Downside）排序的买方决策对比表，横向检视所有跟踪标的的现价、中性目标、年化 CAGR、悲观回撤、假设验证度与五步研究成熟度；支持筛选「已否决归档」标的以保留过往排雷记忆。
- **灵动交互与 BYOK 引擎**：单条假设点击即弹开证伪红线与财报佐证；右上角支持直接在界面配置 **BYOK 大模型引擎（Gemini / Claude / OpenAI）**；全局 **`⌘K` 命令面板** 在驾驶舱与研究画布内全程可用。

### 2. 五步引导式研究画布（`/thesis/[id]`）

- **研究成熟度进度条 + 画布内 `⌘K`**：左侧导航栏实时计算 5 步研究完整度（`X/5`）与实时赔率锚点，底部支持线性前后步骤推进与标的归档 / 删除管理。
- **Step 1 · 商业模式一票否决滤镜 + SEC 多年基本盘**：从复购与水电煤属性、上下游定价权、ROIC / FCF 质量、管理层治理 4 大维度结构化打分，同屏对照 SEC 10-K 多年营收、毛利率、净利润、自由现金流与稀释 EPS 轨迹，不通过可直接「一票否决归档」。
- **Step 2 · 三条可证伪核心假设 + 红队挑刺（持久化落库）**：逼迫把看多逻辑收敛为 3 条带量化红线的核心假设；触发 **「魔鬼代言人（Devil's Advocate）」** 输出 3 条苛刻空头反驳与证伪路径，结果自动写入 PostgreSQL 并在 Step 5 支持一键带入为离场红线。
- **Step 3 · SEC EDGAR 一阶资料 + 电话会原文精读 + 上下游交叉验证**：直连官方免费 **SEC EDGAR API** 拉取 10-K / 10-Q 与多年度 XBRL 财报事实入库（绝不让大模型编造数字）；支持直接粘贴季度电话会 / 10-K 原文片段提炼指引与 CapEx 信号，并与上游 / 下游 / 竞对口径逐条交叉印证（支持点击切换一致 / 分歧 / 待核验状态）。
- **Step 4 · 交互式三情景估值赔率 + 5×5 EPS × PE 敏感度矩阵**：基于 HeroUI v3 精密滑块实时调整 2–5 年远期 `EPS` 与 `PE`，并自动锚定 SEC 最新年报稀释 EPS 参考值；纯函数零延迟计算目标价、年化 CAGR、下行回撤、赔率比以及 **5×5 安全边际敏感度矩阵**。
- **Step 5 · 零杠杆交易铁律检查单 + 一页纸投研备忘录（Investment Memo）**：建仓 / 加仓 / 持有操作在**领域层 Schema 与前端硬开关双层锁死「零杠杆原则」**；强制记录当下情绪与认错离场红线，并一键将 5 步完整研究凝练为可复制、可跨季度对照复盘的**投委会级一页纸投研备忘录**。

### 3. 内联行业术语卡片（Inline Glossary Popover）

- 画布中出现 `HBM3E`、`CoWoS`、`NVLink`、`CapEx`、`ROIC`、`FCF`、`PE`、`CAGR`、`EV/EBITDA`、`10-K`、`Moat` 等专业术语时自动虚线标注，点击即时弹出白话释义、美股财报口径与实战案例，不打断思考心流。

### 4. 一键导出与外部工作流同步

- **Google Docs 研报**：`/api/export/thesis/[id]?format=gdoc` 导出排版精良的语义 HTML，拖入 Google Drive 即可无损转换为 Google Doc。
- **Markdown 档案**：`/api/export/thesis/[id]?format=md` 导出纯净 Markdown 深度备忘录。
- **Google Sheets 全仓赔率表**：`/api/export/portfolio` 导出带 UTF-8 BOM 的 RFC-4180 CSV 台账，覆盖三情景目标价、CAGR 与赔率比。

---

## 设计系统（Swiss Editorial × Apple Natural Titanium）

封装于 [`packages/ui`](packages/ui)（**HeroUI v3** + Tailwind CSS v4 + Framer Motion + Recharts + Tabler Icons），所有业务页面严禁绕过 `@kanon/ui`：

| 维度                | Light（暖白纸面）                          | Dark（阳极黑曜石）             | 机械门禁                                  |
| :------------------ | :----------------------------------------- | :----------------------------- | :---------------------------------------- |
| **画布 / 卡片**     | `#F7F7F5` / `#FFFFFF`                      | `#0B0C0E` / `#141518`          | 零硬编码 Hex / 原始色板                   |
| **品牌钛金属色**    | `#E5E3DD`（Natural Titanium）              | `#272622`（Anodized Titanium） | 统一映射 HeroUI v3 `@layer theme`         |
| **主墨色 / 强调色** | `#111113` / 暖珊瑚橙 `#EA6B4A`             | `#F4F4F2` / `#EA6B4A`          | 90% 中性克制，唯一焦距高亮                |
| **排版与数字**      | `Geist` + `PingFang SC` / `JetBrains Mono` | 同左                           | `tabular-nums` + **最小 12px 字号硬下限** |
| **动效与图标**      | `KANON_SPRING (420, 34, 0.8)`              | 同左                           | 禁用弹跳动画；Tabler 强制 `stroke={1.5}`  |

---

## Monorepo 架构与 AI-Native 四层机械门禁

本项目严格遵循 **AI-Native 代码库园艺（Trust Pyramid）** 工程实践——**能用代码硬性拦截的，绝不靠文档提醒**：

```text
kanon/
├── apps/web/                   # Next.js 16 App Router + React 19 + Tailwind CSS v4
│   └── src/
│       ├── app/                # 薄 Server Component 路由 + REST API（唯一允许访问 DB 层）
│       └── features/           # 垂直领域切片：thesis/ | valuation/ | journal/ | glossary/
├── packages/
│   ├── ui/                     # HeroUI v3 + KANON Natural Titanium 封装层（零业务依赖）
│   ├── core/                   # Drizzle Postgres Schema + PGlite/Postgres 客户端 + 纯估值数学 + 导出器
│   └── ai/                     # SEC EDGAR 客户端 + Vercel AI SDK BYOK + Zod 结构化副驾驶
├── scripts/
│   └── check-design-and-limits.mjs  # TypeScript AST 物理尺寸、审美与色值机械门禁
├── .agents/skills/             # 内置 HeroUI v3 官方 Agent Skills（heroui-react / heroui-theming）
└── .rules/postmortems.md       # Mistake-to-Rule 错题升级沉淀库
```

### 四层门禁（单一真源：`pnpm check && pnpm test && pnpm build`）

| 层级                        | 执行命令                               | 机械拦截内容                                                                                                                                                                                    |
| :-------------------------- | :------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 静态与严格类型**       | `pnpm lint` + `pnpm typecheck`         | Biome 严格模式（零 `any`、零 `console.*`、圈复杂度 ≤ 12）+ 全仓 4 包 `tsc --noEmit`                                                                                                             |
| **L2 架构与审美 AST 门禁**  | `pnpm depcruise` + `pnpm design:check` | 模块边界与 Server-only DB 隔离 + AST 强制：单文件 ≤ 250 行、单函数 ≤ 50 行、嵌套 ≤ 3 层、零类型逃生舱（`as any` / `as never` / `as unknown as`）、零硬编码色值、最小字号 ≥ 12px、`stroke={1.5}` |
| **L3 领域不变量与集成测试** | `pnpm test`                            | 估值赔率与 5×5 敏感度矩阵纯函数单测 + 研究成熟度评分单测 + 内存真实 PostgreSQL（PGlite）CRUD 与 **8 表 DDL / Schema 列级 1:1 一致性校验** + 零杠杆铁律硬拦截测试 + 导出器与 SEC/AI Zod 契约测试 |
| **L4 Git 钩子与 CI 卡点**   | `lefthook.yml` + GitHub Actions        | Pre-commit 自动拦截 + PR 流水线强制全绿                                                                                                                                                         |

---

## 快速启动（零配置开箱即用）

> **零外部依赖开箱体验**：未配置 `DATABASE_URL` 时，KANON 会自动启动本地磁盘持久化的嵌入式真实 PostgreSQL（`@electric-sql/pglite`，数据落盘于 `.data/kanon-pg`），并自动建表写入 `MU（美光科技）`、`NVDA（英伟达）` 完整 5 步研究样板与 12 个核心术语。

```bash
# 1. 安装依赖（Node >= 22, pnpm >= 10）
pnpm install

# 2. 启动本地开发环境（默认 http://localhost:3000）
pnpm dev
```

### 可选：连接云端 PostgreSQL（Neon / Supabase）与 BYOK 大模型

复制 `.env.example` 为 `.env.local` 按需配置：

```bash
cp .env.example .env.local
```

- 填入 `DATABASE_URL` 后运行 `pnpm db:push` 即可无缝切换至 Neon / Supabase 生产 PostgreSQL。
- 在页面顶部点击 **「AI 引擎」** 即可直接在浏览器本地配置 `Gemini` / `Claude` / `OpenAI` BYOK 密钥（仅通过单次请求头透传，绝不写入数据库），或在 `.env.local` 中配置 `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`；未配置时自动运行基于真实入库档案与 SEC 缓存的确定性结构化引擎，同样严格经过 Zod 校验。

### 常用研发与验证命令

```bash
pnpm check        # 运行 L1+L2 全部机械门禁（Biome + TS + depcruise + AST 审美/尺寸门禁）
pnpm test         # 运行 L3 全部 Vitest 单元测试与 Postgres DDL 一致性集成测试
pnpm build        # 运行 Turborepo 全仓生产构建
pnpm format       # Biome 一键自动格式化
```

---

<div align="center">
  <sub>KANON · 卡农 — <em>Quiet precision for long-term minds.</em></sub>
</div>
