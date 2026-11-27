# WAVE U — Post-Wave S 对抗审查 · 止血与发布演进：蓝图与实施规格书

> **基线**：`main@1dc625b`（只读审查；本文件为施工单，不含任何业务代码改动）。
> **视角**：买方投研总监（口径一致、可证伪、反幸存者偏差）+ 红队 / Staff Engineer（RLS、作业可靠性、纸面防线）。
> **日期**：2026-11-28 HKT（= 2026-11-27 UTC）。线上探针时间：2026-11-27 17:32 UTC。
> **范围**：`4a5060c`、`8e7e93a`、`ea96c77`、`1dc625b` 的实际代码 + 生产 `/api/health`。文中行号均基于 `1dc625b`。

## 阅读约定

- **Part 1** 每条发现固定五段：严重度与位置 · 最小复现 · 影响 · 为什么现有门禁没拦住 · 修复与守卫。
- **Part 2** 每个工作项固定七段：① 问题与买方价值 · ② 文件落位 · ③ 数据模型与迁移 · ④ API 契约与权限 · ⑤ 数学 / 算法不变量 · ⑥ 负向测试、E2E 与守卫 · ⑦ 人日、依赖与砍项。
- **严重度**：P0 = 线上数据会被静默破坏或核心指标错误，且已经或即将在生产发生；P1 = 口径 / 权限 / 诚实性的实锤缺陷，会改变买方结论；P2 = 可复现的边界退化或体验缺陷。
- **证据等级**：「已核实」= 直接读到的代码或线上响应；「需线上核验」= 本次审查无权读取（Vercel Cron 日志、Neon 角色属性），列为 U0 待办，不当作事实。
- 沿用 `docs/WAVE_R_S_PLAN.md` 的数据诚实总则：取不到、对不上或样本不足的数值一律返回 `null` + `status` / `reason`，UI 只显示一行状态，绝不回落到默认值。下文不再逐条重复。
- 已完成的 W0–W5、R1–R4、S0–S3 不重复规划；本文只处理它们的缺陷与下一阶段增量。

---

## 0. 线上核验与 `lastTickAt: null` 的根因

### 0.1 探针记录（2026-11-27 17:32 UTC）

| 探针                                       | 结果                                                                                                                                                             | 结论                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET https://app.kanon.hk/api/health`      | `healthy`；`secretsConfigured` 三项为 `true`；`jobQueue={pending:0,running:0,failed:0,done:7,skipped:0,lastTickAt:null,lastTickCompleted:null}`；`dbSizePct:2.3` | 响应含 Wave R 新增的 `dbSizePct` 字段 → 线上已运行 `8e7e93a` 之后的代码 |
| `GET /api/internal/jobs/tick`（无 Bearer） | 401                                                                                                                                                              | 鉴权正常                                                                |

### 0.2 时间线（UTC）

| 时间                | 事件                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| 11-26 09:00         | `19ebd74` 写入 Cron `0 22 * * 1-5`（`apps/web/vercel.json:10`）                              |
| 11-26 22:00（周四） | 迄今唯一一个已经过去的 Cron 窗口；当时线上是 Wave N 代码，**尚无心跳函数**                   |
| 11-27 03:11         | `e093264` 首次引入 `recordTickHeartbeat`（`git log -S recordTickHeartbeat` 已核实）          |
| 11-27 08:54–15:46   | W0–W5 合入（含新作业 `prune_chunks`、`resolve_guidance`、`build_redline`、`sync_segments`）  |
| 11-27 22:00（周五） | **心跳版代码第一次遇到调度窗口**；也是 `prune_chunks` 与 `resolve_guidance` 第一次在生产执行 |
| 11-28 / 11-29       | 周末不调度（`1-5`）                                                                          |
| 11-30 22:00（周一） | 下一次调度                                                                                   |

### 0.3 结论

1. `lastTickAt: null` **目前不能证明 Cron 坏了**：心跳代码上线后还没有经过任何调度窗口。`done: 7` 可能来自 11-26 那次 Wave N 版 Tick，也可能来自建档 `after()` 的按需同步，现有字段无法区分（需线上核验：Vercel Dashboard → Cron Jobs 执行记录）。
2. 它暴露的真问题是**健康检查无法证伪**：从未运行被判为 healthy；即使今晚运行，任何一个长作业越过 60 秒都会在写心跳之前被平台终止，`lastTickAt` 继续为 `null`，health 依旧 `healthy`（P0-2）。
3. **今晚 22:00 UTC 的首次心跳版 Tick 会第一次执行两个含实锤缺陷的作业**：`prune_chunks` 会删除 10-Q 正文分块（P0-1），`resolve_guidance` 会把错误的兑现结论写成不再重算的终态（P0-4）。二者都必须在 22:00 UTC 前停用（U0a，0.5 人日）。

---

## Part 1 — Post-Wave S 深度对抗审查

### 1.0 发现总表

| 编号  | 级别 | 一句话                                                                                          | 主要位置                                                                                                                    |
| ----- | ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P0-1  | P0   | `prune_chunks` 把 Form 4 / 8-K 与 10-Q 一起排名，季报正文分块每日被删                           | `packages/core/src/db/repositories/intel/redline-store.ts:100-121`                                                          |
| P0-2  | P0   | Cron 存活性是纸面防线：从未运行即健康、心跳写在末尾、无单作业截止、周末必误报、周日重基不可达   | `apps/web/src/app/api/health/route.ts:34-38`、`internal/jobs/tick/route.ts:71,150-153`                                      |
| P0-3  | P0   | S1 净值把「拆股追溯后的收盘价」当成未调整价，拆股前区间 NAV / TWR / 回撤失真 r 倍               | `packages/core/src/math/performance/nav-helpers.ts:20-33`、`packages/ai/src/market/bars/providers.ts:120,185`               |
| P0-4  | P0   | R3 兑现按 companyfacts `fy`（申报财年）取数，可能以上年比较期判定，且结论写入后不再重算         | `packages/ai/src/sec/pit/pit-facts-extractor.ts:143`、`repositories/intel/guidance-resolver.ts:89-111`                      |
| P1-1  | P1   | 申报主数据首写者锁死 URL / 财年；混合窗口让往期 10-K 变成目录页 → Redline「章节缺失」永久缓存   | `apps/web/src/app/api/_lib/sec-warehouse-sync.ts:114`、`_lib/sec-pit-sync.ts:120-130`                                       |
| P1-2  | P1   | R1 / R2 作业 id 缺维度、客户端轮询放大 9 倍全量下载、失败后永远 `pending`                       | `apps/web/src/app/api/sec/[ticker]/redline/route.ts:68-84`                                                                  |
| P1-3  | P1   | R2 分部 EBIT 带入闸门在持久化层被短路（利润对账结果未落库）                                     | `packages/core/src/db/repositories/intel/segment-store.ts:148`                                                              |
| P1-4  | P1   | R2 把单季（3 个月）分部数据直接带入 SOTP                                                        | `segment-store.ts:182`、`sec/[ticker]/segments/route.ts:86-91`                                                              |
| P1-5  | P1   | R2 非美元链路：预览把本币显示成 `$`、FX 管道零生产写入、溯源概念被硬编码                        | `apps/web/src/features/valuation/components/drivers/sotp-sec-import.tsx:25-27,157`                                          |
| P1-6  | P1   | S3 在 PIT β 样本不足时捏造 β = 1，并在同一矩阵内切换收益口径                                    | `packages/core/src/math/attribution/decision-matrix.ts:100-103`                                                             |
| P1-7  | P1   | S3 前视偏差：`0033` 把「当前状态」回填到建档日；无快照回合使用事后新增的假设                    | `migrations/v3/0033-decision-snapshots.ts:85-89`、`decision-matrix.ts:39-40`                                                |
| P1-8  | P1   | S3 幸存者偏差：删除档案或退出组织后，RLS 隐藏假设事件，「认知错误」回合可被移出分母             | `0033-decision-snapshots.ts:72-74`、`0027-rls-functions-and-split.ts:80-81`                                                 |
| P1-9  | P1   | S2 风险权重取自研究卡片自报的 `currentWeightPct`，且混入组织内他人档案                          | `apps/web/src/app/api/portfolio/risk/route.ts:91-93`                                                                        |
| P1-10 | P1   | 账本不识别币种：任意 `baseCurrency`、港股价格按美元记账、界面硬编码 `$`                         | `packages/core/src/contracts/workflow-contracts.ts:27`                                                                      |
| P1-11 | P1   | 生产 RLS 是否生效无任何运行时探针（连接角色是否 `BYPASSRLS` 不可观测）                          | `apps/web/src/app/api/health/route.ts`、`scripts/verify-api-contracts.mjs:192-197`                                          |
| P1-12 | P1   | 评测与守卫纸面化：`pnpm eval` 给手写答案打分、夜间「在线」评测被写死离线、G14 / G16 / knip 盲区 | `packages/ai/evals/run-evals.mjs:8`、`package.json:24`、`scripts/wave-guards-rs.mjs:632-741`                                |
| P2-1  | P2   | R1 解析边界：先全量下载再判体积、标题必须同行、取最后一个匹配、10-Q / 20-F 标签写死             | `apps/web/src/app/api/_lib/sec-intel-jobs.ts:37-39`、`packages/ai/src/sec/redline/section-extractor.ts:98-150`              |
| P2-2  | P2   | R2 利润概念兜底取任意非营收概念、缺单位回落 USD、未对账报告显示绿色「校验差」                   | `packages/ai/src/sec/segments/segment-extract.ts:174-177,192`、`sotp-sec-import.tsx:90`                                     |
| P2-3  | P2   | R4 核验器对括号负数符号盲、缺 percentage points 与营业利润线索；生产检索空计划回落到代码检索    | `packages/ai/src/verification/cn-number-units.ts:33-34`、`api/ai/agent/ask/route.ts:63`                                     |
| P2-4  | P2   | S2 数值：LW 收缩缺 ρ 项、样本不足时捏造协方差、单一稀疏标的拖垮整个组合、Jacobi 无收敛标志      | `packages/core/src/math/risk/covariance.ts:93,106-117`、`risk/aligned-returns.ts:91-99`                                     |
| P2-5  | P2   | S0 日内语义与时区：同日顺序依赖录入顺序、UTC+8 清晨被判「未来日期」、无冲销通道                 | `packages/core/src/math/performance/ledger-replay.ts:50-57`、`workflow-contracts.ts:54`                                     |
| P2-6  | P2   | UI 减法：口语化象限名、说教空态、哈希与 δ 等技术噪音、与实际不符的「赛道估算」文案              | `features/portfolio/components/calibration/decision-matrix-view.tsx:14-29,84`、`risk/risk-decomposition-section.tsx:65,110` |

---

### P0-1 `prune_chunks` 把 Form 4 / 8-K 与 10-Q 一起排名，季报正文分块每日被删

- **位置**：`packages/core/src/db/repositories/intel/redline-store.ts:100-121`。`bucket` 把一切非 `10-K/10-K/A/20-F/20-F/A` 的申报（8-K、Form 4、6-K、DEF 14A、10-Q）都归为 `quarter`，每个证券只保留 `rn <= 4`；年报桶只保留 `rn <= 2`。入队见 `warehouse/jobs-and-peers-store.ts:100-104`（`prune_chunks` 每日一次），执行见 `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts:63-66`。`filings` 表里确有 Form 4 与 8-K：`apps/web/src/app/api/_lib/sec-warehouse-sync.ts:114-125` 把 submissions 混合列表（`packages/ai/src/sec/edgar-annuals.ts:136-216`，至多 10 份财报 + 4 份 8-K + 6 份 Form 4）原样写入。
- **最小复现**（PGlite）：同一 `security_id` 写入 10-Q（2026-10-29，含 30 个 `filing_chunks`），随后写入 2 份 8-K、3 份 Form 4（`filed_at` 均更晚）→ 调用 `pruneStaleFilingChunks` → 10-Q 的 30 个分块全部删除（季度桶前四名都是没有分块的 Form 4 / 8-K）。年报桶同理：一份 Part III 型 10-K/A 就会把上一年 10-K 的分块挤出。真实标的：NVDA 在 10b5-1 减持期间每周多份 Form 4。
- **影响**：R1 已缓存 Redline 里的 `currentChunkId / previousChunkId` 指向不存在的分块；R4 `searchFilingChunksFts` 丢失全部季报正文，投委会 Agent 只能检索年报；`guidance_commitments.source_ref`（`source_kind='filing_chunk'`）悬空。分块可以重新抓取，但已缓存的 Redline 行（主键含 `algo_version`）不会自动重建。
- **为什么没拦住**：`redline-store.test.ts` 只构造 10-K / 10-Q；E2E 的 submissions mock 只有 4 份定期报告（`apps/web/e2e/support/mock-upstream.mjs:54-68`），没有 Form 4 / 8-K；E2E 第 05 章确实运行了 Tick（含 `prune_chunks`），但不断言保留集合。
- **修复**：U0a 立即停用（入队与 runner 两道关）；U0-1 改为「只在定期报告内排名 + 保护被 Redline / 指引引用的 accession + 8-K 单独成桶」。**守卫**：G24（Form 4 洪泛夹具，Vitest）。

### P0-2 Cron 存活性是纸面防线

- **位置与机制**（均已核实）：
  1. `apps/web/src/app/api/health/route.ts:34-36`：`tickStale` 只在 `lastTickAt != null` 时计算，**从未运行 = healthy**。`scripts/verify-api-contracts.mjs:192-194` 要求全新环境返回 `healthy`，契约把这一语义固化了。
  2. `apps/web/src/app/api/internal/jobs/tick/route.ts:150-153`：心跳只在最后一步写入，并以 `.catch(() => undefined)` 吞掉错误。预算只在领取前检查（`:71`），`runSingleJob`（`:42-44`）不向作业传递截止信号。第 39 秒领取一个 `build_redline`（`apps/web/src/app/api/_lib/sec-intel-jobs.ts:37-39`：两份文档，各 12 秒超时、重试 2 次）即可越过 `maxDuration = 60`（`:22`），平台终止函数，告警阶段与心跳都不会执行。
  3. `apps/web/vercel.json:10` 的 `0 22 * * 1-5`：周五 22:00 到周一 22:00 间隔 72 小时，大于 `MAX_QUEUE_AGE_SEC = 26h`（`health/route.ts:13`），心跳修好后**每个周日 00:00 至周一 22:00 必然 `degraded`**；同时 `warehouse/jobs-and-peers-store.ts:117` 的周日全量重基（`isSunday`）在生产永远不可达（UTC 周日从不调度）。`thesis/wave-w0-remediation.test.ts:409` 直接传入 `"2026-11-29"`，单测通过，生产路径不存在。
  4. 吞吐：Hobby 计划每天一次、每次 40 秒同步预算；每个标的每天入队 2 个作业（`jobs-and-peers-store.ts:68-90`），作业 id 带日期，前一日未完成的同类作业不会被合并，积压随标的数线性增长，最终 `oldestPendingAgeSec > 26h` 长期 `degraded`。
- **最小复现**：在 E2E mock 中给 `www.sec.gov/Archives` 加 35 秒延迟 → 授权调用 Tick → 函数超时；随后 `GET /api/health` 仍为 `healthy`，`lastTickAt: null`。
- **影响**：告警、日线、SEC 同步、指引兑现、Sunday 重基都依赖这一条链路，而它的失败无法被观测。
- **为什么没拦住**：`test:api` 只验证未授权的 401 / 503（`verify-api-contracts.mjs:807-808`）；E2E 第 03、05 章授权调用 Tick 但只断言 HTTP 200 与收件箱条目，从不读取心跳；周日逻辑只有注入日期的单测。
- **修复**：U0-2（心跳前置、单作业截止、每日调度、`never_ran` 语义、积压合并、可选的小时级补充触发器）。**守卫**：G20（`test:api` 授权 Tick 后断言心跳阶段与 `cron.state`）。

### P0-3 S1 净值把「拆股追溯后的收盘价」当成未调整价

- **位置**：`packages/core/src/math/performance/nav-helpers.ts:20-33`（持仓按真实股数记账，除权日 `h.shares *= sp.ratio`）与 `:53-75`；价格来源 `packages/ai/src/market/bars/providers.ts:120,136`（Polygon `adjusted=true`）和 `:185`（Yahoo `quote.close`），两者都是**拆股追溯后**的价格（Yahoo `close` 只不含股息调整，`adjclose` 才含股息）；读取层 `packages/core/src/db/repositories/portfolio/performance-inputs-store.ts:68-110` 的注释写的是 "unadjusted"；守卫 `scripts/wave-guards-rs.mjs:721-741`（G16）只禁止 `.adjClose`。
- **最小复现**：入金 $8,600 → 2024-05-01 以真实价 $860 买入 NVDA 10 股 → 2024-06-10 10:1 拆股。库内 2024-05-01 收盘约 $86（追溯后）。`buildPortfolioPerformanceSeries` 给出买入当日 NAV = 0 + 10 × 86 = $860，日收益 −90%（`twr.ts:40-45` 的 `dayRet > -1` 放行），拆股日回升 +900%；`maxDrawdownPct ≈ −90%`，拆股前整段 TWR 曲线失真；`dividend-audit.ts` 以真实股数乘以追溯后每股股息，少估 r 倍。
- **影响**：任何在拆股前建仓的持仓（NVDA 2024-06、AVGO 2024-07、WMT 2024-02、CMG 2024-06 等）都会让净值、最大回撤与超额收益失真，而这是 Wave S 的门面指标。
- **为什么没拦住**：`performance.test.ts:187-229` 的净值用例 `splitsByTicker` 为空；拆股只在重放用例（`:57-92`）中测试，而重放不涉及价格；E2E mock 的 Yahoo K 线平滑无断崖（`mock-upstream.mjs:373-390`，与真实 Yahoo 一致），但第 07 章不覆盖拆股前建仓；G16 的前提（「`.close` 未调整」）本身是错的，守卫越严格越把错误口径固化。
- **修复**：U0-5，在录入层把数量与价格归一到「最新拆股基准」，净值循环不再应用拆股；同时检测「拆股已发生但 K 线尚未重基」的断崖，返回 `rebase_pending`。**守卫**：G23（以真实价格路径为地面真值的性质测试 + 禁止在净值循环内应用拆股的 AST 规则），G16 语义改写为「拆股基准一致」。

### P0-4 R3 兑现按申报财年取数，可能以上年比较期判定，且写入后不再重算

- **位置**：`packages/ai/src/sec/pit/pit-facts-extractor.ts:143` 把 `fiscalYear` 设为 companyfacts 的 `fy`，即**申报**所属财年：FY2025 10-K 中 FY2024、FY2023 的比较期事实同样带 `fy=2025, fp=FY`。`packages/core/src/db/repositories/intel/guidance-resolver.ts:89-104` 按 `fiscalYear / fiscalPeriod` 过滤；`:111` 取 `facts[0]?.periodEnd`，而同一份 10-K 的三期事实 `filedAt` 相同，排序未定义。
- **最小复现**（PGlite）：写入 FY2025 10-K 的三条 `revenue`（`period_end` 分别为 2025-01-26 / 2024-01-28 / 2023-01-29，均为 `fy=2025, fp=FY`，同一 accession、同一 `filed_at`）和一条已确认的 FY2025 营收指引 → `resolvePendingGuidanceCommitments` → 结论取决于行序，可能用 FY2023 营收判定为 `miss`。季度同理：10-Q 同时含上年同季比较期。
- **同一模块的其他口径缺陷**（均已核实）：
  - `:65`：`operating_margin`、`operating_expenses` 返回 `null`，既不兑现也不标 `unresolvable`，每天重复扫描。
  - `:109`：只拒绝 `non_gaap`；`basis` 默认值是 `'unspecified'`（`migrations/v3/0031-guidance-ledger.ts:17`），会被当作 GAAP 判定 → Non-GAAP EPS 指引被系统性记为 `miss`。
  - EPS 指引与实际值不做拆股归一：指引发布后、财年结束前发生拆股，实际 EPS 必然「大幅不及」。
  - `packages/core/src/math/guidance/credibility.ts:25` 取链条中「第一个 `confirmed`」：首次指引一旦被修订就变成 `superseded`，信誉被以「修订后、更接近实际」的指引计分，系统性偏乐观；`superseded` 条目也从不被兑现。
  - `repositories/intel/guidance-store.ts:158-171`：撤回不检查是否已兑现，已判 `miss` 的条目可被撤回以美化信誉。
- **黏性**：`resolvedAt` 一旦写入（`:143-149`），`resolvePendingGuidanceCommitments` 不再处理该行，错误结论永久存在，必须由迁移重置。
- **为什么没拦住**：`guidance-store.test.ts:51-87` 每个 `fy` 只造一条 `periodEnd`；`guidance.test.ts` 只测纯评分函数。
- **修复**：U0a 停用 `resolve_guidance`；U0-6 按「期间结束日」绑定事实、拆股归一、强制 basis、初始指引计分、冻结已兑现条目，并以 `pit/2` 重置迁移。**守卫**：比较期夹具（U0-6 ⑥）+ 0034 中的已兑现冻结触发器。

### P1-1 申报主数据首写者锁死 URL / 财年，混合窗口让 Redline「章节缺失」并被永久缓存

- **位置**：
  - `apps/web/src/app/api/_lib/sec-warehouse-sync.ts:114`：`snapshot.filings.slice(0, 10)` 取的是混合列表的前 10 项，往期 10-K 常被 Form 4 / 8-K 挤出。
  - `apps/web/src/app/api/_lib/sec-pit-sync.ts:120-130`：PIT 路径把 `primaryDocUrl` 写成**目录索引** `https://www.sec.gov/Archives/edgar/data/{cik}/{accNoDash}/`。
  - `packages/core/src/db/repositories/warehouse/facts-pit-store.ts:40-46`：冲突更新只改 `items / parse_status / amends_accession`，`primary_doc_url / fiscal_year / fiscal_period / period_end` 由首写者锁死；`items` 还会被无 items 的后写者清空。
  - `apps/web/src/app/api/sec/[ticker]/redline/route.ts:54-57` 与 `_lib/sec-intel-jobs.ts:102-106`：在不分表单的 24 行窗口内找 target，正则 `/^(?:10-K|10-Q|20-F)/` 同时匹配 `10-K/A`；`sec/[ticker]/segments/route.ts:86,140` 与 `sec-intel-jobs.ts:224` 用 12 / 16 行窗口。
- **最小复现**：submissions 最近 10 份为 1 份 10-Q + 3 份 8-K + 6 份 Form 4 → 上一年 10-K 只经 PIT 路径入库，URL 是目录页 → `fetchHtmlMap` 取回 EDGAR 目录 HTML → `section_missing` → `upsertFilingRedline` 落库 → GET 命中 `redline/route.ts:110` 的缓存分支，永久返回「该申报未识别到对应章节正文」。Form 4 持续累积后，24 / 12 行窗口内不再有任何 10-K / 10-Q → `no_comparable` 与分部 `unavailable`。代理声明延期的公司会提交只含 Part III 的 10-K/A（例如 TSLA 2024-04-29），它会成为 target，同样 `section_missing`。
- **为什么没拦住**：mock submissions 只有 4 份定期报告，路径 A 恰好覆盖全部；E2E 第 04 章只验证理想路径。
- **修复**：U0-3。**守卫**：G22（周期性申报网关，AST）。

### P1-2 R1 / R2 作业 id 缺维度、轮询放大、失败即永久 pending

- **位置**：`apps/web/src/app/api/sec/[ticker]/redline/route.ts:68-84`：作业 id `build_redline:${accession}` 不含 section；`_lib/sec-warehouse-sync.ts:91` 用同一 id、不带 section。先请求 `risk_factors` 后，`mda` 永远进不了队列（`enqueueJob` 是 `onConflictDoNothing`）。每次缓存未命中都触发一次 `after()` 全量构建并吞掉错误（`:79-83`）；客户端 `features/research-steps/components/filing/filing-redline-view.tsx:43-45` 每 1.5 秒轮询、最多 8 次 → 一次打开最多 9 次构建 × 2 份完整 HTML 下载。构建失败时不写 `filing_redlines`，GET 也不读作业状态，永远返回 202 `pending`。`sec/[ticker]/segments/route.ts:24-37` 同构。
- **最小复现**：mock 让 SEC 文档返回 500 → 打开 Step 3 Redline → 观察 9 次 `after()` 构建、18 次 SEC 请求，界面停在「加载中」；切到 MD&A → 队列无对应作业。
- **为什么没拦住**：E2E mock 秒回，第一次构建就成功；无失败路径用例。
- **修复**：U0-4。**守卫**：G25（`after()` 白名单网关 + 作业 id 含全部维度，AST）。

### P1-3 R2 分部 EBIT 带入闸门在持久化层被短路

- **位置**：`packages/core/src/db/repositories/intel/segment-store.ts:148`：`profitReconciled: r.profitIsStandard && r.status === "reconciled"`。`packages/core/src/math/segments/reconcile-segments.ts` 计算的真实利润对账结果（分部 OI 合计与合并 OI 差 ≤ 1%）**没有落库**，读取时被「营收对账通过」替代。
- **最小复现**：两分部营收 60e9 + 40e9，合并营收 100.2e9（营收对账通过）；分部 OI 20e9 + 15e9，合并 OI 28e9（未分摊总部费用只出现在无维度的调节项里）→ 纯函数 `profitReconciled = false`，API 却返回 `importable.operatingIncome = true` → SOTP 以 35e9 EBIT 配倍数，高估 25%。
- **为什么没拦住**：`segments.test.ts` 只测纯函数，没有「提取 → 落库 → 读取」往返测试。
- **修复**：0034 新增 `segment_reports.profit_reconciled`，写入纯函数结果；存量行默认 `false`（EBIT 带入暂时关闭，属于诚实降级）。**守卫**：往返测试纳入 U0-7 ⑥。

### P1-4 R2 把单季分部数据直接带入 SOTP

- **位置**：`segment-store.ts:182` 按 `periodEnd` 倒序取最新；`sec/[ticker]/segments/route.ts:86-91` 的 `latestAcc` 取最新一份定期报告，一年中约 9 个月是 10-Q（`segment-extract.ts` 对 10-Q 只取 65–120 天的单季事实）；`packages/core/src/math/segments/sotp-import.ts` 与 `sotp-sec-import.tsx:150-160` 不年化，也不标注期间。
- **最小复现**：最新申报为 10-Q → 带入的「营收」是单季值（示意：数据中心 $30.8B）→ 用户按年度倍数估值，SOTP 低估约 75%。
- **为什么没拦住**：E2E 第 05 章只断言 SOTP 空态；单测只用年度夹具。
- **修复**：只允许 10-K / 20-F 年度报告带入；季度报告 `importable` 全部为 `false`，阻断原因 `quarterly_period`。不做 TTM 拼接（需四个季度同口径，延后）。

### P1-5 R2 非美元链路：预览显示 `$`、FX 管道零生产写入、溯源概念被硬编码

- **位置**：`sotp-sec-import.tsx:25-27,64`（`$` + `/1e9`，不读 `report.currency`）；`:157`（溯源 `concept` 写死为 `us-gaap:Revenues` / `us-gaap:OperatingIncomeLoss`，实际可能是 `RevenueFromContractWithCustomerExcludingAssessedTax` 或 `ifrs-full:Revenue`）；`packages/core/src/db/repositories/warehouse/securities-and-fx-store.ts:163` 的 `upsertFxRates` 在生产代码中**零调用**，`fx_rates_daily` 永远为空，非美元报告恒为 `fx_missing`；`segment-store.ts:96-114` 以期末即期汇率折算流量变量，且没有陈旧度上限。
- **最小复现**：以人民币列报的 20-F 分部（如 BABA）→ 预览行显示「$xxx.xxB」，实为人民币金额（约 7 倍夸大，示意）。
- **为什么没拦住**：knip 不检查包入口 `export *` 的未用导出（`packages/core/src/db/index.ts`），`upsertFxRates` 与 `parseBrokerCsvTransactions` 都是零调用却全绿；G3 的 `REQUIRED_PROD_ENGINES` 是手写清单。
- **修复**：U0-7（币种显示、真实概念溯源）+ U1-1（ECB 汇率入库作业、期间平均汇率）。**守卫**：G29（金额必须显式带币种，AST）、G30（入口导出必须有生产调用方，零基线）。

### P1-6 S3 在 PIT β 样本不足时捏造 β = 1，并在同一矩阵内切换收益口径

- **位置**：`packages/core/src/math/attribution/decision-matrix.ts:100-101`：`ep.totalReturnPct - (pitBeta ?? 1) * spyReturnPct`；`:103`：缺 SPY 时象限改用总回报 `(idioReturnPct ?? ep.totalReturnPct)`。
- **最小复现**：上市不足 60 个交易日即建仓（`beta-pit.ts` 的 `minDays = 60` → `null`）→ 界面「超额 +x%」实为 β = 1 的假设值；同一矩阵里一部分回合按特质收益、一部分按总回报归类。
- **为什么没拦住**：G6+ 只扫 `features/valuation/`；`attribution.test.ts` 只有两个用例，没有 β = `null` 分支。
- **修复**：U0-8，β 缺失时改用显式标注的「相对 SPY 超额」（不乘 β），SPY 也缺时进入 `pending`；每个回合携带 `outcomeBasis`。**守卫**：G21（分析数学禁止非零数值兜底，AST）。

### P1-7 S3 前视偏差：回填把当前状态倒填到建档日，无快照回合使用事后假设

- **位置**：`packages/core/src/db/migrations/v3/0033-decision-snapshots.ts:85,89`：回填事件的 `recorded_at = COALESCE(t.created_at, NOW())`，状态取**迁移时刻**的当前值，非法值还被改写为 `'watching'`；`decision-matrix.ts:39-40`：没有快照的回合退化为「截止日前出现过的全部假设」，包含建仓后才新增的假设。
- **最小复现**：2025 年建档，2026-03 平仓，2026-10 把假设改为 `invalidated` → 迁移回填一条 `invalidated @ 2025 建档日` → 该回合在 2026-03 截止日被判为「判断错」，而当时该假设是成立的。
- **为什么没拦住**：`decisions-store.test.ts` 只覆盖迁移之后产生的事件。
- **修复**：U0-8，`source = 'import'` 的事件在读取时按 `max(recorded_at, 0033 的 applied_at)` 生效（事件表不可变，不改数据）；截止日早于该时刻的回合标记 `pending / pre_history`；无快照回合不再借用全部假设，标记 `pending / no_snapshot`。

### P1-8 S3 幸存者偏差：删档或退出组织后 RLS 隐藏假设事件

- **位置**：`0033-decision-snapshots.ts:72-74`：`hypothesis_status_events` 的 SELECT 策略只有 `kanon_thesis_readable(thesis_id)`；`0027-rls-functions-and-split.ts:80-81` 中该函数等价于「`theses` 里存在且可读」。档案删除后（或用户离开共享档案所在的组织后）事件不可见，`apps/web/src/app/api/portfolio/attribution/route.ts:33-35` 读到空集，回合落入 `pending`，退出 `skillRatePct` 的分母。
- **最小复现**：强制 RLS 下，用户 A 关联档案 T 买入并锁定快照 → 假设被证伪、亏损平仓（「认知错误」）→ A 删除 T → `GET /api/portfolio/attribution`：该回合变为 `pending`，实力占比上升。
- **影响**：`.rules/postmortems.md` 称「即使删除档案也保留反幸存者偏差记录」，但快照虽在，归类却被静默改写——用户可以通过删档美化自己的决策记录。
- **为什么没拦住**：`rls-fail-closed.test.ts` 没有「删档后读取事件」场景；归因测试不经过 RLS。
- **修复**：0034 为事件 SELECT 增加「持有该档案决策快照的用户可读」分支，并让快照 INSERT 同时校验档案可读。**守卫**：G26（强制 RLS 下的幸存者偏差夹具，Vitest）。

### P1-9 S2 风险权重取自研究卡片自报权重，且混入组织内他人档案

- **位置**：`apps/web/src/app/api/portfolio/risk/route.ts:91-93`：权重来自 `theses.currentWeightPct`（研究卡片上手填的「当前仓位」），而不是 S0 账本；`listTheses`（`packages/core/src/db/repositories/thesis-queries.ts:197-201`）返回本人**及所在组织全部成员**的档案。
- **最小复现**：组织内两位分析师各自研究 NVDA（30%、25%）→ 我的组合风险里出现两条 NVDA，相关性为 1 的重复列；我的真实账本只有现金。
- **影响**：「真实日频协方差风控」建立在非真实持仓上；组织用户的风险分解混入同事的研究假设。
- **为什么没拦住**：`risk.test.ts` 只测纯函数；`test:api` 只断言响应结构。
- **修复**：U0-9，权重 = 账本重放持仓 × 同基准最新收盘 / NAV（含现金），只读本人账户。

### P1-10 账本不识别币种

- **位置**：`packages/core/src/contracts/workflow-contracts.ts:27`：`baseCurrency` 接受任意 3–6 位字符串；交易无币种字段（`schema-workflows.ts:126-152`）；港股成交价（港币）按账户币种直接扣现金；`features/cockpit/components/overlays/ledger-performance-line.tsx:107-113` 硬编码 `$`；S1 用美元 SPY 作基准。
- **最小复现**：美元账户入金 $10,000 → 以 380 买入 `0700.HK` 10 股 → 现金扣减 3,800（应约 US$487）；或创建 `baseCurrency: "HKD"` 账户买入 NVDA，NAV 以「$」显示港币与美元的混合数。
- **为什么没拦住**：没有任何跨币种夹具；`baseCurrency` 被写入后从未被读取参与计算。
- **修复**：U0-11 先诚实阻断（仅允许 USD 账户与美元标的，存量混币账户标记 `ledger_inconsistent`），U1-1 再做真正的多币种。

### P1-11 生产 RLS 是否生效无任何运行时探针

- **位置**：`/api/health` 只报告密钥是否配置；`scripts/verify-api-contracts.mjs:192-197` 只断言这些字段。RLS 是否生效取决于运行时连接角色：Neon 控制台 / Vercel 集成创建的角色属于 `neon_superuser`，带 `BYPASSRLS`（见 `docs/WAVE_R_S_PLAN.md` 参考）。`deploy/README.md` 第 3 节要求切换到 `kanon_app NOBYPASSRLS`，但仓库内没有任何证据或探针表明阶段 C 已执行。
- **证据等级**：**需线上核验**。这是「无法证伪」的缺口，不是已证实的泄露；但若 `DATABASE_URL` 仍是 owner，27 张表的 FORCE RLS 全部形同虚设，且现有门禁无一能发现。
- **修复**：U0-10，health 增加 `db.bypassRls / db.rlsFailClosed`，生产环境不满足即 `degraded`；新增只读核验脚本 `deploy/rls-verify.sql`。**守卫**：G28。

### P1-12 评测与守卫纸面化

- **`pnpm eval` 只给手写答案打分**：`packages/ai/src/retrieval/golden-eval.test.ts:233-241` 读取 `evals/golden/answers/grounded-local.json`（人工撰写的「答案」）计算引用准确率、数值零误差、拒答召回；它衡量的是评分器，不是投委会 Agent。唯一真实执行的 Recall@6 用的是内存 BM25（`hybridSearchChunks`），而生产检索走 Postgres `searchFilingChunksFts`（`apps/web/src/app/api/ai/agent/ask/route.ts:61-63`）。
- **「在线」评测被写死为离线**：`package.json:24` 的 `eval` 脚本固定带 `--offline`；`.github/workflows/golden-eval-nightly.yml` 名为 "Online IC Accuracy"，执行的正是 `pnpm eval`；`run-evals.mjs` 即便判定为 live，也只运行同一组离线测试。
- **G14**（`scripts/wave-guards-rs.mjs:632-680`）只检查 `FunctionDeclaration`，箭头函数与方法可绕过；`thesis-mutations.ts`、`archive-importer.ts` 整文件豁免，建档与导入写入的假设没有初始事件。
- **G16**（`:721-741`）的前提错误（见 P0-3）。
- **knip** 不检查包入口的 `export *`：`upsertFxRates`、`parseBrokerCsvTransactions` 零生产调用仍全绿，与 AGENTS「zero-skip」承诺不符。
- **修复**：U0-12。**守卫**：G27（评测必须覆盖生产检索路径、夜间任务不得离线）、G30。

### P2-1 R1 解析边界

- `apps/web/src/app/api/_lib/sec-intel-jobs.ts:37-39`：`await res.text()` 先完整下载再由 `section-extractor.ts:129` 判断 12 MB 上限——大型银行 / 保险 10-K 会白白下载并占用内存，再返回 `too_large`。分部抓取已实现流式上限（`segments/xbrl-instance-scan.ts:121-137`），Redline 未复用。
- `section-extractor.ts:98-114`：标题必须在同一行同时出现 `Item 1A` 与 `Risk Factors`；只有 `</p></div></li></tr></h*>` 和 `<br>` 会换行，因此 `<div>Item 1A.</div><div>Risk Factors</div>` 这类常见 iXBRL 排版会返回 `section_missing`。可构造复现。
- `:146`：多次匹配时**最后一个**正文 ≥ 3 段的匹配胜出，正文中以「Item 7」开头的交叉引用行可能劫持章节起点。
- `filing-redline-view.tsx:10-11`：标签写死「风险因素 (1A)」「经营讨论 (7)」，10-Q 的 MD&A 是 Item 2，20-F 是 Item 3.D / Item 5。
- **修复**：流式上限复用 `readBoundedXmlStream` 的思路；标题识别允许「Item 行 + 下一非空行」两行合并；取正文最长的候选而非最后一个；标签由 `form` 推导。**测试**：以真实 EDGAR 片段制作的夹具（分行标题、交叉引用、TOC 表格）。

### P2-2 R2 利润概念兜底与显示

- `packages/ai/src/sec/segments/segment-extract.ts:174-177`：没有标准利润概念时取「第一个非营收概念」作为 `profitConcept`；候选正则（`xbrl-instance-scan.ts:81-86`）含 `Revenue`，于是 ASU 2023-07 下按分部披露的 `us-gaap:CostOfRevenue` 会被写进 `segment_lines.operating_income`。
- `xbrl-instance-scan.ts:109` 与 `segment-extract.ts:192`：缺 `unitRef` 或单位无法解析时回落 `"USD"`——捏造币种。
- `sotp-sec-import.tsx:90`：只要 `diffPct !== null` 就显示绿色 `pass` 徽章「校验差 x%」，未对账报告同样显示绿色。
- **修复**：利润概念只接受标准概念或命名匹配 `Segment(Operating)?(Profit|Income|Loss)` 的扩展概念，否则为 `null`；单位缺失返回 `parse_failed`；徽章按 `status` 着色。

### P2-3 R4 核验器与生产检索

- `packages/ai/src/verification/cn-number-units.ts:33-34`：只识别前置 `-`，财报表格的括号负数 `(1,234)` 被当成正数——声明「营业利润 +$1.2B」可被亏损 `(1,234)` 错误佐证（符号盲），正确的负值声明反被判为未核实。
- 单位表缺英文 `percentage points`，`0.5 percentage points` 被当作标量；`claim-verifier.ts:42-54` 的概念线索没有 operating income / 营业利润，这类声明退化为「无概念绑定」，任何同值数字都能佐证。
- `apps/web/src/app/api/ai/agent/ask/route.ts:63`：问题中没有词典命中时 `tsQuery` 为空，回落为用股票代码做全文检索（申报正文很少出现代码），检索静默失效。
- **修复**：括号负数与 `−`（U+2212）入表并保留符号比较；补齐 `percentage points / pp / 营业利润 / operating income`；空计划时返回 `retrieval: "no_terms"`，由 Agent 明确告知检索词不足，而不是假装检索。

### P2-4 S2 数值稳健性

- `packages/core/src/math/risk/covariance.ts:93`：`δ = π / (T·γ)`，缺少 Ledoit–Wolf（2004）常数相关目标中的 ρ 项（`κ = (π − ρ) / γ`），收缩系统性偏大，与参考实现 `covCor.m` 不一致。
- `:106-117`：`t < 2` 时返回捏造的 `1e-4` 单位阵与 1% 波动率。
- `risk/aligned-returns.ts:86-99`：按全部标的取交集日期，任一标的停牌造成交集不足 60 日时，**整个组合**被判为无数据，而不是剔除该标的；`:35` 静默丢弃日收益 ≤ −95% 或 ≥ 500% 的样本，低估尾部风险。
- `risk/jacobi-eigen.ts:87`：迭代上限 `min(2000, 25n²)`，n ≥ 40 时可能未收敛，且不返回收敛标志。
- **修复**：补 ρ 项并以 `covCor.m` 的公开示例为黄金用例；样本不足返回 `null`；先剔除稀疏标的再求交集（列入 `missingTickers`）；极端收益保留并标记；Jacobi 改为循环扫描并返回 `converged`。

### P2-5 S0 日内语义与时区

- `packages/core/src/math/performance/ledger-replay.ts:50-57`：同日交易按 `createdAt` 排序，现金路径校验因此依赖录入顺序——先录入当天买入、后录入当天卖出（以卖款买入）会被 `INSUFFICIENT_CASH` 拒绝。
- `packages/core/src/contracts/workflow-contracts.ts:54`：未来日期按 UTC 判断，UTC+8 用户在本地 00:00–08:00 录入当日成交会被拒绝。
- 账本没有冲销通道（`apps/web/src/app/api/portfolio/ledger/route.ts:56-89` 只有建账与记账），录错只能用一笔反向交易「对冲」，会产生虚假的已实现盈亏。
- **修复**：同日按「入金 / 分红 → 卖出 → 买入 → 出金」排序（日终结算语义，成交时刻未记录时最贴近真实可用资金）；未来日期按 UTC+14 判定；冲销通道并入 U1-1。

### P2-6 UI 减法审计（对照 `.rules/editorial-craft.md`）

- `features/portfolio/components/calibration/decision-matrix-view.tsx:14-29`：象限名「（靠运气）」「（认知错误）」口语化，且与右侧徽章重复；`:84` 空态是一句操作说明（违反「零新手引导 / 说教文案」）；`:40-48` 每行显示 6 位快照哈希（技术噪音）。
- `features/portfolio/components/risk/risk-decomposition-section.tsx:65`：向投资者展示估计器内部参数「收缩系数 δ」；`:110` 文案称「暂以赛道敞口估算」，但该分支并不展示任何估算——文案与事实不符；`:9-18,57-88` 四张 `Card` 置于抽屉内，再叠加带边框的表格容器，形成盒中盒。
- `ledger-performance-line.tsx:107-113`、`sotp-sec-import.tsx:25-27`：金额硬编码 `$`（与 P1-5、P1-10 同源）。
- 亮 / 暗主题对比度（如 `stroke-ink-muted/60` 的 SPY 曲线）**需截图实测**，列入 U2-2 截图矩阵，不在此下结论。

---

## Part 2 — Wave U 可执行蓝图

### 全局约束与落位速查

#### A. 目录容量（`universal-max-directory-files` ≤ 12，统计口径为非测试 `.ts/.tsx/.mjs`，`1dc625b` 实测）

| 目录                                                 | 现状  | 本轮落位规则                                                                                     |
| ---------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `packages/core/src/db`                               | 12/12 | 冻结：不新增 `schema-*.ts`；新表 / 新列写入现有 schema 文件（见行数预算）                        |
| `packages/core/src/db/migrations/v3`                 | 11/12 | 只放 `0034`，之后满额；`0035` 起放新目录 `migrations/v4/`（含 `index.ts`）                       |
| `packages/core/src/db/repositories`                  | 12/12 | 冻结                                                                                             |
| `packages/core/src/db/repositories/warehouse`        | 10/12 | 新增 `watchlist-enqueue.ts`、`filings-store.ts` → 12/12                                          |
| `packages/core/src/db/repositories/intel`            | 5/12  | 新增 `guidance-candidates-store.ts` → 6                                                          |
| `packages/core/src/db/repositories/portfolio`        | 4/12  | 新增 `basis-normalize-store.ts`、`fx-rates-reader.ts` → 6                                        |
| `packages/core/src/db/repositories/security`         | 6/12  | 新增 `db-posture.ts` → 7                                                                         |
| `packages/core/src/contracts`                        | 12/12 | 冻结；新增子目录 `contracts/ops/`                                                                |
| `packages/core/src/contracts/analytics`              | 4/12  | 只改现有文件                                                                                     |
| `packages/core/src/math`                             | 11/12 | 冻结根目录                                                                                       |
| `packages/core/src/math/performance`                 | 8/12  | 新增 `split-basis.ts`、`fx-attribution.ts` → 10                                                  |
| `packages/core/src/math/guidance`                    | 3/12  | 新增 `period-binding.ts` → 4                                                                     |
| `packages/ai/src/sec`                                | 12/12 | 冻结；8-K 新闻稿抽取进新目录 `sec/press/`                                                        |
| `packages/ai/src/sec/redline`                        | 7/12  | 新增 `primary-doc.ts` → 8                                                                        |
| `packages/ai/src/market`                             | 10/12 | 新增 `fx-ecb.ts` → 11                                                                            |
| `apps/web/src/app/api/_lib`                          | 12/12 | 冻结；作业辅助逻辑放 `internal/jobs/tick/`                                                       |
| `apps/web/src/app/api/internal/jobs/tick`            | 2/12  | 新增 `tick-runner.ts`、`job-once.ts` → 4                                                         |
| `apps/web/src/features/valuation/components/drivers` | 12/12 | 冻结：只改 `sotp-sec-import.tsx`                                                                 |
| `apps/web/src/features/portfolio/components/risk`    | 2/12  | 只改现有文件                                                                                     |
| `scripts`                                            | 8     | 新增 `wave-guards-u.mjs`（+ `wave-guards-u.test.mjs`）；`wave-guards-rs.mjs` 已 770 行，不再加长 |

**行数预算**（单文件 ≤ 250）：`schema-warehouse.ts` 239 行（只允许 +3 行，超出则把 `jobs` 定义迁入 `schema-platform.ts`）；`warehouse/jobs-and-peers-store.ts` 235 行（入队逻辑必须迁出到 `watchlist-enqueue.ts`）；`warehouse/facts-pit-store.ts` 218 行（`upsertFiling` 与列表函数迁出到 `filings-store.ts`）；`intel/guidance-store.ts` 233 行（候选采纳写入新文件）；`contracts/workflow-contracts.ts` 239 行（币种原语放 `contracts/intel/primitives.ts`）。

#### B. 迁移编号（编号即合并顺序）

| 编号   | 文件                                    | 批次 | 内容                                                                                                                         |
| ------ | --------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `0034` | `v3/0034-wave-u0-integrity.ts`          | U0   | 分部 `profit_reconciled / period_kind`；指引 `pit/1` 重置 + basis 约束 + 已兑现冻结触发器；事件与快照 RLS 修正；混币账户标记 |
| `0035` | `v4/0035-multi-currency-ledger.ts`      | U1   | 交易币种 / 汇率 / 冲销列；账户币种约束；证券交易币种；汇率许可来源                                                           |
| `0036` | `v4/0036-guidance-candidates.ts`        | U1   | `guidance_candidates`（公共只读、系统写）+ 指引采纳关联                                                                      |
| `0037` | `v4/0037-ops-errors-and-stage6a-rls.ts` | U3   | `app_error_events`（系统专用）+ Stage 6a：4 张用户表 RLS                                                                     |

每个迁移同步修改 `schema*.ts` 的列与 `enableRLS()` / `pgPolicy(...)`，由 `repository.test.ts` 的列 / 索引 / RLS 反射（G11）校验；`migrations/index.ts` 合并 `KANON_V4_MIGRATIONS`。

#### C. API 路由增量（`KNOWN_ROUTES` 49 → 50）

| 路由                          | 方法 | DB 上下文                                 | 能力 / 防护                                  | 批次 |
| ----------------------------- | ---- | ----------------------------------------- | -------------------------------------------- | ---- |
| `api/telemetry/client-errors` | POST | `withSystemDb("telemetry")`（写聚合计数） | 同源 + 持久化限流 30 次 / 分钟；不存用户标识 | U3   |

其余增量均在现有路由上扩展字段或 `op`（见各工作项 ④），不新增路由。

#### D. L2 守卫增量（写入新文件 `scripts/wave-guards-u.mjs`，反例写入 `scripts/wave-guards-u.test.mjs`；`design:check` 追加 `node scripts/wave-guards-u.test.mjs`）

每条至少 3 个「必须被抓住」的反例 + 1 个「不得误报」的正例；契约 / Vitest 类守卫同样附带反例夹具。

| 守卫                                   | 类型               | 规则摘要                                                                                                                                            | 批次    |
| -------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| G20 `cron-liveness-contract`           | test:api           | 授权 Tick 后 `health.cron.state = "ok"`、`lastCompletedAt` 非空；宽限期为 0 时未运行即 `never_ran`                                                  | U0      |
| G21 `no-fabricated-numeric-fallback`   | AST                | `math/{performance,risk,attribution,guidance,segments}`、`repositories/{portfolio,intel}` 中，左操作数为标识符或调用结果时禁止 `?? 非零数字` 与 `   |         | 数字`；禁止 `.fill(非零数字)`。参数对象属性的配置默认值（`params.minDays ?? 60`）与数组下标收窄（`vols[i] ?? 1`）不在此列；当前基线 2 处（`decision-matrix.ts:101`、`covariance.ts:116`），U0 清零 | U0  |
| G22 `periodic-filings-gateway`         | AST                | `api/sec/**`、`tick/**`、`repositories/intel/**` 禁止直接调用 `listFilingsBySecurity`；禁止对 `snapshot.filings` 做 `.slice(0, N)` 后持久化         | U0      |
| G23 `price-basis-ground-truth`         | Vitest + AST       | 随机账本 × 随机拆股 × 追溯后 K 线，NAV 必须等于真实价格路径下的 NAV；`nav-*.ts` 内禁止 `shares *=`                                                  | U0      |
| G24 `prune-protects-referenced-chunks` | Vitest             | Form 4 / 8-K 洪泛夹具下，被 Redline / 指引引用的分块与最近的定期报告分块不得被删除                                                                  | U0      |
| G25 `job-once-after-gateway`           | AST                | `next/server` 的 `after` 只能在 `tick/job-once.ts` 中调用；`build_redline` 作业 id 必须含 section                                                   | U0      |
| G26 `rls-snapshot-survivorship`        | Vitest（强制 RLS） | 快照持有者在档案删除 / 退出组织后仍可读取对应假设事件；非持有者不可读                                                                               | U0      |
| G27 `eval-exercises-production-path`   | garden + Vitest    | 评测必须包含 `searchFilingChunksFts` 召回用例；夜间工作流不得以 `--offline` 运行                                                                    | U0      |
| G28 `health-rls-posture`               | test:api           | `KANON_RLS_ENFORCE_LOCAL=1` 下 `health.db.bypassRls = false`、`rlsFailClosed = true`                                                                | U0      |
| G29 `money-currency-explicit`          | AST                | `features/{portfolio,cockpit/components/overlays,valuation/components/drivers}` 禁止金额字符串里出现字面量 `$`，统一 `formatMoney(value, currency)` | U0 / U1 |
| G30 `entry-export-prod-callers`        | garden             | `@kanon/core`、`@kanon/core/db`、`@kanon/ai` 入口导出的函数必须至少有一个非测试调用方；基线为零                                                     | U0      |
| G31 `public-sample-no-db`              | depcruise          | `apps/web/src/app/sample/**` 不得导入 `@kanon/core/db` 或任何 `api/_lib`                                                                            | U2      |

---

### U0 · 止血与线上验兵（P0 / P1 清零）

#### U0a · 热修（必须在 2026-11-27 22:00 UTC 之前上线）

- **改** `packages/core/src/db/repositories/warehouse/jobs-and-peers-store.ts:100-104`：`daily` 只保留 `evaluate_alerts`（移除 `resolve_guidance`、`prune_chunks`），`enqueueGlobalDailyJobs` 返回值相应改为 2。
- **改** `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts:59-66`：两个 runner 改为返回 `{ skipped: "disabled_pending_u0" }`（防御已入队的作业）。
- **改** `apps/web/vercel.json:10`：`"0 22 * * *"`（每日；Hobby 允许每天一次），消除周末误报，周日重基随之可达。
- **测试**：同步修改 `wave-w0-remediation.test.ts` 中对全局作业数量的断言。
- **上线与验证**：`pnpm check && pnpm test && pnpm test:api` → `npx --yes vercel deploy --prod --yes --regions sin1` → 23:00 UTC 之后 `curl -sS https://app.kanon.hk/api/health`，期望 `jobQueue.lastTickAt` 首次非空（Hobby 计划的调度精度为整点 ±59 分钟，因此热修必须在 22:00 UTC 之前生效）。若仍为 `null`，进入 U0-2 并查看 Vercel Cron 执行记录。
- **人日**：0.5。

#### U0-1 · `prune_chunks` 范围修复

① **问题与买方价值**：季报正文是检验「管理层措辞是否转向」的一阶证据；被删之后，Redline 引用与投委会检索会在不报错的情况下退化为「只看年报」。

② **文件落位**：改 `packages/core/src/db/repositories/intel/redline-store.ts`（122 行 → 约 150 行）；改 `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts`（恢复 runner）；改 `warehouse/watchlist-enqueue.ts`（U0-2 迁出后恢复入队）；测 `intel/redline-store.test.ts`。

③ **数据模型**：无 DDL。删除语句改为：

```sql
WITH periodic AS (
  SELECT accession, security_id, filed_at,
    CASE WHEN form IN ('10-K','10-K/A','20-F','20-F/A') THEN 'annual'
         WHEN form IN ('10-Q','10-Q/A') THEN 'quarter' END AS bucket
  FROM filings WHERE form IN ('10-K','10-K/A','20-F','20-F/A','10-Q','10-Q/A')
),
ranked AS (
  SELECT accession, bucket,
    ROW_NUMBER() OVER (PARTITION BY security_id, bucket ORDER BY filed_at DESC) AS rn
  FROM periodic
),
recent_8k AS (
  SELECT accession FROM (
    SELECT accession, ROW_NUMBER() OVER (PARTITION BY security_id ORDER BY filed_at DESC) AS rn
    FROM filings WHERE form IN ('8-K','8-K/A','6-K')
  ) x WHERE rn <= 8
),
protected AS (
  SELECT current_accession AS accession FROM filing_redlines
  UNION SELECT previous_accession FROM filing_redlines
  UNION SELECT split_part(source_ref, ':', 1) FROM guidance_commitments
    WHERE source_kind = 'filing_chunk' AND source_ref IS NOT NULL
),
keep AS (
  SELECT accession FROM ranked WHERE (bucket = 'annual' AND rn <= 3) OR (bucket = 'quarter' AND rn <= 6)
  UNION SELECT accession FROM recent_8k
  UNION SELECT accession FROM protected
)
DELETE FROM filing_chunks WHERE accession NOT IN (SELECT accession FROM keep) RETURNING id;
```

保留 3 份年报（t、t−1 供 Redline，t−2 应对 10-K/A）与 6 份季报（同季同比需要回溯 3 份 10-Q）。分块 id 的格式为 `{accession}:{section}:{idx}`，`split_part` 取 accession。U1-2 落地后在 `protected` 中追加 `guidance_candidates.accession`。

④ **API 与权限**：无路由变化；在 `withSystemDb("cron_tick")` 中执行，归属 G12 白名单的既有条目。

⑤ **不变量**：`∀ a ∈ protected：chunks(a)` 在 prune 前后相等；`∀ 证券：最近 3 份年报与 6 份季报的分块数不变`；prune 幂等。

⑥ **负向测试与守卫（G24）**：夹具 = 1 份 10-K（被 Redline 引用为 `previous`）+ 3 份 10-Q + 1 份 10-K/A + 4 份 8-K + 10 份 Form 4。断言：被引用分块全部保留；第 7 份及更早的 10-Q 分块被删；Form 4 不影响排名；连续执行两次结果相同。反例：把 `protected` 子查询删掉，测试必须失败。

⑦ **人日 / 依赖**：0.5；依赖 U0a。

#### U0-2 · Tick 存活性与吞吐

① **问题与买方价值**：告警、日线、SEC 同步与指引兑现都挂在这条链路上；它的失败目前不可见，「健康」是一个无法证伪的陈述。

② **文件落位**：

- 新增 `apps/web/src/app/api/internal/jobs/tick/tick-runner.ts`：开始心跳 → 带截止的排空 → 告警阶段 → 完成心跳。`route.ts`（167 行）瘦身为鉴权 + 调用。
- 改 `tick/job-handlers.ts`：`JobRunner = (job, signal: AbortSignal) => Promise<JobOutcome>`，信号透传给 `runSyncSecForTicker`、`runBuildRedlineJob`、`runSyncSegmentsJob`、`runSyncDailyBarsForTicker`（这些函数已有或需新增可选 `signal` 参数，均在 `_lib/` 现有文件内修改）。
- 新增 `packages/core/src/db/repositories/warehouse/watchlist-enqueue.ts`：从 `jobs-and-peers-store.ts` 迁出 `enqueueWatchlistJobs` 及辅助函数，并在入队前把同一 `(kind, ticker)` 的更早 `pending` 作业标记为 `skipped: superseded`。
- 改 `warehouse/job-queue-helpers.ts`：`recordTickStarted`、`recordTickCompleted`、`ensureFirstSeen`、`getCronHealth`。
- 新增 `packages/core/src/contracts/ops/health-contracts.ts` 与 `contracts/ops/index.ts`；在 `packages/core/src/index.ts` 导出。
- 改 `apps/web/src/app/api/health/route.ts`、`apps/web/vercel.json`。
- 可选新增 `.github/workflows/cron-tick-hourly.yml`（需仓库所有者在 GitHub Secrets 中配置 `KANON_CRON_SECRET`；仓库为公开仓库，定时任务不向 fork 暴露密钥）。
- 改 `scripts/verify-api-contracts.mjs`（G20）。

③ **数据模型**：无 DDL。`jobs` 表新增两条系统元数据行：`sys:last_tick`（payload 改为 `{ startedAt, completedAt, phase, workerId, claimed, completed, failed }`）与 `sys:first_seen`（`{ at }`，首次 health 调用以 `INSERT ... ON CONFLICT DO NOTHING` 写入）。`SYSTEM_META_JOB_KINDS` 追加 `first_seen`。

④ **API 契约**：

```ts
// packages/core/src/contracts/ops/health-contracts.ts
export const CronStateSchema = z.enum(["ok", "pending_first_run", "stale", "never_ran", "overrun"]);
export const HealthCronSchema = z.object({
  state: CronStateSchema,
  lastStartedAt: z.string().datetime().nullable(),
  lastCompletedAt: z.string().datetime().nullable(),
  lastClaimed: z.number().int().nonnegative().nullable(),
  lastFailed: z.number().int().nonnegative().nullable(),
  backlog: z.number().int().nonnegative(),
});
export const HealthDbPostureSchema = z.object({
  bypassRls: z.boolean(),
  rlsFailClosed: z.boolean(),
});
export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded"]),
  timestamp: z.string().datetime(),
  secretsConfigured: z.object({
    credentials: z.boolean(),
    cron: z.boolean(),
    secUserAgent: z.boolean(),
  }),
  jobQueue: z.unknown(), // 保留旧字段，lastTickAt = cron.lastCompletedAt，兼容一个版本后移除
  cron: HealthCronSchema,
  db: HealthDbPostureSchema,
  dbSizePct: z.number().nullable(),
});
```

- `GET /api/health`：公开，只返回布尔与时间戳；`withSystemDb("health")` 单事务。
- `POST|GET /api/internal/jobs/tick`：Bearer `CRON_SECRET`；三阶段边界不变（领取在系统事务内 → 作业执行在事务外 → 完成 / 失败在系统事务内），心跳的开始与完成各自独立成事务。

⑤ **不变量与算法**：

- `deadline = startedAt + TICK_BUDGET_MS`；领取前要求 `remaining ≥ JOB_COST_MS[kind]`（`sync_daily_bars` 6 秒、`sync_sec` 25 秒、`build_redline` 30 秒、`sync_segments` 20 秒、其余 5 秒），否则停止排空；执行时传入 `AbortSignal.timeout(remaining)`。告警阶段始终保留 15 秒。
- 状态判定：`pending_first_run` ⇔ `lastStartedAt = null ∧ now − firstSeen ≤ 30h`；`never_ran` ⇔ `lastStartedAt = null ∧ now − firstSeen > 30h`；`overrun` ⇔ `lastStartedAt > (lastCompletedAt ?? −∞) + 5min`；`stale` ⇔ `now − lastCompletedAt > 26h`；否则 `ok`。`status = degraded` ⇔ `cron.state ∈ {never_ran, overrun, stale} ∨ pendingStale ∨ storageDegraded ∨ (生产环境 ∧ (db.bypassRls ∨ ¬db.rlsFailClosed))`。
- 全新环境（`firstSeen` 刚写入）返回 `pending_first_run`：如实表达「尚未运行」，但在 30 小时宽限内不降级，`test:api` 现有的「全新环境 healthy」断言保持成立；环境变量 `KANON_CRON_GRACE_HOURS=0` 可在测试中把宽限期设为零。
- 积压合并后，同一 `(kind, ticker)` 至多存在一个 `pending` 作业。

⑥ **负向测试与守卫（G20）**：

1. `test:api`：授权 Tick → `cron.state = "ok"`、`lastCompletedAt` 非空、`lastStartedAt ≤ lastCompletedAt`。
2. `test:api`：以 `KANON_CRON_GRACE_HOURS=0` 启动的第二个环境中未运行 Tick → `cron.state = "never_ran"`、`status = "degraded"`。
3. Vitest：注入一个耗时超过剩余预算的 runner → 被跳过且不领取；注入一个不响应信号的 runner → 下一次 Tick 显示 `overrun`。
4. Vitest：同一标的连续两天入队 → 第一天的 `pending` 被标记 `superseded`。
5. 周日重基：以真实调度表达式计算未来 14 天的触发日，断言至少包含一个 UTC 周日（防止再次写出不可达分支）。
6. E2E 第 05 章：Tick 之后断言 `GET /api/health` 的 `cron.state`。

⑦ **人日 / 依赖**：1.5；依赖 U0a。砍掉：分钟级 Cron（Hobby 不支持）；把 Tick 拆成多个 Vercel Cron（Hobby 限制每天一次）。小时级 GitHub Actions 触发器为可选项，需仓库所有者配置密钥。

#### U0-3 · 申报主数据完整性

① **问题与买方价值**：同口径跨期对照的前提是「拿到的确实是那份 10-K 的正文」；目录页被当作原文时，系统给出的是「无变化 / 缺失」这种看似中性、实则错误的结论。

② **文件落位**：

- 新增 `packages/core/src/db/repositories/warehouse/filings-store.ts`：迁入 `upsertFiling`、`listFilingsBySecurity`，新增 `listPeriodicFilingsBySecurity`（`facts-pit-store.ts` 只保留事实相关逻辑）。
- 改 `apps/web/src/app/api/_lib/sec-warehouse-sync.ts:114`：持久化完整的 `snapshot.filings`（≤ 20），不再 `slice(0, 10)`。
- 新增 `packages/ai/src/sec/redline/primary-doc.ts`：`resolvePrimaryDocUrl(cik, accession, signal)`，经 `fetchSecWithRetry` 读取 submissions（含 `filings.files` 分页）定位 `primaryDocument`；只在 URL 以 `/` 结尾时调用。
- 改 `_lib/sec-intel-jobs.ts`：取文档前修复目录型 URL 并回写；target 选择改为原件优先。
- 改 `api/sec/[ticker]/redline/route.ts`、`api/sec/[ticker]/segments/route.ts`：统一改用 `listPeriodicFilingsBySecurity`。
- 改 Redline 算法版本常量：`redline/1` → `redline/2`（`packages/ai/src/sec/redline/index.ts` 与 `redline/route.ts`），旧缓存行因主键含 `algo_version` 自然失效，无需删除。

③ **数据模型**：无 DDL。`upsertFiling` 的冲突更新改为：

```sql
primary_doc_url = CASE WHEN filings.primary_doc_url LIKE '%/' AND EXCLUDED.primary_doc_url NOT LIKE '%/'
                       THEN EXCLUDED.primary_doc_url ELSE filings.primary_doc_url END,
fiscal_year   = COALESCE(filings.fiscal_year, EXCLUDED.fiscal_year),
fiscal_period = COALESCE(filings.fiscal_period, EXCLUDED.fiscal_period),
period_end    = COALESCE(filings.period_end, EXCLUDED.period_end),
items = CASE WHEN cardinality(EXCLUDED.items) > 0 THEN EXCLUDED.items ELSE filings.items END
```

④ **API 契约**：响应结构不变；`FilingRedlineResponse.algoVersion` 变为 `"redline/2"`。`listPeriodicFilingsBySecurity(db, securityId, { forms?: readonly PeriodicForm[]; limit?: number })`，`PeriodicForm = "10-K" | "10-K/A" | "10-Q" | "10-Q/A" | "20-F" | "20-F/A"`。

⑤ **不变量**：

- target 选择：在周期性申报中取最新的**原件**；若最新的是修正件且同一 `period_end` 存在原件，则用原件；只有不存在原件时才使用修正件。
- 比较期选择沿用 `findComparablePriorFiling`，但候选集合只含周期性申报。
- 任何时刻 `primary_doc_url` 都不会从文档 URL 退化为目录 URL。

⑥ **负向测试与守卫（G22）**：

1. 夹具：submissions 最近 10 份为 1 份 10-Q + 3 份 8-K + 6 份 Form 4，PIT 事实覆盖 5 年 → 同步后上一年 10-K 的 URL 为文档 URL（经 `resolvePrimaryDocUrl` 修复），Redline 为 `ready`。
2. 夹具：再追加 30 份 Form 4 → Redline 与分部仍能找到 10-K / 10-Q。
3. 夹具：最新为 Part III 型 10-K/A → target 为原件 10-K。
4. 夹具：先写文档 URL、后写目录 URL → 文档 URL 保留；`items` 不被清空。
5. G22 反例：路由中直接调用 `listFilingsBySecurity(`；`snapshot.filings.slice(0, 10).map(upsertFiling)`；别名导入 `listFilingsBySecurity as lf`。正例：`listPeriodicFilingsBySecurity(`。
6. E2E mock：submissions 增加 8-K 与 Form 4 条目，第 04 章必须仍然 `ready`。

⑦ **人日 / 依赖**：1.5；无前置依赖。

#### U0-4 · R1 / R2 作业去重与终态

① **问题与买方价值**：同一份申报被重复下载 9 次，既浪费 SEC 的公平访问配额，也让失败永远显示为「加载中」——研究员无法区分「还在算」和「算不出来」。

② **文件落位**：新增 `apps/web/src/app/api/internal/jobs/tick/job-once.ts`（`scheduleJobOnce`：入队 + 按需领取 + `after()` 执行 + 完成 / 失败回写）；改 `api/sec/[ticker]/redline/route.ts`、`api/sec/[ticker]/segments/route.ts`、`_lib/sec-warehouse-sync.ts:89-96`；改 `features/research-steps/components/filing/filing-redline-view.tsx`（遇 `failed` 停止轮询）；改 `features/valuation/components/drivers/sotp-sec-import.tsx`（刷新按钮在 202 后自动转为一次 GET 轮询）。

③ **数据模型**：无 DDL。作业 id 规范：`build_redline:{accession}:{section}`、`sync_segments:{accession}`。

④ **API 契约**：

- `GET /api/sec/[ticker]/redline`：缓存未命中时读取作业状态：作业为 `failed` → 200 + `status: "failed"`；作业为 `pending` / `running` → 202 + `status: "pending"`；作业不存在 → `scheduleJobOnce` 后返回 202。
- `GET /api/sec/[ticker]/segments`：同理，作业失败时返回 `status: "unavailable"`。
- `scheduleJobOnce(spec)`：先在 `withSystemDb("user_triggered_sync")` 中入队并以 `claimJobById(id, workerId)` 抢租约；只有抢到租约的请求才调用 `after()`；`after()` 内三阶段执行，结束时以同一 `workerId` 回写 `completeJob` / `failJobWithBackoff`。Cron 与按需执行因此共用一套租约，不会重复。

⑤ **不变量**：同一 `(accession, section)` 在任意时刻至多一个执行者；一次页面打开最多触发一次构建；失败在 `maxAttempts` 次后成为 `failed` 终态并对用户可见。

⑥ **负向测试与守卫（G25）**：

1. Vitest：并发 9 次 GET（mock SEC 延迟 2 秒）→ 只发生 1 次构建、2 次 SEC 文档请求。
2. Vitest：先 `risk_factors` 后 `mda` → 队列中两条不同作业。
3. Vitest：SEC 返回 500 → 3 次尝试后 GET 返回 `failed`，客户端停止轮询。
4. G25 反例：路由文件直接 `import { after } from "next/server"`；`enqueueJob({ id: \`build_redline:${acc}\` })`；`after(() => run().catch(() => undefined))`。正例：`scheduleJobOnce({ kind: "build_redline", accession, section })`。

⑦ **人日 / 依赖**：0.75；依赖 U0-2（租约辅助函数）。

#### U0-5 · 净值口径统一：拆股基准归一

① **问题与买方价值**：净值、回撤与超额收益是对外展示的业绩，错一次就失去信任；拆股在大盘科技股中很常见，必须一次做对。

② **文件落位**：新增 `packages/core/src/math/performance/split-basis.ts`（纯函数：基准因子、交易归一、断崖检测）；改 `math/performance/nav-helpers.ts`（删除 `applySplitsForHolding`）、`nav-series.ts`、`dividend-audit.ts`；新增 `packages/core/src/db/repositories/portfolio/basis-normalize-store.ts`（读取拆股与 K 线重基状态）；改 `repositories/portfolio/performance-inputs-store.ts` 的注释与命名（"unadjusted" → "split-basis"）；改 `scripts/wave-guards-rs.mjs` 中 G16 的说明文案；测 `math/performance/split-basis.test.ts`。

③ **数据模型**：无 DDL。

④ **API 契约**：`PortfolioPerformanceResponse.basis`（`contracts/analytics/performance-contracts.ts`）新增枚举值 `"rebase_pending"`：检测到拆股断崖时，所有收益指标为 `null`，`series` 只含 NAV 与现金。

⑤ **数学不变量**（`split-basis.ts`）：

- 拆股集合 `{(e_k, r_k)}`；最新基准因子 `F(t) = ∏_{k: e_k > t} r_k`。库内收盘价 `P̃_t = P_t / F(t)`，Yahoo / Polygon 股息同为基准口径 `D̃ = D / F(t)`。
- 交易归一：`q̃_d = q_d · F(d)`，`p̃_d = p_d / F(d)`，现金 `q̃_d · p̃_d = q_d · p_d` 不变。
- 净值循环**不再应用拆股**：`MV_t = Σ_i q̃_i · P̃_{i,t} = Σ_i q_i · P_{i,t}`，持仓在除权日保持连续。
- 断崖检测：对每个 `e_k`，若 `|ln(P̃_{e−1} / P̃_e) − ln r_k| < |ln(P̃_{e−1} / P̃_e)|`（价格跳变可由拆股解释），判定 K 线未重基 → `rebase_pending`，并入队 `backfill_bars`。
- 重放（现金路径、FIFO、可卖股数）继续使用真实股数，与净值互不影响。
- 黄金用例：入金 $8,600、2024-05-01 以 $860 买入 NVDA 10 股、2024-06-10 10:1 拆股，基准 K 线 2024-05-01 为 $86 → 2024-05-01 NAV = $8,600，2024-06-10 NAV 与当日真实市值一致，最大回撤等于真实价格路径下的回撤。

⑥ **负向测试与守卫（G23）**：

1. 性质测试：随机生成真实价格路径与拆股表 → 构造基准 K 线 → 随机账本 → `buildPortfolioPerformanceSeries` 的 NAV 与 `Σ q · P` 逐日相差 ≤ 1e-6。
2. 未重基夹具（K 线在除权日出现 10 倍断崖）→ `basis = "rebase_pending"`，`twrPct = null`。
3. 股息审计：拆股前的股息按基准股数 × 基准股息计算，与真实金额一致。
4. G23 AST 反例：`nav-helpers.ts` 中出现 `h.shares *= sp.ratio`；`nav-series.ts` 中调用 `applySplitsForHolding`。正例：`split-basis.ts` 中的 `normalizeTxToBasis`。

⑦ **人日 / 依赖**：1；依赖 Q5-4 的全量重基（已上线）。

#### U0-6 · R3 兑现口径

① **问题与买方价值**：「管理层说到做到吗」是定价可信度的核心输入；用上年数据判定今年承诺，会把可信的管理层记成失信。

② **文件落位**：新增 `packages/core/src/math/guidance/period-binding.ts`（纯函数）；改 `repositories/intel/guidance-resolver.ts`（使用期间绑定、拆股归一、兑现 `superseded`、对不支持的指标立即 `unresolvable`）；改 `math/guidance/credibility.ts`（初始指引计分）；改 `repositories/intel/guidance-store.ts`（确认时校验 basis；撤回只允许未兑现条目）；改 `contracts/intel/guidance-contracts.ts`；测 `math/guidance/period-binding.test.ts`、`intel/guidance-store.test.ts`。

③ **迁移 `0034`（指引部分）**：

```sql
UPDATE guidance_commitments SET outcome = NULL, surprise = NULL, actual_value = NULL,
  actual_source_json = NULL, resolved_at = NULL, resolution_version = NULL,
  target_period_end = NULL, updated_at = NOW()
WHERE resolution_version = 'pit/1';

ALTER TABLE guidance_commitments ADD CONSTRAINT chk_guidance_basis_required CHECK (
  status <> 'confirmed' OR metric NOT IN ('diluted_eps', 'gross_margin', 'operating_margin')
  OR basis <> 'unspecified'
) NOT VALID;

CREATE OR REPLACE FUNCTION kanon_guard_resolved_guidance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.resolved_at IS NOT NULL AND NOT kanon_rls_is_system() AND (
       NEW.low IS DISTINCT FROM OLD.low OR NEW.high IS DISTINCT FROM OLD.high
    OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.basis IS DISTINCT FROM OLD.basis
    OR NEW.target_fiscal_year IS DISTINCT FROM OLD.target_fiscal_year
    OR NEW.target_fiscal_period IS DISTINCT FROM OLD.target_fiscal_period
    OR NEW.status IS DISTINCT FROM OLD.status OR NEW.outcome IS DISTINCT FROM OLD.outcome) THEN
    RAISE EXCEPTION 'Resolved guidance commitment % is frozen', OLD.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guidance_resolved_frozen ON guidance_commitments;
CREATE TRIGGER trg_guidance_resolved_frozen BEFORE UPDATE ON guidance_commitments
  FOR EACH ROW EXECUTE FUNCTION kanon_guard_resolved_guidance();
```

- 重置语句必须位于触发器创建之前（同一迁移内顺序执行）。
- **只拦截 UPDATE，不拦截 DELETE**：`guidance_commitments.thesis_id` 为 `ON DELETE CASCADE`，DELETE 触发器会复现 `0033` 的「级联撞触发器 → 删档 500」事故（`.rules/postmortems.md` 2026-11-27 条）。
- `NOT VALID`：只约束新写入，不让存量数据阻塞迁移。

④ **API 契约**（`PATCH /api/theses/[id]/guidance`，能力 `write`，`withUserDb` 单事务）：

- `op: "confirm"`：`diluted_eps / gross_margin / operating_margin` 的 `basis = 'unspecified'` → 422 `BASIS_REQUIRED`。
- `op: "withdraw"`：`resolvedAt` 非空 → 409 `ALREADY_RESOLVED`。
- `GuidanceCredibilitySchema` 新增 `initialKeptRatio: string | null`（主指标，以每期最早发布的指引计分）与 `latestKeptRatio: string | null`（参考）；`keptRatio` 保留一个版本作为 `initialKeptRatio` 的别名。
- `GuidanceCommitment.actualSourceJson` 增加 `periodEnd`、`splitFactor`、`derived: "fy_minus_9m" | null`。

⑤ **数学不变量**（`period-binding.ts`）：

- 目标 `(FY t, P)` 的候选事实 `C = { f : f.fy = t ∧ f.fp = P ∧ f.duration = D(P) }`；原始申报 `A* = argmin_{a ∈ accessions(C)} filedAt(a)`；当期结束日 `e* = max{ f.periodEnd : f ∈ C, f.accession = A* }`（比较期的结束日都更早）；实际值取 `A*` 中 `periodEnd = e*` 的事实。
- Q4 不单独申报：`Q4 = FY(A*_FY) − YTD9M(A*_Q3)`，两者 `periodEnd` 与 `periodStart` 必须首尾相接，否则 `unresolvable / q4_unavailable`。
- EPS 拆股归一：`S = ∏_{e ∈ (issuedOn, filedAt(A*)]} r_e`，比较前把指引区间换算为 `low / S`、`high / S`；`splitFactor = S` 记入来源。
- 不支持的指标（`operating_expenses`，以及 PIT 概念表中缺少营业利润时的 `operating_margin`）立即标记 `unresolvable / concept_unavailable`，不再悬挂。
- 信誉：每个 `(metric, label, FY, period)` 链条中，按 `issuedOn` 最早的 `confirmed ∪ superseded` 条目计分；`superseded` 同样参与兑现。
- 黄金用例：FY2025 10-K 含三期营收（2025-01-26 / 2024-01-28 / 2023-01-29），无论行序如何，FY2025 指引都与 2025-01-26 的值比较；2024-02 发布的 FY2025 EPS 指引 $10–11，2024-06 10:1 拆股，实际 $2.94 → 比较区间 $1.0–1.1 → `beat`。

⑥ **负向测试**：

1. 比较期夹具（上述黄金用例）在 100 次随机行序下结论一致。
2. 季度：10-Q 同时含本季与上年同季 → 取本季。
3. `basis = 'unspecified'` 的 EPS 指引确认 → 422；数据库层直接写入 → `chk_guidance_basis_required` 拒绝。
4. 已兑现条目：租户上下文 UPDATE `low` → 触发器抛错；撤回 → 409；删除档案 → 级联成功（回归 `0033` 事故）。
5. 首次指引被修订 → 信誉以首次指引计分；两条都有兑现结果。

⑦ **人日 / 依赖**：1.5；依赖 U0a（作业停用期间完成），上线后恢复 `resolve_guidance` 入队。

#### U0-7 · R2 分部诚实

① **问题与买方价值**：SOTP 是对「业务拆开值多少钱」的判断，基数错了倍数再精确也没有意义。

② **文件落位**：改 `repositories/intel/segment-store.ts`（落库 `profit_reconciled` 与 `period_kind`、读取时直接使用）；改 `apps/web/src/app/api/_lib/sec-intel-jobs.ts`（传入纯函数结果）；改 `packages/ai/src/sec/segments/segment-extract.ts`（利润概念白名单、去掉 USD 兜底）、`xbrl-instance-scan.ts`；改 `packages/core/src/math/segments/sotp-import.ts`（`quarterly_period` 阻断）；改 `contracts/intel/segment-contracts.ts`；改 `features/valuation/components/drivers/sotp-sec-import.tsx`（币种、期间、徽章、真实概念溯源）；新增 `packages/ui/src/lib/format-money.ts`（`formatMoney(value, currency, scale?: "B" | "M")`，基于 `Intl.NumberFormat` 的币种符号，经 `@kanon/ui` 导出；`packages/ui/src/lib` 现为 2 个文件）。

③ **迁移 `0034`（分部部分）**：

```sql
ALTER TABLE segment_reports ADD COLUMN IF NOT EXISTS profit_reconciled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE segment_reports ADD COLUMN IF NOT EXISTS period_kind TEXT NOT NULL DEFAULT 'annual'
  CHECK (period_kind IN ('annual', 'quarter'));
UPDATE segment_reports SET period_kind = 'quarter' WHERE form LIKE '10-Q%';
```

存量行 `profit_reconciled = FALSE`：EBIT 带入在重新同步前保持关闭（诚实降级）。`schema-intel.ts` 同步新增两列（168 → 171 行）。

④ **API 契约**：`SegmentReportSchema` 新增 `periodKind: z.enum(["annual", "quarter"])`、`profitReconciled: z.boolean()`、`revenueConcept: z.string()`、`profitConcept: z.string().nullable()`；`SegmentImportBlockerSchema` 新增 `"quarterly_period"`。`GET /api/sec/[ticker]/segments` 默认只返回年度报告，`?period=quarter` 时返回季度报告（只读、不可带入）。权限不变（登录 + 限流）。

⑤ **不变量**：`importable.revenue ⇒ periodKind = annual ∧ status = reconciled ∧ fxOk ∧ ¬eliminationsMaterial`；`importable.operatingIncome ⇒ importable.revenue ∧ profitIsStandard ∧ profitReconciled ∧ 无亏损分部`；`SotpSegment.source.concept = report.revenueConcept`（或 `profitConcept`），永不硬编码。

⑥ **负向测试与守卫**：

1. 往返测试：P1-3 夹具（营收对账通过、利润不通过）提取 → 落库 → 读取 → `importable.operatingIncome = false`，阻断原因含 `custom_profit_measure`。
2. 10-Q 报告 → `importable` 全部为 `false`，阻断原因 `quarterly_period`。
3. 人民币报告预览显示「CN¥」与本币金额；折算后的带入值等于 `raw × fx / 1e9`。
4. 分部只有 `CostOfRevenue` 维度事实时 → `profitConcept = null`，`operating_income` 列为空。
5. 未对账报告的徽章不使用 `pass`。
6. G29 反例：`` `$${(v / 1e9).toFixed(2)}B` ``、`"营收 ($B)"`、`<span>$</span>{x}`。正例：`formatMoney(v, report.currency, "B")`。

⑦ **人日 / 依赖**：1；FX 数据依赖 U1-1，在此之前非美元报告诚实显示 `fx_missing`。

#### U0-8 · S3 归因诚实

① **问题与买方价值**：「技能还是运气」的复盘只有在不可被事后修饰时才有价值；捏造 β、前视回填和删档改分母都会让复盘变成自我安慰。

② **文件落位**：改 `packages/core/src/math/attribution/decision-matrix.ts`；改 `packages/core/src/db/repositories/portfolio/hypothesis-events-store.ts`（返回 `source`，并读取 `0033` 的 `applied_at`）；改 `apps/web/src/app/api/portfolio/attribution/route.ts`；改 `contracts/analytics/attribution-contracts.ts`；改 `schema-decisions.ts`（策略文本同步）；测 `math/attribution/attribution.test.ts`、`repositories/security/rls-fail-closed.test.ts`。

③ **迁移 `0034`（RLS 部分）**：

```sql
DROP POLICY IF EXISTS kanon_hyp_events_select ON hypothesis_status_events;
CREATE POLICY kanon_hyp_events_select ON hypothesis_status_events FOR SELECT USING (
  kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id)
  OR EXISTS (SELECT 1 FROM decision_snapshots ds
             WHERE ds.thesis_id = hypothesis_status_events.thesis_id AND ds.user_id = kanon_rls_uid())
);
DROP POLICY IF EXISTS kanon_decision_snapshots_insert ON decision_snapshots;
CREATE POLICY kanon_decision_snapshots_insert ON decision_snapshots FOR INSERT WITH CHECK (
  kanon_rls_is_system() OR kanon_rls_open()
  OR (user_id = kanon_rls_uid() AND kanon_thesis_readable(thesis_id))
);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_thesis_user ON decision_snapshots (thesis_id, user_id);
```

`decision_snapshots` 自身的 SELECT 策略只允许读本人行，子查询因此只会命中调用者本人的快照。事件表不可变，前视问题在读取层处理，不改数据。

④ **API 契约**：`DecisionEpisodeSchema` 新增 `outcomeBasis: z.enum(["idiosyncratic", "excess_vs_spy", "unavailable"])` 与 `pendingReason: z.enum(["no_snapshot", "pre_history", "hypotheses_open", "no_benchmark"]).nullable()`；`PortfolioAttributionResponseSchema` 新增 `outcomeBasisCounts`。`GET /api/portfolio/attribution` 仍为本人账户，`withUserDb` 单事务。

⑤ **数学不变量**：

- 结果口径：`β_PIT` 可得（≥ 60 个共同交易日）→ `idio = R − β · R_SPY`；否则若 SPY 可得 → `excess = R − R_SPY`（不乘 β，显式标注）；否则 `unavailable` → `pending / no_benchmark`。代码中不存在任何数值形式的 β 默认值。
- 事件生效时间：`τ(ev) = ev.source = 'import' ? max(recordedAt, appliedAt_0033) : recordedAt`；截止日 `< appliedAt_0033` 且只有导入事件的回合 → `pending / pre_history`。
- 假设集合：只使用快照中的假设；无快照 → `pending / no_snapshot`。
- `skillRatePct = skill / (skill + good_process_bad_luck + lucky + mistake)`，`pending` 不入分母；同时返回各口径计数，供界面说明分母构成。

⑥ **负向测试与守卫（G21、G26）**：

1. β 不足夹具 → `outcomeBasis = "excess_vs_spy"`，`pitBeta = null`，界面不显示「特质收益」字样。
2. 回填前视夹具（P1-7）→ `pending / pre_history`。
3. 无快照回合 → `pending / no_snapshot`，不读取全部假设。
4. G26（强制 RLS）：P1-8 复现场景下删除档案后，A 仍能读取事件，回合仍为 `mistake`；用户 B（无快照）读取为 0 行；A 用他人不可读的 `thesis_id` 插入快照 → RLS 拒绝。
5. G21 反例：`(pitBeta ?? 1)`、`Array(n).fill(0.01)`、`const rate = fx || 1`、`computeBeta() ?? 0.8`。正例：`(divMap.get(d) ?? 0) + amount`（加法单位元）、`params.minDays ?? 60`（配置默认值）、`vols[i] ?? 1`（下标收窄）。

⑦ **人日 / 依赖**：1.25；无前置依赖。

#### U0-9 · S2 风险权重来自账本

① **问题与买方价值**：风险预算必须建立在真实持仓上；研究卡片上的「拟配置比例」是意图，不是敞口。

② **文件落位**：改 `apps/web/src/app/api/portfolio/risk/route.ts`（103 行，改为读取账本）；复用 `repositories/portfolio/performance-inputs-store.ts` 的 `loadTenantAccountAndTransactions` 与 `math/performance/split-basis.ts`；改 `contracts/analytics/risk-contracts.ts`；改 `features/portfolio/components/risk/risk-decomposition-section.tsx`。

③ **数据模型**：无 DDL。

④ **API 契约**：`GET /api/portfolio/risk?accountId=`（本人账户，`withUserDb`）；`basis` 枚举改为 `"ledger_daily_cov" | "insufficient_history" | "empty"`（移除 `sector_tag`）；新增 `accountId`、`cashWeightPct`；`contributions[].weightPct` 改为占 NAV 的比例。

⑤ **数学不变量**：`w_i = q̃_i · P̃_{i,T} / NAV_T`，`w_cash = cash_T / NAV_T`，`Σ w_i + w_cash = 1`；组合波动 `σ_p = sqrt(wᵀ Σ w)`（现金方差与协方差为 0）；ENB 只在风险资产上计算；稀疏标的先剔除再求交集（P2-4）。

⑥ **负向测试**：账本只有现金 → `empty`；组织同事的档案不进入结果；同一标的多笔买入合并为一行；权重和为 1（误差 1e-9）。

⑦ **人日 / 依赖**：0.5；依赖 U0-5。

#### U0-10 · 生产 RLS 实测探针与阶段 C 核验

① **问题与买方价值**：机构客户问「其他租户能看到我的研究吗」时，回答必须来自运行时证据，而不是迁移文件。

② **文件落位**：新增 `packages/core/src/db/repositories/security/db-posture.ts`（`getDbSecurityPosture(tx)`）；改 `apps/web/src/app/api/health/route.ts`；新增 `deploy/rls-verify.sql`（只读核验，内容取自 `docs/WAVE_R_S_PLAN.md` 0.2.5 C0 / C2 与 0.2.6 的核验语句）；改 `deploy/README.md`（第 3 节增加「核验结果记录」）。

③ **数据模型**：无 DDL。查询：

```sql
SELECT r.rolbypassrls, r.rolsuper, kanon_rls_open() AS rls_open
FROM pg_roles r WHERE r.rolname = current_user;
```

④ **API 契约**：`health.db = { bypassRls, rlsFailClosed }`（`rlsFailClosed = ¬rls_open`）；生产环境（`VERCEL_ENV = "production"`）中 `bypassRls ∨ ¬rlsFailClosed` → `status = "degraded"`。只暴露布尔值，不暴露角色名。

⑤ **不变量**：`KANON_RLS_ENFORCE_LOCAL=1` 时 `current_user = kanon_app_local`，`bypassRls = false`；`0028` 之后 `kanon_rls_open()` 恒为 `false`，执行破窗脚本后变为 `true` 并立即反映到 health。

⑥ **负向测试与守卫（G28）**：`test:api`（强制 RLS）断言 `db.bypassRls = false`、`db.rlsFailClosed = true`；Vitest 在 PGlite 中执行 `deploy/rls-break-glass.sql` → `rlsFailClosed = false`。上线后的人工步骤：在 Neon SQL Editor 中执行 `deploy/rls-verify.sql`，并把结果（角色属性、`pg_stat_activity` 中的连接用户）记录到 `deploy/README.md`；若 health 显示 `bypassRls: true`，按阶段 C 创建 `kanon_app` 并切换 `DATABASE_URL`。

⑦ **人日 / 依赖**：0.5；阶段 C 的实际切换需要仓库所有者操作 Neon 与 Vercel 环境变量。

#### U0-11 · 账本跨市场护栏与时区

① **问题与买方价值**：在真正支持多币种之前，最诚实的做法是拒绝无法正确记账的交易，而不是把港币当美元。

② **文件落位**：改 `packages/core/src/contracts/workflow-contracts.ts`（建账币种、标的后缀、未来日期判定）；改 `packages/core/src/math/performance/ledger-replay.ts`（同日排序）；改 `features/cockpit/components/overlays/inbox-and-ledger-sheets.tsx`（`ledger_inconsistent` 账户显示一行状态）。

③ **迁移 `0034`（账本部分）**：

```sql
UPDATE portfolio_accounts SET ledger_inconsistent = TRUE
WHERE base_currency <> 'USD'
   OR id IN (SELECT account_id FROM transactions
             WHERE ticker ~ '\.(HK|SS|SZ|T|L|PA|DE|AS|SW|TO|AX|TW|KS)$');
```

④ **API 契约**：`create_account` 的 `baseCurrency` 暂收紧为 `z.literal("USD")`（U1-1 放开）；`record_transaction` 遇到带交易所后缀的代码 → 400 `CURRENCY_UNSUPPORTED`；未来日期判定改为 `tradeDate > isoDate(now + 14h)`。

⑤ **不变量**：同日排序键 `(tradeDate, rank(action), createdAt, id)`，`rank`：`deposit = 0, dividend = 1, sell = 2, buy = 3, withdraw = 4`；零杠杆在「日终结算」语义下逐日成立。成交时刻未被记录，这是在不引入日内时间戳前提下最贴近真实可用资金的规则（取舍记入 `.rules/postmortems.md`）。

⑥ **负向测试**：同日先录买入、后录卖出（以卖款买入）→ 两笔均成功；同日买入超过「入金 + 卖款」→ `INSUFFICIENT_CASH`；UTC+8 清晨录入当日成交 → 成功；`0700.HK` → 400；混币存量账户在界面显示「账户币种待迁移」。

⑦ **人日 / 依赖**：0.5。

#### U0-12 · 守卫与评测去纸面化

① **问题与买方价值**：门禁全绿只有在它能失败时才有意义。

② **文件落位**：新增 `scripts/wave-guards-u.mjs`、`scripts/wave-guards-u.test.mjs`；改 `package.json`（`design:check` 追加；新增 `eval:live`）；改 `packages/ai/evals/run-evals.mjs`（`--live` 时调用真实 Agent 生成答案并落盘到临时目录，再用同一评分器打分；离线模式明确标注「评分器自检」）；新增 `packages/ai/src/retrieval/fts-recall.test.ts`（以与 `rls-fail-closed.test.ts` 相同的方式启动嵌入式 PGlite，写入 golden 语料，走 `planBilingualQuery` → `searchFilingChunksFts` 计算 Recall@6）；改 `.github/workflows/golden-eval-nightly.yml`（执行 `pnpm eval:live`，缺密钥时失败而非静默降级）；改 `scripts/wave-guards-rs.mjs`（G14 覆盖箭头函数、函数表达式与方法；豁免文件改为在建档 / 导入时写 `source = 'import'` 的初始事件后移除豁免）；删除 `parseBrokerCsvTransactions`（零调用，冲销语义落地后再规划导入）。

③ **数据模型**：无。

④ **API**：无。

⑤ **不变量**：离线评测的报告标题为「评分器自检」，不再输出「IC 准确率」；Recall@6 的生产路径阈值沿用 `baseline.json` 的 `recallAt6All ≥ 0.85`、`recallAt6ZhToEn ≥ 0.80`，未达标即失败（先度量，必要时下调基线并记录原因，而不是继续以内存 BM25 代替）。

⑥ **守卫反例**：

- G27：`package.json` 的 `eval:live` 含 `--offline`；夜间工作流执行 `pnpm eval`；评测测试集中没有任何文件导入 `searchFilingChunksFts`。
- G30：在 `@kanon/core/db` 入口新增一个只被测试调用的导出函数 → 必须失败；正例：被 `apps/web/src/app/**` 调用的导出。
- G14+：`export const writeHyp = async (tx) => tx.update(hypothesesTable)…`（箭头函数）、类方法、对象字面量方法中写 `hypothesesTable` 而不调用 `appendHypothesisStatusEvent`。

⑦ **人日 / 依赖**：2；依赖 U0-1 至 U0-11 的守卫目标代码就位。

---

### U1 · 买方实战核心缺口

**取舍结论**：

| 方向                            | 决定                                         | 理由                                                                                                                                          |
| ------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 多币种账户与跨市场净值归因      | **做（U1-1）**                               | 目标用户以港股 / 中概 / ADR 为主；当前只能诚实阻断（U0-11），不做就无法服务主力人群。ECB 参考汇率免费、官方、可再分发（注明来源），无授权障碍 |
| R3b：8-K Ex-99.1 新闻稿指引草稿 | **做（U1-2）**                               | 指引主要出现在业绩新闻稿而非 10-K；手工录入导致样本长期达不到信誉评级门槛（≥ 4 / ≥ 6）。人工确认流程（G17）已就绪，增量风险小                 |
| 商业行情 / 一致预期源生产闭环   | **只做标注与路由（U1-3）**，合同与再分发延后 | Polygon / FMP / Finnhub 适配器已存在（`packages/ai/src/market/`）；真正的阻碍是多租户 SaaS 的再分发授权与费用，需要商务决策，不是工程问题     |

#### U1-1 · 多币种账户与跨市场净值归因

① **问题与买方价值**：港股与 ADR 投资者的收益有一部分来自汇率；不拆分就无法区分「选股对了」与「汇率帮了忙」。

② **文件落位**：

- 新增 `packages/ai/src/market/fx-ecb.ts`（读取 ECB 日度参考汇率 CSV，换算为 `usd_per_unit`；不走 SEC 网关，独立 10 秒超时）。
- 新增 `packages/core/src/db/repositories/portfolio/fx-rates-reader.ts`（按日取 ≤ d 的最近汇率，回看 ≤ 5 个工作日）。
- 新增 `packages/core/src/math/performance/fx-attribution.ts`（纯函数）。
- 改 `math/performance/nav-series.ts`、`nav-helpers.ts`、`ledger-replay.ts`（金额统一换算到账户本币）。
- 改 `repositories/workflows/portfolio-ledger-store.ts`、`repositories/portfolio/ledger-replay-store.ts`（交易币种、汇率、冲销）。
- 改 `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts` 与 `warehouse/watchlist-enqueue.ts`（新作业 `sync_fx_rates:{day}`，优先级 40；`upsertFxRates` 获得首个生产调用方）。
- 改 `contracts/workflow-contracts.ts`、`contracts/analytics/performance-contracts.ts`；币种原语 `CurrencyCodeSchema` 放 `contracts/intel/primitives.ts`。
- 改 `features/cockpit/components/overlays/ledger-performance-line.tsx`、`inbox-and-ledger-sheets.tsx`（`formatMoney`）。

③ **迁移 `0035`（`migrations/v4/0035-multi-currency-ledger.ts`）**：

```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trade_currency TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fx_to_base DOUBLE PRECISION;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fx_source TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reverses_tx_id TEXT;
UPDATE transactions t SET trade_currency = 'USD', fx_to_base = 1, fx_source = 'identity'
  FROM portfolio_accounts a
  WHERE a.id = t.account_id AND t.trade_currency IS NULL AND a.ledger_inconsistent = FALSE;
ALTER TABLE transactions ADD CONSTRAINT chk_tx_fx CHECK (
  trade_currency IS NOT NULL AND fx_to_base > 0 AND fx_to_base < 1e6
  AND fx_source IN ('identity', 'ecb_reference', 'broker')
) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reverses
  ON transactions (reverses_tx_id) WHERE reverses_tx_id IS NOT NULL;
ALTER TABLE portfolio_accounts ADD CONSTRAINT chk_account_base_currency
  CHECK (base_currency IN ('USD', 'HKD', 'CNY', 'EUR', 'GBP', 'JPY')) NOT VALID;
ALTER TABLE securities ADD COLUMN IF NOT EXISTS trading_currency TEXT;
ALTER TABLE fx_rates_daily ADD COLUMN IF NOT EXISTS source_license TEXT NOT NULL DEFAULT 'ecb_reference';
```

- 只回填一致账户的历史交易为 USD；被 `0034` 标记为不一致的账户保持 `NULL`，由用户在界面上逐笔确认币种后解除标记（不替用户猜测）。
- RLS：新列继承 `transactions` 的用户归属策略；`fx_rates_daily` 为公共参考数据（与 `price_bars_daily` 相同，不启用租户 RLS，列入 `RLS_SYSTEM_EXEMPT`）。
- Drizzle：`schema-workflows.ts` +5 行（170 → 175）；`schema-warehouse.ts` +2 行（239 → 241，触顶前最后一次增加）。

④ **API 契约**（`POST /api/portfolio/ledger`，同源 + 本人账户，`withUserDb` 单事务；汇率在事务**之前**读取，事务内只做校验与写入）：

```ts
export const CurrencyCodeSchema = z.enum(["USD", "HKD", "CNY", "EUR", "GBP", "JPY"]);
// create_account
baseCurrency: CurrencyCodeSchema.default("USD"),
// record_transaction 增量字段
tradeCurrency: CurrencyCodeSchema.optional(),      // 缺省取 securities.trading_currency；CASH 取账户币种
fxToBase: z.number().finite().positive().max(1e6).optional(), // 券商实际汇率；缺省取 ECB 参考汇率
// 新增冲销
z.object({ op: z.literal("reverse_transaction"), accountId: z.string().min(1),
           transactionId: z.string().min(1), note: z.string().max(200).default("") })
```

- 汇率不可得 → 409 `FX_UNAVAILABLE`（不估算）。
- 冲销：追加一条 `reverses_tx_id = 原交易 id` 的反向记录并整体重放；原交易保持不变；同一交易只能被冲销一次（唯一索引）；冲销买入会连带移除该买入的决策归因回合（快照不可变，回合标记 `reversed`）。
- `PortfolioPerformanceResponse` 新增 `baseCurrency`、`localContribution`、`fxContribution`（本币金额）与对应百分比；`basis` 新增 `"fx_stale"`。

⑤ **数学不变量**（`fx-attribution.ts`）：

- 本币净值 `NAV_B(t) = cash_B(t) + Σ_i q̃_i · P̃_i(t) · X_{C_i→B}(t)`。
- 逐日分解（精确可加，无残差）：`ΔMV_i = q̃_i (P̃_t − P̃_{t−1}) X_{t−1} + q̃_i P̃_t (X_t − X_{t−1})`，前项为本地价格贡献，后项为汇率贡献（交叉项归入汇率）。
- 交叉汇率：`usd_per_unit(C) = USD_per_EUR / C_per_EUR`；`X_{C→B} = usd_per_unit(C) / usd_per_unit(B)`。
- 基准：`1 + R_SPY,B = (1 + R_SPY,USD) · (X_{USD→B}(t) / X_{USD→B}(0))`。
- 缺汇率：取 ≤ d 的最近值（≤ 5 个工作日），否则该日 `basis = fx_stale`、收益为 `null`。
- 黄金用例：HKD 账户买入 `0700.HK`（联系汇率，USD/HKD 近似不变）→ 汇率贡献 ≈ 0；EUR 账户买入 NVDA，期间 EURUSD 变动 +5% → 汇率贡献与手算一致（误差 ≤ 1e-9）；`Σ 本地贡献 + Σ 汇率贡献 = ΔNAV − 净入金`（误差 ≤ 1e-9）。

⑥ **负向测试、E2E 与守卫**：汇率缺失 → 409；`fx_stale` 区间的指标为 `null`；冲销后重放结果与「从未录入该交易」完全一致；二次冲销 → 409；E2E 第 07 章新增 HKD 账户 + `0700.HK` 买入 + 冲销各一步；G29 全面启用；G30 确认 `upsertFxRates` 有生产调用方。

⑦ **人日 / 依赖**：5；依赖 U0-5、U0-11。砍掉：同一账户内的多币种现金子账户（券商自动换汇假设记入文档）；本地市场基准（恒指 / 沪深 300 全收益）；新台币（ECB 不覆盖，`2330.TW` 等不支持，ADR 可用）。

#### U1-2 · R3b：8-K Ex-99.1 新闻稿指引候选（人工确认）

① **问题与买方价值**：没有足够的指引样本，信誉账本只能停在「样本不足」；新闻稿是指引最集中的一阶来源。

② **文件落位**：

- 新增目录 `packages/ai/src/sec/press/`：`exhibit-locator.ts`（从申报 `index.json` 定位 EX-99.1）、`press-guidance-rules.ts`（规则抽取：展望 / 指引句式 + 数值区间 + 期间）、`index.ts`。复用 `packages/ai/src/guidance/draft-extractor.ts`（LLM 结构化抽取，可选）与 `quote-anchor.ts`。
- 新增 `packages/core/src/db/repositories/intel/guidance-candidates-store.ts`。
- 改 `apps/web/src/app/api/_lib/sec-warehouse-sync.ts`（Item 2.02 的 8-K 入队 `extract_press_guidance:{accession}`）；改 `tick/job-handlers.ts`。
- 改 `apps/web/src/app/api/theses/[id]/guidance/route.ts`（GET 附带候选；POST 新增 `op: "adopt_candidate"`）。
- 改 `features/research-steps/components/library/guidance-ledger-list.tsx`（候选以一行「来自 8-K · 日期 · 采纳」呈现，不新增卡片）。

③ **迁移 `0036`（`migrations/v4/0036-guidance-candidates.ts`）**：

```sql
CREATE TABLE IF NOT EXISTS guidance_candidates (
  id TEXT PRIMARY KEY,
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('revenue', 'gross_margin', 'operating_margin', 'diluted_eps',
    'capex', 'operating_expenses', 'free_cash_flow', 'custom')),
  basis TEXT NOT NULL CHECK (basis IN ('gaap', 'non_gaap', 'unspecified')),
  unit TEXT NOT NULL CHECK (unit IN ('usd', 'pct', 'usd_per_share')),
  currency TEXT NOT NULL DEFAULT 'USD',
  target_fiscal_year INTEGER NOT NULL,
  target_fiscal_period TEXT NOT NULL CHECK (target_fiscal_period IN ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  low DOUBLE PRECISION,
  high DOUBLE PRECISION,
  quote TEXT NOT NULL CHECK (length(quote) >= 12),
  extractor TEXT NOT NULL CHECK (extractor IN ('rule/1', 'llm/1')),
  issued_on TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (low IS NOT NULL OR high IS NOT NULL),
  CHECK (low IS NULL OR high IS NULL OR low <= high)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guidance_candidates_dedupe
  ON guidance_candidates (accession, metric, target_fiscal_year, target_fiscal_period, basis);
ALTER TABLE guidance_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY kanon_rls_guidance_candidates_read ON guidance_candidates FOR SELECT USING (true);
CREATE POLICY kanon_rls_guidance_candidates_write ON guidance_candidates FOR ALL
  USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());
ALTER TABLE guidance_commitments ADD COLUMN IF NOT EXISTS candidate_id TEXT
  REFERENCES guidance_candidates(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guidance_commit_candidate
  ON guidance_commitments (thesis_id, candidate_id) WHERE candidate_id IS NOT NULL;
```

候选是证券级的公共派生数据，**不跨租户写入任何档案**；采纳动作在用户自己的事务里生成 `draft_ai`。新闻稿分块写入 `filing_chunks`（`section_code = 'ex99_1'`），`source_kind = 'filing_chunk'`，不改动 `0031` 的 CHECK。U0-1 的 `protected` 追加 `guidance_candidates.accession`。Drizzle：`schema-intel.ts` 新表与新列（约 171 → 205 行）。

④ **API 契约**：

- `GET /api/theses/[id]/guidance`（能力 `read`）：响应新增 `candidates: GuidanceCandidateSchema[]`（同一证券、尚未被本档案采纳、最近 8 个季度）。
- `POST /api/theses/[id]/guidance`（能力 `write`）：`{ op: "adopt_candidate", candidateId: string }` → 201 + 新的 `draft_ai`；重复采纳 → 409。
- 作业三阶段：系统事务读取申报 → 事务外抓取 EX-99.1 并抽取 → 系统事务写入分块与候选。LLM 只在配置了服务端密钥时启用，未配置时只运行规则抽取。

⑤ **不变量**：每个候选的 `quote` 必须是分块原文的子串，且 `quote` 中解析出的数值（经 `extractCnAndEnNumbers`）包含 `low` 与 `high`（零容差）；期间解析失败 → 不生成候选；`status = 'confirmed'` 仍只能经 `confirmGuidanceCommitment`（G17）。

⑥ **负向测试**：夹具新闻稿（含「Revenue is expected to be $37.5 billion, plus or minus 2%」）→ 候选 `low = 36.75e9`、`high = 38.25e9`、`unit = usd`；数字不在原文中的 LLM 输出被丢弃；采纳后仍为草稿，未确认前不参与兑现；G17 反例新增：`adoptGuidanceCandidate` 内写 `status: "confirmed"` 必须被抓住。

⑦ **人日 / 依赖**：3；依赖 U0-1、U0-6。砍掉：电话会议纪要抽取（无授权一阶来源）；非美元指引；半年度期间。

#### U1-3 · 数据源许可标注与供应商路由

① **问题与买方价值**：研究员需要知道每个数字的来源与授权性质，才能决定它能否写进投委会材料。

② **文件落位**：改 `packages/ai/src/market/provider-registry.ts`（同一序列内禁止跨供应商静默回落：首选供应商失败时返回错误而不是改用 Yahoo；`MARKET_DATA_PROVIDER` 显式配置时不追加 Yahoo）；改 `packages/ai/src/market/types.ts` 与 `contracts` 中行情来源类型（新增 `licenseClass: "licensed" | "public_reference" | "unofficial"`）；改 K 线写入路径，保证同一证券的序列只有一个 `source`（混源即触发 Q5-4 全量重基）；改导出模块 `packages/core/src/export/formatters.ts`（导出文件脚注列出数据来源与授权性质）。

③ **数据模型**：无新迁移（`price_bars_daily.source` 已存在）；许可映射为代码常量：`yahoo → unofficial`、`ecb → public_reference`、`sec → public_reference`、`polygon / fmp / finnhub → licensed`（以账户实际订阅为准）。

④ **API 契约**：行情相关响应的 `source` 旁新增 `licenseClass`；界面只在悬浮提示与导出脚注中展示（不新增可见文案行）。

⑤ **不变量**：同一序列 `source` 唯一；`consensus.source = "unavailable"` 的既有规则不变；任何 `unofficial` 来源的数值在导出中都有脚注。

⑥ **负向测试**：配置 Polygon 且其返回 403 → 行情请求失败并提示，不出现 Yahoo 数值；混源写入 → 触发全量重基作业。

⑦ **人日 / 依赖**：1。延后：一致预期的生产接入与再分发授权（商务决策）；Vercel Pro / 付费数据的成本评估。

---

### U2 · 视觉减法与对外发布资产

#### U2-1 · Wave R / S 面板减法清单

① **问题与买方价值**：新面板的文字和装饰在和数字争夺注意力。

② **文件落位与改动**：

- `features/portfolio/components/calibration/decision-matrix-view.tsx`：象限名改为「判断正确 · 盈利」「判断正确 · 亏损」「判断失误 · 盈利」「判断失误 · 亏损」，去掉括号与重复徽章；空态改为一行「暂无可归因的成交」；移除行内哈希（锁图标保留，哈希放悬浮提示）；四个象限改为 1px 细线分隔的 2×2 网格，不再使用 `Card`。
- `features/portfolio/components/risk/risk-decomposition-section.tsx`：移除「收缩系数 δ」；四张 `Card` 改为细线指标条（与工作台 4 指标细线条同构）；删除 `sector_tag` 分支及其文案（U0-9 后不再存在该口径）。
- `features/cockpit/components/overlays/ledger-performance-line.tsx`：金额统一 `formatMoney`；`partial_bars` 与 `rebase_pending` 以一枚钛灰徽章提示。
- `features/research-steps/components/filing/filing-redline-view.tsx`：标签由 `form` 推导（10-K：风险因素 · 1A / 经营讨论 · 7；10-Q：风险因素 · 1A / 经营讨论 · 2；20-F：风险因素 · 3.D / 经营回顾 · 5）。
- `features/valuation/components/drivers/sotp-sec-import.tsx`：期间与币种与表头同行；按 `status` 着色。

③–⑤：无数据与 API 变化。

⑥ **测试**：`check-design-and-limits.mjs` 的既有规则（`no-box-in-box-card`、`min-readable-font-size`、`institutional-copy-hygiene`）；`institutional-copy-hygiene` 的禁用词表追加「靠运气」。`scripts/verify-ui-truncation.mjs` 增加上述面板的长代码（如 `BRK.B`）、长分部名与空态矩阵。

⑦ **人日**：1.5。

#### U2-2 · 双主题截图矩阵

- 复用 `.github/workflows/visual-regression.yml`：新增 Step 3 Redline、Step 4 SOTP 带入预览、账本净值、风险分解、决策矩阵五个页面 × 亮 / 暗 × 1440 / 1024 两种宽度的截图；以 WCAG 2.1 AA（正文 4.5:1、图形 3:1）检查 SPY 曲线、细线与徽章对比度，不达标的令牌在 `packages/ui/src/styles/tokens.css` 中调整。
- 产出的真实截图同时用于 U2-4（替换 `docs/assets/` 中的旧图）。
- **人日**：0.5。

#### U2-3 · 免登录公开只读样本档案

① **问题与买方价值**：外部用户在注册前看不到一份完整的研究档案，冷启动门槛高。

② **文件落位**：新增 `apps/web/src/app/sample/[slug]/page.tsx`（`generateStaticParams` 静态生成）；新增 `packages/core/src/db/seeds/sample-dossiers.ts`（由现有 `seed-thesis-nvda.ts` 与 `seed-sec-nvda.ts` 组合的只读快照，标注数据截止日）；改 `apps/web/src/proxy.ts`（`isPublicRoute` 放行 `/sample/` 前缀）；复用档案画布的只读模式（viewer 锁定态）组件；改 `.dependency-cruiser.cjs`（G31）。

③ **数据模型**：无。样本不读数据库，不调用任何 API，不涉及 RLS 与系统上下文。

④ **API**：无。页面带 `<meta name="robots" content="index">`；标题处只有一枚「示例」徽章（诚实标注，不加说明文案）。

⑤ **不变量**：样本中的每个财务数字都来自种子中的真实 SEC 事实，并显示截止日；分析师撰写的文字明确属于示例档案；不展示任何用户数据。

⑥ **测试与守卫（G31）**：depcruise 规则 `public-sample-no-db`，以临时违规导入做反向探针；E2E 新增未登录访问 `/sample/nvda` 返回 200 且无 `/api/` 请求；`proxy.ts` 单测确认 `/sample/x` 不重定向、`/thesis/x` 仍重定向。

⑦ **人日**：1.5。

#### U2-4 · 官网与 README 刷新

- `marketing/index.html`：替换为 U2-2 产出的真实截图；新增指向 `https://app.kanon.hk/sample/nvda` 的入口；能力描述按实际上线状态更新（多币种只在 U1-1 上线后写入）。推送 `main` 后由 GitHub Pages 自动发布。
- `README.md`、`docs/PRD.md`：同步路由数（50）、守卫编号（G1–G31）与新能力。
- **人日**：0.5。

---

### U3 · 可观测性与企业级收尾

#### U3-1 · `requestId` 贯穿、结构化日志与错误事件

① **问题与买方价值**：用户报告「刚才同步失败」时，必须能在一分钟内定位到那一次请求。

② **文件落位**：改 `apps/web/src/app/api/_lib/http.ts`（所有 `jsonOk / jsonError` 附带 `x-request-id` 响应头；接受经校验的入站 `x-request-id`，格式 `^[A-Za-z0-9_-]{8,64}$`）；改 `_lib/logger.ts`（统一字段：`requestId, route, status, durationMs, code, userHash`，`userHash` 为加盐哈希）；改 `_lib/db-context.ts`（`withUserDb / withSystemDb` 以 `set_config('kanon.request_id', id, true)` 绑定，供审计日志关联）；新增 `apps/web/src/app/api/telemetry/client-errors/route.ts`；改 `apps/web/src/app/error.tsx`、`global-error.tsx`（上报错误摘要）；改 `tick-runner.ts`（作业失败写入错误事件）；`SystemDbReason` 追加 `"telemetry"`，G12 白名单同步。

③ **迁移 `0037`（错误事件部分，`migrations/v4/0037-ops-errors-and-stage6a-rls.ts`）**：

```sql
CREATE TABLE IF NOT EXISTS app_error_events (
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('server', 'client', 'job')),
  route TEXT NOT NULL,
  code TEXT NOT NULL,
  sample_request_id TEXT,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fingerprint, day)
);
ALTER TABLE app_error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_error_events FORCE ROW LEVEL SECURITY;
CREATE POLICY kanon_rls_app_error_events_system ON app_error_events FOR ALL
  USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());
```

`fingerprint = sha256(source | route | code | 去除数字与标识符后的消息模板)`；只存聚合计数，不存消息原文与用户标识。保留 30 天，由 `prune_chunks` 同一作业清理。Drizzle 定义写入 `schema-platform.ts`（47 行）。

④ **API 契约**：

```ts
export const ClientErrorReportSchema = z.object({
  route: z.string().trim().min(1).max(120),
  digest: z.string().regex(/^[a-f0-9]{16,64}$/),
  kind: z.enum(["render", "fetch", "unhandled"]),
  buildId: z.string().max(40),
});
```

`POST /api/telemetry/client-errors`：`verifySameOrigin` + `checkPersistentRateLimit`（30 次 / 分钟 / IP）→ `withSystemDb("telemetry")` 计数加一 → 202。health 新增 `errors24h: number`。

⑤ **不变量**：每个 API 响应都有 `x-request-id`；同一请求的日志与审计行共享同一 id；错误事件表不含任何可识别个人的字段。

⑥ **测试**：`test:api` 断言所有路由响应带 `x-request-id`；非法入站 id 被替换；上报端点跨域 → 403、超限 → 429；`KNOWN_ROUTES` 50 条。

⑦ **人日**：2。砍掉：第三方错误监控 SaaS（会把错误内容发送给外部处理方，需要数据处理协议与用户决策，延后）。

#### U3-2 · Stage 6a：4 张用户表 RLS

① **问题与买方价值**：告警规则、日历令牌、AI 用量与手工财务覆盖都是租户私有数据，目前只靠应用层过滤。

② **文件落位**：迁移 `0037`（RLS 部分）；改 `schema-workflows.ts`（`alert_rules`、`calendar_tokens`）、`schema-platform.ts`（`ai_usage`）、`schema-extensions.ts`（`user_sec_overrides`），加 `.enableRLS()` 与 `kanonUserOwnedPolicies(...)`；改 `repository.test.ts`（`RLS_STAGE6_PENDING` 由 11 张减为 7 张）；测 `rls-fail-closed.test.ts`。

③ **迁移**：四张表按 `0027` 的 `buildUserOwnedPolicySql` 同构生成（`ENABLE` + `FORCE` + SELECT / ALL 两条策略，谓词 `kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()`）。

④ **API 与权限**：无路由变化。访问路径核对：日历订阅在认证前按令牌哈希查找，已在 `withSystemDb("calendar_feed")` 内；告警评估在 `withSystemDb("cron_tick")` 内；其余读写都在 `withUserDb` 内（G9 保证句柄来源）。

⑤ **不变量**：租户 B 对 A 的四张表 SELECT 为 0 行、INSERT 被拒；系统上下文可读全部。

⑥ **测试**：`rls-fail-closed.test.ts` 新增四张表的跨租户读写夹具；`test:api` 在强制 RLS 下覆盖收件箱规则、日历订阅、AI 用量与 SEC 手工覆盖四条路径。

⑦ **人日**：1.5。延后 Stage 6b：`sessions`、`api_tokens`、`user_totp_factors`、`memberships`、`org_invitations`、`audit_log`、`restricted_list`（认证前查找或被策略子查询引用，需单独设计）。

#### U3-3 · 投委会全屏只读演示模式

① **问题与买方价值**：投委会上需要一个不会被误编辑、结论先行的展示视图。

② **文件落位**：新增 `apps/web/src/app/thesis/[id]/present/page.tsx`（Server Component，`withUserDb` 读取，`requireThesisAccess(..., "read")`）；新增功能切片 `apps/web/src/features/thesis-present/`（`present-deck.tsx`、`present-slide.tsx`、`index.ts`，3 个文件；跨切片只经 `index.ts` / `public-*.ts` 引用）；样式复用 `@kanon/ui`，打印样式沿用 `@media print` 令牌。

③ **数据模型**：无。

④ **API**：无新路由；复用画布 SSR 引导查询。

⑤ **内容顺序**：综合结论 → 三情景估值与赔率 → 核心假设状态 → 最近一次 Redline 的关键变化 → 指引信誉 → 离场条件；键盘 `←/→` 翻页、`Esc` 退出；无任何编辑控件。

⑥ **测试**：viewer 角色可进入且无写请求；非成员 404；E2E 第 10 章追加演示模式截图；打印为 PDF 时暗色主题自动转为浅色。

⑦ **人日**：1。

---

### 砍掉与延后

- **砍掉**：分钟级 / 多条 Vercel Cron（Hobby 不支持）；账户内多币种现金子账户；本地市场全收益基准；新台币标的；电话会议纪要抽取；第三方错误监控 SaaS；季度分部的 TTM 拼接；券商 CSV 导入（删除零调用的解析器，冲销语义稳定后再规划）；Redline 的 LLM 摘要（沿用 Wave R 决定）。
- **延后**：一致预期的生产接入与再分发授权；R4b 向量检索（以 U0-12 的生产路径 Recall@6 为闸门）；EWMA 协方差；Brinson 归因界面；Stage 6b 的 7 张认证 / 组织表 RLS；`kanon.system` 的二次令牌加固；Vercel Pro 与付费数据的成本评估。

### 批次依赖、人日与完成定义

| 批次 | 内容                                                          | 人日 | 进入条件                                                         |
| ---- | ------------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| U0a  | 停用 `prune_chunks` / `resolve_guidance`、每日调度            | 0.5  | 立即，2026-11-27 22:00 UTC 之前上线                              |
| U0   | U0-1 至 U0-12 + 迁移 `0034` + G20–G30                         | 12.5 | U0a；U0-4 依赖 U0-2；U0-9 依赖 U0-5                              |
| U1   | U1-1 多币种（`0035`）→ U1-2 新闻稿候选（`0036`）；U1-3 可并行 | 9    | U0 全绿；生产 health `cron.state = ok` 且 `db.bypassRls = false` |
| U2   | U2-1 → U2-2 → U2-3（G31）→ U2-4                               | 4    | U0；U2-4 中的多币种描述依赖 U1-1                                 |
| U3   | U3-1（`0037` 错误事件）、U3-2（`0037` RLS）、U3-3             | 4.5  | U0；U3-2 与 U1 无冲突，可并行                                    |
| 合计 |                                                               | 30.5 | 单人串行约 6 周；两人并行（U1 ∥ U2 + U3）约 4 周                 |

**每个批次的完成定义（DoD）**：

1. 门禁：`pnpm format && pnpm check`（含 `wave-guards-u.test.mjs` 全部反例）→ `pnpm test` → `pnpm eval`（离线为评分器自检）与 `pnpm eval:live`（夜间）→ `pnpm build` → `pnpm test:api`（`KANON_RLS_ENFORCE_LOCAL=1`）→ `pnpm test:e2e`。
2. 线上验兵：部署后 `GET https://app.kanon.hk/api/health` 必须满足 `status = healthy`、`cron.state = ok`（U0 之后的第一个调度窗口）、`db.bypassRls = false`、`db.rlsFailClosed = true`；不满足即回滚或进入破窗流程。
3. 文档同步：`AGENTS.md`（路由数 50、守卫 G1–G31）、`README.md`、`docs/PRD.md`、`marketing/index.html`（仅当对外能力变化）、`.rules/editorial-craft.md`（U2 新增禁用词与细线指标条规则）、`deploy/README.md`（`rls-verify.sql` 与核验记录、可选的小时级触发器）。
4. 复发类问题升级为守卫并写入 `.rules/postmortems.md`，本轮至少四条：「健康检查不可证伪（从未运行即健康）」「测试夹具比真实上游更干净（只有定期报告、价格无追溯口径）」「首写者锁死主数据」「同一事实的口径维度缺失（申报财年 ≠ 事实期间、作业 id 缺 section）」。
5. 迁移：`DATABASE_URL_MIGRATE=… pnpm db:migrate`（`KANON_RUNTIME_MIGRATIONS=off`）→ `npx --yes vercel deploy --prod --yes --regions sin1`。

---

## 参考

- Vercel Cron Jobs 用量与定价（Hobby：每天一次，调度精度为整点 ±59 分钟；撰写时已核实）：<https://vercel.com/docs/cron-jobs/usage-and-pricing>
- SEC EDGAR API 文档（companyfacts 的 `fy` / `fp` 随申报给出；同一申报内比较期事实共享这两个值，可在任一大型公司的 companyfacts 响应中直接验证）：<https://www.sec.gov/edgar/sec-api-documentation>
- 价格口径的代码证据：`packages/ai/src/market/bars/providers.ts:120`（Polygon 请求显式带 `adjusted=true`）与 `:185`（Yahoo chart 的 `quote.close`，拆股追溯、不含股息；`adjclose` 另含股息）。
- ECB 欧元外汇参考汇率：<https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html>
- Ledoit, O., Wolf, M. (2004). _Honey, I Shrunk the Sample Covariance Matrix_. Journal of Portfolio Management 30(4)（常数相关目标的 `κ = (π − ρ) / γ`）。
- Meucci, A. (2009). _Managing Diversification_. Risk 22(5).
- Neon 角色与 `BYPASSRLS`：<https://neon.com/docs/manage/roles>
