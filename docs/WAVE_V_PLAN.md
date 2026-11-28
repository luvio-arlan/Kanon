# WAVE V — Post-Wave U 对抗审查 · 生产安全收口与买方链路闭环：蓝图与实施规格书

> **基线**：`main@87933f6`（只读审查；本文件为施工单，不含业务代码改动）。文中行号均基于 `87933f6`。
> **视角**：独立主架构师（口径单一来源、可证伪）+ 买方投研负责人（真实持仓、真实新闻稿、真实港股用户）+ 安全红队（生产 RLS、租户边界、成本滥用）。
> **范围**：`242a238`（U0）、`508fa65`（U1）、`814b0f3`（U2/U3）、`2cc751f`（遥测热修）的实际代码 + 生产 `/api/health` + SEC EDGAR 真实申报。
> **日期**：2026-11-28 UTC。线上探针时间：2026-11-28 10:14 UTC。
> **总盘子**：19 人日（V0 6 · V1 8 · V2 5），宁少而狠。

## 实施状态（2026-11-28 · `e47c75a` 起）

| 项                    | 状态                     | 实际落位 / 偏差                                                                                                                                                                                                                    |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V0-1 生产 RLS 角色    | **代码完成，待运维执行** | `deploy/rls-provision-app-role.sql`、`0038`、`health-watch.yml`（G32）。需要所有者在 Neon 执行脚本并把 Vercel `DATABASE_URL` 切换到 `kanon_app`，之后探针才会变为 `bypassRls: false`                                               |
| V0-2 FX 回填          | 完成                     | `fx-coverage-store.ts`、`api/portfolio/fx-coverage.ts`、`fxGaps`；每日 Cron 自动补齐全库最早外币成交日以来的缺口（G35）                                                                                                            |
| V0-3 口径单一来源     | 完成                     | `loadPortfolioAnalyticsContext` + `toReplayTxInput`（G33）；`computeLedgerPortfolioWeights` 迁入 `math/risk/ledger-weights.ts`；归因回合按成交币种计量，评估的是选股而不是汇率                                                     |
| V0-4 旧账户与汇率输入 | 完成，**并发现根因**     | `normalizeCanonicalTicker` 把 `0700.HK` 改成 `0700-HK` 后才推断币种，港股成交被记为 USD × 1；现改为按原始代码推断，数字交易所代码兼容 `-`，新增 `0039` 重新标记受影响账户（编号较原计划后移一位）                                  |
| V1-1 8-K 新闻稿       | 完成                     | 真实 NVDA `0001045810-26-000088`：0 → 5 条候选（G36）；`0040` 版本化与撤回；同证券采纳（G37）；作业返回 `skipped` 原因                                                                                                             |
| V1-2 记账表单         | 完成                     | 新增 `ledger-tx-form.tsx`、`ledger-tx-history.tsx`；**另修复**列表契约丢弃 `baseCurrency` / `ledgerInconsistent`（前端此前恒按 USD 渲染）                                                                                          |
| V1-3 汇率贡献         | 完成                     | `fx-contribution.ts`（Carino），净值行展示「本地 · 汇率」                                                                                                                                                                          |
| V1-4 非 SEC 标的      | 完成                     | 同步提示以服务端 `notice` 为准；手工财务按申报币种显示（`formatCompactMoney`）                                                                                                                                                     |
| V1-5 新鲜度           | 完成                     | `ops/queue-freshness.ts`、health `freshness`（G38）；`sync_sec` 优先级 52；新闻稿作业只覆盖近 120 天；**另修复** fan-out 与告警阶段按排除列表认领、会把未执行的新作业静默标记完成的问题（`claimDueJobs({ onlyKinds })`）           |
| V1-6 样本复制         | **无需新增代码**         | 样本页已链接 `/register`，注册默认生成含 NVDA 的起步工作区                                                                                                                                                                         |
| V2-1 Stage 6b         | **部分完成**             | `0041`：`sessions`、`api_tokens`、`user_totp_factors`、`audit_log` 已启用（G40，37 表）；`memberships`、`org_invitations`、`restricted_list` 仍待定，原因见 Part 2：建组织与接受邀请时，写入者尚不是成员，需要先改为定义者函数流程 |
| V2-2 托管 AI 额度     | 完成                     | `0042` `ai_usage.key_source`、`checkHostedAiQuota`（G41，默认每用户每日 20 次，`KANON_HOSTED_AI_DAILY_CALLS`）；自治 Agent 此前不记用量，现已补记                                                                                  |
| V2-3 遥测解耦         | 完成                     | 失败先落库、遥测另起事务（G39）；路由模板化；`buildId` 取部署 SHA                                                                                                                                                                  |

迁移实际编号：`0038` 角色授权 · `0039` 数字交易所币种重标记 · `0040` 候选撤回 · `0041` Stage 6b（第一部分）· `0042` AI 用量来源。下文保留原始审查与蓝图，便于对照。

## 阅读约定

- **证据等级**：「已核实」= 直接读到的代码、本地探针或线上响应；「需线上核验」= 本次无权读取（Neon 角色、Vercel 环境变量、生产表数据），列为 V0 待办，不当作事实。
- **严重度**：P0 = 生产安全边界失效，或核心指标静默错误；P1 = 口径 / 权限 / 诚实性实锤缺陷，会改变买方结论或让核心功能整体失效；P2 = 可复现的边界退化、观测盲区或体验摩擦。
- 沿用 Wave R/S/U 的数据诚实总则：取不到、对不上或样本不足一律 `null` + `status` / `reason`，绝不回落默认值。
- 已完成的 U0–U3 不重复规划；本文只处理它们的缺陷与下一阶段增量。

---

## 0. 线上与真实上游核验

### 0.1 探针记录

| 探针                                                               | 结果                                                                                                                                                                                 | 结论                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `GET https://app.kanon.hk/api/health`（10:14 UTC）                 | `status:"degraded"`；`db:{bypassRls:true, rlsFailClosed:true}`；`cron.state:"ok"`、`lastStartedAt:null`、`lastCompletedAt:"2026-11-27T22:21:44Z"`；`errors24h:0`；`jobQueue.done:18` | **生产连接角色绕过 RLS**（P0-1）。U0 完成定义第 2 条（`bypassRls=false`）未满足，但已部署且无人告警     |
| `GET /api/internal/jobs/tick`（无 Bearer）                         | 401                                                                                                                                                                                  | 鉴权正常                                                                                                |
| 心跳时间线                                                         | 最近一次 Tick（11-27 22:21 UTC）早于 U0 部署（`242a238`，11-28 05:16 UTC）；`lastStartedAt:null` 来自旧心跳格式                                                                      | **Wave U 版 Tick 尚未经历任何调度窗口**，首次为 11-28 22:00 UTC；`sync_fx_rates` 迄今未在 Cron 中执行过 |
| SEC `CIK0001045810` 最新 8-K Item 2.02（`0001045810-26-000088`）   | 目录 `index.json` 中新闻稿文件名为 `q3fy27pr.htm`；`-index.html` 的 Type 列明确标注 `EX-99.1`                                                                                        | 现行定位器按文件名猜测必然失败（P1-2）；按 Type 列定位可行                                              |
| 对 `q3fy27pr.htm` 本地运行 `extractPressReleaseGuidanceCandidates` | 120 个分块、Outlook 位于第 27 行、**候选 0 条**                                                                                                                                      | 即使拿到文件，规则抽取也在旗舰标的上零产出（P1-2）                                                      |
| 本地 `vitest src/retrieval/fts-recall.test.ts`                     | 通过（阈值 Recall@6 ≥ 0.85 / 中→英 ≥ 0.80；基线 0.95 / 0.94）                                                                                                                        | R4b 闸门未触发（见 Part 2），但样本是夹具语料，不是生产语料                                             |
| 夜间 `golden-eval-nightly.yml` 运行记录                            | 沙箱内 `gh` TLS 失败                                                                                                                                                                 | **未验证**                                                                                              |

### 0.2 结论

1. 迄今为止，Wave U 交付的所有租户隔离（33 张 RLS 表、Stage 6a 四表、`0034` 快照可见性修正）**在生产中都没有生效**，隔离只靠应用层 `WHERE user_id = …`。这是本轮唯一最高优先级。
2. `degraded` 状态从部署起就持续存在，却没有任何外部观测触发告警。健康探针可以证伪，但**没有人去读它**。
3. U1 的两项旗舰能力（多币种、8-K 指引）在真实数据上**基本没有产出**：FX 历史只有约 15 个交易日，新闻稿抽取对 NVDA 输出 0 条。单测全绿，因为夹具比真实上游更干净，与 Wave U 复盘第 2 条同一类错误再次出现。

---

## Part 1 — Post-Wave U 对抗审查总表

### 1.1 P0

| 编号 | 位置                                                                                                                                                                                                                                                              | 复现路径                                                                                                                                                                                                                                                                                   | 买方 / 安全影响                                                                                                                                                                                                                                                            | 最小修法                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-1 | 生产 `DATABASE_URL` 角色（需线上核验具体角色名）；`deploy/README.md:54` 只有文字说明；仓库内**无** `kanon_app` 建角色 / 授权脚本（`grep kanon_app` 只命中 README、`rls-verify.sql`、测试）                                                                        | `curl https://app.kanon.hk/api/health` → `db.bypassRls:true`（已核实）。`getDbSecurityPosture`（`repositories/security/db-posture.ts:7-20`）读取 `rolbypassrls OR rolsuper`                                                                                                                | 任何一个应用层漏掉 `user_id` 过滤的查询都会跨租户读写；`0034` 的幸存者偏差修正、Stage 6a、`app_error_events` 系统专用策略全部失效。`/thesis/[id]/present` 中 `listGuidanceCommitments(tx, id)`（`present/page.tsx:76`）只靠前置的 `loadThesisCanvasBootstrap` 访问判定兜底 | V0-1：在仓库内提供幂等的 `deploy/rls-provision-app-role.sql`；迁移 `0038` 做条件授权与默认权限；先在 Neon 分支演练 `test:api`，再切换生产 `DATABASE_URL`；部署闸门与外部健康巡检（G32）          |
| P0-2 | `apps/web/src/app/api/portfolio/risk/route.ts:126-143` 组装重放输入时丢弃 `tradeCurrency` / `fxToBase`；`repositories/portfolio/basis-normalize-store.ts:73-93` 以本币收盘价直接与账户本币 NAV 相除                                                               | USD 账户：入金 10,000，买入 100 股 `0700.HK` @ HK$400（`fxToBase≈0.128`，真实成本约 $5,120）。风险路由按 `fx=1` 重放，现金变为 −30,000 → 重放失败 → `holdings:[]` → 风险面板空白。HKD 账户买入 AAPL @ $230（`fx≈7.8`）：现金被高估，AAPL 权重被低估约 7.8 倍且无任何提示                   | S2 协方差风险、集中度簇上限（`CORRELATED_CLUSTER_CAP_PCT`）对所有跨币种组合**静默错误**；港股 + 美股是目标用户的主力组合                                                                                                                                                   | V0-3：抽出唯一的行→重放输入映射 `toReplayTxInput`，性能 / 风险 / 归因三条路由共用；权重按 `shares × close × X(asOf)` 计算，汇率缺失的持仓进入 `missingTickers`（reason `fx`），不回落成本（G33） |
| P0-3 | `apps/web/src/app/api/portfolio/performance/route.ts:42-90` 不检查 `ledger_inconsistent`；`math/performance/nav-helpers.ts:34`、`ledger-replay.ts:88` 以 `fxToBase && fxToBase > 0 ? fxToBase : 1` 回落；`nav-helpers.ts:36` 又按代码后缀推断币种并用真实汇率估值 | `0034` 标记的旧账户（含 `.HK` 成交、`0035` 未回填）：现金按 `fx=1` 扣减 HK$ 金额，持仓却按 HKD→USD 估值 → 建仓当日约 −87% 虚假回撤。界面只显示一条「账户币种待迁移」（`inbox-and-ledger-sheets.tsx:42-45`），但**全仓库没有任何解除该标记的代码路径**（`grep ledger_inconsistent` 已核实） | 旧用户看到捏造的净值、TWR、回撤；标记永远无法解除，账户被永久困住。影响面（被标记账户数）需线上核验                                                                                                                                                                        | V0-4：被标记账户的性能 / 风险 / 归因统一返回 `status:"currency_unconfirmed"`；新增 `op:"confirm_legacy_currency"` 一次性确认并清除标记；删除全部 `: 1` 三元回落并把 G21 扩展到条件表达式（G34）  |

### 1.2 P1

| 编号  | 位置                                                                                                                                                                                   | 复现路径                                                                                                                                                                                                                                                                                                                                                                              | 买方 / 安全影响                                                                                                                                                                                                                                          | 最小修法                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1  | `packages/ai/src/market/fx-ecb.ts:12`（`lastNObservations=15`）；`math/performance/nav-series.ts:204-211`（任一日 `fx_stale` → 整个响应不可用）；`fx-attribution.ts:18,39`（7 日回看） | ① 录入一年前买入的 `0700.HK` → `resolveTxCurrencyAndFx` 抛 409 `FX_UNAVAILABLE`（`fx-rates-reader.ts:151-156`）；② 若手填汇率绕过，NAV 网格从首笔成交日开始，早于汇率表最早日期的每一天都是 `fx_stale` → TWR / 回撤 / 汇率贡献**永久**为 `null`。ECB 每次只返回最近 15 个观测，历史永远补不齐；生产 `fx_rates_daily` 很可能仍为空（`sync_fx_rates` 尚未在 Cron 中执行过，需线上核验） | 多币种能力对所有带历史持仓的非美元用户整体不可用；第一次录入港股成交就失败                                                                                                                                                                               | V0-2：ECB `startPeriod` 区间回填 + 事务外 `ensureFxCoverage`；响应增加 `fxGaps` 显式列出缺口（G35）                                                  |
| P1-2  | `packages/ai/src/sec/press/exhibit-locator.ts:10-11,32-37`；`press-guidance-rules.ts:9-19,197-199`                                                                                     | ① NVDA 新闻稿名为 `q3fy27pr.htm`，不匹配 `ex-99-1 / press / release / earnings`；更糟的是排除规则 `/(?:index                                                                                                                                                                                                                                                                          | summary                                                                                                                                                                                                                                                  | xsl                                                                                                                                                  | cal | def | lab | pre | …)/i`会误删`pressrelease.htm`（含 `pre`）与 `q3fiscal….htm`（含 `cal`）。② 即使拿到文件：收入要点句「…in its outlook.」也命中滚动上下文正则，把含「fourth quarter of fiscal 2027」的标题行覆盖掉，此后每句都推断不出期间；`&#8226;`/`&#8217;` 等数字实体未解码。本地对真实文件运行：**0 条候选**（已核实） | 指引信誉账本依旧停在「样本不足」，U1-2 的买方价值为零；作业照常返回 `"done"`（`job-handlers.ts:96-98`），观测上看不出 | V1-1：按 `-index.html` 的 Type 列定位 EX-99.1；期间上下文只由「outlook / guidance + 期间短语」行设置，要点行不得覆盖；完整解码 HTML 实体；以真实新闻稿作为黄金夹具（G36） |
| P1-3  | `press-guidance-rules.ts:59-63,105-114,126-131`                                                                                                                                        | 真实句式「GAAP and non-GAAP gross margins are expected to be 73.0% and 73.5%, respectively, plus or minus 50 basis points.」→ 候选 `gross_margin / non_gaap / [72.5, 74.0]`；「GAAP and non-GAAP operating expenses … $4.8 billion and $3.4 billion, respectively.」→ `non_gaap / [3.4e9, 4.8e9]`（本地探针已核实；NVDA 2026-11 新闻稿仍使用同一句式）                                | 两个口径被并成一个更宽的区间，「兑现命中率」被系统性抬高，信誉评级失真，而且看起来像有锚点                                                                                                                                                               | V1-1：识别 `GAAP and non-GAAP … respectively`，拆成两条候选（按顺序配对）；无法配对就丢弃；迁移 `0039` 撤回 `rule_version=1` 中受影响的候选          |
| P1-4  | `repositories/intel/guidance-candidates-store.ts:146-180`（`adoptGuidanceCandidate`）                                                                                                  | 对 AAPL 档案 `POST /api/theses/{id}/guidance {op:"adopt_candidate", candidateId:<NVDA 候选>}` → 写入 `securityId = NVDA` 的承诺挂在 AAPL 档案上；兑现时用 NVDA 的事实判定                                                                                                                                                                                                             | 档案级数据被跨证券污染；候选 id 对所有能查看该证券的用户可见                                                                                                                                                                                             | V1-1：采纳前比较 `cand.securityId` 与档案证券，不一致返回 409 `CANDIDATE_SECURITY_MISMATCH`（G37）                                                   |
| P1-5  | `features/cockpit/lib/inbox-ledger-api.ts:119-131`；`features/cockpit/components/overlays/ledger-sheet-parts.tsx:9-16`                                                                 | 界面上唯一的记账入口只发送 `ticker / action ∈ {deposit,buy,sell} / quantity / price / tradeDate`：不带 `thesisId`、`fees`、`tradeCurrency`、`fxToBase`，没有股息 / 出金，也不展示冲销。服务端契约全部支持（`workflow-contracts.ts:24-46`），`GET /api/portfolio/ledger` 也已返回最近 30 笔明细（`ledger/route.ts:29`）                                                                | 没有 `thesisId` 就不会调用 `lockDecisionSnapshotForBuy`（`portfolio-ledger-store.ts:175-185`），**S3 决策矩阵对界面用户永远为空**；手续费为 0 会让成本基数与 TWR 系统性偏高；`FX_UNAVAILABLE` 的报错让用户「手动填写券商成交汇率」，但表单里没有这个字段 | V1-2：表单补齐，并按代码自动关联同名档案；明细行加「冲销」                                                                                           |
| P1-6  | `math/performance/nav-series.ts:148-150,164-167`；`fx-attribution.ts:109-116`；`ledger-performance-line.tsx:128-137`                                                                   | ① `localContributionPct = local / Σ净入金`，分母是累计净入金而不是时间加权：先入金再出金时分母趋近 0，比例发散；与同屏的 TWR 口径不同。② 加仓日的汇率项用 `curr.shares`，新股按 `X_{t−1}→X_t` 计入汇率贡献，但它们是按当日汇率成交的；清仓日 `curr` 缺失，整段汇率变动被归入本地贡献。③ 汇率贡献算完后**界面从未展示**（`apps/web` 中 `grep fxContribution` 无结果）                  | U1-1 承诺的「选股对了还是汇率帮了忙」没有交付；一旦展示，又会与 TWR 不可加                                                                                                                                                                               | V1-3：按日 `fx_t / NAV_{t−1}` 计算贡献，再用 Carino 系数链接（与 TWR 精确可加）；汇率项只计算跨日持有的股数；在净值行展示一行                        |
| P1-7  | `apps/web/src/app/api/internal/jobs/tick/tick-runner.ts:28-29,95-103`；`repositories/warehouse/watchlist-enqueue.ts:6-23,47,59`；`jobs-and-peers-store.ts:149`；`vercel.json` 每日一次 | 每日唯一一次 Tick 的作业预算为 40 秒；按优先级先执行 fx（40）→ SPY（45）→ 全部标的 K 线（50）→ 新闻稿（55），最后才是 `sync_sec`（60，估算 25 秒，剩余不足即被排除）。次日入队时，`supersedeOlder…` 把未执行的旧作业标记为 `skipped/superseded`，于是 `backlog` 恒为 0，`cron.state` 恒为 `ok`。同一 `run_at` 下按入队顺序认领，被挤出的总是同一批尾部标的                            | 标的数稍多时，SEC 新申报只能靠用户手动同步，ROADMAP §7「新 10-K / 10-Q 入库 ≤ 30 分钟」在 Hobby 计划下结构性不可达；健康检查无法证伪这种饥饿（需线上核验实际耗时与标的数）                                                                               | V1-5：health 暴露「最近一次成功同步距今最久的标的」与 `superseded24h`；`sync_sec` 优先于新闻稿；新闻稿只为最近 120 天的申报入队；轮转认领顺序（G38） |
| P1-8  | `tick-runner.ts:55-71,128-141`                                                                                                                                                         | `failJobWithBackoff` 与 `recordAppErrorEvent` 在同一个 `withSystemDb` 回调中执行。遥测写入一旦抛错（`2cc751f` 修复的 timestamptz 参数问题就是实例），失败标记随之回滚；异常未被捕获，直接冒出 `drainSyncQueue` → `runCronTick` 中断 → `recordTickCompleted` 不写 → 作业停在 `running` 直到租约到期                                                                                    | 观测组件的缺陷反过来破坏作业状态机与心跳；这类问题已真实发生过一次                                                                                                                                                                                       | V2-3：遥测写入改为独立事务，并吞掉自身异常；作业状态写入先行（G39）                                                                                  |
| P1-9  | `repositories/portfolio/fx-rates-reader.ts:139-145`                                                                                                                                    | USD 账户记 USD 成交并传 `fxToBase: 7.8` → 写入 `fx_source:"identity"`、汇率 7.8，现金路径与成本放大 7.8 倍；跨币种手填汇率没有与 ECB 的偏离校验（上限只有 `1e6`）                                                                                                                                                                                                                     | 一次手误就会让零杠杆现金路径判定建立在错误金额上                                                                                                                                                                                                         | V0-4：同币种必须为 1；与 ECB 偏离超过 3% 返回 422 `FX_DEVIATION`，除非显式 `fxDeviationAck: true`                                                    |
| P1-10 | `packages/ai/src/copilot/run-copilot.ts:86-108`（无 BYOK 时回落服务端环境密钥）；`api/ai/agent/route.ts:35`、`api/ai/copilot/route.ts:11` 只有按 IP 的每分钟限流                       | 开放注册 + 托管密钥：单 IP 每天可调用 Agent 约 15 × 1440 = 21,600 次；`ai_usage` 有记录但没有额度闸门。生产是否配置了托管密钥需线上核验                                                                                                                                                                                                                                               | 成本无上限，账单可被滥用打穿；用户也不知道自己是在用托管额度还是 BYOK                                                                                                                                                                                    | V2-2：按用户日额度（`ai_usage` 聚合）+ `key_source` 列；超额返回 429 `HOSTED_QUOTA`（G41）                                                           |

### 1.3 P2

| 编号 | 位置                                                                                                                                             | 复现 / 现象                                                                                                                                                                                                                                                  | 最小修法                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | G21 盲区：`scripts/wave-guards-u.mjs:43-55` 只识别 `??` / `\|\|`，作用域不含 `repositories/workflows` 与 `api/portfolio`                         | 漏网的捏造回落：`nav-helpers.ts:34`、`ledger-replay.ts:88,196`（三元）、`ledger-reversal-store.ts:64-66`（`?? 1`、`?? "identity"`）、`ledger-fifo-helpers.ts:107-111` 与 `performance/route.ts:68`（无效本币静默变成 USD）                                   | G34：识别条件表达式中 `: <非零字面量>` 的回落分支，并扩大作用域                                                            |
| P2-2 | `apps/web/src/app/api/internal/jobs/tick/segment-sync-job.ts:179,184-185`                                                                        | 定位失败或抽取为空时返回 `false`，处理器仍记为 `done`；`issuedOn` 缺失时回落为今天（捏造日期）                                                                                                                                                               | 返回 `{ skipped: "no_ex99_1" \| "no_candidates" }`；`issuedOn` 缺失即跳过                                                  |
| P2-3 | `guidance-candidates-store.ts:69`；`press-guidance-rules.ts:188`                                                                                 | 冲突跳过时仍 `written += 1`；只扫描前 120 行，较长的新闻稿（表格行计入行数）可能截断 Outlook                                                                                                                                                                 | 用 `RETURNING` 计数；扫描全文，只持久化与候选相关的分块                                                                    |
| P2-4 | `shared/lib/report-client-error.ts:23,27`；`repositories/security/app-errors-store.ts:26-28,80-88`；`api/telemetry/client-errors/route.ts:17-21` | `route` 原样存入 `window.location.pathname`（含档案 id），基数随档案数增长；`buildId` 写死为 `"web"`，无法关联版本；同源校验基于可伪造的 `Origin`，脚本可以每 IP 每分钟写入 30 条不同指纹；`errors24h` 对「24 小时内被触达的指纹」累加整日计数，最多高估一倍 | 路由模板化（`/thesis/[id]`）+ 白名单；`buildId` 取 `VERCEL_GIT_COMMIT_SHA` 前 8 位；每日指纹上限；`errors24h` 改为按日求和 |
| P2-5 | `repositories/portfolio/performance-inputs-store.ts:91-104`；`fx-rates-reader.ts:82-90`                                                          | 每次请求都加载持仓标的与 SPY 的**全部**历史 K 线和全部汇率；风险只需 252 天，性能只需从首笔成交日开始                                                                                                                                                        | 加 `barDate ≥ 起始日 − 10 天` 下界（V1-5 顺带完成）                                                                        |
| P2-6 | `api/portfolio/attribution/route.ts:55-70`                                                                                                       | 归因路由不传币种 / 汇率：港股回合按本币收益与 USD 计价的 SPY β 超额比较（HKD 联系汇率下影响很小，CNY / JPY / EUR 下显著）                                                                                                                                    | 由 G33 的共享映射一并修正；回合收益按账户本币计算                                                                          |
| P2-7 | `features/thesis/hooks/canvas-api.ts:114-115`；`api/sec/[ticker]/route.ts:115-124`；`api/sec/[ticker]/manual-override.ts:32`                     | 对港股同步：服务端返回 `notice`（非 SEC 申报主体）且 `warehouseSynced:false`，前端优先命中 `warehouseSynced === false` 分支，提示「SEC 快照已更新，历史口径校验未完成」，与事实相反；手工录入的财务数字一律以 `$` 格式化                                     | V1-4                                                                                                                       |
| P2-8 | `nav-series.ts:79` 与 `ledger-replay.ts:103`                                                                                                     | NAV 循环逐日把现金舍入到 2 位，账本重放舍入到 4 位，长期账户的两处现金可能相差若干美分                                                                                                                                                                       | NAV 循环内部保留全精度，只在输出时舍入                                                                                     |

### 1.4 已审查、未发现逃逸点（列明以便回归）

- **IC 全屏演示**（`app/thesis/[id]/present/page.tsx`）：未登录重定向；`loadThesisCanvasBootstrap` 在访问判定（`thesis-canvas-bootstrap.ts:197-198`）不通过时返回 `null` → `notFound()`；演示组件不含写控件。残余风险只来自 P0-1（生产无 RLS 时完全依赖访问判定的先后顺序）。
- **`kanon.system` 上下文**：`set_config('kanon.system', …)` 只出现在 `tenant-context.ts` 与 `migrate-cli.ts`，G12（`wave-guards-rs.mjs:444-447`）拦截其他写法。在 NOBYPASSRLS 角色下，它仍是「应用内可信」边界，不是加密边界；本轮维持现状，不做二次令牌（见 Part 2）。
- **冲销**：`lockAccountForUpdate` 行锁 + `idx_transactions_reverses` 唯一索引，双重防止重复冲销；冲销记录不可再冲销；重放时把原交易与冲销一并过滤（`ledger-replay.ts:62-70`），与「从未录入」完全一致。
- **Stage 6a 四表 RLS** 策略本身与 `buildUserOwnedPolicySql` 同构，日历订阅在 `withSystemDb("calendar_feed")` 内；代码层面没有问题，生产层面被 P0-1 架空。

---

## Part 2 — Stage 6b：7 张认证 / 组织表 RLS 收口设计

### 2.1 根因约束

1. **策略自引用**：`kanon_thesis_writable / deletable`（`0027-rls-functions-and-split.ts:83-110`）与 `theses` 的 SELECT 策略都在策略内部子查询 `memberships`。函数是 `SECURITY INVOKER`，如果给 `memberships` 加一条「同组织成员可见」的策略（策略里再次查询 `memberships`），PostgreSQL 会报 `infinite recursion detected in policy for relation "memberships"`。
2. **认证前查询**：会话与 PAT 查找已经在 `withSystemDb("auth_bootstrap")` 内（`api/_lib/auth-session.ts:51,99`；login / register / logout 共 5 处），不构成阻碍。
3. **全局哈希链**：`appendAuditLog` 在 advisory lock 下按 `created_at DESC` 读取**全表**最新一行的 `entry_hash`（`audit-and-restricted-store.ts:28-35`）。按租户加 SELECT 策略后，租户只能看到自己可见的「最新一行」，链会分叉，篡改证据随之失效。
4. **合规失效开放**：`isTickerRestricted`（`audit-and-restricted-store.ts:172-177`）在用户事务内按 `org_id` 读取。若 `restricted_list` 改为「仅成员可见」，已退出组织但仍持有组织账户的用户会读到 0 行，限制名单**失效开放**。
5. **FORCE 与 BYPASSRLS**：`FORCE ROW LEVEL SECURITY` 对表属主同样生效，`SECURITY DEFINER` 函数要想绕过 RLS，属主必须带 `BYPASSRLS`。Neon 控制台创建的 `neondb_owner` 属于 `neon_superuser`（具备 BYPASSRLS，需线上核验），可以作为定义者函数的属主。

### 2.2 公共构件（迁移 `0040`）

```sql
-- 定义者函数：属主 = 迁移角色（需 BYPASSRLS）；固定 search_path；收回 PUBLIC 执行权。
CREATE OR REPLACE FUNCTION kanon_org_role(oid_ text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.role FROM memberships m
  WHERE m.org_id = oid_ AND m.user_id = kanon_rls_uid() AND m.accepted_at IS NOT NULL
  LIMIT 1
$$;
CREATE OR REPLACE FUNCTION kanon_audit_chain_tail() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT entry_hash FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 1
$$;
CREATE OR REPLACE FUNCTION kanon_ticker_restricted(oid_ text, tickers text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM restricted_list r
    WHERE r.org_id = oid_ AND r.ticker = ANY(tickers)
      AND (r.expires_at IS NULL OR r.expires_at >= NOW()))
$$;
CREATE OR REPLACE FUNCTION kanon_accept_invitation(token_hash_ text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inv org_invitations%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM org_invitations
  WHERE token_hash = token_hash_ AND accepted_at IS NULL AND revoked_at IS NULL
    AND expires_at > NOW() AND invitee_user_id = kanon_rls_uid()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE org_invitations SET accepted_at = NOW() WHERE id = inv.id;
  INSERT INTO memberships (id, org_id, user_id, role, accepted_at, created_at)
  VALUES ('mem_' || md5(inv.id), inv.org_id, inv.invitee_user_id, inv.role, NOW(), NOW())
  ON CONFLICT DO NOTHING;
  RETURN inv.org_id;
END $$;
REVOKE ALL ON FUNCTION kanon_org_role(text), kanon_audit_chain_tail(),
  kanon_ticker_restricted(text, text[]), kanon_accept_invitation(text) FROM PUBLIC;
-- 授权给 kanon_app（条件执行，与 0038 同模式）。
```

- `kanon_thesis_writable / deletable` 以及 `theses` 策略中的 `EXISTS (SELECT 1 FROM memberships …)` 全部改为 `kanon_org_role(t.org_id) IN (…)`，用 `CREATE OR REPLACE` 实现，不删除旧对象。
- `memberships` 的确切列（`id / org_id / user_id / role / accepted_at / created_at`）以 `schema-enterprise.ts:29-42` 为准；`kanon_accept_invitation` 的插入列在实施时按 schema 反射校对（G11）。

### 2.3 逐表决策

| 表                      | 决策                                | 策略（`ENABLE` + `FORCE`）                                                                                                                                               | 访问路径改动                                                                                                                              | 理由                                                                                                            |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sessions`              | **做**                              | `kanonUserOwnedPolicies`：`is_system() OR user_id = uid()`                                                                                                               | 无：查找 / 创建 / 注销已在 `auth_bootstrap`；「活跃会话」列表在用户上下文内                                                               | 零改动成本，令牌哈希也属于租户私有                                                                              |
| `api_tokens`            | **做**                              | 同上                                                                                                                                                                     | 无：PAT 校验在 `auth_bootstrap`（`auth-session.ts:99`）                                                                                   | 同上                                                                                                            |
| `user_totp_factors`     | **做**                              | 同上                                                                                                                                                                     | 登录二步验证 `verifyTotpIfEnabled` 已在系统上下文；绑定 / 解绑在用户上下文                                                                | 密钥材料（即便已加密）只应属主可见                                                                              |
| `memberships`           | **做（依赖 `kanon_org_role`）**     | SELECT：`is_system() OR user_id = uid() OR kanon_org_role(org_id) IS NOT NULL`；INSERT / UPDATE / DELETE：`is_system() OR kanon_org_role(org_id) = 'owner'`              | 接受邀请改为 `SELECT kanon_accept_invitation($hash)`；邀请人以外的任何人不能直接插入成员行                                                | 防住真正的威胁：越权给自己加 owner 角色                                                                         |
| `org_invitations`       | **做（依赖定义者函数）**            | SELECT：`is_system() OR invitee_user_id = uid() OR kanon_org_role(org_id) IN ('owner','pm')`；INSERT / UPDATE：`is_system() OR kanon_org_role(org_id) IN ('owner','pm')` | 被邀请人**不再**直接 UPDATE 邀请行（否则可以顺手修改 `role` 列），一律经 `kanon_accept_invitation`                                        | 关闭「接受时改角色」的越权路径                                                                                  |
| `audit_log`             | **做，但只约束读与写入身份**        | SELECT：`is_system() OR actor_user_id = uid() OR kanon_org_role(org_id) = 'owner'`；INSERT：`is_system() OR actor_user_id = uid()`；UPDATE / DELETE 维持 REVOKE          | `appendAuditLog` 的链尾查询改为 `SELECT kanon_audit_chain_tail()`；链校验只在系统上下文运行                                               | 链尾函数只暴露一个哈希、不暴露任何租户内容，链保持全局单链                                                      |
| `restricted_list`       | **做，但合规判定绝不走 RLS 可见性** | SELECT：`is_system() OR kanon_org_role(org_id) IS NOT NULL`；写：`is_system() OR kanon_org_role(org_id) IN ('owner','pm')`                                               | `isTickerRestricted` 改为调用 `kanon_ticker_restricted`；买入守卫增加：账户带 `org_id` 而调用者不再是成员 → 403 `ORG_MEMBERSHIP_REQUIRED` | 列表可见性按成员收紧，但「能不能买」的判定必须失效关闭                                                          |
| `kanon.system` 二次令牌 | **继续延后**                        | —                                                                                                                                                                        | —                                                                                                                                         | 威胁模型是「应用内 SQL 注入」，G12 + 全量参数化已覆盖；二次令牌会让所有系统作业多一个密钥依赖，收益小于运维风险 |

**前置条件**：V0-1 完成（生产角色 NOBYPASSRLS）。否则 Stage 6b 与 Stage 6a 一样只是纸面防线。

---

## Part 3 — Wave V 战略取舍表

| 候选项                           | 决定                                    | 硬理由                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生产 RLS 角色切换 + 健康外部巡检 | **做（V0-1）**                          | 不做，前三个 Wave 的所有隔离投资都是零                                                                                                                                                                                                    |
| FX 历史回填、跨币种口径统一      | **做（V0-2 / V0-3 / V0-4）**            | 目标用户的主力组合是港股 + 美股；当前要么静默错误，要么整体不可用                                                                                                                                                                         |
| 8-K 新闻稿抽取修复               | **做（V1-1）**                          | 已有 80% 的管道，只差定位与口径拆分；真实文件验证零产出，属于半成品止损                                                                                                                                                                   |
| R4b `pgvector` 混合检索          | **继续延后**                            | 闸门未触发：FTS Recall@6 0.95 / 中→英 0.94（阈值 0.85 / 0.80，本地复跑通过）。但样本是夹具语料，V1-5 顺带为生产语料加 20 条抽样召回；连续两周 < 0.85 才重新评估。Neon 免费层存储与 1536 维向量的体积是第二道闸                            |
| 券商 CSV 对账单导入              | **延后到 Wave V 之后的第一批**          | 先决条件尚未满足：界面连手续费、股息、冲销都还没暴露（P1-5）。最小形态预案：仅 IBKR Flex Query CSV；先试运行、展示差异、确认后整批入账；整批共享 `external_ref = import:{batchId}`，撤销即批量追加冲销行（复用 `reverses_tx_id`），零新表 |
| 英文国际化（`en-US`）与全球买方  | **延后（无期限）**                      | 文案卫生守卫、评测、指引抽取都以中文机构语域为核心；在中文用户的前 10 分钟还有四个断点时扩张语种，等于把四个断点翻译一遍。重启条件：非 `zh` 语言的注册占比 ≥ 20%                                                                          |
| 500+ 标的规模性能优化            | **只做有界查询（并入 V1-5，0.5 人日）** | 个人持仓通常是 10–40 个标的；当前没有任何证据表明 ROADMAP §7 的「200 标的 < 1.5s」被突破（未验证）。先给 K 线 / 汇率加日期下界，系统性优化等真实负载出现再做                                                                              |
| Brinson 归因                     | **永久砍掉**                            | 需要带行业权重的授权基准成分股；对集中持仓的个人组合解释力低；与「决策正确性」2×2 矩阵的买方叙事重复                                                                                                                                      |
| EWMA 协方差                      | **继续延后**                            | 在 60–252 天窗口下，对 LW 收缩的边际改进用户不可感知，却多出一个需要解释的参数                                                                                                                                                            |
| 一致预期商业数据源               | **继续延后**                            | 阻碍是多租户再分发授权（商务决策），不是工程问题；`consensus.source = "unavailable"` 的诚实规则不变                                                                                                                                       |
| 托管 AI 额度 + BYOK 体验         | **做（V2-2）**                          | 不加额度，成本没有上限（P1-10）；加了额度，「先用托管额度体验，再接 BYOK」就是自然的冷启动路径                                                                                                                                            |
| 套餐 / 计费（Stripe 等）         | **延后**                                | 在 20 个真实周活用户完成一次「档案 → 成交 → 季度复盘」闭环之前，计费只会增加摩擦                                                                                                                                                          |
| 新手前 5 分钟：样本档案一键复制  | **做（V1-6）**                          | `/sample/nvda` 已上线；注册后直接复制成自己的档案，能跳过空白画布这一最大的冷启动断点                                                                                                                                                     |

---

## Part 4 — 真实用户「前 10 分钟」链路审计

沿「注册 → 新建首个美股 / 港股标的 → 同步 SEC → 估值与假设 → 跑一次 IC Agent → 记一笔持仓并看风险 / 归因」走查。只列代码中可以复现的断点。

| #   | 断点                                                     | 触发路径与证据                                                                                                                                                                                                                                                                              | 流失机理                                                                             | 修复                           |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| 1   | **港股标的同步后得到一条相反的提示和一片空白**           | 新建 `0700.HK` → `POST /api/sec/0700.HK` → `not_sec_registrant` → 响应 `{snapshot:null, warehouseSynced:false, notice}` → `canvas-api.ts:114-115` 优先弹出「SEC 快照已更新，历史口径校验未完成」；Step 3 / 4 无数据；手工录入的营收以 `$` 显示（`manual-override.ts:32`），腾讯以人民币报告 | 用户以为系统坏了，或者以为数据马上就到；第一印象就是「不支持港股」，而官网写的是港股 | V1-4                           |
| 2   | **第一笔港股成交被 409 拦下，报错指向一个不存在的字段**  | 默认 USD 账户 → 登记 `0700.HK` 买入 → `FX_UNAVAILABLE`（生产汇率表很可能为空；即使有数据也只覆盖约 3 周）→ 文案「请手动填写券商成交汇率」，但表单只有代码 / 数量 / 价格 / 日期（`ledger-sheet-parts.tsx:9-16`）                                                                             | 严肃投资者第一件事就是录入现有持仓，这一步被卡死                                     | V0-2 + V1-2                    |
| 3   | **记了账，归因矩阵却永远是空的**                         | 界面记账不带 `thesisId` → 不生成决策快照（`portfolio-ledger-store.ts:175-185`）→ S3 决策矩阵没有任何回合；用户看到「暂无可归因的成交」，却刚刚记过一笔                                                                                                                                      | 「复盘认知」是 KANON 与行情软件的核心差异，在这里失效                                | V1-2                           |
| 4   | **跨币种组合的风险面板空白或权重错误，汇率贡献从不出现** | P0-2 + P1-6：USD 账户持有港股时风险面板直接为空；HKD 账户持有美股时权重偏小约 7.8 倍；净值行只有 TWR / SPY / 回撤                                                                                                                                                                           | 对数字敏感的用户只要发现一个数字不对，就会怀疑所有数字                               | V0-3 + V1-3                    |
| 5   | **IC Agent 的额度性质不透明**（需线上核验）              | 无 BYOK 时 `resolveByokModel` 回落到服务端环境密钥；若未配置，则只有确定性工具步骤与本地综合；两种情况下界面都没有说明当前走的是哪条路径                                                                                                                                                    | 用户不知道结论是由模型生成的还是规则拼出来的，也不知道会不会被收费                   | V2-2（一枚徽章，不加说明文案） |

注册 / 登录本身（2FA、CSRF、锁定）已有 `test:api` 覆盖，本轮未发现新断点。

---

## Part 5 — Wave V 分批次可执行蓝图

### 全局约束与落位速查

**目录容量**（≤ 12 个非测试 `.ts/.tsx/.mjs`，`87933f6` 实测）：

| 目录                                                | 现状  | 本轮落位规则                                               |
| --------------------------------------------------- | ----- | ---------------------------------------------------------- |
| `packages/core/src/db/repositories`（根）           | 12/12 | 冻结；新增子目录 `repositories/ops/`                       |
| `packages/core/src/db/repositories/warehouse`       | 12/12 | 冻结                                                       |
| `packages/core/src/db/repositories/portfolio`       | 6     | 新增 `fx-coverage-store.ts` → 7                            |
| `packages/core/src/db/repositories/enterprise`      | 6     | 新增 `org-role-store.ts` → 7                               |
| `packages/core/src/db/repositories/security`        | 8     | 新增 `ai-quota-store.ts` → 9                               |
| `packages/core/src/db/migrations/v4`                | 4     | 新增 `0038`–`0041` → 8                                     |
| `packages/core/src/math/performance`                | 10    | 新增 `fx-contribution.ts` → 11                             |
| `packages/ai/src/sec/press`                         | 3     | 新增 `press-period-context.ts`、`press-basis-split.ts` → 5 |
| `apps/web/src/app/api/_lib`                         | 12/12 | 冻结；额度判定放进现有 `byok-headers.ts`（87 行）          |
| `apps/web/src/features/cockpit/components/overlays` | 6     | 新增 `ledger-tx-history.tsx` → 7                           |
| `scripts`                                           | 10    | 新增 `wave-guards-v.mjs`（+ `wave-guards-v.test.mjs`）→ 11 |

**行数预算**（单文件 ≤ 250）：`api/ai/agent/route.ts` 248、`enterprise/organizations-and-rls-store.ts` 248、`warehouse/job-queue-helpers.ts` 248 —— 三者**只减不增**，改动一律落在新文件；`tick-runner.ts` 228（遥测拆分后应缩短）；`press-guidance-rules.ts` 212（期间上下文与口径拆分迁出）；`ledger-sheet-parts.tsx` 212（明细与冲销迁出到 `ledger-tx-history.tsx`）。

**迁移编号**（编号即合并顺序，全部 expand-only，置于 `migrations/v4/`）：

| 编号   | 文件                                    | 批次 | 内容                                                                          |
| ------ | --------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `0038` | `0038-app-role-grants.ts`               | V0   | 条件授权给 `kanon_app` + 默认权限                                             |
| `0039` | `0039-guidance-candidate-retraction.ts` | V1   | 候选 `rule_version` / `retracted_at` / `retract_reason`；撤回口径合并的旧候选 |
| `0040` | `0040-stage6b-rls.ts`                   | V2   | 4 个定义者函数 + 7 表 RLS + 策略函数改用 `kanon_org_role`                     |
| `0041` | `0041-ai-usage-key-source.ts`           | V2   | `ai_usage.key_source`                                                         |

**API 路由**：`KNOWN_ROUTES` 保持 50，只在现有路由上扩展 `op` 与字段。

**L2 守卫增量**（写入 `scripts/wave-guards-v.mjs`，反例写入 `scripts/wave-guards-v.test.mjs`；`design:check` 追加 `node scripts/wave-guards-v.test.mjs`；每条至少 3 个必须抓住的反例 + 1 个不得误报的正例）：

| 守卫                                    | 类型               | 规则摘要                                                                                                                                                                      | 批次 |
| --------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| G32 `live-health-posture-watch`         | garden + 工作流    | `.github/workflows/health-watch.yml` 必须存在：每小时请求生产 health，`status ≠ healthy` 或 `db.bypassRls = true` 即失败；`deploy/README.md` 的部署步骤必须包含同一断言       | V0   |
| G33 `ledger-replay-input-single-source` | AST                | `apps/web/src/app/api/portfolio/**` 中禁止手写同时含 `quantity` 与 `fees` 键的对象字面量，必须调用 `toReplayTxInput`                                                          | V0   |
| G34 `no-fabricated-fallback-ternary`    | AST（G21 扩展）    | 在 G21 作用域 + `repositories/workflows` + `api/portfolio` 内，禁止 `cond ? x : <非零数字字面量 \| "USD" \| "identity">` 形式的回落                                           | V0   |
| G35 `fx-history-coverage`               | Vitest             | 400 天前买入 `0700.HK` 的 USD 账户：回填夹具下 `status = ready`；缺口时 `fxGaps` 非空且指标为 `null`；同币种 `fxToBase ≠ 1` → 422                                             | V0   |
| G36 `press-extractor-real-fixtures`     | Vitest             | 3 份真实 EX-99.1（NVDA `q3fy27pr.htm` + 另外两家在新闻稿中给出 Outlook 的发行人）+ 对应 `-index.html`：定位成功；候选与人工标注逐值一致；`respectively` 句拆为两条或不产出    | V1   |
| G37 `guidance-adopt-same-security`      | Vitest             | 跨证券采纳 → 409；同证券 → 201 且 `status = draft_ai`                                                                                                                         | V1   |
| G38 `cron-freshness-falsifiable`        | test:api           | 构造某标的 `sync_sec` 连续 3 天被 superseded → health `cron.staleTickers ≥ 1` 且 `status = degraded`                                                                          | V1   |
| G39 `telemetry-isolated-from-job-state` | AST + Vitest       | `recordAppErrorEvent` 不得与 `failJobWithBackoff / completeJob / skipJob` 出现在同一个 `withSystemDb` 回调内；遥测抛错时作业仍为 `failed`、心跳仍写入                         | V2   |
| G40 `rls-6b-definer-hardening`          | Vitest（强制 RLS） | `pg_proc` 中所有 `SECURITY DEFINER` 函数带 `search_path` 配置、PUBLIC 无执行权；7 表跨租户读写夹具；退出组织的账户买入受限标的 → 403；任意策略查询不出现 `infinite recursion` | V2   |
| G41 `hosted-ai-quota-gate`              | AST + Vitest       | 调用 `resolveEffectiveByok` 的路由必须处理 `quota_exceeded` 分支；托管额度超限 → 429 `HOSTED_QUOTA`；BYOK 不受限                                                              | V2   |

---

### V0 · 生产安全与账本口径止血（6 人日）

#### V0-1 · 生产 RLS 角色切换与外部健康巡检（1.5 人日）

- **问题与用户价值**：P0-1。买方团队把投资备忘录放进来的前提是「别人看不到」；目前这一点只靠应用代码不出错来保证。
- **文件落位**：新增 `deploy/rls-provision-app-role.sql`（幂等：`CREATE ROLE kanon_app LOGIN NOBYPASSRLS NOSUPERUSER`，密码由操作者以 psql 变量传入、绝不入库；`REVOKE UPDATE, DELETE ON audit_log`）；新增迁移 `0038`；新增 `.github/workflows/health-watch.yml`；改 `deploy/README.md`（切换步骤：Neon 分支 → 分支上跑 `KANON_RLS_ENFORCE_LOCAL=1 pnpm test:api` → 生产切换 → 探针验收 → 回滚指引）；改 `scripts/garden-guards.mjs` 或 `wave-guards-v.mjs`（G32）。
- **迁移 `0038` 草案**：

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_app') THEN
    GRANT USAGE ON SCHEMA public TO kanon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanon_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanon_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kanon_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kanon_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kanon_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO kanon_app;
  END IF;
END $$;
```

若 expand-only 守卫把 `REVOKE` 视为收缩，`audit_log` 的 REVOKE 只保留在 provisioning 脚本中。

- **守卫与验收**：G32；验收以生产探针为准——`db.bypassRls = false`、`status = healthy`，并且 11-28 22:00 UTC 之后的第一个窗口出现非空的 `lastStartedAt`。切换后 24 小时内 `errors24h` 不得出现新的 `42501`（权限不足）指纹；一旦出现，即按 README 回滚到旧连接串。
- **依赖**：无；**V0 其余项与 V2 全部依赖本项**。

#### V0-2 · FX 历史回填与事务外覆盖保证（1.5 人日）

- **问题与用户价值**：P1-1、断点 2。录入一年前的港股持仓必须立刻可用。
- **文件落位**：改 `packages/ai/src/market/fx-ecb.ts`（`fetchEcbReferenceFxRates({ startPeriod?, endPeriod? })`；URL 在 `startPeriod` 存在时改用 `startPeriod=…&endPeriod=…`，否则保持 `lastNObservations=15`；超时 15 秒）；新增 `repositories/portfolio/fx-coverage-store.ts`（`findFxCoverageGap(tx, currencies, fromDate)` 返回缺口区间）；改 `api/portfolio/ledger/route.ts`（`record_transaction` / `create_account` / `confirm_legacy_currency` 在 `withUserDb` **之前**调用 `ensureFxCoverage`：有缺口则事务外拉取 ECB 区间，再经 `withSystemDb("user_triggered_sync")` 写入，符合 G10）；改 `tick/job-handlers.ts`（`sync_fx_rates` 支持 payload `startPeriod`，同时补齐所有账户最早成交日以来的缺口，单次最多回填 3 年）；改 `math/performance/nav-series.ts`（不可用响应附带 `fxGaps`）。
- **契约变更**：`PortfolioPerformanceResponseSchema` 新增 `fxGaps: z.array(z.object({ currency: CurrencyCodeSchema, from: IsoDate, to: IsoDate })).default([])`。
- **不变量**：ECB 最早日期 1999-01-04；早于该日期的成交仍返回 409；汇率表只写 ECB 原始换算值，不插值。
- **守卫与验收**：G35；`fx-ecb` 解析器对 3 年区间夹具（约 780 个观测 × 5 种货币）单测通过；E2E 第 07 章新增「录入 400 天前的 `0700.HK` 买入 → 净值行出现 TWR」。
- **依赖**：V0-1。

#### V0-3 · 风险 / 归因路由的币种一致性（1 人日）

- **问题与用户价值**：P0-2、P2-6。同一账本，三个面板应该给出同一个口径。
- **文件落位**：改 `repositories/portfolio/performance-inputs-store.ts`（新增并导出 `toReplayTxInput(row)`，统一包含 `tradeCurrency / fxToBase / reversesTxId / isOpeningBalance / createdAtMs`）；改 `basis-normalize-store.ts`（`computeLedgerPortfolioWeights` 接收 `baseCurrency` 与 `fxRatesByCurrency`，`marketValue = shares × close × X(asOf)`，汇率缺失时把该持仓放入 `missingPriceTickers` 并标注 reason `fx`）；改 `api/portfolio/{performance,risk,attribution}/route.ts`（三处统一调用映射）；改 `math/attribution/episodes.ts`（回合金额按 `fxToBase` 换算为账户本币）。
- **契约变更**：`PortfolioRiskResponse.missingTickers` 的元素增加可选字段 `reason: "bars" | "fx"`（向后兼容）。
- **守卫与验收**：G33；Vitest：HKD 账户持有 AAPL、USD 账户持有 `0700.HK` 两组夹具，风险权重与手算误差 ≤ 1e-6；`test:api` 断言三条路由对同一账本返回一致的 `totalNav`。
- **依赖**：V0-2（汇率可得）。

#### V0-4 · 旧账户币种确认、汇率输入校验与回落清零（1.5 人日）

- **问题与用户价值**：P0-3、P1-9、P2-1。被困住的旧账户必须有一条出路，新输入不能制造错误金额。
- **文件落位**：改 `contracts/workflow-contracts.ts`（新增 `op:"confirm_legacy_currency"`，`mode: "as_base" | "infer_by_ticker"`；`record_transaction` 新增 `fxDeviationAck?: boolean`）；新增 `repositories/workflows/ledger-legacy-confirm.ts`（workflows 目录 7 → 8：在一个事务内为 `trade_currency IS NULL` 的行填入币种与 ECB 汇率，`fx_source = 'ecb_reference' | 'identity'`，整体重放，现金路径失败返回 409 并给出 `failDate`，成功后清除 `ledger_inconsistent`）；改 `fx-rates-reader.ts:139-145`（同币种必须为 1；与 ECB 偏离超过 3% 返回 422 `FX_DEVIATION`）；改 `nav-helpers.ts:34`、`ledger-replay.ts:88,196`、`ledger-reversal-store.ts:64-66`、`ledger-fifo-helpers.ts:107-111`、`performance/route.ts:68`（删除全部回落；`fxToBase` 为空时重放返回新失败码 `FX_MISSING`）；三条组合路由对被标记账户返回 `status: "currency_unconfirmed"`；改 `inbox-and-ledger-sheets.tsx:42-45`（把一行文字换成两个按钮「按账户币种」「按代码推断」）。
- **契约变更**：`PortfolioPerformanceResponse.status` 与 `PortfolioRiskResponse.status` 枚举增加 `"currency_unconfirmed"`。
- **守卫与验收**：G34（当前基线 7 处：`nav-helpers.ts:34`、`ledger-replay.ts:88,196`、`ledger-reversal-store.ts:65-66`、`ledger-fifo-helpers.ts:111`、`performance/route.ts:68`；本项清零）；Vitest：被标记账户性能 → `currency_unconfirmed`；确认后的结果与「一开始就带币种录入」逐日一致；`fxToBase: 7.8` 的 USD/USD 成交 → 422。
- **依赖**：V0-2。

#### V0 小结

| 项   | 人日                             |
| ---- | -------------------------------- |
| V0-1 | 1.5                              |
| V0-2 | 1.5                              |
| V0-3 | 1                                |
| V0-4 | 1.5                              |
| 合计 | 5.5（另留 0.5 用于生产切换窗口） |

---

### V1 · 买方链路闭环（8 人日）

#### V1-1 · 8-K 新闻稿抽取：定位、期间上下文与口径拆分（2 人日）

- **问题与用户价值**：P1-2、P1-3、P1-4。让指引信誉账本第一次拥有真实样本。
- **文件落位**：改 `packages/ai/src/sec/press/exhibit-locator.ts`（先请求 `{accession}-index.html`，按表格 Type 列取 `EX-99.1` 行的文件名；失败再回退到 `index.json` 的文件名规则，并删除会误伤的 `pre` / `cal` 排除项）；新增 `press-period-context.ts`（期间上下文只由同时包含「outlook / guidance」和期间短语的行设置；要点行不得覆盖；遇到下一个大标题时清空）；新增 `press-basis-split.ts`（`GAAP and non-GAAP <metric> … A and B, respectively` → 两条候选；同句带 `±` 容差时分别作用于 A 与 B；无法配对即丢弃）；改 `press-guidance-rules.ts`（完整解码命名实体与数字实体；扫描全文；`rule/1` → `rule_version = 2`）；改 `guidance-candidates-store.ts`（采纳前校验证券一致；`upsert` 冲突时仅在 `rule_version` 更高时更新数值并清除撤回标记；计数用 `RETURNING`）；改 `segment-sync-job.ts:179,184-185`（返回 skipped 原因，`issuedOn` 缺失即跳过）。
- **迁移 `0039` 草案**：

```sql
ALTER TABLE guidance_candidates ADD COLUMN IF NOT EXISTS rule_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE guidance_candidates ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMPTZ;
ALTER TABLE guidance_candidates ADD COLUMN IF NOT EXISTS retract_reason TEXT;
DO $$ BEGIN
  ALTER TABLE guidance_candidates ADD CONSTRAINT chk_guidance_candidates_rule_version
    CHECK (rule_version >= 1) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE guidance_candidates
SET retracted_at = NOW(), retract_reason = 'basis_merged'
WHERE retracted_at IS NULL AND quote ~* 'gaap\s+and\s+non-gaap';
```

已被采纳为 `draft_ai` 的承诺不自动修改（属于用户数据）；`GET /api/theses/[id]/guidance` 新增 `retractedAdoptions: string[]`，列表行显示一枚钛灰徽章「来源已更正」。

- **契约变更**：`GuidanceCandidateSchema` 增加 `ruleVersion: z.number().int().min(1)`；采纳错误码新增 `CANDIDATE_SECURITY_MISMATCH`（409）与 `CANDIDATE_RETRACTED`（409）。
- **守卫与验收**：G36、G37；验收标准是在 NVDA `q3fy27pr.htm` 上得到 Q4 FY2027 的收入（±3%）、GAAP 毛利率、non-GAAP 毛利率、GAAP 营业费用、non-GAAP 营业费用共 5 条候选，数值与原文逐一对应；作业 skipped 原因在 health 的作业计数中可见。
- **依赖**：无（可与 V0 并行；生产验收需 V0-1）。

#### V1-2 · 记账表单补齐与冲销入口（2 人日）

- **问题与用户价值**：P1-5、断点 2 / 3。让「记一笔」真正连上研究档案、成本与复盘。
- **文件落位**：改 `features/cockpit/lib/inbox-ledger-api.ts`（`apiRecordLedgerTx` 增加 `thesisId / fees / tradeCurrency / fxToBase / fxDeviationAck`，`action` 扩展到 `dividend / withdraw`；新增 `apiReverseLedgerTx`）；改 `ledger-sheet-parts.tsx`（代码输入匹配到用户的同名档案时自动关联，并显示档案名；手续费；币种与汇率放在一个默认折叠的「成交汇率」行里，只在成交币种 ≠ 账户币种时出现；报 `FX_DEVIATION` 时就地二次确认）；新增 `overlays/ledger-tx-history.tsx`（基于 GET 已返回的 30 笔明细，每行一个「冲销」文本按钮，确认后调用 `reverse_transaction`）。遵守 `.rules/editorial-craft.md`：不加说明文案，不套卡片。
- **契约变更**：无（服务端契约已存在）。
- **守卫与验收**：E2E 第 07 章：关联档案买入 → 决策矩阵出现 1 个回合；冲销 → 回合消失、现金复原；`verify-ui-truncation.mjs` 覆盖长代码（`BRK.B`、`0700.HK`）与汇率行。
- **依赖**：V0-4（错误码与 `fxDeviationAck`）。

#### V1-3 · 汇率贡献口径与展示（1 人日）

- **问题与用户价值**：P1-6。用同一个口径回答「选股」与「汇率」各贡献了多少。
- **文件落位**：新增 `packages/core/src/math/performance/fx-contribution.ts`（纯函数）；改 `fx-attribution.ts:109-116`（汇率项只对 `min(prev.shares, curr.shares)` 计算；增减的股数按成交汇率计价，跨日汇率贡献为 0；清仓日对 `prev.shares` 计算汇率项）；改 `nav-series.ts:148-150,164-167`（百分比改用链接贡献）；改 `ledger-performance-line.tsx`（非美元持仓存在时，在 TWR 同一行追加「本地 x% · 汇率 y%」）。
- **数学不变量**：`r_t = (NAV_t − NAV_{t−1} − F_t) / NAV_{t−1}`；`c^{loc}_t = Δloc_t / NAV_{t−1}`，`c^{fx}_t = Δfx_t / NAV_{t−1}`；Carino 系数 `k_t = ln(1+r_t)/r_t`（`r_t = 0` 时取 1），`K = ln(1+R)/R`；`C^{loc} = Σ (k_t/K)·c^{loc}_t`，`C^{fx}` 同理；黄金用例要求 `C^{loc} + C^{fx} + C^{cash} = TWR`（误差 ≤ 1e-9），其中现金项是外币现金持有期间的汇率变动（单币种现金下恒为 0）。
- **守卫与验收**：`fx-attribution.test.ts` 新增加仓日、清仓日、先入金后出金三组黄金用例；保留 EUR 账户 + NVDA、HKD 账户 + `0700.HK` 两组既有用例。
- **依赖**：V0-3。

#### V1-4 · 非 SEC 标的的诚实路径（1 人日）

- **问题与用户价值**：P2-7、断点 1。港股用户在第一分钟就应该知道系统能做什么、不能做什么。
- **文件落位**：改 `features/thesis/hooks/canvas-api.ts:114-118`（`notice` 优先于 `warehouseSynced` 分支）；改 `api/sec/[ticker]/route.ts:115-124`（响应增加 `secStatus: "not_registrant"`）；改 `api/sec/[ticker]/manual-override.ts:32` 与 `UpsertManualSecSnapshotSchema`（新增 `reportingCurrency: CurrencyCodeSchema`，展示改用 `formatMoney`）；改 Step 3 / 4 空态（`filing-live-panel.tsx`）：一行「非 SEC 申报主体 · 手工录入财务」，后接录入入口。
- **契约变更**：`SecSyncResponseSchema` 增加可选 `secStatus`；手工快照增加 `reportingCurrency`（默认 `USD`，兼容旧数据）。
- **守卫与验收**：G29 作用域扩展到 `features/research-steps`；E2E：新建 `0700.HK` → 看到上述一行而不是「SEC 快照已更新」。
- **依赖**：无。

#### V1-5 · Cron 新鲜度可证伪与有界查询（1.5 人日）

- **问题与用户价值**：P1-7、P2-5。「数据是不是最新的」必须能从 health 里读出来，而不是靠猜。
- **文件落位**：新增 `packages/core/src/db/repositories/ops/queue-freshness.ts`（`getTickerFreshness`：每个在研标的最近一次 `sync_sec` / `sync_daily_bars` 成功距今的时长、24 小时内被 superseded 的数量）；改 `api/health/route.ts`（`cron.staleTickers`、`cron.superseded24h`；`staleTickers > 0` 持续超过 72 小时即 `degraded`）；改 `watchlist-enqueue.ts`（`sync_sec` 优先级 52，排在新闻稿之前；`run_at` 按日期哈希轮转，避免总是饿死同一批尾部标的）；改 `sec-warehouse-sync.ts:100-115`（新闻稿只为最近 120 天的申报入队）；改 `performance-inputs-store.ts:91-104` 与 `fx-rates-reader.ts:82-90`（日期下界）；在 `fts-recall.test.ts` 旁新增 20 条生产语料抽样用例（来自 NVDA 种子的真实 10-K 分块），作为 R4b 的观测闸门。
- **契约变更**：`HealthCron` 增加 `staleTickers: number`、`superseded24h: number`。
- **守卫与验收**：G38；`test:api` 断言新字段存在且能被构造的饥饿场景触发。
- **依赖**：无（生产验收需 V0-1）。

#### V1-6 · 样本档案一键复制（0.5 人日）

- **问题与用户价值**：冷启动。注册后的第一屏不应是空白画布。
- **文件落位**：改 `apps/web/src/app/sample/[slug]/page.tsx`（标题旁一个「复制到我的研究」按钮，未登录时跳转 `/login?next=…`）；改 `POST /api/theses` 的请求契约（新增 `fromSample: z.enum(["nvda"]).optional()`），由 `repositories/starter-workspace.ts` 从 `seeds/sample-dossiers.ts` 生成用户自己的档案（标注「来自示例」，数据截止日保留）。G31 不受影响：样本页仍不导入数据库，复制动作走 API。
- **守卫与验收**：E2E：未登录访问 `/sample/nvda` → 点击复制 → 登录 → 档案列表出现 NVDA，五步画布均有内容。
- **依赖**：无。

#### V1 小结

| 项   | 人日 |
| ---- | ---- |
| V1-1 | 2    |
| V1-2 | 2    |
| V1-3 | 1    |
| V1-4 | 1    |
| V1-5 | 1.5  |
| V1-6 | 0.5  |
| 合计 | 8    |

---

### V2 · 安全收口与成本闸门（5 人日）

#### V2-1 · Stage 6b：7 表 RLS（3 人日）

- **问题与用户价值**：Part 2 全文。组织成员关系、邀请、审计与合规名单是买方团队信任的根。
- **文件落位**：迁移 `0040`（2.2 节函数 + 2.3 节策略 + `kanon_thesis_*` 与 `theses` 策略改用 `kanon_org_role`）；改 `schema-enterprise.ts`、`schema-extensions.ts`（`.enableRLS()` 与 `pgPolicy(...)`；两文件分别为 131 / 150 行，预算充足）；新增 `repositories/enterprise/org-role-store.ts`（`acceptInvitationViaDefiner`、`isTickerRestrictedForAccount`，后者包含「组织账户的非成员 → 403」守卫）；改 `audit-and-restricted-store.ts:28-35,172-177`（链尾与限制判定改用定义者函数）；改 `api/orgs/org-mutation-handlers.ts`（接受邀请改走定义者函数）；改 `repository.test.ts`（`RLS_STAGE6_PENDING` 7 → 0，删除该集合）；改 `rls-fail-closed.test.ts`；改 `deploy/rls-verify.sql`（新增定义者函数属主与 `proconfig` 检查）。
- **契约变更**：`POST /api/portfolio/ledger` 新增错误码 `ORG_MEMBERSHIP_REQUIRED`（403）。
- **守卫与验收**：G40；`test:api` 在强制 RLS 下覆盖登录、PAT、2FA 绑定、邀请—接受、限制名单拦截、审计写入与校验链六条路径；审计链在 1,000 次并发追加夹具下保持单链（`prev_hash` 唯一）。
- **依赖**：V0-1。

#### V2-2 · 托管 AI 额度与 key 来源徽章（1.5 人日）

- **问题与用户价值**：P1-10、断点 5。成本有上限；用户知道自己在用什么。
- **文件落位**：迁移 `0041`；新增 `repositories/security/ai-quota-store.ts`（`getHostedUsageToday(tx, userId)`，复用已有索引 `idx_ai_usage_user_created`）；改 `api/_lib/byok-headers.ts`（`resolveEffectiveByok` 返回判别联合 `{ kind: "byok" } | { kind: "hosted" } | { kind: "quota_exceeded" }`；`buildAiUsageEntry` 写入 `keySource`）；Agent / Copilot / Ask 三条路由只增加一个分支（agent 路由 248 行，用单行早返回，不得超过 250）；在 AI 结果面板标题旁显示一枚钛灰徽章「托管」或「自有密钥」。
- **迁移 `0041` 草案**：

```sql
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS key_source TEXT;
DO $$ BEGIN
  ALTER TABLE ai_usage ADD CONSTRAINT chk_ai_usage_key_source
    CHECK (key_source IS NULL OR key_source IN ('byok', 'hosted')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

- **契约变更**：429 `HOSTED_QUOTA`，携带 `resetAt`；托管日额度由环境变量 `KANON_HOSTED_AI_DAILY_CALLS` 配置（默认 20，设为 0 即关闭托管）；health 增加 `ai.hosted: boolean`（只表示是否配置，不暴露密钥信息）。
- **守卫与验收**：G41；`test:api`：第 21 次托管调用 → 429；附带 BYOK 头 → 200。
- **依赖**：无。

#### V2-3 · 遥测解耦与卫生（0.5 人日）

- **问题与用户价值**：P1-8、P2-4。观测组件不能把被观测的系统拖垮。
- **文件落位**：改 `tick-runner.ts:55-71,128-141`（先在独立事务内写作业状态，再在另一个事务内写遥测，遥测异常只记日志）；改 `app-errors-store.ts`（路由模板化白名单；每日指纹数上限 500；`countAppErrorsLast24h` 改为对今天与昨天按日求和）；改 `report-client-error.ts:23,27`（上报模板化路由；`buildId` 取 `NEXT_PUBLIC_BUILD_ID`，构建时注入 `VERCEL_GIT_COMMIT_SHA` 前 8 位）。
- **守卫与验收**：G39；Vitest：遥测写入抛错时作业为 `failed`、`recordTickCompleted` 已写入。
- **依赖**：无。

#### V2 小结

| 项   | 人日 |
| ---- | ---- |
| V2-1 | 3    |
| V2-2 | 1.5  |
| V2-3 | 0.5  |
| 合计 | 5    |

---

### 批次依赖、人日与完成定义

| 批次 | 内容                                                                                   | 人日 | 进入条件                                             |
| ---- | -------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------- |
| V0   | V0-1 → V0-2 → V0-3 / V0-4（`0038`、G32–G35）                                           | 6    | 立即；V0-1 必须先于一切生产验收                      |
| V1   | V1-1、V1-4、V1-5、V1-6 可与 V0 并行；V1-2 依赖 V0-4；V1-3 依赖 V0-3（`0039`、G36–G38） | 8    | 生产 `bypassRls = false`                             |
| V2   | V2-1 依赖 V0-1；V2-2、V2-3 可并行（`0040`、`0041`、G39–G41）                           | 5    | V0 全绿                                              |
| 合计 |                                                                                        | 19   | 单人串行约 4 周；两人并行（V0 → V2-1 ∥ V1）约 2.5 周 |

**每个批次的完成定义（DoD）**：

1. 门禁：`pnpm format && pnpm check`（含 `wave-guards-v.test.mjs` 全部反例）→ `pnpm test` → `pnpm eval` → `pnpm build` → `pnpm test:api`（`KANON_RLS_ENFORCE_LOCAL=1`）→ `pnpm test:e2e`。
2. **线上验兵**（本轮新增硬条件）：部署后 `GET https://app.kanon.hk/api/health` 必须满足 `status = healthy`、`db.bypassRls = false`、`db.rlsFailClosed = true`、`cron.lastStartedAt` 非空且晚于部署时间，V1 之后还要求 `cron.staleTickers = 0`；不满足即回滚。G32 的巡检工作流必须保持绿色。
3. 真实上游验收：V0-2 以 ECB 实际区间响应、V1-1 以 SEC 实际 EX-99.1 跑一次端到端，并把结果写入 PR 描述（不只依赖夹具）。
4. 文档同步：`AGENTS.md`（守卫 G1–G41）、`README.md`、`docs/PRD.md`、`deploy/README.md`（角色切换与回滚）、`marketing/index.html`（多币种与新闻稿指引在 V0-2 / V1-1 验收**之前**不得作为卖点）。
5. 复盘写入 `.rules/postmortems.md`，至少两条：「部署完成定义中的线上条件未被执行（`degraded` 持续存在而无人告警）」与「夹具比真实上游更干净（第二次）：ECB 只取 15 个观测、新闻稿文件名与句式」。后者是同类问题第二次发生，按 AGENTS.md 要求升级为 L2 守卫（G35 / G36 以真实上游样本为夹具）。

---

## 参考

- ECB Data Portal API（`startPeriod` / `endPeriod` / `lastNObservations`）：<https://data.ecb.europa.eu/help/api/data>
- SEC EDGAR 申报索引（`{accession}-index.html` 的 Type 列标注 `EX-99.1`；以 `0001045810-26-000088` 实测）：<https://www.sec.gov/Archives/edgar/data/1045810/000104581026000088/>
- PostgreSQL 行级安全与 `SECURITY DEFINER`（策略递归、`FORCE ROW LEVEL SECURITY` 对属主生效、`search_path` 加固）：<https://www.postgresql.org/docs/16/ddl-rowsecurity.html>、<https://www.postgresql.org/docs/16/sql-createfunction.html>
- Neon 角色与 `BYPASSRLS`：<https://neon.com/docs/manage/roles>
- Carino, D. (1999). _Combining Attribution Effects Over Time_. Journal of Performance Measurement 3(4).
