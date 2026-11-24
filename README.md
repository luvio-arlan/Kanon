<div align="center">
  <br />
  <a href="https://kanon.hk">
    <img alt="KANON · 卡农" src="./marketing/assets/favicon.svg" width="64" />
  </a>

  <h1>KANON · 卡农</h1>

  <p>
    <strong>Conviction, composed.</strong><br />
    在噪音里，谱出自己的确定性。
  </p>

  <p>
    面向深度个人价值投资者与买方投研机构的 <strong>投资逻辑操作系统（Investment Thesis OS）</strong>。<br />
    剥离跳动 K 线与算命式聊天框——用第一性原理、SEC XBRL 一阶溯源、多角色 AI 投委会红蓝对抗与零杠杆铁律，<br />
    把听来的观点，炼成自己算出来的底气。
  </p>

  <p>
    <a href="https://kanon.hk"><strong>官网 kanon.hk ↗</strong></a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="./docs/PRD.md">产品白皮书 PRD</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="./docs/PRODUCT_ARCHITECTURE_V3.md">架构演进蓝图 v3–v5</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="./marketing/index.html">品牌官网源码</a>
  </p>
  <br />
</div>

---

## 为什么是 KANON（卡农）

绝大多数金融软件在精密地贩卖焦虑：闪烁的红绿 K 线、嘈杂的社区喊单、替你算命的聊天机器人。

**KANON** 反其道而行之。名字取自 **Canon（第一性原理与准则）** 与 **卡农（层层递进的复调交叉印证）**——融合 **Swiss Editorial 建筑留白** 与 **Natural Titanium 工业克制**，只服务一件事：**帮你用顶级买方投研方法，把一家好公司从头到尾看透、算清赔率、守住纪律。**

- **不做** 实时盯盘 K 线终端或券商下单通道
- **不做** 直接给出买卖建议的算命式聊天框
- **不做** 多邻国式打卡徽章游戏化与社交喊单广场
- **坚持** 零杠杆硬契约、SEC 原件溯源与人类终审主权（Human-in-the-Loop）

---

## 核心能力体系

| 维度                     | 核心机制                                                                                                                                 |
| :----------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **五步买方研究画布**     | 商业模式一票否决（含预期差与事前验尸） → 3 条可证伪核心假设 → SEC 一阶资料与产业链互证 → 双引擎估值 → 零杠杆交易铁律与一页纸投委会备忘录 |
| **SEC XBRL 零幻觉溯源**  | 直连官方 SEC EDGAR API 拉取多年度 10-K / 10-Q 财务事实入库，严禁大模型编造任何数字                                                       |
| **多角色 AI 投委会**     | 基本面主笔 · 法务会计审计 · 苛刻空头红队（Devil's Advocate）· 人类终审提案（BYOK 支持 Gemini / Claude / OpenAI）                         |
| **确定性估值内核**       | 纯函数驱动三情景目标价、年化 CAGR、上下行赔率比、Reverse-DCF 与 **5×5 EPS × P/E 敏感度矩阵**                                             |
| **零杠杆铁律与长期归档** | 领域层 Schema 与前端双层锁死 `0.00×` 杠杆；一键导出 Google Docs、Markdown 与全仓赔率 CSV                                                 |

---

## 演进蓝图（v3.0 → v6.0）

- **v3.0（已落地）**：买方预期差 / 事前验尸画布 · MCP-Ready 多步研究 Agent 与 SSE 实时轨迹 · 四层 AI-Native 零 Slop 机械门禁
- **v4.0（下一代）**：十年 SEC 语义金库（`pgvector + BM25` 原件高亮溯源）· 跨季度假设漂移雷达 · 多角色投委会对抗室
- **v5.0（机构 OS）**：亚 50ms 本地优先增量同步（Postgres WAL）· 全市场 Financial MCP 总线（Form 4 / 13F）· 买方团队 RBAC/RLS 协作舱
- **v6.0（认知复利）**：跨越完整周期的个人预测校准图谱（Brier Score）· 原生 macOS 极速终端与零盘中打扰季报简报

---

## 仓库结构

```text
kanon/
├── apps/web/          # Next.js 16 + React 19 + HeroUI v3 + Tailwind v4 核心投研应用
├── packages/
│   ├── ui/            # Swiss Editorial × Natural Titanium 统一组件与视觉系统
│   ├── core/          # Drizzle PostgreSQL / PGlite + 确定性纯函数估值内核 + 导出器
│   └── ai/            # SEC EDGAR XBRL 解析器 + Vercel AI SDK BYOK 多步研究引擎
├── marketing/         # 品牌官方网站（kanon.hk，未来演进为 apps/marketing）
├── promo-video/       # 24s 60fps 品牌宣传片源码与纯代码复调原声合成器
└── docs/              # PRD 与 v3–v5 架构白皮书
```

---

## 快速启动（零外部依赖，开箱即用）

> 未配置 `DATABASE_URL` 时自动启动本地磁盘持久化嵌入式 PostgreSQL（`@electric-sql/pglite`），自动建表并写入 `NVDA`、`MU` 完整研究样板。

```bash
pnpm install   # Node >= 22, pnpm >= 10
pnpm dev       # 启动本地研发环境 http://localhost:3000
pnpm check     # 运行四层机械门禁（Biome + TS + DepCruise + AST 审美门禁 + Knip）
pnpm test      # 运行金融纯函数、DDL 一致性与零杠杆契约测试
```

---

<div align="center">
  <sub>
    <strong>KANON · 卡农</strong> — <em>Quiet precision for long-term minds.</em><br />
    Architected by <strong>Caius Lu</strong> · <a href="https://kanon.hk">kanon.hk</a> · <a href="mailto:jensencuda@gmail.com">jensencuda@gmail.com</a>
  </sub>
</div>
