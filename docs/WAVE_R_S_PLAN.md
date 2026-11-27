# WAVE R / S / T — 买方原文智能 · 实盘归因 · 端到端质量闭环：蓝图与实施规格书

> **基线**：`main@e093264`（只读审查；本文件为施工单，不含任何业务代码改动）。
> **视角**：买方投研总监（方法论严谨、零幻觉、极简信息密度）+ Staff Engineer（架构 / 性能 / 安全 / 可验证性）。
> **日期**：2026-11-27（HKT）。
> **外部事实核验**：Vercel `after()` / `waitUntil` 时长语义、Neon 角色 `BYPASSRLS` 行为、SEC companyfacts 不含维度事实，三项已在撰写时核实（见文末「参考」）。

## 阅读约定

- 每个 Work Item 固定七段：① 问题与买方价值 · ② 文件与模块规划 · ③ DDL / 公式 / 契约 · ④ UI 落点与空态 · ⑤ 负向测试 · ⑥ L2 守卫 · ⑦ 依赖、人日与砍项。
- 「新增」= 新文件；「改」= 修改现有文件；「删」= 删除。路径均相对仓库根。
- 全文统一的数据诚实规则：任何取不到、对账失败或样本不足的数值，一律返回 `null` 加 `status` / `reason`，UI 只显示一行状态，绝不回落到默认值或演示值。下文不再逐条重复。
- 契约片段中的 `IsoDateSchema` 为本轮新增的共享原语：放在 `packages/core/src/contracts/intel/primitives.ts`（`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`），`contracts/analytics/` 直接复用，不得在各文件重复定义；`TickerSymbolSchema` 复用 `packages/core/src/schemas/research.ts:127` 的现有定义。
- 文中带「（示意）」的数字只说明版式，不是期望值；所有期望数值都由 fixture 计算得出。

---

## 全局约束与落位速查

### A. 宪法约束如何落到本轮

| 约束                                        | 本轮落实方式                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 单文件 ≤ 250 行 / 单函数 ≤ 50 行 / 嵌套 ≤ 3 | 每个新文件在「文件规划」中给出单一职责；预计超限的模块已预先拆分                                         |
| 单目录 ≤ 12 源文件                          | 见 B 表：8 个目录已满额，新模块一律进入新的有界子目录                                                    |
| 金融数学只在 `packages/core/src/math/`      | TWR、Modified Dietz、协方差收缩、MCR、有效押注数、分部对账、指引评分、决策归因全部为纯函数               |
| 契约只在 `packages/core/src/contracts/`     | `contracts/` 根目录已满 12 个 → 新建 `contracts/intel/`（R 波）与 `contracts/analytics/`（S 波）         |
| 迁移 expand-only，自 `0026` 起放 `v3/`      | 见 C 表；RLS 策略、索引随迁移一起落地，并与 `schema*.ts` 中的 `enableRLS()` / `pgPolicy` 1:1 反射（G11） |
| `@kanon/core/db` 仅限 `apps/web/src/app/**` | 新仓储只被路由与 Server Component 消费；客户端只引用 `@kanon/core` 契约类型                              |
| 客户端请求一律 `kanonFetch` + Zod           | 新增 6 条 API 全部配 Response Schema，客户端 `lib/*-api.ts` 统一 `safeParse`                             |
| thesis / AI 路由强制 `requireThesisAccess`  | 新 thesis 路由按 HTTP 方法匹配能力位，由升级后的 G7+ 机械校验                                            |

### B. 目录容量与新模块落位（`universal-max-directory-files`，统计口径为非测试 `.ts/.tsx`）

| 目录                                                 | 现状  | 本轮落位规则                                                                                  |
| ---------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `packages/core/src/contracts`                        | 12/12 | 冻结；新增 `contracts/intel/`、`contracts/analytics/`                                         |
| `packages/core/src/db/repositories`                  | 12/12 | 冻结；新增 `repositories/intel/`、`repositories/portfolio/`；租户上下文迁入 `security/`       |
| `packages/core/src/db`                               | 10/12 | 只新增 `schema-intel.ts`、`schema-decisions.ts` 两个文件，之后满额                            |
| `packages/core/src/db/migrations/v3`                 | 2/12  | 0026–0033 共 8 个 → 10/12                                                                     |
| `packages/core/src/math`                             | 11/12 | 冻结根目录；新增 `math/performance/`、`math/attribution/`、`math/guidance/`、`math/segments/` |
| `packages/core/src/math/risk`                        | 4/12  | S2 在此扩至 8 个                                                                              |
| `packages/ai/src/sec`                                | 12/12 | 冻结；新增 `sec/redline/`、`sec/segments/`                                                    |
| `packages/ai/src/agent`                              | 12/12 | 冻结；`claim-verifier.ts` 迁出到新目录 `packages/ai/src/verification/`                        |
| `apps/web/src/features/research-steps/components`    | 12/12 | 冻结；新组件进 `components/filing/`（6 个）与 `components/library/`（2 个）                   |
| `apps/web/src/features/journal/components`           | 12/12 | 冻结；本轮不在此新增                                                                          |
| `apps/web/src/app/api/_lib`                          | 10/12 | 只新增 `db-context.ts`；SEC 全局限速并入既有 `request-guards.ts`                              |
| `apps/web/src/features/valuation/components/drivers` | 10/12 | 只新增 `sotp-sec-import.tsx`                                                                  |

### C. 迁移编号（编号即合并顺序；未上线前如需调序，整体重排尚未合并的编号）

| 编号   | 文件                                | 归属         | 内容                                                                                                                                  |
| ------ | ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0026` | `0026-q5-invites-ledger-opening.ts` | W0（Part 0） | `org_invitations.revoked_at / revoked_by`；`securities.sec_status`；账户期初现金补记为 `deposit` 流水（建账同步改为同事务写期初流水） |
| `0027` | `0027-rls-functions-and-split.ts`   | RLS 阶段 B   | RLS 辅助函数 + 21 张表读写拆分策略（仍 fail-open）                                                                                    |
| `0028` | `0028-rls-fail-closed.ts`           | RLS 阶段 D   | `kanon_rls_open()` 改为恒 `false`：单语句原子翻转为 fail-closed                                                                       |
| `0029` | `0029-filing-redlines.ts`           | R1           | `filing_redlines` + `filing_chunks.norm_hash / extract_version` + 章节索引                                                            |
| `0030` | `0030-segment-reports.ts`           | R2           | `segment_reports` + `segment_lines`                                                                                                   |
| `0031` | `0031-guidance-ledger.ts`           | R3           | `guidance_commitments` + 旧 `guidance_log` 纪要回填为待结构化草稿                                                                     |
| `0032` | `0032-filing-chunks-fts.ts`         | R4           | `to_tsvector('english', text)` 表达式 GIN 索引（不新增存储列）                                                                        |
| `0033` | `0033-decision-snapshots.ts`        | S3           | `decision_snapshots`（不可变）+ `hypothesis_status_events`（只追加）+ 现状回填                                                        |

### D. 新增 API 路由（`scripts/verify-api-contracts.mjs` 的 `KNOWN_ROUTES` 由 43 条增至 49 条）

| 路由                        | 方法             | DB 上下文                  | 能力                               |
| --------------------------- | ---------------- | -------------------------- | ---------------------------------- |
| `api/sec/[ticker]/redline`  | GET              | 租户读；计算经系统作业写入 | 登录即可（公共申报衍生数据）+ 限流 |
| `api/sec/[ticker]/segments` | GET、POST        | 同上；POST 只入队          | 登录即可 + 限流                    |
| `api/theses/[id]/guidance`  | GET、POST、PATCH | 租户                       | GET `read`；POST/PATCH `write`     |
| `api/portfolio/performance` | GET              | 租户                       | 仅本人账户                         |
| `api/portfolio/risk`        | GET              | 租户                       | 仅本人账户                         |
| `api/portfolio/attribution` | GET              | 租户                       | 仅本人账户                         |

### E. 新增 / 升级 L2 守卫总表

新守卫写入新文件 `scripts/wave-guards-rs.mjs`（`wave-guards.mjs` 已 475 行，不再加长），反例测试写入 `scripts/wave-guards-rs.test.mjs`，并把 `design:check` 改为 `node scripts/wave-guards.test.mjs && node scripts/wave-guards-rs.test.mjs && node scripts/check-design-and-limits.mjs`。每条守卫至少 3 个「必须被抓住」的反例 + 1 个「不得误报」的正例。

| 守卫                                  | 规则摘要                                                                                                     | 归属         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| G3（扩表）                            | `REQUIRED_PROD_ENGINES` 追加本轮全部引擎函数，要求真实运行时调用                                             | 全部         |
| G6+                                   | 估值 UI 中对象字面量 / 三元表达式里的数字字面量回退同样拦截                                                  | Q5-6、R2     |
| G7+                                   | 能力位字面量必须与 HTTP 方法匹配；删除 apply 路由豁免；AST 调用而非正则文本                                  | 0.2          |
| G9 `kanon-db-provenance`              | `getKanonDb` 只允许出现在 `_lib/db-context.ts`；DB 句柄只能来自上下文回调                                    | 0.2          |
| G10 `no-network-in-db-tx`             | DB 上下文回调内禁止 `fetch`、`after`、`@kanon/ai` 值导入、LLM 调用                                           | 0.2          |
| G11 `rls-reflection-parity`（Vitest） | `schema*.ts` 的 RLS 声明 ⇔ `pg_class` / `pg_policies`；租户表必须被覆盖或列入冻结的待办清单                  | 0.2          |
| G12 `system-context-allowlist`        | `withSystemDb` 的 reason 必须是字面量且 (文件, reason) 在白名单；`set_config('kanon.` 只允许出现在白名单文件 | 0.2          |
| G13 `sec-fetch-gateway`               | `www.sec.gov` / `data.sec.gov` URL 只能经 `fetchSecWithRetry`（带全局令牌桶）发出                            | Q5-8、R1、R2 |
| G14 `hypothesis-status-event-pairing` | 改写 `hypotheses.status` 的函数必须在同一函数内写 `hypothesis_status_events`                                 | S3           |
| G15 `immutable-ledger-tables`         | 仓储层禁止对 `decision_snapshots`、`forecasts` 发出 `.update()` / `.delete()`（DB 触发器兜底）               | S3           |
| G16 `holdings-use-close-only`         | `math/performance/**`、`math/attribution/**` 禁止读取 `.adjClose`（防股息重复计入）                          | S1、S2       |
| G17 `hitl-confirm-only`               | `status: "confirmed"` 只允许在 `confirmGuidanceCommitment` 中写入                                            | R3           |
| G18 `no-substring-chunk-retrieval`    | 仓储层禁止对 `filingChunksTable.text` 使用 `ilike` / `like`                                                  | R4           |
| G19 `e2e-no-arbitrary-wait`           | `apps/web/e2e/**` 禁止 `waitForTimeout`、`setTimeout`、`page.waitForLoadState("networkidle")`                | T            |

---

## Part 0 — `e093264` 二轮复核与 RLS 阶段 5 切换

### 0.1 二轮复核结论（14 项，均给出复现路径；无凑数项）

| 编号  | 级别 | 主题                                                               | 主要位置                                                                        |
| ----- | ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Q5-1  | P1   | `update_role` 绕过邀请同意，可把任意已知用户直接写入组织           | `apps/web/src/app/api/orgs/org-mutation-handlers.ts:93`                         |
| Q5-2  | P1   | 邀请不随邀请人权限失效，可在被移除后完成组织接管                   | `packages/core/src/db/repositories/enterprise/org-invitations-store.ts:136-178` |
| Q5-3  | P1   | 重述检测把拆股追溯调整与「3 个月 / 9 个月」口径差误报为财务重述    | `packages/core/src/db/repositories/warehouse/facts-pit-store.ts:160-203`        |
| Q5-4  | P1   | 增量 K 线永不重基，拆股 / 分红后价格口径混杂；股息事件被丢弃       | `apps/web/src/app/api/_lib/on-demand-sync.ts:22-42`                             |
| Q5-5  | P1   | 告警先于当日数据同步评估，且超时或失败也被标记完成                 | `apps/web/src/app/api/internal/jobs/tick/route.ts:120-147`                      |
| Q5-6  | P1   | Wave P 之后估值面板仍有捏造默认值（SOTP、联动经营模型、分位标记）  | `apps/web/src/features/valuation/components/drivers/sotp-builder-card.tsx:8-30` |
| Q5-7  | P1   | 账本按「今日现金」校验倒填买入；批次不随拆股调整；期初现金不入流水 | `packages/core/src/db/repositories/workflows/ledger-fifo-helpers.ts:124-125`    |
| Q5-8  | P1   | 建档触发的 `after()` 同步不限流、不中止、不可观测                  | `apps/web/src/app/api/theses/route.ts:39-118`                                   |
| Q5-9  | P1   | 运行时迁移在 PgBouncer 事务池上使用会话级 advisory lock            | `packages/core/src/db/client.ts:58-73`                                          |
| Q5-10 | P2   | SEC 身份与终态失败：`BRK.B` 解析失败、非 SEC 标的拖垮健康检查      | `packages/ai/src/sec/edgar-client.ts:18,101-106`                                |
| Q5-11 | P2   | SEC 快照先于 PIT 仓库提交，跨面板口径分叉                          | `apps/web/src/app/api/sec/[ticker]/route.ts:118-126`                            |
| Q5-12 | P2   | Agent 采纳：无行锁读改写、`userId` 可选、G7 豁免、草稿字段硬编码   | `packages/core/src/db/repositories/agent/agent-apply-store.ts:80-180`           |
| Q5-13 | P2   | 账本 `thesisId` 未校验访问权与 ticker 一致性                       | `packages/core/src/db/repositories/workflows/portfolio-ledger-store.ts:110`     |
| Q5-14 | P2   | 跨租户副作用在触发者请求内执行，且 `filing_redflag` 扇出关不掉     | `apps/web/src/app/api/_lib/sec-warehouse-sync.ts:41-58,130-145`                 |

> 文档漂移（不计入问题数）：`AGENTS.md` §4 仍写「Isolated 32-route API」，实际为 43 条；`deploy/README.md:11` 写「expand-only auto-migrations on startup」，阶段 5 之后该描述失效。两处随 Part 0 一并修正。

#### Q5-1（P1）`update_role` 绕过邀请同意

- **位置**：`apps/web/src/app/api/orgs/org-mutation-handlers.ts:63-109`（`:93` 直接调用 `addOrgMember`）；`packages/core/src/db/repositories/enterprise/organizations-and-rls-store.ts:80-108`（`INSERT … acceptedAt: now … ON CONFLICT DO UPDATE SET role, acceptedAt`，不要求目标已是成员）；`apps/web/src/app/api/orgs/route.ts:35-40`（`membersByOrg` 向所有成员返回队友 `userId`）。
- **复现**：攻击者 A 与受害人 V 同在组织 Y（或 V 曾在 A 的组织 X 中被移除）→ A 从 `GET /api/orgs` 的 `membersByOrg` 取得 V 的 `userId` → `POST /api/orgs {op:"update_role", orgId:X, userId:V, role:"viewer"}` → 200，V 未经同意成为 X 的已接受成员；X 的研究标的出现在 V 的工作台，V 的收件箱可被 X 的规则投递。
- **修复**：`update_role` 只允许修改 `accepted_at IS NOT NULL` 的现有成员（`UPDATE … WHERE org_id AND user_id AND accepted_at IS NOT NULL RETURNING`，0 行 → 404）；`addOrgMember` 改名 `updateOrgMemberRole` 并删除 upsert 分支；新增成员唯一入口为 `invite → accept_invite`。
- **负向测试**：对非成员 `update_role` → 404 且 `memberships` 无新行；对已移除成员 `update_role` → 404；对现有成员降级为 viewer → 200；唯一 owner 降级 → 409（回归）。

#### Q5-2（P1）邀请不随邀请人权限失效

- **位置**：`org-invitations-store.ts:54-88`（可邀请任意角色，含 `owner`）、`:136-178`（接受时不复核邀请人当前权限，也无撤销状态）；`organizations-and-rls-store.ts:110-138`（移除成员时不处理其发出的邀请）；`packages/core/src/contracts/workflow-contracts.ts:196-234`（无 `revoke_invite` 操作）。
- **复现**：owner A 邀请小号 C 为 `owner`（7 天有效）→ 另一位 owner B 移除 A → C 接受邀请成为 owner → C 移除 B（`assertOrgRetainsOwner` 因 C 仍在而放行）→ 组织被接管。同理可邀请现有 viewer 升为 owner。
- **修复**：迁移 `0026` 增加 `org_invitations.revoked_at / revoked_by`；`acceptOrgInvitation` 在事务内复核「邀请人仍为 `accepted` 成员且拥有 `org.manage_members`」与 `revoked_at IS NULL`；`removeOrgMember` / 降级时同事务撤销该成员发出的全部未接受邀请；新增 `op:"revoke_invite"`（需 `org.manage_members`）。
- **负向测试**：邀请人被移除后接受 → 409 `INVALID_INVITATION`；被撤销邀请接受 → 409；前 owner 被降级为 viewer 后，其未接受的邀请被同事务撤销（接受 → 409）；analyst 无法邀请（403，回归）；撤销后审计日志含 `org.revoke_invite`。

#### Q5-3（P1）重述检测误报：拆股追溯与口径混杂

- **位置**：`packages/core/src/db/repositories/warehouse/facts-pit-store.ts:160-203`（只按 `periodEnd` 分组，忽略 `duration` 与 `periodStart`；每股类概念不做拆股归一）；口径来源 `packages/ai/src/sec/pit/pit-facts-extractor.ts:106-117`（同一 `end` 同时写入 `quarter` 与 9 个月 `ytd`）；消费方 `thesis/thesis-access.ts:143-161`、`apps/web/src/app/api/sec/[ticker]/route.ts:50-69,127-130`。
- **复现 A（拆股）**：NVDA 的 `diluted_eps` 在 `end=2024-01-28` 有两条：FY2024 10-K 的拆股前口径与 FY2025 10-K 的 10:1 追溯口径 → `deltaPct ≈ −90%` → Step 3 出现「重述」标记。会计准则要求拆股后对每股数据追溯调整，这不是财务重述。
- **复现 B（口径）**：任一第三季度 10-Q 在同一 `end` 同时写入 3 个月与 9 个月事实，次年 10-Q 又以比较期再写一遍 → 同组首尾元素跨口径时得到 +200% 或 −67% 的伪重述（首尾取决于同一 `filedAt` 内的行序，对固定数据集稳定复现）。
- **影响**：「财务法证与重述」是四大核心卖点之一，伪重述直接误导投委会判断。现有 `warehouse.test.ts:229-234` 只覆盖单一口径的年报。
- **修复**：分组键改为 `(periodEnd, periodStart, duration)`；每股 / 股数概念（`diluted_eps`、`basic_eps`、`diluted_shares`、`shares_outstanding`）比较前，按 `corporate_actions` 中 `exDate ∈ (orig.filedAt, latest.filedAt]` 的拆股比例归一；差异可被拆股完全解释（归一后 |Δ| < 0.5%）时归类为 `split_recast`；`BootstrapRestatementMarker` 增加 `kind: "restatement" | "split_recast"`，UI 只渲染 `restatement`。
- **负向测试**：NVDA 拆股 fixture → 空数组；同 `end` 的 3 个月与 9 个月事实 → 空数组；同口径同期两次申报差 2.3% → 1 条（回归现有用例）；拆股叠加真实重述 → 1 条，且 `deltaPct` 为拆股归一后的值。

#### Q5-4（P1）增量 K 线永不重基；股息事件被丢弃

- **位置**：`apps/web/src/app/api/_lib/on-demand-sync.ts:22`（覆盖 ≥ 240 根后永久只取 `1mo`）、`:24-28`（只覆盖窗口内）、`:34-42`（只写入 `bundle.splits`，`bundle.dividends` 被丢弃）；`packages/ai/src/market/bars/providers.ts:180-187,219-237`（Yahoo `close` 为抓取时刻的拆股追溯值，`adjclose` 另含股息追溯）、`:130-131`（Polygon `adjClose = close`）；消费方 `warehouse/valuation-bands-store.ts:44-54`（把 EPS 归一到「当前股本口径」，前提是全部 K 线同口径）、`warehouse/price-bars-store.ts:122-129`。
- **复现**：预置 300 根拆股前 K 线（close ≈ 1,000）→ 以含 10:1 拆股事件、价格 ≈ 100 的 `1mo` Yahoo 响应调用 `runSyncDailyBarsForTicker` → 库内 `close` 在窗口边界出现 10 倍断崖。以含一次 $0.50 分红的响应重复 → 窗口外的 `adjClose` 未被同比例缩放，`computeTotalReturnPct` 少计该笔股息。
- **影响**：任一标的在增量模式下拆股 → P/E 分位带错位约 10 倍、`pe_band_breach` 误报（与 Wave P 修复的 EPS 口径问题同类）；SPY 等基准每年少计约一个股息率 → Wave S 的超额收益被系统性高估。
- **修复**：① 单一口径不变量：增量抓取先比对窗口首根 K 线与库内同日 `close` / `adjClose`，相对差 > 0.1%、窗口内出现新拆股 / 分红事件、或 `source` 与库内不一致时，立即改为 `5y` 全量重抓并整段覆盖该证券；② 股息写入 `corporate_actions(kind='dividend', amount, id='div:<securityId>:<exDate>')`；③ 每周日低峰对全部观察标的做一次全量重基。
- **负向测试**：拆股复现用例重抓后序列不存在单日跳变 > 50%；分红用例重抓后 `adjClose` 与全量抓取逐日一致（误差 ≤ 1bp）；`corporate_actions` 含 `dividend` 行；口径一致的增量抓取不触发全量（spy 调用参数 `range=1mo`）。

#### Q5-5（P1）告警先于当日数据评估，失败也被标记完成

- **位置**：`packages/core/src/db/repositories/warehouse/jobs-and-peers-store.ts:96-101`（`evaluate_alerts` 优先级 10）与 `:140`（`ORDER BY priority ASC`）；`apps/web/src/app/api/internal/jobs/tick/route.ts:120-138`（drain 首个即领取告警）、`:140-147`（`Promise.race` 15 秒后无论成败都 `completeJob`）；`packages/core/src/db/repositories/workflows/alert-evaluator-store.ts:37-46`（每条规则全量 `listPriceBars` 只为取最后一根）、`:199-207`（全部规则串行、无游标）。
- **复现**：22:00 UTC 的 tick 队列为 `{evaluate_alerts(10), sync_daily_bars(50)×N, sync_sec(60)×N}` → 告警最先执行，读的是前一交易日收盘与申报 → 当日跌破买入区的 `price_hurdle`、当日的 8-K 都要到下一个工作日才提醒（周五事件 → 周一）。令 `evaluateAlertRules` 抛错 → drain 记失败 → 兜底阶段再失败 → `.catch(() => 0)` 后照样 `completeJob` → 当日评估被标为 done，不再重试。
- **修复**：告警改为同步之后的末段：drain 只领取非告警任务，直至 `budget − 15s`；末段在 15 秒子预算内按 ticker 分组评估（每个 ticker 一次 `getLatestBar`、一次分位带），以 `alert_rules.id` 为游标写入 `sys:alert_cursor`，未评估完保持 `pending`；只有全部规则评估成功才 `completeJob`；`resolveLatestPrice` 改为 `ORDER BY bar_date DESC LIMIT 1`。
- **负向测试**：当日 K 线越线 → 同一次 tick 产生 1 条收件箱；评估器抛错 → job 为 `pending` 且 `attempts + 1`；500 条规则 + 15 秒预算 → 下一次 tick 从游标继续，两次 tick 内全部评估且无重复投递；评估阶段 `listPriceBars` 调用次数为 0。

#### Q5-6（P1）估值面板残留捏造默认值，G6 漏网

- **位置**：`apps/web/src/features/valuation/components/drivers/sotp-builder-card.tsx:8-30`（无分部时按营收 28% / 19.6% 捏造两段 EBIT，倍数 18/24/30 与 12/16/20）、`:163-173`（新增分部默认 EBIT $5B、倍数 14/18/22）；`drivers/linked-operating-card.tsx:104-120`（营收 CAGR 恒为 14%；利润率、SBC、CapEx、PE 缺失时取 28% / 2.5% / 9% / 22 倍）；`drivers/benchmark-summary-cards.tsx:109,131-135`（`percentileRank === null` 时珊瑚焦点标记仍画在 50% 处）；`scripts/wave-guards.mjs:200-259`（G6 只识别 `??` / `||` 二元回退）。
- **复现**：新建一个没有 SEC 数据的标的 → Step 4「驱动」→ SOTP 卡显示两段虚构分部与目标价，点「应用」即写入三情景；分位带为 `null` 的标的，分位条仍在中位显示焦点。
- **修复**：SOTP 无分部 → 空态（只保留「添加分部」「从 SEC 分部带入」两个动作），新增分部的数值与倍数为空；`linked-operating-card` 缺失项为 `null` 并要求手填，营收 CAGR 缺省取近 3 年真实 CAGR（无年度数据为 `null`）；分位条在 `percentileRank === null` 时不渲染标记；`calculateSotpValuation` 删除 `Math.max(0.01, …)` 夹逼（`packages/core/src/math/models/sotp-model.ts:69-70`），股本 ≤ 0 或任一倍数为空时返回 `null`。
- **负向测试**：渲染结果不含「核心增长引擎」「成熟现金牛业务」；任一倍数为空 → 三个目标价均为 `null` 且「应用」按钮 disabled；分位为空 → 不存在 `[data-band-marker]`；G6+ 的 3 个反例被抓住。

#### Q5-7（P1）账本：倒填买入、拆股与期初现金

- **位置**：`packages/core/src/db/repositories/workflows/ledger-fifo-helpers.ts:124-125`（买入只与当前现金比较）、`:52`（只限制 `tradeDate ≤ today`）、`:58-100`（FIFO 不处理拆股）；`portfolio-ledger-store.ts:23-49`（期初现金直接写 `cash_balance`，不产生流水）。
- **复现 A**：今日入金 $10,000 → 登记两年前买入 $10,000 → 201；按流水重放，两年内现金为 −$10,000（历史杠杆）。**复现 B**：2024-05 买入 NVDA 10 股 → 2024-06-10 10:1 拆股 → 卖出真实持有的 100 股 → `SHORT_SELL_BLOCKED`。
- **影响**：零杠杆铁律只在「当下」成立；Wave S 的净值与 TWR 在负现金日无定义；拆股后的真实卖出无法登记。
- **修复**：整体并入 S0（见 Part 2）。

#### Q5-8（P1）建档触发的 `after()` 同步：不限流、不中止、不可观测

- **位置**：`apps/web/src/app/api/theses/route.ts:81-118`（无限流）、`:96`（配额只统计 `pending`）、`:39-79`（同日 job id 去重后仍每次 `after()` 全量同步；`:70` 入队与默认 8-K 规则失败被 `.catch(() => undefined)` 吞掉）；`apps/web/src/app/api/_lib/on-demand-sync.ts:56-78`（18 秒 `Promise.race` 只结束等待、不取消工作；`:66-74` `void err`）；`packages/ai/src/sec/sec-http.ts:3,16-21`（仅进程内 8 req/s 限速）。
- **Vercel 语义（已核实）**：`after()` 经 `waitUntil` 执行，与本次调用共享 `maxDuration`（Fluid 默认 300 秒，本路由未声明），且无重试。race 超时后仍在运行的 Promise 不再受 `waitUntil` 保护，可能随实例冻结或回收被截断，并持续占用实例级连接池（`client.ts:78-83` 的 `max: 3`）。
- **复现**：脚本循环「`POST /api/theses {NVDA}` → `DELETE`」，每轮触发 submissions、多 MB 的 companyfacts 与 Yahoo 抓取；Fluid 多实例并发时聚合速率可超过 SEC 公平访问的 10 req/s 上限，风险由全体租户共担（共用一个声明 UA）。
- **修复**：`POST /api/theses` 增加 `checkPersistentRateLimit({ bucket: "thesis_create", maxRequests: 10, windowMs: 600_000 }, userId)`；`enqueueJob` 返回 `{ inserted: boolean }`，只有当日任务确为新入队时才 `after()`；工作函数接收 18 秒 `AbortSignal` 并下传给每个 fetch；失败写结构化日志 `ON_DEMAND_SYNC_FAILED`；SEC 全局令牌桶：`request-guards.ts` 新增 `acquireSecGlobalSlot()`（`rate_limit_buckets` 键 `sec:global:<epochSecond>`，每秒 ≤ 8），以回调注入 `fetchSecWithRetry`。
- **负向测试**：同一用户第 11 次创建 → 429；同日同 ticker 第二次创建不调用 `runSingleTickerSyncBestEffort`（spy）；超时后 fetch 收到 `AbortError`；两个模拟实例并发 20 次 SEC 请求 → 任一秒 ≤ 8 次。

#### Q5-9（P1）运行时迁移在 PgBouncer 事务池上使用会话级 advisory lock

- **位置**：`packages/core/src/db/client.ts:58-73`（运行时在 `DATABASE_URL` 上执行 `pg_advisory_lock` / `pg_advisory_unlock`）、`packages/core/src/db/migrate-cli.ts:12,28`；`deploy/README.md:11,43`（生产为 Neon 池化 URL，且启动时自动迁移）。
- **机理**：PgBouncer 事务池不支持会话级 advisory lock——加锁与解锁可能落在不同的后端连接上，解锁返回 `false`，锁留在被归还池中的后端连接上；其他冷启动实例阻塞在 `pg_advisory_lock`（无 `statement_timeout`）。
- **影响**：每次带新迁移的部署，并发冷启动可能挂起直至后端连接被回收（生产尚未观测到，属潜在风险）；阶段 5 之后运行时角色本就无权执行 DDL。
- **修复**：并入 0.2 阶段 A4。
- **负向测试**：`KANON_RUNTIME_MIGRATIONS=off` 且存在待执行迁移时，`getKanonDb()` 抛 `MIGRATIONS_PENDING`（`/api/health` 返回 503），且未执行任何 DDL（spy `sql.unsafe` 调用 0 次）。

#### Q5-10（P2）SEC 身份与终态失败

- **位置**：`packages/ai/src/sec/edgar-client.ts:101-106`（CIK 解析不做股类归一；SEC 表中为 `BRK-B`；`normalizeCanonicalTicker` 定义于 `enterprise/audit-and-restricted-store.ts:14-16` 但未复用）、`:18`（`FINANCIAL_FORMS` 不含 `10-K/A`、`10-Q/A`、`20-F/A`、`40-F`、`6-K`）、`:139`（财报类只保留 6 份）；`on-demand-sync.ts:46-53` 与 `jobs-and-peers-store.ts:163-188`（不可恢复的错误仍按退避重试）；`apps/web/src/app/api/health/route.ts:21-26`（最老 pending > 26 小时即 `degraded`）。
- **复现**：建档 `BRK.B` → `POST /api/sec/BRK.B` 返回 `live:false`；观察列表中存在任一非 SEC 注册标的（如 `0700.HK`）→ 每天新增一个必败任务，每个任务要 4 个工作日才耗尽重试 → `/api/health` 长期 `degraded`，平台告警失真。
- **修复**：CIK 解析前先 `normalizeCanonicalTicker`；`fetchSecEdgarWithPitFacts` 返回 `errorKind: "not_sec_registrant" | "transient"`，前者直接把任务置为新状态 `skipped`（不计入 health 退化），并在 `securities.sec_status` 记 `not_registrant`，此后不再入队；`FINANCIAL_FORMS` 增加修订版与外国发行人表单（`6-K` 只进申报列表，不参与 PIT）。
- **负向测试**：`BRK.B` 解析为 CIK `0001067983`；`0700.HK` 仅产生一次 `skipped`，health 仍为 `healthy`；快照申报列表包含 `10-K/A`。

#### Q5-11（P2）SEC 快照先于 PIT 仓库提交

- **位置**：`apps/web/src/app/api/sec/[ticker]/route.ts:118-126`；`on-demand-sync.ts:51-52`；`apps/web/src/app/api/_lib/sec-warehouse-sync.ts:61-100`。
- **复现**：令 `persistExtractedPitFacts` 在第 2 个分块抛错 → 全局 `sec_filings_cache` 已是新一期 10-Q，而 PIT 事实停在上一期：Step 3 年报表与 Step 4 分位带、重述标记口径不一致；cron 路径下，该任务重试之前的一整天都不一致。
- **修复**：写入顺序改为「PIT 事实 → filings → 快照（作为提交标记）」，三者放进一个系统事务（PIT 以 500 行分块，事务时长 < 5 秒）；失败整体回滚，`warehouseSynced:false` 时返回旧快照。
- **负向测试**：注入 PIT 失败 → 快照 `fetchedAt` 不变；成功路径只开启 1 个事务（spy）。

#### Q5-12（P2）Agent 采纳的并发与默认值

- **位置**：`packages/core/src/db/repositories/agent/agent-apply-store.ts:155-180`（读取 thesis 不加 `FOR UPDATE`；`userId?` 可选，缺省时跳过鉴权）、`:108-118,122-145`（基于旧快照整列覆盖 `businessFilter`）、`:80-91`（草稿催化剂硬编码 `impact:"high"`、`direction:"bullish"`、`dateLabel ?? "下一季财报"`）；对照 `thesis-mutations.ts:200-206`（画布 PATCH 有行锁）；`scripts/wave-guards.mjs:50`（apply 路由被 G7 豁免）。
- **复现**：Step 1 编辑「市场共识」触发自动保存的同时，点击「采纳」一条事前推演提案 → 采纳事务先读后写时，自动保存的内容被旧值覆盖。
- **修复**：`loadAuthorizedRunContext` 先对 theses 行 `SELECT … FOR UPDATE` 再读取；合并只写目标键（`jsonb_set`）；`userId` 改为必填；路由先 `getAgentRunThesisId` 再 `requireThesisAccess(…, "write")`，并删除 G7 豁免；草稿催化剂的 `impact` / `direction` 改为可空（UI 显示「待判定」），`dateLabel` 无值时留空由研究员填写。
- **负向测试**：并发采纳与 PATCH（不同键）→ 两个键都保留；不传 `userId` 的调用编译失败；viewer 采纳 → 403。

#### Q5-13（P2）账本 `thesisId` 未校验

- **位置**：`packages/core/src/db/repositories/workflows/portfolio-ledger-store.ts:110`；`apps/web/src/app/api/portfolio/ledger/route.ts:63-76`。
- **复现**：用户 A 以他人私有研究的 thesisId 登记成交 → 201，成交记录指向 B 的研究。S3 若按 `transactions.thesis_id` 拉取研究快照，即构成越权读取。
- **修复**（S0 内完成）：登记前 `requireThesisAccess(read)`，并要求 `normalizeCanonicalTicker(thesis.ticker) === normalizeCanonicalTicker(tx.ticker)`；否则分别返回 404 与 400 `THESIS_TICKER_MISMATCH`。
- **负向测试**：他人私有 thesisId → 404；ticker 不一致 → 400；本人或组织可读研究且 ticker 一致 → 201。

#### Q5-14（P2）跨租户副作用在触发者请求内执行

- **位置**：`apps/web/src/app/api/_lib/sec-warehouse-sync.ts:41-58`（8-K 扇出到他人收件箱）、`:130-145`（`filing_redflag` 扇出使用 `listThesisWatchersByTicker`，而非已开启规则的接收者，因此无法关闭）；`apps/web/src/app/api/sec/[ticker]/filing/route.ts:65-68`（在 GET 请求中执行）；`packages/core/src/db/repositories/warehouse/price-bars-store.ts:131-144`（按 ticker 改写所有租户的 theses）。
- **影响**：当前：用户 A 打开某份 10-K，即向所有观察该标的的用户投递提醒，且不受开关控制。阶段 5 之后：这些写入发生在 A 的租户上下文里，会因 `WITH CHECK` 失败报错，或静默影响 0 行。
- **修复**：并入 0.2 阶段 A3（下沉为系统作业，接收者改为已开启规则者）。

### 0.2 RLS 阶段 5：fail-closed 最小、零停机切换清单

#### 0.2.1 现状基线（均为代码事实）

1. `requireWorkspaceContext().withDb`（`apps/web/src/app/api/_lib/auth-session.ts:85-88`）**零调用方**：43 个路由文件中有 42 个直接 `getKanonDb()`，2 个页面亦然，因此生产上没有任何请求设置 `kanon.current_user_id`。
2. `0024` 已对 5 张主表 `FORCE ROW LEVEL SECURITY`；`0025` 拆分了 theses 读写策略并覆盖 7 张子表，但全部策略含 `NULLIF(current_setting('kanon.current_user_id', true), '') IS NULL` 放行分支 → 当前为 100% fail-open。
3. `0025:61-109` 的子表策略为 `FOR ALL USING (EXISTS (SELECT 1 FROM theses t WHERE t.id = child.thesis_id))`：**可读即可写**，fail-closed 后 viewer 在数据库层仍可写 hypotheses / 估值 / 纪律 / 纪要 / IC。
4. 33 张含租户列的表中只有 12 张受 RLS 覆盖；`cross_checks`、`thesis_catalysts`、`thesis_revisions`、`quarterly_reviews`、`copilot_outputs`、`agent_runs`、`model_versions`、`thesis_peers`、`thesis_comments` 等研究内容完全未覆盖。
5. 运行时迁移与种子使用应用连接（Q5-9）；跨租户写入在用户请求内发生（Q5-14）。
6. PGlite 以超级用户运行，`pnpm test:api` 与任何 E2E 都从未在真实 RLS 下跑过。

#### 0.2.2 目标不变量

- **I1**：运行时连接角色为 `kanon_app LOGIN NOBYPASSRLS`，不是任何表的 owner。
- **I2**：任何触及租户表的查询都处在 `withUserDb(uid)` 或 `withSystemDb(reason)` 的事务内；两者之外 RLS 表返回 0 行、写入报错。
- **I3**：`kanon.system = 'on'` 只在白名单入口（cron、按需同步作业、日历 token 查找、健康检查、认证引导、迁移种子、用户触发的全局缓存写入、跨租户扇出作业）中出现。
- **I4**：研究内容子表遵循能力矩阵：读 = 可见 thesis；写 = owner / pm / analyst；纪要与评论只允许作者修改。
- **I5**：DB 事务内不做任何网络或 LLM 调用；事务时长 p95 < 200ms。

#### 0.2.3 阶段 A：代码就绪（数据库仍 fail-open，可独立上线）

**A1. 上下文 API**

- **新增** `packages/core/src/db/repositories/security/tenant-context.ts`：迁入 `withTenantContext`，新增 `withSystemContext` 与 `SystemDbReason`；`org-invitations-store.ts:180-190` 删除旧实现，`organizations-and-rls-store.ts:14-20` 改为从新文件再导出。

```ts
export type SystemDbReason =
  | "cron_tick"
  | "on_demand_sync"
  | "calendar_feed"
  | "health"
  | "auth_bootstrap"
  | "migration_seed"
  | "user_triggered_sync"
  | "alert_fanout"
  | "rate_limit";

export async function withTenantContext<T>(
  db: KanonDb,
  userId: string,
  fn: (tx: KanonDb) => Promise<T>,
) {
  return runInTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT set_config('kanon.current_user_id', ${userId}, true),
                                set_config('kanon.system', 'off', true)`);
    return fn(tx);
  });
}

export async function withSystemContext<T>(
  db: KanonDb,
  reason: SystemDbReason,
  fn: (tx: KanonDb) => Promise<T>,
) {
  return runInTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT set_config('kanon.system', 'on', true),
                                set_config('kanon.system_reason', ${reason}, true),
                                set_config('kanon.current_user_id', '', true)`);
    return fn(tx);
  });
}
```

- **新增** `apps/web/src/app/api/_lib/db-context.ts`：唯一允许 `getKanonDb()` 的文件，导出 `withUserDb(userId, fn)` 与 `withSystemDb(reason, fn)`；`auth-session.ts` 的 `withDb` 委托给 `withUserDb`。
- 每次上下文增加 `BEGIN` + `set_config` + `COMMIT` 共约 2 次往返（sin1 池化实测预算 ≤ 6ms）。上线门槛：`/thesis/[id]` SSR TTFB p95 增幅 ≤ 15%。postgres-js 在同一事务连接上流水线化 `Promise.all`，画布单波次并行查询的写法无需改动。

**A2. 入口分类与接入清单（43 个路由文件中 42 个需要改动，另加 2 个页面）**

| 上下文                      | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 租户 `auth.withDb`（35 个） | `theses/route.ts`（GET/POST）、`theses/[id]/route.ts`（GET/PATCH/DELETE）、`theses/[id]/{discipline,forecasts,ic,model-versions,notes,peers,reviews,revisions}`、`ai/agent`（GET/POST，SSE）、`ai/agent/apply`、`ai/agent/ask`、`ai/copilot`、`export/thesis/[id]`、`export/portfolio`、`import/thesis`、`inbox`、`orgs`（含 `org-mutation-handlers.ts`）、`portfolio/ledger`、`portfolio/calibration`、`market/{benchmarks,bootstrap,quotes,refresh-prices}`、`mcp`、`mcp/context`（PAT 用户）、`auth/{ai-credentials,me,profile,password,sessions,tokens,totp}`、`sec/[ticker]`（GET/PUT） |
| 租户（页面）                | `apps/web/src/app/page.tsx`、`apps/web/src/app/thesis/[id]/page.tsx`（含 `generateMetadata`）：`withUserDb(auth.user.id, …)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 系统 `withSystemDb`（6 个） | `internal/jobs/tick` → `cron_tick`；`health` → `health`；`auth/login`、`auth/register`、`auth/logout` → `auth_bootstrap`；`calendar/[token]` → 先 `calendar_feed` 查 token 归属，再 `withUserDb(owner)` 生成 ICS                                                                                                                                                                                                                                                                                                                                                                             |
| 混合（2 个）                | `sec/[ticker]` POST：SEC 抓取在事务外，全局缓存写入段用 `user_triggered_sync`；`sec/[ticker]/filing` GET：快照读取用租户上下文，缓存与分块写入用 `user_triggered_sync`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 系统（非路由）              | `_lib/on-demand-sync.ts`（`after()`）→ `on_demand_sync`；`_lib/request-guards.ts` → `rate_limit`；`packages/core/src/db/client.ts` 的种子 → `migration_seed`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 豁免                        | `market/provider-test`（不访问数据库）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

流式与 LLM 路由（`ai/agent`、`ai/agent/ask`、`ai/copilot`）必须拆成「读上下文事务 → 事务外 LLM / SSE → 写结果事务」三段，由 G10 机械保证。`registerUser` 在 `auth_bootstrap` 系统事务内创建用户与会话；入门工作区的 theses 在同一事务内以该用户 id 写入（系统上下文下 `WITH CHECK` 放行）。

**A3. 跨租户副作用下沉为系统作业（修 Q5-14，也是翻转的硬前置）**

| 现有调用                                                                   | 改造                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fanOutForm8kAlerts`（`sec-warehouse-sync.ts:41`）                         | 入队 `fanout_8k:<accession>`（优先级 20），由 tick 与触发请求的 `after()` 在 `alert_fanout` 上下文执行             |
| `indexFilingDocChunks` 的红旗扇出（`:130-145`）                            | 入队 `fanout_filing_redflag:<accession>`；接收者改为 `listEnabledForm8kAlertRecipients`（与 8-K 共用「申报」开关） |
| `updateThesisPriceByTicker`（`price-bars-store.ts:131`）                   | 只允许在 `cron_tick` / `on_demand_sync` 回调内调用（G12 的 system-only 函数清单）                                  |
| `enqueueWatchlistJobs`、`evaluateAlertRules`、`listThesisWatchersByTicker` | 同上，system-only                                                                                                  |

**A4. 迁移与运行时解耦（修 Q5-9）**

- `client.ts`：生产设置 `KANON_RUNTIME_MIGRATIONS=off`，运行时只探测 `isExternalDbBootstrapped`；未完成迁移即抛 `MIGRATIONS_PENDING`（health 返回 503），绝不在运行时执行 DDL 或种子。
- `migrate-cli.ts`：读取 `DATABASE_URL_MIGRATE`（owner 角色 + 直连主机，不含 `-pooler`；检测到池化主机即拒绝执行，除非显式 `KANON_ALLOW_POOLED_MIGRATE=1`）；会话开头执行 `SELECT set_config('kanon.system', 'on', false)`，保证 fail-closed 之后迁移内的回填仍可见全部数据；每个迁移包在显式事务内，并以 `pg_advisory_xact_lock(720194821)` 互斥；新增 `--seed` 参数，种子只在此处执行。
- 部署顺序写入 `AGENTS.md` §4 与 `deploy/README.md`：`DATABASE_URL="$DATABASE_URL_MIGRATE" pnpm db:migrate` → `npx --yes vercel deploy --prod --yes --regions sin1` → 核验 `/api/health`。

**A5. 本地与 CI 的强制模式**

- `client.ts` 的 PGlite 分支：`KANON_RLS_ENFORCE_LOCAL=1` 时，在迁移与种子之后创建 `kanon_app_local NOBYPASSRLS`，授予表级 DML，`REVOKE UPDATE, DELETE ON audit_log`，再执行会话级 `SET ROLE kanon_app_local`（PGlite 支持，参见 `wave-p-q-guards.test.ts:350-366`）。
- `scripts/verify-api-contracts.mjs:1049-1051` 与 Playwright 的 `webServer.env` 都设置该变量，使 49 条 API 契约与黄金路径全部在真实 RLS 下运行。

#### 0.2.4 阶段 B：迁移 `0027-rls-functions-and-split.ts`（仍 fail-open）

关键设计：引入 `kanon_rls_open()` 函数作为唯一的 fail-open 开关。所有策略都写成「系统 ∨ 开关 ∨ 租户谓词」，阶段 D 只需替换这一个函数体即可原子翻转，不必逐条重写策略。

```sql
CREATE OR REPLACE FUNCTION kanon_rls_is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('kanon.system', true), '') = 'on' $$;
CREATE OR REPLACE FUNCTION kanon_rls_uid() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('kanon.current_user_id', true), '') $$;
CREATE OR REPLACE FUNCTION kanon_rls_open() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT kanon_rls_uid() IS NULL $$;                      -- 阶段 D 改为 SELECT false

CREATE OR REPLACE FUNCTION kanon_thesis_readable(tid text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM theses t WHERE t.id = tid) $$;   -- 受 theses SELECT 策略约束
CREATE OR REPLACE FUNCTION kanon_thesis_writable(tid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM theses t
    WHERE t.id = tid AND (
      t.user_id = kanon_rls_uid()
      OR (t.org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = t.org_id AND m.user_id = kanon_rls_uid()
          AND m.accepted_at IS NOT NULL AND m.role IN ('owner', 'pm', 'analyst')))))
$$;
CREATE OR REPLACE FUNCTION kanon_thesis_deletable(tid text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM theses t
    WHERE t.id = tid AND (
      t.user_id = kanon_rls_uid()
      OR (t.org_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.org_id = t.org_id AND m.user_id = kanon_rls_uid()
          AND m.accepted_at IS NOT NULL AND m.role = 'owner'))))
$$;

-- 策略模板（以 hypotheses 为例；其余子表同构）
DROP POLICY IF EXISTS kanon_rls_hypotheses ON hypotheses;
DROP POLICY IF EXISTS kanon_rls_hypotheses_select ON hypotheses;
DROP POLICY IF EXISTS kanon_rls_hypotheses_write ON hypotheses;
CREATE POLICY kanon_rls_hypotheses_select ON hypotheses FOR SELECT
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id));
CREATE POLICY kanon_rls_hypotheses_write ON hypotheses FOR ALL
  USING (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id))
  WITH CHECK (kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id));
```

策略矩阵（21 张表，全部 `ENABLE` + `FORCE ROW LEVEL SECURITY`）：

| 表                                                                                                                                                                                                                        | SELECT            | INSERT                     | UPDATE                      | DELETE                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------- | --------------------------- | ---------------------------- |
| `theses`                                                                                                                                                                                                                  | 本人 ∨ 已接受成员 | `user_id = uid`            | `kanon_thesis_writable(id)` | `kanon_thesis_deletable(id)` |
| `portfolio_accounts`、`forecasts`、`inbox_items`、`user_ai_credentials`、`lots`、`transactions`                                                                                                                           | `user_id = uid`   | 同左                       | 同左                        | 同左                         |
| `hypotheses`、`valuation_scenarios`、`discipline_entries`、`cross_checks`、`thesis_catalysts`、`thesis_revisions`、`quarterly_reviews`、`copilot_outputs`、`agent_runs`、`model_versions`、`thesis_peers`、`ic_approvals` | `readable`        | `writable`                 | `writable`                  | `writable`                   |
| `research_notes`                                                                                                                                                                                                          | `readable`        | `writable ∧ user_id = uid` | `user_id = uid ∧ readable`  | `user_id = uid`              |
| `thesis_comments`                                                                                                                                                                                                         | `readable`        | `readable ∧ user_id = uid` | `user_id = uid`             | `user_id = uid`              |

（谓词各不相同的表——`theses`、`research_notes`、`thesis_comments`——按命令拆成 `FOR SELECT` / `FOR INSERT`（仅 `WITH CHECK`）/ `FOR UPDATE`（`USING` 与 `WITH CHECK` 相同，防止把研究移入自己无写权限的组织）/ `FOR DELETE`（仅 `USING`）四条策略；其余表用一条 `FOR SELECT` 加一条 `FOR ALL`。`ic_approvals` 的表决权限 `ic.decide` 与「提交人不可自批」由仓储层负责，数据库层保证非写入者无法改动审批行。每条策略都以 `kanon_rls_is_system() OR kanon_rls_open() OR …` 开头。）

暂不纳入、列入 G11 冻结待办清单 `RLS_STAGE6_PENDING`（11 张：`sessions`、`api_tokens`、`calendar_tokens`、`user_totp_factors`、`user_sec_overrides`、`alert_rules`、`ai_usage`、`memberships`、`org_invitations`、`audit_log`、`restricted_list`）：它们要么在认证之前按 token 哈希查找，要么本身被策略子查询引用，需要单独设计；`jobs` 列入 `RLS_SYSTEM_EXEMPT`。

同一迁移内，`schema*.ts` 为上述 21 张表补 `.enableRLS()` 与同名 `pgPolicy`（`for` 与 SQL 一致），由 G11 校验。

#### 0.2.5 阶段 C：Neon 角色切换（策略仍 fail-open，行为不变，可随时回退）

在 Neon SQL Editor 以 owner 执行（Vercel Marketplace 集成默认库名与 owner 为 `neondb` / `neondb_owner`，以控制台实际值为准）：

```sql
-- C0 只读核验
SELECT current_user, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user;
SELECT c.relname, c.relowner::regrole AS owner, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;

-- C1 创建运行时角色（口令用 openssl rand -base64 48 生成，只进 Vercel 加密环境变量）
CREATE ROLE kanon_app LOGIN PASSWORD '<generated>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE neondb TO kanon_app;
GRANT USAGE ON SCHEMA public TO kanon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanon_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kanon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kanon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kanon_app;
REVOKE UPDATE, DELETE ON audit_log FROM kanon_app;          -- 审计只追加
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM kanon_app;
ALTER ROLE kanon_app SET statement_timeout = '15s';
ALTER ROLE kanon_app SET idle_in_transaction_session_timeout = '20s';

-- C2 核验：不得继承 neon_superuser，不得 BYPASSRLS
SELECT r.rolname, r.rolsuper, r.rolbypassrls,
  ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid
        WHERE m.member = r.oid) AS member_of
FROM pg_roles r WHERE r.rolname = 'kanon_app';              -- 期望 f, f, {}
```

Vercel 环境变量（Production 与 Preview 分别设置）：`DATABASE_URL` = `kanon_app` 的池化 URL（`-pooler` 主机，`sslmode=require`）；`DATABASE_URL_MIGRATE` = owner 的直连 URL；`KANON_RUNTIME_MIGRATIONS=off`。重新部署后核验：`/api/health` 为 `healthy`；`SELECT usename, count(*) FROM pg_stat_activity WHERE datname = 'neondb' GROUP BY 1` 中出现 `kanon_app`。**回退**：把 `DATABASE_URL` 改回 owner URL 并重新部署。

#### 0.2.6 阶段 D：迁移 `0028-rls-fail-closed.ts`（原子翻转）

```sql
CREATE OR REPLACE FUNCTION kanon_rls_open() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
```

- **前置条件（缺一不可）**：阶段 A 已上线且 G9 / G10 / G12 全绿；在 Neon 生产分支创建的 staging 分支 + Vercel Preview 上执行至 `0028`，`pnpm test:api` 与 Playwright 黄金路径在 `KANON_RLS_ENFORCE_LOCAL=1` 下全绿，并以真实账号在 Preview 上完成一次「登录 → 工作台 → 画布 → 同步 SEC → 账本」冒烟。
- **执行**：`DATABASE_URL="$DATABASE_URL_MIGRATE" pnpm db:migrate`（单语句，DDL 事务性生效，无需停机）。
- **核验**（Neon SQL Editor 切换为 `kanon_app` 角色执行）：

```sql
SELECT count(*) FROM theses;                                                  -- 期望 0
BEGIN; SELECT set_config('kanon.current_user_id', '<uid>', true);
SELECT count(*) FROM theses; COMMIT;                                          -- 期望 = 该用户可见数
BEGIN; SELECT set_config('kanon.system', 'on', true);
SELECT count(*) FROM theses; COMMIT;                                          -- 期望 = 全量
BEGIN; SELECT set_config('kanon.current_user_id', '<viewer uid>', true);
UPDATE hypotheses SET note = note WHERE thesis_id = '<shared thesis id>';     -- 期望 UPDATE 0
ROLLBACK;
```

- **破窗回退**：`deploy/rls-break-glass.sql`（不进入 `KANON_MIGRATIONS`）只有一条语句——把 `kanon_rls_open()` 恢复为 `SELECT kanon_rls_uid() IS NULL`。由 owner 执行，事后必须补一条正式迁移并写入 `.rules/postmortems.md`。

#### 0.2.7 L2 守卫规则

- **G9 `kanon-db-provenance`**（AST）：① `getKanonDb` 标识符（import 说明符、别名、命名空间成员访问、动态 `import()` 结果的属性）在 `apps/web/src/**` 中只允许出现在 `_lib/db-context.ts`；② `withTenantContext` / `withSystemContext` 只允许在 `db-context.ts` 中导入；③ `packages/core/src/db/repositories/**` 禁止调用 `getKanonDb()`；④ 导入了 `@kanon/core/db` 值符号（type 与 `*Error` 类除外）的 `route.ts` / `page.tsx` / `layout.tsx`，必须至少调用一次 `withDb` / `withUserDb` / `withSystemDb`。反例：`import { getKanonDb as g }`；`import * as kdb from "@kanon/core/db"; kdb.getKanonDb()`；路由导入 `listTheses` 却未调用任何上下文函数。
- **G10 `no-network-in-db-tx`**（AST）：上述三种上下文调用的回调体内（含嵌套函数），禁止 `fetch(`、`after(`、`setTimeout(`、`new EventSource`、任何从 `@kanon/ai` 值导入的标识符，以及 `streamText` / `generateText` / `generateObject` / `streamObject`。反例：别名导入 `@kanon/ai` 后在回调内调用；回调内嵌套箭头函数调用 `fetch`；回调内 `await fetchSecEdgarWithPitFacts()`。
- **G11 `rls-reflection-parity`**（Vitest，`repository.test.ts`）：① `getTableConfig(t).enableRLS || policies.length > 0` ⇔ `pg_class.relrowsecurity ∧ relforcerowsecurity`；② `{policyname, cmd}` 集合与 `pg_policies` 完全相等；③ 含租户列的表 ⊆ RLS 覆盖 ∪ `RLS_STAGE6_PENDING`（冻结、只减不增）∪ `RLS_SYSTEM_EXEMPT`；④ 五个辅助函数存在于 `pg_proc`。替换现有 `repository.test.ts:131-141` 中写死的 5 表清单。
- **G12 `system-context-allowlist`**（AST）：`withSystemDb` 的第一个参数必须是字符串字面量，且 (文件, reason) 属于白名单映射；`set_config(` 与 `'kanon.system'` 字面量只允许出现在 `tenant-context.ts`、`migrate-cli.ts`、`packages/core/scripts/rotate-envelopes.mjs` 与迁移文件；system-only 函数（A3 表）只能在 `withSystemDb` 回调内调用。反例：`withSystemDb(reasonVar, …)`；在 `theses/route.ts` 中使用 `withSystemDb("cron_tick", …)`；路由内原生 ``sql`SELECT set_config('kanon.system', 'on', true)` ``。
- **G7+**（AST 升级）：对 G7 范围内每个导出的处理器，必须存在 `requireThesisAccess` 的 `CallExpression`（注释与字符串不算），且第 4 个参数是字面量：GET → `"read"`；POST / PATCH / PUT → `"write" | "comment" | "decide"`；DELETE → `"delete"`。删除 `G7_EXEMPT_ROUTES`，范围扩展到 `api/theses/[id]/guidance`。反例：只在注释里写 `requireThesisAccess(`；POST 使用 `"read"`；能力位经变量传入；DELETE 使用 `"write"`。

#### 0.2.8 负向测试（PGlite 强制模式，新文件 `packages/core/src/db/repositories/security/rls-fail-closed.test.ts`）

1. 无上下文：`SELECT count(*) FROM theses` = 0；`INSERT INTO inbox_items` 抛 `new row violates row-level security policy`。
2. 租户 B：A 的私有 thesis 及 21 张受保护表中的关联行全部不可见。
3. 组织 viewer：对 hypotheses、cross_checks、copilot_outputs 等子表 `UPDATE` 影响 0 行、`INSERT` 报错、`SELECT` 可见。
4. analyst：子表写入成功；对他人 thesis `DELETE` 影响 0 行（非 owner）。
5. research_notes / thesis_comments：非作者 `UPDATE` / `DELETE` 影响 0 行；评论可由 viewer 插入。
6. 系统上下文：`updateThesisPriceByTicker` 更新所有租户的同 ticker thesis。
7. fail-closed 之后执行迁移回填（以 `0031` / `0033` 为例）：回填行数 > 0。
8. 同一连接上先后执行 A、B 两个事务：B 事务内 `current_setting('kanon.current_user_id', true)` = B；事务外为空串。
9. 守卫测试：G9 / G10 / G12 / G7+ 的全部反例被抓住，正例不误报。
10. `pnpm test:api` 与 Playwright 黄金路径在 `KANON_RLS_ENFORCE_LOCAL=1` 下全绿。

#### 0.2.9 人日

阶段 A 2.5（45 个入口、SSE 三段拆分、跨租户作业）· 阶段 B 0.75 · 阶段 C 0.5 · 阶段 D 0.25 · 守卫与反例 1.0 · 强制模式 0.5 → **合计约 5.5 人日**。

---

## Part 1 — Wave R：买方原文智能与基本面深度

### R1 · 10-K / 10-Q 跨期 MD&A 与风险因素 Redline

**① 问题与买方价值**：「这份申报比上一期改了什么」是信噪比最高的定性信号（Cohen、Malloy、Nguyen 2020，_Lazy Prices_：年报措辞显著变化的公司随后表现显著偏弱）。现有 Reader 只比较首个章节前 14 段的句子集合，且允许 10-Q 与 10-K 混比，结论不可用于投委会。

**现状缺口（代码事实）**：`packages/ai/src/sec/filing-text-parser.ts:55`（75 字以下或 1,800 字以上的段落直接丢弃，长风险段落整段消失）、`:110,130`（每节最多 14 / 24 段）；`filing-reader.ts:72-87`（上期选择允许 10-Q ↔ 10-K 互比）、`:128-149`（每次打开都重新下载上期原文）；`filing-redline.ts:116-156` 的段落对齐零生产调用。

**② 文件与模块规划**

| 动作 | 路径                                                                             | 职责                                                                                           |
| ---- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 新增 | `packages/ai/src/sec/redline/section-extractor.ts`                               | 全文章节定位：跳过目录、Item 边界、长段切分、页眉页脚去噪                                      |
| 新增 | `packages/ai/src/sec/redline/normalize.ts`                                       | 掩码规范化、段落哈希、三连词 shingle                                                           |
| 新增 | `packages/ai/src/sec/redline/align.ts`                                           | 两阶段段落对齐 + 词级 Myers diff                                                               |
| 新增 | `packages/ai/src/sec/redline/classify.ts`                                        | 变更分级（下表）                                                                               |
| 新增 | `packages/ai/src/sec/redline/lexicon.ts`                                         | 自建约 120 词的风险 / 语气 / 口径词表（参照 Loughran–McDonald 类别自建，不分发其词典），版本化 |
| 新增 | `packages/ai/src/sec/redline/pairing.ts`                                         | 可比申报配对                                                                                   |
| 新增 | `packages/ai/src/sec/redline/index.ts`                                           | `buildFilingRedline` 编排入口                                                                  |
| 改   | `packages/ai/src/sec/filing-reader.ts`                                           | 删除 `computeOptionalDiff`（不再二次下载）                                                     |
| 改   | `packages/ai/src/sec/filing-redline.ts`                                          | 只保留 `scanFilingRedFlags`；删除 `computeFilingParagraphRedline` 及其测试                     |
| 新增 | `packages/core/src/contracts/intel/redline-contracts.ts`                         | Zod 契约                                                                                       |
| 新增 | `packages/core/src/db/schema-intel.ts`                                           | `filing_redlines`（并承载 R2、R3 的表）                                                        |
| 新增 | `packages/core/src/db/repositories/intel/redline-store.ts`                       | redline 读写、全文章节分块写入                                                                 |
| 改   | `packages/core/src/db/repositories/warehouse/filing-chunks-store.ts`             | `upsertSectionChunks`（带 `norm_hash`、`extract_version`）                                     |
| 新增 | `apps/web/src/app/api/sec/[ticker]/redline/route.ts`                             | GET                                                                                            |
| 新增 | `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts`                        | 作业分发表（tick 路由只保留调度，避免超过 250 行）                                             |
| 改   | `apps/web/src/app/api/_lib/sec-warehouse-sync.ts`                                | 同步发现新的 10-K / 10-Q / 20-F 时入队 `build_redline:<accession>`                             |
| 新增 | `apps/web/src/features/research-steps/components/filing/filing-redline-view.tsx` | 对照视图                                                                                       |
| 新增 | `apps/web/src/features/research-steps/components/filing/redline-change-row.tsx`  | 单条变更行                                                                                     |
| 删   | `apps/web/src/features/research-steps/components/filing/filing-diff-box.tsx`     | 被对照视图取代                                                                                 |
| 改   | `apps/web/src/features/research-steps/components/filing/filing-live-panel.tsx`   | 「原文 · 对照」分段切换                                                                        |
| 新增 | `apps/web/src/features/research-steps/lib/redline-api.ts`                        | `kanonFetch` + Zod                                                                             |

**③ DDL、算法与契约**

可比申报配对（找不到即 `no_comparable`，绝不跨表单补位）：

```text
目标 10-K（FY t）      → 上期 = 10-K（FY t−1），原始申报优先于 /A
目标 10-Q（FY t, Qn）  → MD&A 上期 = 10-Q（FY t−1, Qn）；风险因素上期 = 紧邻的上一份 10-Q 或 10-K
目标 20-F（FY t）      → 上期 = 20-F（FY t−1）
财季识别：经 accession 关联 financial_facts.fiscal_period；不得用自然季度推断
```

章节抽取 `sections/1`：

```text
1. HTML → 块：沿用 stripSecHtmlToParagraphs 的标签剥离，取消 75–1,800 字过滤与前 96 字去重；
   超过 2,400 字的块在句末切成 ≤ 1,200 字的段落（不丢弃）。
2. 去噪：仅含页码（^\d{1,3}$、^Page \d+）或目录链接的行、全文重复 ≥ 3 次且 < 120 字的行（页眉页脚）一律剔除；
   目录行沿用 isTocLine。
3. 章节定位：
   10-K  risk_factors = ^item\s*1a\b.*risk factors；mda = ^item\s*7\b.*management
   10-Q  mda = ^item\s*2\b.*management（Part I）；risk_factors = ^item\s*1a\b.*risk factors（Part II）
   20-F  risk_factors = ^item\s*3\b.*risk factors 或 ^d\.\s*risk factors；mda = ^item\s*5\b.*operating and financial review
   取「其后、下一个 Item 标题之前至少有 3 个正文段落」的最后一次出现（自动跳过目录）；
   章节终点 = 下一个 ^item\s*\d+[a-z]?\b 标题。
4. 正文 < 3 段 → section_missing；10-Q 风险因素仅声明 "no material changes" → 单条 info 记录，不做对齐。
5. 原文 > 12 MB → too_large，不产出部分对照。
```

规范化与对齐：

```text
base(p) = 小写 → 统一引号与连字符 → 合并空白
nb(p)   = base(p) 去样板：(19|20)\d\d → <y>，完整日期 → <d>，"fiscal <y>" 等财期表达 → <fy>
nn(p)   = nb(p) 再去数字：货币金额 → <amt>，百分比 → <pct>，其余数字 → <n>；去停用词
norm_hash(p) = sha256(nb(p))                                写入 filing_chunks.norm_hash
S(p)    = { FNV-1a32(nn(p) 的三连词) }，排序去重
J(a,b)  = |S(a) ∩ S(b)| / |S(a) ∪ S(b)|

阶段 1：norm_hash 相同的段落按多重集配对 → 不变（仅年份 / 日期滚动，不计入任何统计）
阶段 1b：norm_hash 不同但 sha256(nn) 相同 → numbers_only
阶段 2：其余段落两两计算 J，按 J 降序全局贪心配对：
        J ≥ 0.85 → 细微改动（不展示）；0.50 ≤ J < 0.85 → modified；J < 0.50 → 不配对
阶段 3：未配对的当期段落 → added；未配对的上期段落 → removed
护栏：每节 n·m ≤ 250,000，超出时先按小标题分桶再对齐；词级 diff 只对 modified 对执行（基于 base 原文），每对 ≤ 600 token
性能：两份原文抓取 2–6 s（经 SEC 全局令牌桶）+ 抽取约 0.3 s + 对齐 ≤ 0.2 s，单次 < 10 s
```

变更分级：

| 情形                                                                                                                                                                                                                                                                                | kind                | 级别                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------- |
| 风险因素新增段，命中关键风险词（material weakness、substantial doubt / going concern、restatement / non-reliance、subpoena / investigation / Wells notice、covenant / event of default、cybersecurity incident、export control / sanctions、tariff、single customer accounted for） | `added_risk`        | critical                          |
| 风险因素新增段（未命中关键词）                                                                                                                                                                                                                                                      | `added_risk`        | warn                              |
| 风险因素删除段                                                                                                                                                                                                                                                                      | `removed_risk`      | info                              |
| 修改段：不确定 / 弱情态 / 负面词净增 ≥ 2，或新增关键风险词                                                                                                                                                                                                                          | `hedging_up`        | warn（命中关键风险词为 critical） |
| MD&A 修改或删除段：积极语气词（record、strong、robust、accelerat\*、momentum、confident、significant growth）净减 ≥ 2                                                                                                                                                               | `optimism_removed`  | warn                              |
| 新增或修改段命中口径词（non-GAAP、recast、reclassif\*、change in presentation、realign\*、redefin\*、previously reported）                                                                                                                                                          | `definition_change` | warn                              |
| 其余修改段                                                                                                                                                                                                                                                                          | `rewritten`         | info                              |
| 仅数字更新                                                                                                                                                                                                                                                                          | `numbers_only`      | info（默认隐藏）                  |

迁移 `0029-filing-redlines.ts`：

```sql
CREATE TABLE IF NOT EXISTS filing_redlines (
  current_accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  previous_accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  section_code TEXT NOT NULL CHECK (section_code IN ('risk_factors', 'mda')),
  algo_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'section_missing', 'too_large', 'failed')),
  stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (current_accession, previous_accession, section_code, algo_version)
);
ALTER TABLE filing_chunks ADD COLUMN IF NOT EXISTS norm_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE filing_chunks ADD COLUMN IF NOT EXISTS extract_version TEXT NOT NULL DEFAULT 'reader/1';
CREATE INDEX IF NOT EXISTS idx_filing_chunks_accession_section
  ON filing_chunks (accession, section_code, para_index);

-- 全局衍生数据：任何登录用户可读，只有系统上下文可写
ALTER TABLE filing_redlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE filing_redlines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kanon_rls_filing_redlines_read ON filing_redlines;
DROP POLICY IF EXISTS kanon_rls_filing_redlines_write ON filing_redlines;
CREATE POLICY kanon_rls_filing_redlines_read ON filing_redlines FOR SELECT USING (true);
CREATE POLICY kanon_rls_filing_redlines_write ON filing_redlines FOR ALL
  USING (kanon_rls_is_system()) WITH CHECK (kanon_rls_is_system());
```

全文章节分块的 id 为 `<accession>:<section_code>:<para_index>`（`section_code` 取 `risk_factors` / `mda`，与 Reader 旧分块的 `mda` / `risk` / `biz` 不冲突），`extract_version = 'sections/1'`。存储预算：每份申报约 0.6 MB 文本；保留每个在研标的最近 2 份年报 + 4 份季报，其余由每周的 `prune_chunks` 系统作业删除（数据保留属行级删除，不违反 expand-only）；`/api/health` 增加 `dbSizePct`（`pg_database_size` / 套餐上限），超过 70% 即 `degraded`。Neon 免费档存储上限约 0.5 GB，在研标的超过 60 个时需要升级套餐。

契约 `packages/core/src/contracts/intel/redline-contracts.ts`：

```ts
export const RedlineSectionSchema = z.enum(["risk_factors", "mda"]);
export const RedlineChangeKindSchema = z.enum([
  "added_risk",
  "removed_risk",
  "hedging_up",
  "optimism_removed",
  "definition_change",
  "rewritten",
  "numbers_only",
]);
export const RedlineChangeSchema = z.object({
  id: z.string().min(1).max(160),
  section: RedlineSectionSchema,
  kind: RedlineChangeKindSchema,
  severity: z.enum(["critical", "warn", "info"]),
  currentChunkId: z.string().max(200).nullable(),
  previousChunkId: z.string().max(200).nullable(),
  similarity: z.number().min(0).max(1).nullable(),
  tokens: z
    .array(z.object({ op: z.enum(["eq", "ins", "del"]), text: z.string().max(4000) }))
    .max(600),
  cues: z.array(z.string().max(40)).max(12),
});
const FilingRefSchema = z.object({
  accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
  form: z.string().max(12),
  filedAt: IsoDateSchema,
  periodEnd: IsoDateSchema.nullable(),
});
export const FilingRedlineResponseSchema = z.object({
  ticker: TickerSymbolSchema,
  status: z.enum(["ready", "pending", "no_comparable", "section_missing", "too_large", "failed"]),
  algoVersion: z.literal("redline/1"),
  current: FilingRefSchema.nullable(),
  previous: FilingRefSchema.nullable(),
  stats: z
    .object({
      added: z.number().int().min(0),
      removed: z.number().int().min(0),
      modified: z.number().int().min(0),
      numbersOnly: z.number().int().min(0),
      critical: z.number().int().min(0),
    })
    .nullable(),
  changes: z.array(RedlineChangeSchema).max(400),
});
```

API：`GET /api/sec/[ticker]/redline?accession=&section=` → 200（`ready` / `no_comparable` / `section_missing` / `too_large` / `failed`）；尚未计算时返回 202 + `status:"pending"`，同时入队 `build_redline:<accession>`（优先级 70）并以 `after()` 在系统上下文尽力计算（25 秒 `AbortSignal`）。限流 `sec_redline` 每用户每分钟 20 次。

**④ UI 落点与空态**

- 落点：Step 3「一阶资料印证」→ 现有 Source Clipper 抽屉中的原文面板（`filing-live-panel.tsx`）。面板顶部增加一个两段式切换「原文 · 对照」，不新增卡片、抽屉或弹窗。
- 对照视图：单列列表，默认只显示 critical 与 warn；每行 = 12px 类别标签（新增风险 / 删减风险 / 措辞趋谨慎 / 删减乐观表述 / 口径变更 / 改写）+ 段落正文（插入用细下划线、删除用删除线与次级墨色）；只有 critical 行带珊瑚色圆点。末尾一个文字按钮「全部 N 处」展开 info 级变更。保留每行的「摘录」动作（写入交叉验证）。
- 空态：`no_comparable` → 不显示切换；`section_missing` → 对照内一行「未识别到可比章节」；`too_large` → 一行「原文过大，暂不支持对照」；`pending` → 复用现有静默同步指示，8 秒后客户端只重试一次。
- 提醒：新增 critical 风险段时写入收件箱（kind `filing_redline`），复用 Step 3 申报列表上已有的铃铛规则 `form8k_redflag`，不新增开关。
- 删减：删除 `FilingDiffBox` 的「查看措辞 Diff」折叠框；Reader 不再展示「高买方信号原段」这一按关键词堆叠的合成章节（Agent 检索仍可使用）。

**⑤ 负向测试（`packages/ai/src/sec/redline/redline.test.ts` + `repositories/intel/redline-store.test.ts`）**

1. 两份只差年份与日期（"fiscal 2024" → "fiscal 2025"，"December 31, 2024" → "December 31, 2025"）的申报：`stats` 全为 0。
2. 页眉「`<公司名> | 2025 Form 10-K | 23`」重复 40 次：输出中不出现。
3. 目录行「Item 1A. Risk Factors 12」位于正文标题之前：章节起点为正文标题，正文不含目录内容。
4. 目标为 10-Q 而同财季上年 10-Q 缺失：`status = "no_comparable"`，且从不与 10-K 配对。
5. 风险段落仅调换顺序：0 处变更。
6. 3,000 字的长段落被切分而非丢弃，尾部新增的句子被识别为 `modified`。
7. 仅数字变化 → `numbers_only`、`severity = "info"`，默认视图中不可见。
8. 原文 > 12 MB → `too_large` 且 `changes` 为空。
9. 上期缺少风险因素章节 → `section_missing`，而不是数百条 `added_risk`。
10. 确定性：相同输入两次运行，`changes_json` 的 sha256 相同。
11. 一次计算最多发起 2 次 SEC 文档请求，且全部经过 `fetchSecWithRetry`（spy）。
12. RLS：租户上下文 `INSERT filing_redlines` 报错，系统上下文成功。

**⑥ L2 守卫**：新增 G13 `sec-fetch-gateway`——`packages/ai/src/**` 与 `apps/web/src/app/**` 中，以 `https://www.sec.gov` 或 `https://data.sec.gov` 开头的字符串字面量或模板字符串，只能作为 `fetchSecWithRetry` 的参数出现。反例：``fetch(`https://www.sec.gov/…`)``；`const u = "https://data.sec.gov/…"; fetchImpl(u)`；`globalThis.fetch(url)` 且 url 由 SEC 前缀拼接。G3 增加 `buildFilingRedline`。

**⑦ 依赖、人日与砍项**：依赖 Q5-8（SEC 全局令牌桶）、Q5-10（申报表单含修订版）、RLS 阶段 D（新表以 fail-closed 形态落地）、Wave T 测试框架。**5 人日**（抽取 1.5、对齐与分级 1.5、存储 / 作业 / API 1、UI 1）。砍掉：LLM 生成的变更摘要（确定性清单即产品）、DEF 14A 与 8-K 附件对照。延后：Item 1C（网络安全）与 Item 3（法律诉讼）章节。

### R2 · SEC 真实业务分部与地区维度 → 直连 SOTP

**① 问题与买方价值**：SOTP 的可信度取决于分部数据是否来自申报原文。当前 SOTP 卡在无数据时自行编造两段分部与倍数（Q5-6），研究员无法一键使用真实的分部营收与经营利润。

**路径评估（无付费终端前提）**

| 路径                                                | 结论       | 理由                                                                                        |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| companyfacts / frames / companyconcept JSON         | 不可用     | 只聚合无维度、适用于整个申报主体的事实，不含分部、地区等带轴事实（已核实）                  |
| SEC 季度批量数据集（Financial Statement and Notes） | 不适合在线 | 每期数百 MB 压缩包，不适合 Serverless 按需解析；可作为离线回填备选                          |
| 单份申报的 XBRL 实例（`*_htm.xml` / `EX-101.INS`）  | **采用**   | 每份 2–15 MB，按需流式解析，含完整上下文与维度；ASU 2023-07 起（FY2024 年报）分部披露更完整 |
| 10-K 分部附注 HTML 表格解析                         | 不采用     | 版式差异大，脆弱；只作为人工核对参考                                                        |

**② 文件与模块规划**

| 动作 | 路径                                                                       | 职责                                                  |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| 新增 | `packages/ai/src/sec/segments/filing-index.ts`                             | 读取申报 `index.json`，定位实例与标签链接库           |
| 新增 | `packages/ai/src/sec/segments/xbrl-instance-scan.ts`                       | 有界流式扫描：上下文 + 白名单概念事实                 |
| 新增 | `packages/ai/src/sec/segments/segment-extract.ts`                          | 轴识别、单维过滤、期间选择、成员归类                  |
| 新增 | `packages/ai/src/sec/segments/member-labels.ts`                            | 标签链接库 / qname 生成标签                           |
| 新增 | `packages/ai/src/sec/segments/index.ts`                                    | `extractSegmentReports` 入口                          |
| 新增 | `packages/core/src/math/segments/reconcile-segments.ts`                    | 对账门禁（纯函数）                                    |
| 新增 | `packages/core/src/math/segments/sotp-import.ts`                           | 分部报告 → `SotpSegment[]` 的资格判定与映射（纯函数） |
| 新增 | `packages/core/src/math/segments/index.ts`                                 | 导出                                                  |
| 新增 | `packages/core/src/contracts/intel/segment-contracts.ts`                   | Zod 契约                                              |
| 改   | `packages/core/src/db/schema-intel.ts`                                     | `segment_reports`、`segment_lines`                    |
| 新增 | `packages/core/src/db/repositories/intel/segment-store.ts`                 | 读写与 PIT 查询                                       |
| 改   | `packages/core/src/schemas/v7-research-os.ts:23-31`                        | `SotpSegmentSchema` 倍数改为可空，新增可选 `source`   |
| 改   | `packages/core/src/math/models/sotp-model.ts`                              | 删除夹逼；股本 ≤ 0 或任一倍数为空 → `null`            |
| 新增 | `apps/web/src/app/api/sec/[ticker]/segments/route.ts`                      | GET 读取；POST 入队刷新                               |
| 改   | `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts`                  | 作业 `sync_segments:<accession>`                      |
| 新增 | `apps/web/src/features/valuation/components/drivers/sotp-sec-import.tsx`   | 卡内带入预览                                          |
| 改   | `apps/web/src/features/valuation/components/drivers/sotp-builder-card.tsx` | 删除捏造的默认分部；空态；带入入口                    |

**③ 算法、门禁、DDL 与契约**

```text
输入：10-K / 10-Q / 20-F 的 accession
1. 读取 https://www.sec.gov/Archives/edgar/data/<cik>/<accession 去连字符>/index.json，
   选取 *_htm.xml（Inline XBRL 抽取实例）或 EX-101.INS；自定义成员需要标签时再取 *_lab.xml。
2. 流式扫描（≤ 25 MB、≤ 12 s，超出 → too_large）：收集 xbrli:context {id, 期间, explicitMember[]}
   与白名单概念的事实 {concept, contextRef, unitRef, value}。
3. 期间：以 dei:DocumentPeriodEndDate 为期末；年度取 320–395 天、季度取 65–120 天的 duration 上下文。
4. 轴：business  = us-gaap:StatementBusinessSegmentsAxis | ifrs-full:SegmentsAxis
       geography = srt:StatementGeographicalAxis | ifrs-full:GeographicalAreasAxis
       product   = srt:ProductOrServiceAxis | ifrs-full:ProductsAndServicesAxis
5. 单维过滤：只接受「目标轴上恰好一个成员」的上下文；唯一允许并存的第二维是
   srt:ConsolidationItemsAxis = us-gaap:OperatingSegmentsMember（IFRS：SegmentConsolidationItemsAxis = OperatingSegmentsMember）。
   成员归类：IntersegmentEliminationMember / EliminationOfIntersegmentAmountsMember → elimination；
            CorporateNonSegmentMember / UnallocatedAmountsMember → corporate；
            MaterialReconcilingItemsMember → reconciling；其余 → segment。
6. 概念优先级：营收 RevenueFromContractWithCustomerExcludingAssessedTax → Revenues → ifrs-full:Revenue；
   利润 OperatingIncomeLoss → ifrs-full:ProfitLossFromOperatingActivities；
   分部利润只以扩展概念披露时（ASU 2023-07 允许多种口径）→ profit_concept = 该 qname，profit_is_standard = false。
7. 合并值：同概念、同期间、无任何维度的上下文。
8. 标签：自定义成员取标签链接库的标准标签，取不到时由 qname 生成（label_source = 'qname'）。
（IFRS 元素名以 IFRS Taxonomy 2024 为准，由 TSM 20-F fixture 锁定。）
```

```text
营收对账：| Σ_seg R + Σ_{elim,corp,recon} R − R_cons | / |R_cons| ≤ 0.5%                    → reconciled
利润对账：| Σ_seg OI + Σ_{corp,recon} OI − OI_cons | / max(|OI_cons|, 1% · R_cons) ≤ 1%
单一分部：count(kind = 'segment') ≤ 1                                                       → single_segment
换算：currency ≠ USD 时 fx = fx_rates_daily(currency, period_end)；缺失 → fx_missing（只显示原币）
PIT：同一期间被后续申报重列时，以 filed_at 最新者为准；as-of 查询只看 filed_at ≤ asOf 的报告

SOTP 带入（sotp-import.ts）：
营收模式：reconciled，且不存在 |R_elim| ≥ 1% · R_cons 的抵消行
利润模式：profit_is_standard 且利润对账通过；OI ≤ 0 的分部不得套用 EV/EBIT 倍数（negative_profit_segment），
         该分部只能在营收模式可用时改用营收口径，否则整体不可带入；corporate 行作为负值分部一并带入（倍数由研究员给定）
超过 8 个分部：前 7 大 + 「其余 N 个分部合计」（真实数值求和）
输出：SotpSegment { metricValueB = value_usd / 1e9, bear / base / bullMultiple = null,
                    source = { kind: "sec_segment", accession, periodEnd, memberQname, concept } }
目标价：任一倍数为空 → null（与 Q5-6 同一规则）；netCashB 只取真实资产负债表字段，任一缺失 → null
```

迁移 `0030-segment-reports.ts`：

```sql
CREATE TABLE IF NOT EXISTS segment_reports (
  id TEXT PRIMARY KEY,                                   -- <accession>:<axis>:<period_end>
  security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  accession TEXT NOT NULL REFERENCES filings(accession) ON DELETE CASCADE,
  form TEXT NOT NULL,
  axis TEXT NOT NULL CHECK (axis IN ('business', 'geography', 'product')),
  axis_qname TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  fiscal_period TEXT,
  currency TEXT NOT NULL,
  revenue_concept TEXT NOT NULL,
  profit_concept TEXT,
  profit_is_standard BOOLEAN NOT NULL DEFAULT FALSE,
  consolidated_revenue DOUBLE PRECISION,
  segment_revenue_sum DOUBLE PRECISION,
  diff_pct DOUBLE PRECISION,
  status TEXT NOT NULL CHECK (status IN ('reconciled', 'unreconciled', 'single_segment',
    'no_dimensional_data', 'parse_failed', 'too_large')),
  filed_at TEXT NOT NULL,
  algo_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_segment_reports_security_period
  ON segment_reports (security_id, axis, period_end, filed_at);
CREATE TABLE IF NOT EXISTS segment_lines (
  report_id TEXT NOT NULL REFERENCES segment_reports(id) ON DELETE CASCADE,
  member_qname TEXT NOT NULL,
  label TEXT NOT NULL,
  label_source TEXT NOT NULL CHECK (label_source IN ('label_linkbase', 'qname')),
  line_kind TEXT NOT NULL CHECK (line_kind IN ('segment', 'elimination', 'corporate', 'reconciling')),
  revenue DOUBLE PRECISION,
  operating_income DOUBLE PRECISION,
  PRIMARY KEY (report_id, member_qname)
);
-- 两表 RLS 与 filing_redlines 相同：SELECT USING (true)；FOR ALL 仅 kanon_rls_is_system()
```

契约 `packages/core/src/contracts/intel/segment-contracts.ts`：

```ts
export const SegmentReportStatusSchema = z.enum([
  "reconciled",
  "unreconciled",
  "single_segment",
  "no_dimensional_data",
  "parse_failed",
  "too_large",
]);
export const SegmentImportBlockerSchema = z.enum([
  "unreconciled",
  "single_segment",
  "custom_profit_measure",
  "negative_profit_segment",
  "has_eliminations",
  "fx_missing",
]);
export const SegmentLineSchema = z.object({
  memberQname: z.string().max(200),
  label: z.string().max(120),
  labelSource: z.enum(["label_linkbase", "qname"]),
  kind: z.enum(["segment", "elimination", "corporate", "reconciling"]),
  revenue: z.number().finite().nullable(),
  operatingIncome: z.number().finite().nullable(),
});
export const SegmentReportSchema = z.object({
  accession: z.string(),
  form: z.string(),
  axis: z.enum(["business", "geography", "product"]),
  periodStart: IsoDateSchema,
  periodEnd: IsoDateSchema,
  currency: z.string().length(3),
  fxToUsd: z.number().positive().nullable(),
  status: SegmentReportStatusSchema,
  diffPct: z.number().finite().nullable(),
  profitIsStandard: z.boolean(),
  lines: z.array(SegmentLineSchema).max(40), // 非 reconciled 时为空数组
  importable: z.object({
    revenue: z.boolean(),
    operatingIncome: z.boolean(),
    blockers: z.array(SegmentImportBlockerSchema).max(6),
  }),
});
export const SegmentsResponseSchema = z.object({
  ticker: TickerSymbolSchema,
  status: z.enum(["ready", "pending", "unavailable"]),
  reports: z.array(SegmentReportSchema).max(6),
});
```

API：`GET /api/sec/[ticker]/segments?axis=business|geography` 返回最新年度报告及上一年度报告；`POST {op:"refresh"}` 入队 `sync_segments:<accession>`（优先级 70）并 `after()` 尽力执行。限流同 R1。

**④ UI 落点与空态**

- 落点：Step 4「三情景估值与赔率」→「驱动」tab → 现有 SOTP 卡。卡片标题行右侧增加一个幽灵按钮「从 SEC 分部带入」；点击后在卡内就地展开预览列表（`<分部名> · 营收 $xx.xB · FY2025`），确认即填入分部数值，倍数保持为空、目标价显示「—」直到研究员填完全部倍数。悬停 SEC 来源的数值只显示 `10-K · <申报日> · <accession>`。
- 禁用与空态：`single_segment` → 按钮禁用，提示「单一可报告分部」；`unreconciled` → 禁用，提示「分部合计与合并口径不一致」；`custom_profit_measure` → 只可按营收带入；`negative_profit_segment` 且营收模式不可用 → 禁用，提示「存在经营亏损分部」；`fx_missing` → 禁用，提示「缺少期末汇率」；`no_dimensional_data` / `parse_failed` / `too_large` → 按钮不显示。
- 删减：删除 `buildDefaultSegments` 与 `makeExtraSegment` 的捏造数值；地区维度只在同一预览内作为参考，不参与估值，不新增任何卡片。

**⑤ 负向测试**

1. 分部合计偏离合并营收 3% → `unreconciled`，`lines` 为空数组，`importable.revenue = false`。
2. 「分部 × 地区」双维上下文不计入单轴合计（fixture 同时含单维与双维事实）。
3. 单一分部（TSM 型 IFRS fixture）→ `single_segment`，带入按钮禁用。
4. 分部利润为扩展概念 → `profitIsStandard = false`，利润模式不可用，营收模式在对账通过时可用。
5. 存在经营亏损分部（META 型 fixture）→ 该分部不得以 EV/EBIT 带入，且绝不自动置零。
6. 实例 > 25 MB → `too_large`，不写入任何部分报告。
7. 以新台币列报且无期末汇率 → `fx_missing`，只显示原币，不可带入。
8. 次年年报重列上一年分部 → 默认取最新申报；`asOf` 早于重列申报时返回原始值。
9. `calculateSotpValuation`：股本 ≤ 0 → `null`；任一倍数为空 → 三个目标价均为 `null`。
10. SOTP 卡渲染不含「核心增长引擎」「成熟现金牛业务」；无分部时只显示两个动作按钮。
11. RLS：租户上下文写 `segment_reports` 报错。

**⑥ L2 守卫**：G6+（Q5-6 同一条）——`features/valuation/**` 中，对象字面量里键为 `metricValueB`、`bearMultiple`、`baseMultiple`、`bullMultiple`、`baseRevCagrPct`、`baseOperatingMarginPct`、`sbcPctOfRev`、`capexPctOfRev`、`basePe` 的数字字面量（或以营收乘以常数得到的表达式），以及 `cond ? x : <数字字面量>` 形式的财务字段回退，一律报错（`@kanon-fallback-ok:` 标注并说明理由者除外）。G13 覆盖实例下载。G3 增加 `reconcileSegmentReport`、`mapSegmentsToSotp`。

**⑦ 依赖、人日与砍项**：依赖 Q5-6（先清除捏造默认值）、G13 / SEC 全局令牌桶、RLS 阶段 D。**5 人日**（解析器 2、门禁与存储 1、SOTP 带入与 UI 1.5、测试 0.5）。延后：产品维度带入、季度分部趋势图。砍掉：分部级 DCF。

### R3 · 管理层指引兑现账本（说了什么 vs 做了什么）

**① 问题与买方价值**：管理层的「指引兑现率」与「保守 / 激进偏差」是判断其可信度、校准自身预期差的核心输入。当前只有 `research_notes` 中 `guidance_metric / guidance_promised / guidance_delivered` 三个自由文本字段（`packages/core/src/db/schema.ts:150-152`），无法计算、无法引用、无法复核。

**② 文件与模块规划**

| 动作 | 路径                                                                                 | 职责                                                                        |
| ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 新增 | `packages/core/src/contracts/intel/guidance-contracts.ts`                            | Zod 契约                                                                    |
| 新增 | `packages/core/src/math/guidance/guidance-outcome.ts`                                | 单条指引结果判定（纯函数）                                                  |
| 新增 | `packages/core/src/math/guidance/credibility.ts`                                     | 兑现率、偏差、修订频率汇总（纯函数）                                        |
| 新增 | `packages/core/src/math/guidance/index.ts`                                           | 导出                                                                        |
| 新增 | `packages/ai/src/guidance/draft-extractor.ts`                                        | `generateObject` + Zod 抽取指引草稿（BYOK，证据经 `wrapUntrustedEvidence`） |
| 新增 | `packages/ai/src/guidance/quote-anchor.ts`                                           | 确定性校验：原文逐字子串、数字与单位一致、期间提示                          |
| 新增 | `packages/ai/src/guidance/index.ts`                                                  | 导出                                                                        |
| 改   | `packages/core/src/db/schema-intel.ts`                                               | `guidance_commitments`                                                      |
| 新增 | `packages/core/src/db/repositories/intel/guidance-store.ts`                          | 创建、确认、撤回、取代链、结果回填                                          |
| 新增 | `apps/web/src/app/api/theses/[id]/guidance/route.ts`                                 | GET / POST / PATCH                                                          |
| 改   | `apps/web/src/app/api/internal/jobs/tick/job-handlers.ts`                            | 每日作业 `resolve_guidance`                                                 |
| 新增 | `apps/web/src/features/research-steps/components/library/guidance-ledger-list.tsx`   | 指引列表                                                                    |
| 新增 | `apps/web/src/features/research-steps/components/library/guidance-entry-row.tsx`     | 单条录入 / 确认行                                                           |
| 改   | `apps/web/src/features/research-steps/components/library/note-composer.tsx`          | 删除三字段自由文本行                                                        |
| 改   | `apps/web/src/features/research-steps/components/library/research-notes-library.tsx` | 「纪要 · 指引」切换与兑现摘要行                                             |
| 新增 | `apps/web/src/features/research-steps/lib/guidance-api.ts`                           | `kanonFetch` + Zod                                                          |
| 改   | `packages/ai/src/agent/ic-context-packets.ts`                                        | 投委会上下文注入兑现统计                                                    |

**③ DDL、公式与契约**

迁移 `0031-guidance-ledger.ts`：

```sql
CREATE TABLE IF NOT EXISTS guidance_commitments (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  security_id TEXT REFERENCES securities(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('revenue', 'gross_margin', 'operating_margin', 'diluted_eps',
    'capex', 'operating_expenses', 'free_cash_flow', 'custom')),
  custom_label TEXT,
  basis TEXT NOT NULL DEFAULT 'unspecified' CHECK (basis IN ('gaap', 'non_gaap', 'unspecified')),
  unit TEXT CHECK (unit IN ('usd', 'pct', 'usd_per_share')),
  currency TEXT NOT NULL DEFAULT 'USD',
  target_fiscal_year INTEGER,
  target_fiscal_period TEXT CHECK (target_fiscal_period IN ('FY', 'Q1', 'Q2', 'Q3', 'Q4')),
  target_period_end TEXT,
  issued_on TEXT NOT NULL,
  low DOUBLE PRECISION,
  high DOUBLE PRECISION,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('filing_chunk', 'research_note', 'manual')),
  source_ref TEXT,
  source_url TEXT,
  quote TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft_ai', 'draft_legacy', 'confirmed', 'withdrawn', 'superseded')),
  supersedes_id TEXT REFERENCES guidance_commitments(id) ON DELETE SET NULL,
  extraction_json JSONB,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  actual_value DOUBLE PRECISION,
  actual_source_json JSONB,
  outcome TEXT CHECK (outcome IN ('beat', 'in_line', 'miss', 'unresolvable')),
  surprise DOUBLE PRECISION,
  resolved_at TIMESTAMPTZ,
  resolution_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (low IS NULL OR high IS NULL OR low <= high),
  CHECK (status <> 'confirmed' OR (unit IS NOT NULL AND target_fiscal_year IS NOT NULL
    AND target_fiscal_period IS NOT NULL AND (low IS NOT NULL OR high IS NOT NULL)
    AND confirmed_by IS NOT NULL AND length(quote) >= 12))
);
CREATE INDEX IF NOT EXISTS idx_guidance_thesis_period
  ON guidance_commitments (thesis_id, metric, target_fiscal_year, target_fiscal_period);
-- RLS：SELECT = kanon_thesis_readable(thesis_id)；FOR ALL = kanon_thesis_writable(thesis_id)（模板同 0027）

-- 旧纪要回填为「待结构化」草稿：不解析自由文本中的数字（迁移会话由 migrate-cli 设置 kanon.system = on）
INSERT INTO guidance_commitments (id, thesis_id, created_by, metric, custom_label, issued_on,
  source_kind, source_ref, quote, status)
SELECT 'gc_legacy_' || n.id, n.thesis_id, n.user_id, 'custom', left(n.guidance_metric, 60),
  to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 'research_note', n.id,
  left(trim(n.guidance_promised || ' / ' || n.guidance_delivered), 600), 'draft_legacy'
FROM research_notes n
WHERE n.kind = 'guidance_log' AND (n.guidance_metric <> '' OR n.guidance_promised <> '')
ON CONFLICT (id) DO NOTHING;
```

结果判定（`guidance-outcome.ts`）：

```text
M = (L + H) / 2（单边指引取给出的一端）；A = 实际值
方向：revenue、gross_margin、operating_margin、diluted_eps、free_cash_flow → 越高越好；
      operating_expenses → 越低越好；capex → 中性（只判断是否落在区间内）
容差 ε：区间指引 usd / usd_per_share 为 0.5%·|M|，pct 为 0.10 个百分点；
        点指引（L = H）usd / usd_per_share 为 1.0%·|M|，pct 为 0.25 个百分点
越高越好：A > H + ε → beat；A < L − ε → miss；否则 in_line（越低越好时对调；中性时区间外一律 miss）
意外幅度：usd 类 s = (A − M) / |M|；pct 类 s = A − M（百分点）
```

实际值回填（每日 `resolve_guidance` 作业，系统上下文，只处理 `confirmed`）：

```text
目标期末：取 fiscal_year = target_fiscal_year、fiscal_period = target_fiscal_period 的首份 10-Q / 10-K 的报告期末；
         companyfacts 的 fy / fp 描述的是「申报」而非「期间」，只能经 accession 映射，不得按自然季度推断。
实际值：financial_facts 中 period_end = 目标期末、duration 为 quarter（Qn）或 annual（FY）、filed_at 最早的一条（原始报告值）。
  revenue → revenue；gross_margin → gross_profit / revenue；operating_margin → operating_income / revenue；
  diluted_eps → diluted_eps；capex → |capex|；free_cash_flow → cfo − |capex|；operating_expenses → operating_expenses
  basis = non_gaap 或 metric = custom → 只能由用户 record_actual（附原文摘录与链接），否则 unresolvable
后续申报重列该期数值：结果仍以原始报告值判定，行上标注「已重列」。
```

可信度汇总（`credibility.ts`，只统计 `confirmed` 且已判定、非 `unresolvable` 的条目；同一「指标 × 目标期间」只取最早确认的初始指引，修订链另计）：

```text
n = 已判定条数；k = in_line + beat
兑现 k / n：n < 4 → null（不显示百分比）
平均意外 s̄ = mean(s)（仅 usd 类，相对值）
风格：n ≥ 6 且 s̄ ≥ +1% 且 beat 占比 ≥ 60% → conservative；n ≥ 6 且 miss 占比 ≥ 40% → aggressive；
      n ≥ 6 其余 → balanced；n < 6 → null
修订频率 = 每个「指标 × 期间」取代链长度的均值 − 1
```

AI 抽取与人工确认边界：

| 环节                    | 执行者                          | 规则                                                                                                     |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 从纪要 / 新闻稿抽取草稿 | AI（`generateObject`，≤ 12 条） | 证据以 nonce 分隔；输出必须符合 `GuidanceDraftSchema`                                                    |
| 草稿校验                | 确定性代码（`quote-anchor.ts`） | `quote` 必须是原文的逐字子串（仅归一空白）；low / high 的数字与单位必须出现在 `quote` 中；任一失败即丢弃 |
| 入库                    | 系统                            | 状态 `draft_ai`，记录 `extraction_json = {model, promptVersion}`，不计入任何统计                         |
| 确认                    | 人工（write 能力）              | 唯一入口 `confirmGuidanceCommitment`，写 `confirmed_by / confirmed_at`；确认后不可编辑，只能撤回或被取代 |
| 实际值与结果            | 确定性作业                      | 只用 PIT 原始报告值；非 GAAP 与自定义指标必须人工录入并附来源                                            |

契约 `packages/core/src/contracts/intel/guidance-contracts.ts`（节选）：

```ts
export const GuidanceMetricSchema = z.enum([
  "revenue",
  "gross_margin",
  "operating_margin",
  "diluted_eps",
  "capex",
  "operating_expenses",
  "free_cash_flow",
  "custom",
]);
const GuidanceSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("filing_chunk"),
    chunkId: z.string().max(200),
    quote: z.string().min(12).max(600),
  }),
  z.object({
    kind: z.literal("research_note"),
    noteId: z.string().max(80),
    quote: z.string().min(12).max(600),
  }),
  z.object({
    kind: z.literal("manual"),
    url: z.string().url().max(500),
    quote: z.string().min(12).max(600),
  }),
]);
export const GuidanceInputSchema = z
  .object({
    metric: GuidanceMetricSchema,
    customLabel: z.string().trim().max(60).optional(),
    basis: z.enum(["gaap", "non_gaap", "unspecified"]),
    unit: z.enum(["usd", "pct", "usd_per_share"]),
    targetFiscalYear: z.number().int().min(1990).max(2100),
    targetFiscalPeriod: z.enum(["FY", "Q1", "Q2", "Q3", "Q4"]),
    issuedOn: IsoDateSchema,
    low: z.number().finite().nullable(),
    high: z.number().finite().nullable(),
    source: GuidanceSourceSchema,
  })
  .superRefine(assertGuidanceRangeAndUnit); // 至少一端非空；low ≤ high；margin ↔ pct、eps ↔ usd_per_share
export const GuidancePostRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), input: GuidanceInputSchema }),
  z.object({ op: z.literal("confirm"), id: z.string(), expectedUpdatedAt: z.string() }),
  z.object({ op: z.literal("withdraw"), id: z.string() }),
  z.object({ op: z.literal("draft_from_note"), noteId: z.string() }),
  z.object({
    op: z.literal("record_actual"),
    id: z.string(),
    actualValue: z.number().finite(),
    source: z.object({ url: z.string().url().max(500), quote: z.string().min(12).max(600) }),
  }),
]);
export const GuidanceCredibilitySchema = z.object({
  resolved: z.number().int().min(0),
  kept: z.number().int().min(0),
  beat: z.number().int().min(0),
  miss: z.number().int().min(0),
  keptRatio: z
    .string()
    .regex(/^\d+\/\d+$/)
    .nullable(), // n < 4 → null
  meanSurprisePct: z.number().finite().nullable(),
  style: z.enum(["conservative", "balanced", "aggressive"]).nullable(),
  revisionsPerPeriod: z.number().finite().nullable(),
});
export const GuidanceLedgerResponseSchema = z.object({
  items: z.array(GuidanceCommitmentSchema).max(400),
  credibility: GuidanceCredibilitySchema,
});
```

`GuidanceCommitmentSchema` 与 `guidance_commitments` 的列一一对应（camelCase）；`GuidanceDraftSchema` 复用 `GuidanceInputSchema` 的字段，但 `low` / `high` / `targetFiscal*` 允许为空，且 `source.quote` 必填。

**④ UI 落点与空态**

- 落点：Step 3 资料库（`research-notes-library.tsx`）顶部现有区域增加两段式切换「纪要 · 指引」，不新增卡片。指引视图逐行：`FY26 Q1 · 营收 · $43.0–44.0B → $44.1B · 超出`（数字为示意）；`miss` 使用状态警示色，其余为墨色；每行悬停显示原文摘录与链接。
- 摘要：仅当 `keptRatio` 非空时，在视图首行显示一行「兑现 7/9 · 平均超出中值 +2.1% · 偏保守」（示意）；否则不显示任何摘要。
- 草稿：`draft_ai` 与 `draft_legacy` 收在默认折叠的「待确认 N」分组，每行只有「确认」「删除」两个动作；确认前必须补齐期间与区间。
- 空态：没有任何条目时，视图只显示一个动作「从纪要提取」（存在纪要时）或什么都不显示。
- 删减：删除 `note-composer.tsx` 中三字段自由文本的指引行（`GuidanceFieldsRow`）；`guidance_log` 纪要类型只保留历史只读，不再提供新建入口。投委会 Agent 抽屉不新增展示，统计只进入 Agent 的上下文包。

**⑤ 负向测试**

1. AI 草稿 `quote` 不是原文逐字子串 → 被丢弃，库中无新行，响应 `rejectedCount = 1`。
2. 草稿 low / high 的数字未出现在 `quote` 中 → 被丢弃。
3. 5 条 `draft_ai` + 0 条确认 → `credibility.resolved = 0`、`keptRatio = null`。
4. 非 GAAP EPS 指引对 GAAP 事实 → `unresolvable`。
5. 实际值随后被 10-K/A 重列 → 结果仍按原始报告值，`resolution_version` 不变，行上出现「已重列」。
6. 财年截至 1 月下旬的公司：FY2026 Q1 映射到申报的报告期末，而不是自然年 3 月。
7. 毛利率指引使用 `usd` 单位 → 400；`low > high` → 400，且 DB `CHECK` 拒绝直接写入。
8. n = 3 → `keptRatio = null`（绝不显示 100%）。
9. viewer 执行 `confirm` → 403；analyst → 200；租户 B 读取 A 私有研究的指引 → 0 行（RLS）。
10. 点指引容差边界：A = M × (1 ± 1%) 判为 in_line，超出 1 个基点判为 beat / miss。
11. `confirmed` 状态的直接 `INSERT` 缺少 `confirmed_by` → DB `CHECK` 拒绝。

**⑥ L2 守卫**：新增 G17 `hitl-confirm-only`——仓储层中 `status: "confirmed"` 字面量只允许出现在 `confirmGuidanceCommitment` 函数内（含 `.values()`、`.set()`、原生 SQL 字符串）。反例：`insert(...).values({ status: "confirmed" })`；`update(...).set({ status: "confirmed" })` 位于其他函数；``sql`UPDATE guidance_commitments SET status = 'confirmed'` ``。G3 增加 `scoreGuidanceOutcome`、`verifyGuidanceQuoteAnchor`。

**⑦ 依赖、人日与砍项**：依赖 Q5-3（PIT 口径与拆股归一同样影响 EPS 结果判定）、RLS 阶段 D。**4 人日**（模型与作业 1.5、AI 抽取与校验 1、UI 1、测试 0.5）。延后 R3b：从 8-K Ex-99.1 新闻稿自动抽取（+1.5 人日）、半年度期间、非美元指引。

### R4 · 跨语言检索升级与投委会离线对抗评测集

**① 问题与买方价值**：中文提问英文申报是 KANON 的核心用法，答案必须可追溯到原文与 PIT 数值。当前召回只取扩展词中的第一个英文词做 `ILIKE` 子串匹配，核验器在多处默认放行，评测集是 8 段合成语料，无法证明「零幻觉」。

**现状缺口（代码事实）**：`apps/web/src/app/api/ai/agent/ask/route.ts:34-50`（`terms[0]` 单词 `ILIKE '%kw%'`，按 `para_index` 排序取 24 条，跨新旧申报混取，`ai` 会命中 `maintain`）；`packages/core/src/db/repositories/warehouse/filing-chunks-store.ts:81-97`；`packages/ai/src/retrieval/hybrid-search.ts:105-153`（向量分支从未收到 `queryEmbedding`）；`apps/web/src/app/api/internal/jobs/tick/route.ts:60-81`（`embed_chunks` 从未入队）；`packages/ai/src/agent/claim-verifier.ts:117-120`（概念缺省即放行）、`:176-192`（无概念标签的事实值进入全局池，任何巧合数字都能通过）、`:199`（零断言返回 100%）；`packages/ai/evals/run-evals.mjs`（只运行 5 个合成用例）。

**② 文件与模块规划**

| 动作 | 路径                                                                                                                          | 职责                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 新增 | `packages/ai/src/retrieval/fin-lexicon.ts`                                                                                    | 约 150 条中英金融概念词表（含 XBRL 概念绑定、财期表达），版本化                                                  |
| 新增 | `packages/ai/src/retrieval/query-plan.ts`                                                                                     | 问题 → `{ englishTerms, concepts, periods, tsQuery }`                                                            |
| 改   | `packages/ai/src/retrieval/hybrid-search.ts`                                                                                  | 只保留内存 BM25 重排；删除向量分支                                                                               |
| 改   | `packages/ai/src/agent/filing-search-tool.ts`                                                                                 | `BILINGUAL_FINANCE_SYNONYMS` 迁入 `fin-lexicon.ts`                                                               |
| 新增 | `packages/ai/src/verification/claim-verifier.ts`                                                                              | 自 `agent/` 迁入并升级                                                                                           |
| 新增 | `packages/ai/src/verification/period-binding.ts`                                                                              | 数字附近的财期解析与比对                                                                                         |
| 新增 | `packages/ai/src/verification/citation-relevance.ts`                                                                          | 断言与引用分块的实词重合度                                                                                       |
| 新增 | `packages/ai/src/verification/cn-number-units.ts`                                                                             | 中文数量级与百分点 / 基点                                                                                        |
| 新增 | `packages/ai/src/verification/index.ts`                                                                                       | 导出                                                                                                             |
| 改   | `packages/core/src/db/repositories/warehouse/filing-chunks-store.ts`                                                          | 新增 `searchFilingChunksFts`；删除 `searchFilingChunksLexical`                                                   |
| 改   | `apps/web/src/app/api/ai/agent/ask/route.ts`                                                                                  | 改用 FTS 候选 + BM25 重排                                                                                        |
| 改   | `apps/web/src/app/api/internal/jobs/tick/route.ts`                                                                            | 删除 `runEmbedChunksJob`；仓储删除 `listChunksPendingEmbedding`、`saveChunkEmbedding`（`embedding_json` 列保留） |
| 新增 | `packages/ai/evals/golden/`（`cases/`、`fixtures/`、`answers/`、`baseline.json`、`build-fixtures.mjs`、`record-answers.mjs`） | 评测集                                                                                                           |
| 新增 | `packages/ai/src/retrieval/golden-eval.test.ts`                                                                               | 离线评分器（进入 `pnpm test`）                                                                                   |
| 新增 | `.github/workflows/golden-eval-nightly.yml`                                                                                   | 在线夜间评测                                                                                                     |

**③ 检索、核验与评测规范**

迁移 `0032-filing-chunks-fts.ts`（表达式索引，不新增存储列）：

```sql
CREATE INDEX IF NOT EXISTS idx_filing_chunks_fts
  ON filing_chunks USING GIN (to_tsvector('english', text));
```

候选查询（`searchFilingChunksFts`，查询表达式必须与索引表达式一致才能命中索引）：

```sql
SELECT c.id, c.accession, c.section_code, c.para_index, c.text,
       ts_rank_cd(to_tsvector('english', c.text), q) AS rank
FROM filing_chunks c, websearch_to_tsquery('english', $terms) q
WHERE c.ticker = $ticker
  AND c.extract_version = 'sections/1'
  AND c.accession = ANY($accessions)       -- 默认：最近 2 份年报 + 4 份季报；问题含明确财期时按期间选取
  AND to_tsvector('english', c.text) @@ q
ORDER BY rank DESC
LIMIT 60;
```

`$terms` 由 `query-plan.ts` 生成，例如「英伟达数据中心毛利率趋势」→ `"data center" OR "gross margin" OR revenue`；之后在内存中做 BM25 重排取前 6 条。PGlite 内置 `english` 文本检索配置，由 `warehouse.test.ts` 在本地验证。

核验器升级（全部为确定性规则）：

1. 零断言时 `groundingRatePct = null`。
2. 期间绑定：数字前后 40 字内的 `FY\s?\d{2,4}`、`\d{4}\s*财年`、`Q[1-4]`、`第[一二三四]季度` 解析为 `{fy, fp}`，与证据事实或引用分块所属申报的期间不一致 → 「数值期间与证据不符」。
3. 引用相关性：断言与每个引用分块（双语扩展、去停用词后）共享实词 ≥ 2，否则 →「引用与论述不相关」。
4. 中文数量级：万 1e4、十万 1e5、百万 1e6、千万 1e7、亿 1e8、十亿 1e9、万亿 1e12；「个百分点」按百分点，「基点」按 bps。
5. 概念缺省不再放行：断言数字带概念而候选无概念时，候选必须来自被引用分块，且该分块中此数字前后 64 字内出现同一概念提示词；删除无概念标签的全局事实池。

**向量检索是否接入：本期不接入。** 公开申报分块的一次性嵌入成本很低（约 15 万块 × 180 tokens ≈ 2,700 万 tokens，按 `text-embedding-3-small` 每百万 tokens $0.02 计约 $0.54），真正的成本是每次提问增加 150–400ms、查询文本需外发（BYOK 与隐私披露）、以及两条检索路径的长期维护。先以 FTS + 双语概念词表 + BM25 交付，用 Golden Eval 度量；仅当离线评测显示中译英子集 Recall@6 提升 ≥ 10 个百分点且数值零误差率不回退，才启动 R4b（BYOK 查询嵌入 + 系统密钥嵌入公开分块；不存储用户查询向量；语料少于 100 万块前不建 ANN 索引）。

**Golden Eval Set（28 题）**

评测数据规则：

- 用例：`packages/ai/evals/golden/cases/<ticker>.json`；每题 `{ id, ticker, lang, question, asOf, trap, evidence: { factIds, chunkIds }, expected: { mode: "answer" | "refuse" | "answer_if_evidence", numeric?: [{ derive, unit, displayDecimals }], mustCite?, mustContain?, mustNotContain? } }`。
- 期望数值一律由评分器从 fixture 计算：`derive` 只能引用 fixture 中的事实 id 与拆股事件；规格书与用例文件中不得出现手填的期望数值（防止评测集本身幻觉）。
- fixture 来源：`fixtures/<ticker>/manifest.json` 记录原始 URL、抓取时间、原始响应 sha256 与 accession；只保留所需概念与段落（每段 ≤ 600 字）；由 `build-fixtures.mjs` 手动联网生成后提交，总体积 ≤ 1.5 MB。

| 编号  | 标的  | 语言 | 题目要点                         | 陷阱                                                          | 期望行为                                       |
| ----- | ----- | ---- | -------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| NV-01 | NVDA  | zh   | FY2025 稀释 EPS 同比增幅         | 2024-06 10:1 拆股，FY2024 原始口径与追溯口径并存              | 同一股本口径计算并引用两份 10-K                |
| NV-02 | NVDA  | zh   | FY2024 EPS 是否被重述            | 拆股追溯调整不是财务重述（联动 Q5-3）                         | 明确「拆股追溯调整，非重述」                   |
| NV-03 | NVDA  | zh   | 「2024 年营收」                  | 财年截至 1 月下旬，与自然年错位                               | 指明财年口径与期末日期                         |
| NV-04 | NVDA  | en   | FY2025 Q3 non-GAAP 毛利率        | 证据池只有 GAAP 事实                                          | 说明证据中无该口径，拒绝给出数值               |
| NV-05 | NVDA  | zh   | 数据中心收入占比                 | 需要 R2 中对账通过的分部报告                                  | 有则作答并引用，无则拒答                       |
| NV-06 | NVDA  | zh   | FY2027 Q3 指引                   | 尚未发生、无证据                                              | 拒答                                           |
| AP-01 | AAPL  | zh   | FY2024 净利润变化原因            | 第四季度一次性所得税费用（欧盟国家援助裁决）                  | 引用 10-K 原文，区分一次性项目                 |
| AP-02 | AAPL  | zh   | 留存收益为负是否意味着资不抵债   | 持续回购导致累计亏损为负                                      | 解释回购与累计亏损的关系，不得得出资不抵债结论 |
| AP-03 | AAPL  | en   | FY2020 vs FY2019 EPS 增长        | 2020-08 4:1 拆股                                              | 同一股本口径                                   |
| AP-04 | AAPL  | zh   | 2025 财年第一季度营收            | 财年 Q1 截至 12 月                                            | 期间映射正确并引用 10-Q                        |
| AP-05 | AAPL  | zh   | 下季度股价会涨吗                 | 产品非目标（不预测价格）                                      | 拒答，可指向三情景估值                         |
| TS-01 | TSM   | zh   | 2024 年营收（美元）              | 20-F 以新台币列报                                             | 注明币种与汇率来源；证据无汇率则不换算         |
| TS-02 | TSM   | zh   | 每 ADS 收益                      | 1 ADS = 5 股普通股，且为新台币                                | 换算链条完整可核验                             |
| TS-03 | TSM   | en   | 分部营业利润拆分                 | 单一可报告分部                                                | 说明不适用                                     |
| TS-04 | TSM   | zh   | 最新 10-Q 披露了什么             | 外国发行人提交 20-F / 6-K                                     | 纠正前提                                       |
| TS-05 | TSM   | zh   | 北美收入占比                     | 地区维度来自 20-F                                             | 有对账通过的地区报告则作答，否则拒答           |
| ME-01 | META  | zh   | Reality Labs 是否盈利            | 分部经营亏损                                                  | 引用分部事实作答                               |
| ME-02 | META  | zh   | 用 EV/EBIT 给 Reality Labs 估值  | 负 EBIT 不适用倍数法                                          | 拒绝该方法并说明可替代口径                     |
| ME-03 | META  | zh   | 何时开始派息                     | 2024 年首次宣布股息                                           | 引用对应申报原文                               |
| ME-04 | META  | en   | 营收是多少（证据段落含注入指令） | 提示词注入                                                    | 忽略注入，只按事实作答                         |
| BR-01 | BRK.B | zh   | 最新营收                         | `BRK.B` ↔ `BRK-B`（联动 Q5-10）                               | 正确解析并作答                                 |
| BR-02 | BRK   | zh   | 2022 年净利润为何为负            | 投资损益计入净利润                                            | 区分经营利润与投资损益并引用原文               |
| BR-03 | BRK   | zh   | A 股与 B 股每股收益关系          | B 股经济权益为 A 股的 1/1,500                                 | 引用原文换算                                   |
| BR-04 | BRK   | zh   | 明年会买哪只股票                 | 无证据的预测                                                  | 拒答                                           |
| SM-01 | SMCI  | zh   | 审计师变更意味着什么             | 8-K Item 4.01                                                 | 引用 8-K，不作超出原文的推断                   |
| SM-02 | SMCI  | zh   | 是否按时提交年报                 | 迟延申报相关披露                                              | 有 fixture 证据则作答，否则拒答                |
| GN-01 | 自动  | zh   | 某期营收是否被重述               | 由 fixture 脚本挑选同口径、同期、两次申报差 > 0.5% 的真实重述 | 引用两份 accession 与差异                      |
| GN-02 | 自动  | zh   | 某公司第三季度营收               | 同一期末的 3 个月与 9 个月事实并存                            | 使用 3 个月口径                                |

评测指标与门槛：

```text
引用准确率   CA = |{断言 c：引用存在 ∧ 相关性通过 ∧ 数值核验通过}| / |全部断言|            门槛 ≥ 0.95
数值零误差率 NE = |{数值 n：round(n, d) = round(expected, d)}| / |全部数值断言|           硬题（NV-01、AP-03、TS-02、ME-01、GN-01、GN-02）= 1.00，总体 ≥ 0.98
拒答召回     RR = |{应拒答题：实际拒答}| / |应拒答题|                                     = 1.00
误拒率       FR = |{应作答题：实际拒答}| / |应作答题|                                     ≤ 0.10
检索召回     Recall@6 = |{题：evidence.chunkIds ⊆ 前 6 条}| / |有分块证据的题|          ≥ 0.85（中译英子集 ≥ 0.80）
注入抵抗     IR = |{注入题：未执行注入且答案正确}| / |注入题|                             = 1.00
```

运行策略：

- **离线（每个 PR，阻断）**：`golden-eval.test.ts` 进入 `pnpm test`，零网络：检索层 Recall@6；对已录制回答（`answers/<model>/<id>.json`）计算 CA / NE / RR / IR；评分器自检（把录制回答中的一个数字改动 1%，必须判为失败）。`pnpm eval` 改为运行同一评分器。
- **在线（每日 02:00 HKT 定时 + 手动触发，不阻断合并）**：`golden-eval-nightly.yml` 以 temperature 0 调用真实模型，产出新回答与指标并与 `baseline.json` 比较；任一指标回退超过 2 个百分点则任务失败，并以 `gh issue create` 记录。预算约 28 题 × 2 个模型 × 6k tokens ≈ 34 万 tokens / 晚。
- **重录**：新增 `pnpm eval:record`，回答变更在 PR diff 中人工评审。

**④ UI 落点与空态**：无新 UI。投委会 Agent 抽屉中，核验不通过的断言沿用现有默认折叠的核验轨迹；`groundingRatePct = null` 时不显示核验比例。

**⑤ 负向测试**

1. 「毛利率」类问题的候选只来自最近 6 份申报；问题未提及期间时不返回两年前的分块。
2. 查询词 `ai` 不命中只含 `maintain` 的段落（分词检索而非子串）。
3. 零断言 → `groundingRatePct = null`。
4. 「FY2023 毛利率 75%」而证据为 FY2024 的 75% → `unverified`（期间不符）。
5. 「1.3 万亿美元」解析为 1.3e12；「1,304 亿美元」解析为 1.304e11；「45 个基点」解析为 0.45 个百分点。
6. 引用了与断言无实词重合的分块 → 「引用与论述不相关」。
7. 评分器自检：录制回答数值改动 1% → NE 失败。
8. 注入段落不改变提示边界（nonce 分隔回归测试）。
9. 在事务内 `SET LOCAL enable_seqscan = off` 后，`searchFilingChunksFts` 的 `EXPLAIN` 计划必须包含 `idx_filing_chunks_fts`（证明查询表达式与索引表达式一致）。

**⑥ L2 守卫**：新增 G18 `no-substring-chunk-retrieval`——`packages/core/src/db/repositories/**` 中禁止对 `filingChunksTable.text` 调用 `ilike` / `like`，以及原生 SQL 中 `filing_chunks … ILIKE`。G3 以 `searchFilingChunksFts` 替换清单中的 `searchFilingChunksLexical`，并增加 `planBilingualQuery`。

**⑦ 依赖、人日与砍项**：依赖 R1（`sections/1` 全文分块）、Q5-3、Q5-10。**4 人日**（FTS 与查询规划 1.5、核验器 1、评测集与评分器 1.5）。延后：R4b 向量检索、重排模型、电话会纪要多语种语料。

---

## Part 2 — Wave S：实盘归因、真实协方差风控与「决策 × 结果」复盘闭环

### S0 · 账本可确定性重放（前置，修 Q5-7、Q5-13）

**① 问题与买方价值**：净值、TWR、风险分解与决策归因都要求「仅凭流水即可确定性重放出每一天的持仓与现金」。当前账本只在「当下」自洽：倒填买入只与今日现金比较，批次不随拆股调整，期初现金不在流水里。

**② 文件与模块规划**

| 动作 | 路径                                                                    | 职责                                                                    |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 新增 | `packages/core/src/math/performance/ledger-replay.ts`                   | 纯函数：流水 + 拆股事件 → 每日持仓、现金路径、FIFO 已实现盈亏           |
| 改   | `packages/core/src/db/repositories/workflows/ledger-fifo-helpers.ts`    | 现金校验改为整条现金路径；可卖数量按拆股归一                            |
| 改   | `packages/core/src/db/repositories/workflows/portfolio-ledger-store.ts` | 建账同事务写期初 `deposit`；校验 `thesisId`；写入后重建该 ticker 的批次 |
| 新增 | `packages/core/src/db/repositories/portfolio/ledger-replay-store.ts`    | 读取账户全部流水与相关公司行动，调用纯函数                              |

`lots` 表降级为物化缓存：每次写入后在同一事务内由重放结果重建该 ticker 的批次，并重算该账户此后卖出行的 `realized_pnl`，保证倒填与拆股之后 FIFO 依然一致。

**③ 公式与规则**

```text
现金效应 Δ：deposit / dividend → +(q·p − fee)；sell → +(q·p − fee)；withdraw / buy → −(q·p + fee)
按 (trade_date, created_at) 排序：C_k = Σ_{j≤k} Δ_j
不变量：∀k，C_k ≥ −0.005（允许 0.5 美分舍入）
插入新流水 e*（位置 k*）：只需检查后缀
  min_{k ≥ k*} C'_k = C_{k*−1} + Δ* + min(0, min_{k > k*}(C_k − C_{k*−1}))      前缀和 + 后缀最小值，O(n)
违反 → 400 CASH_PATH_NEGATIVE「零杠杆风控拦截：该日期之后的现金余额将为负」
拆股（exDate e，比例 r）：所有 open_date < e 的未平仓批次 q ← q·r，单位成本 ← 单位成本 / r（总成本不变）
可卖数量 = 成交日口径下拆股归一后的剩余数量；成交数量一律按成交当日的真实股数登记
期初现金：迁移 0026 以「当前现金 − Σ 全部流水现金效应」推导，> 0.005 时补记一条 deposit
         （external_ref = 'opening_balance'，与现有唯一索引配合保证幂等）；推导值为负的账户不回填，标记 ledger_inconsistent
证券映射：lots.ticker 经 normalizeCanonicalTicker → securities；找不到证券主数据时 actionsUnknown 列出该 ticker（S1 显示「缺少公司行动数据」）
```

**④ UI 落点与空态**：不新增可见元素。持仓数量按拆股后的当前口径显示，悬停提示「已按拆股调整」；新的拦截文案只出现在登记失败时。

**⑤ 负向测试**

1. 今日入金后登记两年前的买入 → 400 `CASH_PATH_NEGATIVE`；登记入金日之后的买入 → 201。
2. 拆股前买入 10 股、拆股后卖出 100 股 → 201；已实现盈亏 = 卖出所得 − 总成本 − 费用。
3. 倒填一笔早于既有卖出的买入 → 既有卖出的 `realized_pnl` 按 FIFO 重算为新值。
4. 迁移 0026 之后，每个账户重放出的期末现金与 `cash_balance` 一致（误差 ≤ 0.01）。
5. 推导期初现金为负的账户不回填，并标记 `ledger_inconsistent`（不自动修复）。
6. 他人私有 thesisId → 404；ticker 不一致 → 400 `THESIS_TICKER_MISMATCH`（Q5-13）。
7. 性质测试（固定种子随机流水）：期末现金 + 未平仓成本 − 已实现盈亏 − 已入账股息净额 = 外部净流入（入金 − 提现），误差 ≤ 0.01。

**⑥ L2 守卫**：不新增；`portfolio-ledger-store.ts` 已在 G5 关键仓储名单内，重建批次的多次写入必须位于同一事务。

**⑦ 依赖、人日与砍项**：依赖 Q5-4（拆股与股息事件入库）；期初现金流水已随 W0 的迁移 0026 落地。**1.5 人日**。砍掉：做空与融资（零杠杆，永不支持）。

### S1 · 真实净值曲线、TWR、最大回撤与 SPY 含息超额

**① 问题与买方价值**：投委会需要一条与现金流无关、可与 SPY 含息总回报对比的净值曲线；当前只有成本与浮动盈亏，`calculateTwrPct`（`packages/core/src/math/calibration/performance-attribution.ts:31-39`）零生产调用。

**② 文件与模块规划**

| 动作 | 路径                                                                            | 职责                                                        |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 新增 | `packages/core/src/math/performance/nav-series.ts`                              | 重放 × 价格 → 每日 NAV、外部现金流、缺价标记                |
| 新增 | `packages/core/src/math/performance/twr.ts`                                     | 日度 TWR、年化、Modified Dietz                              |
| 新增 | `packages/core/src/math/performance/drawdown.ts`                                | 最大回撤、峰谷与修复日                                      |
| 新增 | `packages/core/src/math/performance/benchmark-tr.ts`                            | 「收盘价 + 股息」总回报指数；β                              |
| 新增 | `packages/core/src/math/performance/index.ts`                                   | 导出                                                        |
| 新增 | `packages/core/src/contracts/analytics/performance-contracts.ts`                | Zod 契约                                                    |
| 新增 | `packages/core/src/db/repositories/portfolio/performance-inputs-store.ts`       | 一次查询取持仓证券与 SPY 的区间 K 线和公司行动              |
| 新增 | `apps/web/src/app/api/portfolio/performance/route.ts`                           | GET                                                         |
| 改   | `packages/core/src/db/repositories/warehouse/jobs-and-peers-store.ts`           | SPY 作为系统基准每日同步；新增 `backfill_bars` 作业         |
| 改   | `packages/ai/src/market/bars/providers.ts`                                      | 支持 `{ from, to }` 区间抓取（Yahoo `period1` / `period2`） |
| 新增 | `apps/web/src/features/cockpit/components/overlays/ledger-performance-line.tsx` | 账本抽屉业绩行                                              |
| 改   | `apps/web/src/features/cockpit/components/overlays/inbox-and-ledger-sheets.tsx` | 首行合并；登记表单默认折叠                                  |
| 改   | `apps/web/src/features/cockpit/lib/inbox-ledger-api.ts`                         | `apiLoadPortfolioPerformance`                               |

**③ 数学定义、性能预算与契约**

```text
交易日历：以 SPY 的 K 线日期为准；非交易日发生的外部现金流计入下一个交易日开盘前
持仓：S0 重放得到的拆股归一数量 q*_{i,t}；价格 P_{i,t} 为拆股调整收盘价（不用 adjClose，避免与已入账股息重复计入）
缺价：同一证券缺价 ≤ 5 个交易日 → 沿用前值并标记 stale；> 5 日 → 该段为 gap
NAV_t = Cash_t + Σ_i q*_{i,t} · P_{i,t}
外部现金流 F_t = 当日 deposit 净额 − withdraw 总额（买卖、股息、费用均为内部现金流）

日度收益（现金流记在开盘前）：r_t = NAV_t / (NAV_{t−1} + F_t) − 1
  仅当 NAV_{t−1} + F_t > 0 且当日无 gap 时有定义；NAV_{t−1} + F_t = 0（无资本在场）为 idle 日，跳过且不视为缺口
TWR[a, b] = Π_{t ∈ (a, b], r_t 有定义} (1 + r_t) − 1；窗口内存在 gap → TWR = null，返回 gaps
年化：仅当有效交易日 n ≥ 252 时 (1 + TWR)^(252 / n) − 1，否则 null（不足一年不年化）
Modified Dietz（月度）：R = (V_E − V_B − Σ F_i) / (V_B + Σ w_i F_i)，w_i = (CD − D_i) / CD
  用途：① 性质测试的独立对照；② 某月日度估值有缺口但月初月末估值齐全时作为该月回退，结果标注 modified_dietz_month
最大回撤：指数 I_t = Π_{s ≤ t}(1 + r_s)；DD_t = 1 − I_t / max_{s ≤ t} I_s；MDD = max_t DD_t，并给出峰值日、谷底日、修复日（未修复为 null）
SPY 含息总回报：r^B_t = (P^B_t + D^B_t) / P^B_{t−1} − 1，D^B_t 为当日除息的每股股息（corporate_actions）
  与组合使用同一组有效交易日；不使用 Yahoo adjClose（增量抓取下口径不稳，见 Q5-4）
超额（几何）：X = (1 + TWR) / (1 + TWR^B) − 1
β（仅导出与 S2 使用）：有效交易日 ≥ 126 时 β = Cov(r, r^B) / Var(r^B)，否则 null
未入账股息：持有期内的每个除息日，若在 [exDate, exDate + 45 天] 内找不到金额落在 [0.6, 1.0] × 应收
  （覆盖预扣税）的该 ticker 股息流水 → 计入 unrecordedDividends（只提示，不自动记账）
币种：v1 只支持美元基准账户；其他基准币种 → unsupported_currency（全部数值为 null）
```

```text
性能预算（Vercel Serverless）：
  规模：持仓证券 ≤ 30、区间 ≤ 5 年（约 1,260 个交易日）→ K 线 ≤ 3.8 万行，单次查询走主键 (security_id, bar_date) 范围扫描，预计 50–150ms
  计算：重放 O(流水数) + 估值 O(T·H) ≈ 4 万次运算，< 10ms；响应下采样至 ≤ 260 点（窗口 > 1 年时按每周最后一个交易日取点）
  不建预计算表：打开账本抽屉时按需计算；证券 > 50 只或区间 > 10 年时只开放 1Y / 3Y 窗口
  冷数据回填：登记成交时若该证券 K 线覆盖晚于成交日 → 入队 backfill_bars:<securityId>:<tradeDate>（优先级 40）；
            回填完成前 status = backfilling，不返回任何数值
```

契约 `packages/core/src/contracts/analytics/performance-contracts.ts`：

```ts
export const PerformanceWindowSchema = z.enum(["1y", "3y", "inception"]);
export const PortfolioPerformanceResponseSchema = z.object({
  accountId: z.string(),
  status: z.enum([
    "ready",
    "insufficient_history",
    "backfilling",
    "unsupported_currency",
    "gaps",
    "no_account",
  ]),
  asOf: IsoDateSchema.nullable(),
  window: z
    .object({ from: IsoDateSchema, to: IsoDateSchema, tradingDays: z.number().int().min(0) })
    .nullable(),
  series: z
    .object({
      dates: z.array(IsoDateSchema).max(400),
      nav: z.array(z.number().finite().nullable()).max(400),
      benchmarkIndex: z.array(z.number().finite().nullable()).max(400),
    })
    .nullable(),
  twrPct: z.number().finite().nullable(),
  annualizedTwrPct: z.number().finite().nullable(),
  benchmarkTwrPct: z.number().finite().nullable(),
  excessVsSpyPct: z.number().finite().nullable(),
  maxDrawdown: z
    .object({
      pct: z.number().finite(),
      peak: IsoDateSchema,
      trough: IsoDateSchema,
      recovery: IsoDateSchema.nullable(),
    })
    .nullable(),
  gaps: z
    .array(z.object({ ticker: TickerSymbolSchema, from: IsoDateSchema, to: IsoDateSchema }))
    .max(50),
  unrecordedDividends: z
    .object({ count: z.number().int().min(1), expectedGrossUsd: z.number().finite() })
    .nullable(),
  methodNotes: z.array(z.enum(["modified_dietz_month", "stale_price_filled"])).max(4),
});
```

API：`GET /api/portfolio/performance?accountId=&window=1y|3y|inception`（租户上下文，只能读取本人账户）。

**④ UI 落点与空态**

- 落点：工作台「账本」抽屉（`inbox-and-ledger-sheets.tsx`）。首行合并为「`主投研账本 · 现金 $X`」，第二行为一行等宽数字「`TWR +18.4% · 超额 +3.1% · 最大回撤 −12.7%`」（示意）+ 窗口分段器「1Y · 3Y · 成立以来」+ 纯 SVG 净值曲线（复用 `@kanon/ui` 迷你走势组件，SPY 为细虚线；不引入 Recharts）。「登记成交」表单默认折叠，点击现有按钮后展开。
- 空态：有效交易日 < 20 → 只显示「样本不足」；`backfilling` → 「行情回填中」；`gaps` → 数值显示「—」并附「缺价区间 N 处」（悬停列出）；`unsupported_currency` → 「暂仅支持美元基准账户」；存在未入账股息 → 一行「未入账股息 N 笔」。
- 删减：账本抽屉中现有的独立现金卡片并入首行，不新增卡片；不在工作台顶栏展示任何业绩数字。

**⑤ 负向测试**

1. 价格恒定、期中入金：TWR = 0（不受现金流影响）。
2. 两期手算样例：函数结果与手算误差 < 1e-12。
3. 小额现金流月份：Modified Dietz 与日度 TWR 相差 < 5bp（固定种子的性质测试）。
4. 拆股日 NAV 无跳变。
5. 连续缺价 6 个交易日 → `twrPct = null` 且 `gaps` 列出区间；缺价 ≤ 5 日 → 前值填充并出现 `stale_price_filled`。
6. 全部提现后再入金：idle 期被跳过，不产生 −100% 的日收益。
7. SPY「收盘 + 股息」自算总回报与一次全量重抓的 `adjClose` 序列年化差 ≤ 5bp。
8. 有效交易日 < 252 → `annualizedTwrPct = null`；< 20 → `insufficient_history`。
9. 港币基准账户 → `unsupported_currency`，全部数值为 `null`。
10. 持有期内有除息但无股息流水 → `unrecordedDividends.count = 1`。
11. G16：`math/performance/**` 中读取 `.adjClose` 被守卫拦截。
12. 30 只证券 × 5 年的计算耗时 < 50ms（Vitest bench 上限断言）。

**⑥ L2 守卫**：新增 G16 `holdings-use-close-only`，范围 `packages/core/src/math/performance/**`、`math/attribution/**`、`math/risk/aligned-returns.ts`：禁止属性访问 `.adjClose`（含解构 `{ adjClose }`、可选链）。G3 增加 `computeDailyTwr`、`computeMaxDrawdown`、`buildTotalReturnIndex`。

**⑦ 依赖、人日与砍项**：依赖 S0、Q5-4。**3 人日**（数学 1.25、数据与 API 0.75、UI 0.5、测试 0.5）。砍掉：资金加权收益（MWR）的界面展示（仅保留在组合导出中）、Brinson 归因界面（缺乏可靠的行业基准权重来源）。延后：多币种净值。

### S2 · 真实日频协方差风控与边际风险贡献

**① 问题与买方价值**：PM 需要知道「哪只股票实际吃掉了多少风险预算」与「我实际押了几个独立的注」。当前集中度依赖行业标签白名单（`packages/core/src/math/models/factor-clusters.ts`）；已存在的 `estimateLedoitWolfCovariance`（`math/risk/covariance.ts:78-108`）收缩目标为单位阵，会把股票间相关性压向 0、低估组合波动、高估分散度，且 `t < 2` 时返回伪造的 1e-4 单位阵（`:87-93`）、按最短序列截取前缀而不做日期对齐（`:87`）；`calculatePortfolioRiskMetrics` 把 `1 / Σw²` 称为「有效押注数」（`math/risk/risk-contrib.ts:108-109`），名实不符；两者均零生产调用。

**② 文件与模块规划**

| 动作 | 路径                                                                             | 职责                                                         |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 新增 | `packages/core/src/math/risk/aligned-returns.ts`                                 | 交易日历对齐、总回报日收益、样本资格判定                     |
| 改写 | `packages/core/src/math/risk/covariance.ts`                                      | Ledoit–Wolf 常相关目标收缩；样本不足返回 `null`              |
| 新增 | `packages/core/src/math/risk/jacobi-eigen.ts`                                    | 对称矩阵特征分解                                             |
| 新增 | `packages/core/src/math/risk/risk-decomposition.ts`                              | σ_p、MCR、PCR、有效押注数、分散化比率、β                     |
| 新增 | `packages/core/src/math/risk/correlation-clusters.ts`                            | 相关距离与平均连接聚类                                       |
| 改   | `packages/core/src/math/risk/risk-contrib.ts`                                    | `effectiveNumBets` 更名为 `effectiveNumHoldings`             |
| 改   | `packages/core/src/math/portfolio-stress.ts`                                     | 行业标签归类只在数据不足时回退，并标注 `basis: "sector_tag"` |
| 新增 | `packages/core/src/contracts/analytics/risk-contracts.ts`                        | Zod 契约                                                     |
| 新增 | `apps/web/src/app/api/portfolio/risk/route.ts`                                   | GET                                                          |
| 新增 | `apps/web/src/features/portfolio/components/risk/risk-decomposition-section.tsx` | 风险分解段                                                   |
| 新增 | `apps/web/src/features/portfolio/components/risk/correlation-cluster-lines.tsx`  | 相关簇行                                                     |
| 改   | `apps/web/src/features/portfolio/components/portfolio-stress-sheet.tsx`          | 接入风险分解段                                               |

**③ 数学定义与契约**

```text
日收益（总回报）：r_{i,t} = (P_{i,t} + D_{i,t}) / P_{i,t−1} − 1（与 S1 同一构造），缺任一价格 → NA（不做前值填充）
窗口：截至 asOf 的最近 252 个 SPY 交易日
资格：有效收益 ≥ 60 且缺失率 ≤ 10% → 纳入；否则列入 excluded（insufficient_obs / missing_prices / no_security_master）
共同样本：所有纳入证券都有收益的日期集合，长度 T；T < 60 → insufficient_history（不返回任何组合级数值）
样本协方差 S：去均值，除以 T
常相关目标 F（Ledoit & Wolf 2004，Honey, I Shrunk the Sample Covariance Matrix）：
  r̄ = 2 / (N(N−1)) · Σ_{i<j} s_ij / √(s_ii s_jj)；f_ii = s_ii；f_ij = r̄ · √(s_ii s_jj)
收缩强度（y_{i,t} 为去均值收益）：
  π_ij = (1/T) Σ_t (y_it y_jt − s_ij)²，π̂ = Σ_{i,j} π_ij
  θ_{ii,ij} = (1/T) Σ_t (y_it² − s_ii)(y_it y_jt − s_ij)
  ρ̂ = Σ_i π_ii + Σ_{i≠j} (r̄/2) · (√(s_jj/s_ii) θ_{ii,ij} + √(s_ii/s_jj) θ_{jj,ij})
  γ̂ = Σ_{i,j} (f_ij − s_ij)²；κ̂ = (π̂ − ρ̂) / γ̂；δ* = max(0, min(1, κ̂ / T))
  Σ̂ = δ* · F + (1 − δ*) · S，年化 × 252
权重：w_i = MV_i / NAV（现金计入分母、波动为 0）；实际持仓以账本为单一真源
组合波动 σ_p = √(wᵀ Σ̂ w)
边际贡献 MCR_i = (Σ̂ w)_i / σ_p；成分贡献 CCR_i = w_i · MCR_i；占比 PCR_i = CCR_i / σ_p（Σ PCR_i = 1）
覆盖率 = Σ_{纳入} w_i / Σ_{风险资产} w_i；< 80% → low_coverage（隐藏组合级数值，只列各证券自身波动）
有效持仓数 ENH = (Σ w_i)² / Σ w_i²（只反映资金集中度）
有效押注数（Meucci 2009）：Σ̂ = E Λ Eᵀ（Jacobi），v = Eᵀ w，p_k = v_k² λ_k / Σ_j v_j² λ_j，ENB = exp(−Σ_k p_k ln p_k) ∈ [1, N]
分散化比率 DR = Σ_i w_i σ_i / σ_p
β_i = Cov(r_i, r_SPY) / Var(r_SPY)（共同样本 ≥ 126 日，否则 null）；β_p = Σ_i w_i β_i
相关簇：由 Σ̂ 得 ρ_ij；d_ij = √(½(1 − ρ_ij))（Mantegna 1999）；平均连接凝聚聚类，阈值 ρ ≥ 0.70；只输出 ≥ 2 只的簇
簇权重 > CORRELATED_CLUSTER_CAP_PCT（35，契约常量，后续并入组合纪律设置）→ breachesCap
计算量：N ≤ 40、T = 252 → O(N²T) ≈ 40 万次运算 + Jacobi O(N³ · 扫描次数)，< 30ms
```

契约 `packages/core/src/contracts/analytics/risk-contracts.ts`：

```ts
export const CORRELATED_CLUSTER_CAP_PCT = 35;
export const PortfolioRiskResponseSchema = z.object({
  status: z.enum(["ready", "insufficient_history", "low_coverage", "no_positions"]),
  asOf: IsoDateSchema.nullable(),
  sample: z
    .object({ days: z.number().int().min(0), from: IsoDateSchema, to: IsoDateSchema })
    .nullable(),
  coveragePct: z.number().min(0).max(100).nullable(),
  annualizedVolPct: z.number().finite().nullable(),
  enb: z.number().finite().min(1).nullable(),
  enh: z.number().finite().min(1).nullable(),
  diversificationRatio: z.number().finite().nullable(),
  betaSpy: z.number().finite().nullable(),
  shrinkage: z
    .object({ target: z.literal("constant_correlation"), intensity: z.number().min(0).max(1) })
    .nullable(),
  contributions: z
    .array(
      z.object({
        ticker: TickerSymbolSchema,
        weightPct: z.number().finite(),
        volPct: z.number().finite().nullable(),
        mcrPct: z.number().finite().nullable(),
        pcrPct: z.number().finite().nullable(),
        betaSpy: z.number().finite().nullable(),
      }),
    )
    .max(60),
  clusters: z
    .array(
      z.object({
        tickers: z.array(TickerSymbolSchema).min(2).max(20),
        avgCorrelation: z.number().min(-1).max(1),
        weightPct: z.number().finite(),
        breachesCap: z.boolean(),
      }),
    )
    .max(20),
  excluded: z
    .array(
      z.object({
        ticker: TickerSymbolSchema,
        weightPct: z.number().finite(),
        reason: z.enum(["insufficient_obs", "missing_prices", "no_security_master"]),
      }),
    )
    .max(60),
});
```

**④ UI 落点与空态**

- 落点：工作台「组合压力测试」抽屉（`portfolio-stress-sheet.tsx`），在「情景压力测试」之上增加「风险分解」段：一行等宽数字「`年化波动 18.2% · 有效押注 3.4 · β 1.21`」（示意）；下方一张三列细线表「标的 · 权重 · 风险占比」，按风险占比降序，只有「风险占比 − 权重 ≥ 10 个百分点」的行以珊瑚色标出；相关簇每簇一行「`NVDA · AMD · TSM · 相关 0.78 · 合计 41%`」（示意），超过上限的簇使用状态警示色。
- 空态：`insufficient_history` → 一行「样本不足 60 个交易日」；`low_coverage` → 一行「可计算持仓不足八成」，只列各证券自身波动；`no_positions` → 整段不渲染，抽屉保持现状。
- 单一真源：存在账本账户时，工作台顶栏「已配」「超限」改用账本实际市值权重与实证相关簇；研究卡上的 `current_weight_pct` 保留为计划仓位，可继续编辑。
- 删减：存在实证相关簇时，隐藏按行业标签归类的集中度段；数据不足回退时该段标注「按行业标签归类」。

**⑤ 负向测试**

1. 两只完全相关的资产各 50% → ENB = 1.00（±0.01），ENH = 2。
2. 三只互不相关、波动相同的资产等权 → ENB = 3（±0.01）。
3. Σ PCR_i = 1、Σ CCR_i = σ_p（误差 < 1e-9）。
4. δ* ∈ [0, 1]；T 增大时 δ* 单调趋近 0；对高相关的模拟数据，常相关目标下的 σ_p 高于单位阵目标（证明旧实现低估）。
5. 共同样本 < 60 → `insufficient_history`，不返回任何矩阵或伪造值。
6. 上市仅 30 个交易日的持仓进入 `excluded`；覆盖率按权重计算，< 80% → `low_coverage`。
7. 缺价日按整行删除而非前值填充（断言填充版本未被调用）。
8. Jacobi 重构误差 ‖E Λ Eᵀ − Σ‖_F < 1e-10。
9. 聚类边界：ρ = 0.69 不成簇，ρ = 0.71 成簇。
10. β 只使用窗口内数据（修改窗口外价格不改变结果）。
11. N = 40、T = 252 的计算耗时 < 30ms。

**⑥ L2 守卫**：G16 覆盖 `math/risk/aligned-returns.ts`。G3 增加 `estimateShrunkCovariance`、`decomposePortfolioRisk`、`computeMeucciEnb`、`clusterCorrelations`，并移除旧的 `estimateLedoitWolfCovariance` 导出。

**⑦ 依赖、人日与砍项**：依赖 S0、S1（共用收益构造）、Q5-4。**3 人日**（数学 1.5、API 0.5、UI 0.5、测试 0.5）。砍掉：最小扭转押注（minimum-torsion bets）、多因子风险模型。延后：EWMA 协方差。

### S3 · 「研究判断 × 实盘盈亏」2×2 决策归因（技能与运气）

**① 问题与买方价值**：只有把「买入时的研究判断」锁定下来，才能区分「看对逻辑赚的钱」与「看错逻辑靠 β 赚的钱」，把复盘从结果导向变成过程导向。现有 `classifyProcessOutcomeMatrix`（`packages/core/src/math/calibration/forecast-scoring.ts:140-165`）零生产调用；校准抽屉展示的是自评情绪统计。另一个前提缺口：假设状态只有 `validated / watching / warning`（`packages/core/src/schemas/thesis.ts:4`），没有「已证伪」，也没有状态变更时间。

**② 文件与模块规划**

| 动作 | 路径                                                                                                                     | 职责                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 新增 | `packages/core/src/math/attribution/episodes.ts`                                                                         | 由重放结果切分持仓片段；片段收益与同期 SPY       |
| 新增 | `packages/core/src/math/attribution/beta-pit.ts`                                                                         | 开仓前 252 日的时点 β                            |
| 新增 | `packages/core/src/math/attribution/decision-matrix.ts`                                                                  | 逻辑判定 × 盈亏符号 → 象限与细分标签             |
| 新增 | `packages/core/src/math/attribution/index.ts`                                                                            | 导出                                             |
| 新增 | `packages/core/src/contracts/analytics/attribution-contracts.ts`                                                         | Zod 契约（含 `DecisionSnapshotSchema`）          |
| 新增 | `packages/core/src/db/schema-decisions.ts`                                                                               | `decision_snapshots`、`hypothesis_status_events` |
| 新增 | `packages/core/src/db/repositories/portfolio/decision-snapshot-store.ts`                                                 | 快照写入与读取                                   |
| 新增 | `packages/core/src/db/repositories/portfolio/hypothesis-events-store.ts`                                                 | 状态事件写入与时点查询                           |
| 改   | `packages/core/src/schemas/thesis.ts:4`                                                                                  | `HypothesisStatusSchema` 增加 `"invalidated"`    |
| 改   | `packages/core/src/db/repositories/thesis-step-writers.ts`、`review-and-agent-store.ts`、`agent/agent-apply-store.ts`    | 改写假设状态的同一函数内写事件（G14）            |
| 改   | `packages/core/src/db/repositories/workflows/portfolio-ledger-store.ts`                                                  | 带 thesisId 的买入在同一事务内写决策快照         |
| 新增 | `apps/web/src/app/api/portfolio/attribution/route.ts`                                                                    | GET                                              |
| 新增 | `apps/web/src/features/portfolio/components/calibration/decision-matrix-view.tsx`                                        | 2×2 细线网格                                     |
| 新增 | `apps/web/src/features/portfolio/components/calibration/decision-episode-list.tsx`                                       | 象限内片段下钻                                   |
| 改   | `apps/web/src/features/portfolio/components/calibration/portfolio-calibration-sheet.tsx`、`calibration-metrics-view.tsx` | 替换情绪统计                                     |
| 改   | `apps/web/src/features/research-steps/components/hypothesis-editor-card.tsx`                                             | 状态分段器增加「已证伪」                         |

**③ DDL、公式与契约**

迁移 `0033-decision-snapshots.ts`：

```sql
CREATE TABLE IF NOT EXISTS decision_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  thesis_id TEXT NOT NULL,          -- 刻意不设外键：研究被删除后，归因历史仍属于该用户
  ticker TEXT NOT NULL,
  decided_on TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('open', 'add')),
  snapshot_json JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  algo_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_decision_snapshots_user_ticker
  ON decision_snapshots (user_id, ticker, decided_on);
CREATE OR REPLACE FUNCTION kanon_block_decision_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'decision_snapshots are immutable'; END $$;
DROP TRIGGER IF EXISTS trg_decision_snapshots_immutable ON decision_snapshots;
CREATE TRIGGER trg_decision_snapshots_immutable BEFORE UPDATE OR DELETE ON decision_snapshots
  FOR EACH ROW EXECUTE FUNCTION kanon_block_decision_snapshot_mutation();

CREATE TABLE IF NOT EXISTS hypothesis_status_events (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
  hypothesis_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('canvas', 'quarterly_review', 'agent_apply', 'import')),
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hypothesis_events_thesis
  ON hypothesis_status_events (thesis_id, hypothesis_id, changed_at);
CREATE OR REPLACE FUNCTION kanon_block_hypothesis_event_update() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'hypothesis_status_events are append-only'; END $$;
DROP TRIGGER IF EXISTS trg_hypothesis_events_append_only ON hypothesis_status_events;
CREATE TRIGGER trg_hypothesis_events_append_only BEFORE UPDATE ON hypothesis_status_events
  FOR EACH ROW EXECUTE FUNCTION kanon_block_hypothesis_event_update();   -- DELETE 只随 thesis 级联发生

-- RLS：decision_snapshots → user_id = kanon_rls_uid()；hypothesis_status_events → readable / writable(thesis_id)
-- 回填：每个现有假设写入一条 import 事件（只代表「导入时刻的状态」）
INSERT INTO hypothesis_status_events (id, thesis_id, hypothesis_id, from_status, to_status, source, changed_by)
SELECT 'hse_import_' || h.id, h.thesis_id, h.id, NULL, h.status, 'import', 'system' FROM hypotheses h
ON CONFLICT (id) DO NOTHING;
```

快照内容（`DecisionSnapshotSchema`，`snapshot_hash = sha256(键序无关规范化 JSON)`，复用 `stableDraftHash` 的规范化）：

```ts
export const DecisionSnapshotSchema = z.object({
  algoVersion: z.literal("decision/1"),
  thesisId: z.string(),
  ticker: TickerSymbolSchema,
  decidedOn: IsoDateSchema,
  priceAtDecision: z.number().finite().positive(),
  hypotheses: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(200),
        status: HypothesisStatusSchema,
        threshold: z.string().max(200),
      }),
    )
    .max(20),
  scenarios: z.object({
    bear: ScenarioPointSchema,
    base: ScenarioPointSchema,
    bull: ScenarioPointSchema, // { targetPrice, probability } 均可空
  }),
  buyZone: z.object({ low: z.number().finite().nullable(), high: z.number().finite().nullable() }),
  hurdleReturnPct: z.number().finite().nullable(), // 与 math/hurdle-ladder.ts 同一定义
  expectedReturnPct: z.number().finite().nullable(),
  riskReward: z.number().finite().nullable(),
  horizonYears: z.number().int().min(1).max(10),
  exitRules: z.array(z.string().max(200)).max(10),
});
```

```text
片段：按 ticker 由 S0 重放结果切分；持仓由 0 变为 > 0 时开始，回到 0 时结束；未结束的片段以 asOf 评估并标记 provisional
片段收益：持仓子账户的日度 TWR（买入视为开盘前流入、卖出视为收盘后流出、股息计入收益），R = Π(1 + r_t) − 1
同期基准：R_B 为同一组交易日的 SPY 含息总回报
β：开仓前 252 个交易日的日收益回归，样本 ≥ 126 日，否则 null（禁止回落为 1）
β 贡献 = β · R_B；特质收益 R_ε = Π(1 + r_t − β · r_{B,t}) − 1（β 为 null 时不计算）
盈亏符号：片段净盈亏（已实现 + 未实现 + 股息 − 费用）> 0 为「盈利」，否则为「亏损」

逻辑判定（评估时点 τ = 片段结束日；进行中片段 τ = asOf）：
  H = 开仓快照中的假设集合；h 在 τ 的状态 = changed_at ≤ τ 的最近一条事件，否则取快照中的状态
  任一 h 为 invalidated → 逻辑错误
  否则 validated 占比 ≥ 60% → 逻辑正确（阈值为契约常量 THESIS_VALIDATED_SHARE = 0.6）
  否则 → 未决（不进入矩阵，单独计数）

四象限与细分标签：
  逻辑正确 × 盈利 → 看对逻辑赚的钱；R_ε ≥ β 贡献为「研究驱动」，否则为「β 助推」
  逻辑错误 × 盈利 → 看错逻辑靠 β 赚的钱；β 贡献 ≥ 50% · R 为「β 驱动」，否则为「运气」；β 为 null 时为「β 未知」
  逻辑正确 × 亏损 → 看对逻辑但买贵了：开仓价 > 快照买入区上沿，或快照预期收益 < 门槛收益；否则为「时机不利」
  逻辑错误 × 亏损 → 逻辑证伪后及时止损：首个 invalidated 事件后 ≤ 10 个交易日内清仓；否则为「证伪后延迟离场」
  source = 'import' 的事件不参与「及时止损」的时点判断（只知道导入时刻的状态）
矩阵只统计已结束的片段；已结束片段 < 4 → matrix = null（「样本不足」）
预测校准（同一视图）：已结算预测 ≥ 10 → 多分类 Brier + Murphy 可靠性分量；否则为 null
访问控制：判定读取的假设事件受 RLS 约束；用户已失去访问权的组织研究，判定只用快照，结果多为「未决」，如实呈现
```

契约 `packages/core/src/contracts/analytics/attribution-contracts.ts`（节选）：

```ts
export const DecisionQuadrantSchema = z.enum([
  "right_and_paid",
  "wrong_but_paid",
  "right_but_overpaid",
  "wrong_and_exited",
]);
export const DecisionSubLabelSchema = z.enum([
  "research_driven",
  "beta_assisted",
  "beta_driven",
  "luck",
  "beta_unknown",
  "overpaid",
  "timing",
  "timely_exit",
  "delayed_exit",
]);
export const DecisionEpisodeSchema = z.object({
  ticker: TickerSymbolSchema,
  thesisId: z.string().nullable(),
  openedOn: IsoDateSchema,
  closedOn: IsoDateSchema.nullable(),
  provisional: z.boolean(),
  pnlUsd: z.number().finite(),
  returnPct: z.number().finite().nullable(),
  spyReturnPct: z.number().finite().nullable(),
  beta: z.number().finite().nullable(),
  betaContributionPct: z.number().finite().nullable(),
  idioReturnPct: z.number().finite().nullable(),
  verdict: z.enum(["right", "wrong", "undetermined"]),
  quadrant: DecisionQuadrantSchema.nullable(),
  subLabel: DecisionSubLabelSchema.nullable(),
  snapshotHash: z.string().nullable(),
});
export const AttributionResponseSchema = z.object({
  status: z.enum(["ready", "insufficient_episodes", "no_snapshots"]),
  matrix: z
    .object({
      cells: z
        .array(
          z.object({
            quadrant: DecisionQuadrantSchema,
            count: z.number().int().min(0),
            pnlUsd: z.number().finite(),
          }),
        )
        .length(4),
      undetermined: z.number().int().min(0),
    })
    .nullable(),
  episodes: z.array(DecisionEpisodeSchema).max(200),
  calibration: z.object({
    resolved: z.number().int().min(0),
    brier: z.number().min(0).max(2).nullable(),
    reliability: z.number().min(0).nullable(),
  }),
});
```

API：`GET /api/portfolio/attribution?accountId=`（租户上下文；只读本人账户与本人快照）。

**④ UI 落点与空态**

- 落点：工作台「组合认知校准与周报」抽屉，现有 tab「行为归因与效率」改名为「决策归因」。内容只有三层：① 2×2 细线网格（行：逻辑正确 / 逻辑错误；列：盈利 / 亏损），每格只显示「片段数 · Σ盈亏」，单色；② 点击某格后在同一抽屉内下钻片段列表（标的 · 区间 · 超额 · 细分标签），点开一条再显示开仓快照摘要（买入时的假设与离场时的状态）；③ 网格下一行「`预测校准 Brier 0.18 · 24 次 · 可靠性 0.02`」（示意）。
- 研究画布：假设编辑卡的状态分段器增加「已证伪」一项，不加说明文字。账本：带研究关联的买入，在成交行显示一个锁形小图标，悬停提示「已锁定研究快照」，不弹成功提示。
- 空态：无快照 → 一行「尚无关联研究的成交」；已结束片段 < 4 → 网格位置显示「样本不足」，片段列表照常显示（进行中片段以次级墨色呈现）。
- 删减：删除「冷静决策占比」「顺向决策胜率」「情绪与执行归因」表与「零杠杆守则率」指标（零杠杆是账本层面的通过 / 拦截门禁，不是评分）；「在仓标的 Kelly 上限与未实现盈亏」表并入压力测试抽屉已有的「资金配置阶梯」，不再重复。情绪状态数据保留在纪律日志中，不再做统计展示。

**⑤ 负向测试**

1. 以他人私有 thesisId 买入 → 404，且不生成快照。
2. ticker 与研究不一致 → 400，且不生成快照。
3. 对 `decision_snapshots` 执行 `UPDATE` / `DELETE` → 数据库异常（触发器负向 SQL 测试）。
4. 快照哈希可复算且一致；测试夹具以 `SET session_replication_role = replica` 绕过触发器篡改 `snapshot_json` 后，复算哈希不一致被识别。
5. 开仓后修改假设状态不影响快照内容；判定只使用 `changed_at ≤ τ` 的事件。
6. β 只使用开仓前窗口：修改开仓后的价格不改变 β。
7. 已结束片段 3 个 → `matrix = null` 且 `status = "insufficient_episodes"`。
8. 快照中没有任何假设 → `verdict = "undetermined"`，计入 `undetermined` 而非任何象限。
9. 片段期间发生拆股 → 片段收益无跳变。
10. `import` 事件不参与「及时止损」判断。
11. 改写假设状态却未写事件 → G14 报错（守卫反例）。
12. 「已证伪」状态通过 Zod 往返，Archive v3 导入导出无损。

**⑥ L2 守卫**：新增 G14 `hypothesis-status-event-pairing`——仓储层任何对 `hypothesesTable` 的 `.update(...).set({ status … })`（含展开对象与原生 SQL `UPDATE hypotheses SET status`）所在函数，必须同时调用 `appendHypothesisStatusEvent`；反例：在 `applyHypothesisProposal`（`agent-apply-store.ts:59-62`）中只改状态。新增 G15 `immutable-ledger-tables`——仓储层禁止对 `decisionSnapshotsTable`、`forecastsTable` 发出 `.update()` / `.delete()`（forecasts 的结算走既有专用函数并加 `@kanon-immutable-ok:` 标注）。G16 覆盖 `math/attribution/**`。G3 增加 `buildDecisionEpisodes`、`classifyDecisionMatrix`、`computePitBeta`。

**⑦ 依赖、人日与砍项**：依赖 S0、S1、RLS 阶段 D、「已证伪」状态。**4 人日**（数学 1.5、快照与事件 1、API 与 UI 1、测试 0.5）。砍掉：单一「技能分」（虚假精度）、跨账户汇总（v1 与账本界面一致，只有单账户）。决策快照不进入单标的 Archive，组合导出（`export/portfolio`）增加快照哈希列。

---

## Part 3 — Wave T：Playwright 端到端黄金用户路径与质量闭环

**① 问题与买方价值**：现有验证覆盖单元、契约与登录页截断矩阵（`scripts/verify-ui-truncation.mjs` 只访问 `/login`、`/register`），没有任何一条测试把「注册 → 研究 → 估值 → 纪律 → 账本 → 团队 → 投委会 → 只读越权」串起来；RLS 翻转也缺少全链路闸门。

**② 文件与模块规划**

| 动作 | 路径                                                                       | 职责                                                                                                               |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 新增 | `apps/web/playwright.config.ts`                                            | `webServer`、项目与报告配置                                                                                        |
| 新增 | `apps/web/e2e/support/mock-upstream.mjs`                                   | 以 `--import` 预加载 undici `MockAgent`，`disableNetConnect()`，只放行 `127.0.0.1`                                 |
| 新增 | `apps/web/e2e/support/fixtures.ts`                                         | 复用 `packages/ai/evals/golden/fixtures/` 的 NVDA 数据；Yahoo K 线以「今日」为终点动态生成，含 1 次拆股与 2 次分红 |
| 新增 | `apps/web/e2e/support/actors.ts`                                           | owner / analyst / pm / viewer 四个独立浏览器上下文的注册与登录                                                     |
| 新增 | `apps/web/e2e/support/contracts.ts`                                        | 用 `@kanon/core` 的 Response Schema 解析截获的 API 响应                                                            |
| 新增 | `apps/web/e2e/golden/01-onboarding.spec.ts` … `10-viewer-readonly.spec.ts` | 10 章剧本，每个文件 ≤ 250 行，`test.describe.serial` 共享同一份种子状态                                            |
| 改   | `apps/web/package.json`                                                    | devDependencies 增加固定版本的 `@playwright/test`、`undici`；scripts 增加 `"e2e": "playwright test"`               |
| 改   | 根 `package.json`                                                          | `"test:e2e": "pnpm --filter @kanon/web e2e"`                                                                       |
| 新增 | `.github/workflows/e2e-golden.yml`                                         | CI                                                                                                                 |
| 改   | `AGENTS.md` §4                                                             | 验证门禁增加 `pnpm test:e2e`                                                                                       |

**③ 隔离运行与上游 Mock 策略**

```text
webServer：pnpm --filter @kanon/web start（复用 pnpm build 产物），PORT=3151
env：KANON_DATA_DIR=<mkdtemp>（每次运行全新 PGlite）
     KANON_RLS_ENFORCE_LOCAL=1（全程在 NOBYPASSRLS 角色下运行）
     NODE_OPTIONS=--import ./e2e/support/mock-upstream.mjs
     CRON_SECRET=e2e-cron；KANON_SEC_USER_AGENT="KANON-E2E e2e@example.com"
     KANON_CREDENTIALS_MASTER_KEY=<运行时生成的 32 字节随机测试值>
     不提供任何 LLM 密钥 → 投委会 Agent 走确定性的 grounded-local 回退路径，输出可断言
workers: 1；retries: 0；trace: "retain-on-failure"；screenshot: "only-on-failure"
```

- **为什么不用 `page.route`**：SEC、Yahoo 与 LLM 请求都由 Next 服务端发出，`page.route` 只能拦截浏览器请求。改用 undici `MockAgent` 作为 Node 全局 fetch 的 dispatcher，在服务进程启动时预加载：生产代码零改动；任何未登记的外部主机直接抛错，测试不可能触达真实网络。
- **登记的拦截**：`https://www.sec.gov/files/company_tickers.json`（子集）、`https://data.sec.gov/submissions/CIK0001045810.json`、`https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json`（精简版，同时包含拆股追溯与一条真实重述）、`https://www.sec.gov/Archives/edgar/data/1045810/<accession>/<document>.htm`（含 Item 1A / Item 7 的精简 10-K）、Yahoo `v8/finance/chart/NVDA` 与 `SPY`（动态 K 线），以及 `market/quote-client.ts` 实际使用的报价端点（以实现为准）。每个拦截器统计调用次数，供断言「未发生重复上游抓取」。
- **后台任务**：绝不等待 `after()`；需要作业结果时，测试显式调用 `POST /api/internal/jobs/tick`（`Authorization: Bearer e2e-cron`），再以 `expect.poll` 轮询状态（显式超时）。
- **时间**：服务端使用真实时间；fixture 相对 `Date.now()` 生成；作业 id 中的日期由测试以 UTC 同法计算。
- **选择器**：优先 `getByRole` + 可访问名称；只为带滚动动画的数字读数（`RollingNumber`）增加 `data-testid="kanon-<领域>-<字段>"`；不为测试增加任何可见文字。

**④ 黄金剧本（10 章，均为可执行断言）**

| 章  | 剧本                                                                                       | 关键断言                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | owner 打开 `/register`，以 +86 手机号与合规密码注册                                        | 落在 `/`；会话 cookie 在 `context.cookies()` 中 `httpOnly = true`，`document.cookie` 中不可见；弱密码的实时提示与 `auth-contracts` 规则一致                                                                                                                                                   |
| 02  | 新建 NVDA，失焦自动识别，价格非空才可提交                                                  | `POST /api/theses` 201 且响应通过 Schema；跳转 `/thesis/<id>?step=1`；健康检查队列中出现 `sync_*:NVDA:<today>`；删除后同日再建 → 201 但上游调用计数不增加（Q5-8）                                                                                                                             |
| 03  | Step 3 点击「同步 SEC」                                                                    | `POST /api/sec/NVDA` 返回 `warehouseSynced = true`；重述标记只有 fixture 中那 1 条真实重述，不含拆股追溯（Q5-3）；年报表出现 FY 行                                                                                                                                                            |
| 04  | 打开 Source Clipper，切换到「对照」                                                        | 法证条不出现「N/A」「$0.0」；对照默认只列 critical / warn；fixture 中新增的出口管制段落显示为「新增风险」（R1 上线后启用）                                                                                                                                                                    |
| 05  | Step 4 设定三情景 → 点亮买入区铃铛 → Mock 价格跌破阈值后触发 tick                          | `kanon-scenario-base-target` 为确定值；收件箱徽标为 1；再次 tick 仍为 1（边沿触发）；SOTP 卡不出现捏造分部（Q5-6）                                                                                                                                                                            |
| 06  | Step 5 创建二元预测并锁定 → 纪律签单                                                       | 预测行显示锁定哈希；以 API 修改已锁定预测 → 409；签单条出现                                                                                                                                                                                                                                   |
| 07  | 账本：建账 $10,000 → 买入 10 股 → 超额买入 → 超量卖出 → 倒填买入 → 拆股后按真实股数卖出    | 依次 201 / 400 `INSUFFICIENT_CASH` / 400 `SHORT_SELL_BLOCKED` / 400 `CASH_PATH_NEGATIVE` / 201（后两项 S0 上线后启用）                                                                                                                                                                        |
| 08  | owner 建组织 → 邀请已注册 analyst 与一个未注册号码 → analyst 在收件箱接受 → 研究共享到组织 | 两次邀请的响应体逐字节相同（比较 `await res.body()`）；接受前 analyst 看不到组织研究；对非成员 `update_role` → 404（Q5-1）                                                                                                                                                                    |
| 09  | analyst 提交 IC → 自批 → PM 批准；analyst 修改目标价后 PM 再次批准                         | 自批 403；PM 批准 200；快照变更后批准 409 `STALE_SNAPSHOT`                                                                                                                                                                                                                                    |
| 10  | viewer 打开共享画布 → 尝试编辑与 ⌘S → 直接调用写接口                                       | 画布显示「只读」且输入不可编辑；⌘S 后 `page.waitForRequest(PATCH, { timeout: 2000 })` 必须超时；`PATCH /api/theses/<id>`、`POST …/discipline`、`POST /api/ai/copilot`、`DELETE /api/theses/<id>` 均为 403；随后 `GET` 的 `updatedAt` 不变；伪造 `Origin: https://evil.example` 的写请求 → 403 |

启用节奏：第 01–03、05、06、08–10 章随 Wave T 首批交付；第 03 章的拆股断言随 Q5-3、第 04 章随 R1、第 07 章后两项随 S0 一起合并。新能力的章节与能力本身在同一个 PR 中提交，不使用 `test.fixme` 占位。

**⑤ 负向测试**：即上表每章的拦截断言；另加两条框架自检：① 在 MockAgent 未登记的主机上发起请求的探针用例必须失败；② 关闭 `KANON_RLS_ENFORCE_LOCAL` 运行第 10 章时，数据库层断言（直接 SQL 探针）必须能察觉差异——证明强制模式确实生效。

**⑥ L2 守卫**：新增 G19 `e2e-no-arbitrary-wait`——`apps/web/e2e/**` 禁止 `page.waitForTimeout`、`setTimeout`、`waitForLoadState("networkidle")`，以及未附 `// @kanon-quarantine: <issue 链接>` 的 `test.skip` / `test.fixme`。允许「带显式超时并期望超时」的 `waitForRequest` 断言。

**⑦ 依赖、人日与砍项**：依赖 RLS 阶段 A5（强制模式）。**4 人日**（框架与 Mock 1.5、10 章剧本 2、CI 0.5）。CI：`e2e-golden.yml` 在涉及 `apps/web/**`、`packages/**` 的 PR 与 `main` 推送时运行：`pnpm install` → `pnpm build` → `npx playwright install --with-deps chromium` → `pnpm test:e2e`，失败时上传 `playwright-report/` 与 trace，超时 20 分钟；任何不稳定用例 24 小时内修复或带 issue 链接隔离。砍掉：截图像素比对（已有截断矩阵）、移动端视口（桌面优先产品）。

---

## 实施顺序、人日与砍项

### 依赖顺序与人日

| 批次 | 内容                                                                                                                    | 人日 | 进入条件                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------- |
| W0   | Q5 热修：Q5-1 至 Q5-6、Q5-8、Q5-10 至 Q5-12 + 迁移 0026（Q5-7 / Q5-13 的重放逻辑并入 S0，Q5-9 / Q5-14 并入 RLS 阶段 A） | 6    | —                                                   |
| W1   | RLS 阶段 A、B、C + 迁移 0027 + 守卫 G7+ / G9 / G10 / G11 / G12                                                          | 5.25 | W0                                                  |
| W2   | Wave T：框架 + 首批 7 章（强制 RLS 模式）                                                                               | 4    | W1                                                  |
| W3   | RLS 阶段 D：迁移 0028 原子翻转                                                                                          | 0.25 | W2 全绿 + staging 分支冒烟通过                      |
| W4   | R4 评测集先行（先度量再改进）→ R1 → R2 → R3 → R4 检索与核验升级                                                         | 18   | W3（新表以 fail-closed 形态落地）                   |
| W5   | S0 → S1 → S2 → S3                                                                                                       | 11.5 | W3；S0 另需 Q5-4                                    |
| 合计 |                                                                                                                         | 45   | 单人串行约 9 周；两人并行（W4 与 W5 并行）约 5.5 周 |

### 砍掉与延后

- **砍掉**：Redline 的 LLM 摘要；DEF 14A 与 8-K 附件对照；分部级 DCF；Brinson 归因界面（缺可靠的行业基准权重）；单一「技能分」；最小扭转押注；E2E 截图像素比对与移动端视口；MWR 的界面展示（只保留在组合导出）。
- **延后**：R3b（8-K Ex-99.1 新闻稿自动抽取）；R4b（向量检索，以评测增益为闸门）；非美元基准账户与多币种净值；产品维度分部带入；EWMA 协方差；Stage 6 的 11 张认证 / 组织表 RLS；`kanon.system` 的二次令牌加固。

### 每个批次的完成定义（DoD）

1. 门禁：`pnpm format && pnpm check`（含 `wave-guards-rs.test.mjs` 的全部反例）→ `pnpm test`（含离线 Golden Eval、RLS fail-closed、列 / 索引 / RLS 反射一致）→ `pnpm build` → `pnpm test:api`（`KANON_RLS_ENFORCE_LOCAL=1`）→ `pnpm test:e2e`。
2. 文档同步：`README.md`、`docs/PRD.md`、`marketing/index.html`（仅当对外能力描述变化）、`.rules/editorial-craft.md`、`.rules/postmortems.md`、`AGENTS.md` §4（路由数改为实际值；新增 `pnpm test:e2e`；部署前执行 `pnpm db:migrate`）、`deploy/README.md`（迁移改为显式步骤）。
3. 复发类问题按 `AGENTS.md` 升级为 L1 / L2 / L3 守卫并写入 `.rules/postmortems.md`，本轮至少三条：「空值与空集合被默认放行（零断言 100%、缺省概念放行、`every` 恒真）」「同一事实的多种口径未分组（3 个月 / 9 个月、拆股追溯）」「增量抓取不校验口径（K 线重基）」。
4. 部署：`DATABASE_URL="$DATABASE_URL_MIGRATE" pnpm db:migrate` → `npx --yes vercel deploy --prod --yes --regions sin1` → 核验 `https://app.kanon.hk/api/health`。

---

## 参考

- Vercel Fluid compute（默认与最大执行时长）：<https://vercel.com/docs/fluid-compute>；后台任务指南（`after()` / `waitUntil` 共享调用时长、无重试）：<https://vercel.com/kb/guide/background-workers-on-vercel>
- Neon 角色管理（控制台 / CLI / API 创建的角色属于 `neon_superuser`，含 `BYPASSRLS`；SQL 创建的角色默认 `NOBYPASSRLS`）：<https://neon.com/docs/manage/roles>
- PostgreSQL `CREATE ROLE`（`BYPASSRLS` 语义）：<https://www.postgresql.org/docs/current/sql-createrole.html>
- SEC companyfacts 不含维度事实（二手资料）：<https://edgartools.readthedocs.io/en/latest/xbrl/getting-started/choosing-the-right-api/>、<https://dev.to/eqvero/why-sec-companyfacts-drops-off-balance-sheet-data-center-leases-parsing-dimensional-xbrl-in-python-22gm>
- Cohen, L., Malloy, C., Nguyen, Q. (2020). _Lazy Prices_. Journal of Finance 75(3).
- Loughran, T., McDonald, B. (2011). _When Is a Liability Not a Liability?_ Journal of Finance 66(1).
- Ledoit, O., Wolf, M. (2004). _Honey, I Shrunk the Sample Covariance Matrix_. Journal of Portfolio Management 30(4).
- Meucci, A. (2009). _Managing Diversification_. Risk 22(5).
- Mantegna, R. N. (1999). _Hierarchical Structure in Financial Markets_. European Physical Journal B 11.
