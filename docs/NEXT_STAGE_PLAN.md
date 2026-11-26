# KANON 下一阶段精炼计划（Stages 0–8 上线后审查）

> 审查日期：2026-11-26 · 审查范围：`bcdef4a..19ebd74`（183 文件，+12,988 / −757）· 基线：`19ebd74`
> 视角：买方投研总监（数据诚实、方法论、决策闭环）+ Staff Engineer（安全、一致性、可达性）
> 本文件承接 [TOP_TIER_ROADMAP.md](TOP_TIER_ROADMAP.md)，是 Wave I 起的单一真源。§0 规则同样适用。

---

## 0. 一句话结论

**Stages 0–8 「测试已通过」，但还没有「对用户闭环」。** 三类问题同时存在：

1. **生产配置缺口**：Vercel Production 未配置 `KANON_CREDENTIALS_MASTER_KEY` 与 `CRON_SECRET`（2026-11-26 用 `vercel env ls production` 核实，仅有 `DATABASE_URL*`）。结果是：所有 BYOK 密钥与 TOTP 种子都用仓库里公开的开发常量加密；Cron 通道一直返回 503。
2. **前后端契约漂移**：2FA 设置页发送 `{op:"enroll"}`，服务端按 `action` 做判别，**生产上 2FA 无法开启**。`test:api` 直接用 `action` 调接口，所以没暴露。
3. **「已实现但无生产调用方」**：Beneish / Altman / Piotroski / DuPont、`calculateWacc`、`getFactsAsOf`、`detectFactRestatements`、`hybridSearchChunks`、`searchFilingChunksLexical`、`scanFilingRedFlags`、`enqueueJob`、`upsertAlertRule`、`addOrgMember` 在 `apps/web` 或 AI 路由中**零调用**。它们都从包 `index.ts` 再导出，所以 knip 不会报。

下一阶段的原则：**先修安全与诚实，再让已建好的引擎在真实数据上流动，最后才做新能力。**

---

## 1. 真实代码漏洞与边界条件（精确到文件与行号）

严重度：**S0** = 安全/资金/数据可被篡改；**S1** = 数据一致性或核心体验断点；**S2** = 方法论或边界缺陷。

### 1.1 S0 — 安全与「零杠杆」铁律

| #    | 位置                                                                                                 | 问题与触发场景                                                                                                                                                                                                                                                                                                                                                                    | 修复方向                                                                                                                                                                                                                                                                                                      |
| :--- | :--------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S0-1 | `packages/core/src/security/totp.ts:116-119`                                                         | `deriveEnvelopeKey()` 在缺失环境变量时静默回落到硬编码 `"kanon-local-dev-envelope-key-v1"`。生产恰好未配置 → 拿到数据库只读权限 + 公开仓库即可解密全部 BYOK Key 与 TOTP 种子。还有：无 AAD 绑定（`userId:provider` 行之间可互换密文）、无 key id、TOTP 与 BYOK 共用同一把密钥。                                                                                                   | 生产环境 fail-closed（`VERCEL_ENV=production` 且无 key 时抛错）；envelope 升级为 `v2:<kid>:…`，AAD = `purpose:userId:provider`，HKDF 按用途分别派生；迁移任务双钥解密 `v1` → 重加密为 `v2`；`/api/health` 暴露 `secretsConfigured` 布尔值。                                                                   |
| S0-2 | `apps/web/src/app/api/portfolio/ledger/route.ts:32-34` → `portfolio-ledger-store.ts:115-133`         | `quantity/price` 只经过 `Number()`，不校验有限且 > 0。`buy quantity=-100 price=10` 时 outlay = −1000，能通过现金闸门，现金凭空 +$1,000，还写入一笔负数 lot。`quantity="abc"` 会变成 `NaN`：`NaN > cash` 恒为 false，买入照样通过，随后 `cash_balance` 也被写成 `NaN`，**该账户此后所有零杠杆闸门永久失效**（任何金额都能买入）。`sell` 传负数则直接扣减现金，并记下一笔负数卖出。 | 在 `packages/core/src/contracts/` 增加 `LedgerTransactionRequestSchema`（`z.number().finite().positive()`、`tradeDate` ISO 且 ≤ 今天、`ticker` 用 `TickerSymbolSchema`）；DB 层加 `CHECK (quantity > 0 AND price >= 0 AND fees >= 0)` 与 `CHECK (action IN (...))`（expand-only：`NOT VALID` → `VALIDATE`）。 |
| S0-3 | `portfolio-ledger-store.ts:143-185`                                                                  | 「读现金 → 判断 → 写 lot → 写交易 → 写现金」全程没有事务和行锁。两笔并发买入读到同一 `cashBalance`，都能通过，后写的覆盖先写的（lost update），**等于用竞态加杠杆**。FIFO 消耗 lot 时中途失败，会留下「lot 已扣、交易未记」的半状态。                                                                                                                                             | `db.transaction` + `SELECT … FROM portfolio_accounts WHERE id=$1 FOR UPDATE`；lot 更新、交易插入、现金更新放在同一事务内。                                                                                                                                                                                    |
| S0-4 | `apps/web/src/app/api/theses/[id]/ic/route.ts:102-107` → `ic-and-compliance-store.ts:92-112`         | **IDOR**：路由只校验 URL 里 `thesisId` 的所有权，`approvalId` 不绑定该 thesis。只要拥有任意一个 thesis，就能批准或驳回系统内任意 `org_id IS NULL` 的审批。                                                                                                                                                                                                                        | `WHERE id = $approvalId AND thesis_id = $thesisId`；更新返回 0 行时返回 404。                                                                                                                                                                                                                                 |
| S0-5 | `ic/route.ts:74`、`ic-and-compliance-store.ts:56-59,98-103`                                          | ① `orgId` 直接取自客户端请求体：省略即绕过 PM 角色校验，伪造即挂到别的组织；② 没有 maker-checker，提交人可以批准自己的提案；③ 没有状态机，`approved → approved`、`rejected → approved` 都能执行；④ `snapshotHash` 对客户端载荷求哈希，UI 默认传 `{thesisId}`，所以每次哈希都一样，**无法证明「批准的是哪一版」**；⑤ 状态更新与审计写入不在同一事务。                              | `orgId` 由服务端从 `theses.org_id` 派生；组织模式强制 `decidedBy ≠ submittedBy`；状态机只允许 `in_review → approved / rejected`、`* → archived`；`snapshotHash` 由服务端对规范化 thesis 快照（假设、估值、最新 model_version id、SEC accession）计算；状态更新与审计写入放进同一事务。                        |
| S0-6 | `apps/web/src/app/api/auth/totp/route.ts:52-55` → `totp-and-lockout-store.ts:101-110`                | 已开启 2FA 的账号调用 `POST {action:"begin"}`，`onConflictDoUpdate` 会把 `enabled` 置回 false、清空恢复码。**持有被盗会话即可无码关闭 2FA**，DELETE 路由的验证码要求形同虚设。                                                                                                                                                                                                    | 已开启时 `begin` 返回 409，或要求携带当前 TOTP 码；`lastUsedStep` 与恢复码消耗改为条件 `UPDATE … WHERE last_used_step < $step` / `array_remove` 并检查影响行数，防止同一码并发重放。                                                                                                                          |
| S0-7 | `apps/web/src/features/ai-settings/lib/security-vault-api.ts:38,51`、`totp-and-vault-card.tsx:53-59` | **生产断点**：客户端发送 `op:"enroll"/"confirm"`，服务端 `TotpActionRequestSchema` 的判别字段是 `action`，必然返回 400，界面显示「初始化 2FA 失败」。即使修好，确认接口返回的 `recoveryCodes` 也被 `Boolean(res?.ok)` 丢弃，用户永远看不到恢复码。设置页也没有停用 2FA 的入口。                                                                                                   | 客户端改走 `kanonFetch` 并复用 `TotpActionRequest` 类型；恢复码一次性展示并提供「复制 / 下载 .txt / 我已保存」确认；用 `otpauthUri` 渲染二维码；补齐停用流程。                                                                                                                                                |

### 1.2 S1 — 数据一致性与点时（PIT）正确性

| #     | 位置                                                                                                                | 问题与触发场景                                                                                                                                                                                                                                                                                                                                                                                          | 修复方向                                                                                                                                                                                                                                                                           |
| :---- | :------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1  | `apps/web/src/app/api/_lib/sec-warehouse-sync.ts:52,57,117-124`                                                     | **PIT 在写入端就被破坏**：① `periodEnd` 硬编码为 `${FY}-12-31`，AAPL（9 月）、MSFT（6 月）、NVDA（1 月）全部错位；② 5 年 annuals 全部记到**最新一份**申报的 `accession / filedAt` 名下，`getFactsAsOf('2022-06-30')` 查不到 FY2020 的数据；③ fact id 含 accession，每次新 10-K 同步都会把全部历史年度重复写一遍；④ `xbrlTag` 固定写成 `Revenues`，与实际取用的标签不符，溯源失真。                      | 改用 companyfacts 每条 fact 自带的 `accn / filed / fy / fp / form / start / end / 实际 tag`；`periodEnd = fact.end`；写入后按 `(security, concept, periodEnd, duration)` 重算 `is_latest_for_period`（`facts-pit-store.ts:131,135` 目前恒为 true）。                               |
| S1-2  | `sec-warehouse-sync.ts:134-137` → `securities-and-fx-store.ts:45-61,74-77`                                          | 打开任意一份申报原文，都会以 `{ticker, name: ticker}` 调用 `upsertSecurity`，而 `normalizeSecurityFields` 会把 `cik` 置 null、`name` 置为 ticker、`currency` 置 USD、`adrRatio` 置 1 后整行覆盖。**ADR 标的（TSM、BABA）的 ADR 比率与币种被静默重置**，Step 3 的多币种/ADR 法证随之失真。同一函数还把 filings 的 `cik` 写成 `"INDEXED"`。                                                               | `upsertSecurity` 改为局部更新，只写调用方显式提供的字段；chunk 索引路径只用 `getSecurityByTicker`，查不到就跳过，不新建。                                                                                                                                                          |
| S1-3  | `packages/core/src/db/repositories/warehouse/price-bars-store.ts:147-154,164`                                       | 「真实 5 年 P/E 分位带」有**前视偏差**：2024-02 的价格配的是 FY2024 EPS，而该 EPS 2025 年才披露。另外 `adjClose`（Yahoo 口径同时做了拆股与分红调整）除以 as-reported EPS（未做拆股调整）：NVDA 2024 年 10:1 拆股前的年份 P/E 被低估约 10 倍，并被 `pe > 1` 的过滤条件吃掉一部分观测。                                                                                                                   | 用 PIT TTM 稀释 EPS（`filed ≤ barDate`，Q4 用已有的 `deriveQ4FromAnnualAndYtd` 反推）÷ **仅做拆股调整**的收盘价（Polygon `adjusted=true` 只调拆股）；EPS 同样按拆股事件调整。                                                                                                      |
| S1-4  | `apps/web/src/app/api/market/benchmarks/route.ts:38-39`                                                             | 缺少 `price` 参数时，`currentPrice` 静默回落为 `100`，随后算出的当前 P/E、分位、同业溢价全部基于一个虚构价格。违反 ROADMAP §0.4「宁可显示暂无」。                                                                                                                                                                                                                                                       | 缺价时直接返回 400，或返回 `currentPe: null`。                                                                                                                                                                                                                                     |
| S1-5  | `inbox-and-forecasts-store.ts:115-118,145-158`、`theses/[id]/forecasts/route.ts:15-34`、`forecast-scoring.ts:55-58` | 不可篡改预测账本可以被「合法」地玩弄：① `resolveBy` 允许是过去日期，事后补录一个已知结局的预测，Brier 直接作弊；② 单个概率不校验 [0,1]，`[1.5, −0.5]` 之和为 1，可以通过；③ `outcomeIndex` 不校验上界，传 `5` 时 Brier 只计 Σp²，**比如实结算还低**；④ 可重复结算，`resolved_at / outcome_json` 不受 trigger 保护；⑤ `forecasts` 没有 DELETE 保护，`ON DELETE CASCADE` 删 thesis 时会连带抹掉失败预测。 | 创建时要求 `resolveBy > today`，每个概率在 [0,1]；结算时 `0 ≤ outcomeIndex < probabilities.length` 且 `resolved_at IS NULL`；trigger 扩展为 `resolved_at` 一经写入不可再改；`BEFORE DELETE` 默认拒绝（只在账号注销时用 `SET LOCAL kanon.allow_forecast_purge = on` 放行）。        |
| S1-6  | `migrations/v2/0020-teams-ic-audit.ts:63-74`                                                                        | `audit_log` 的 append-only 只是行级 trigger，`TRUNCATE` 能绕过；表 owner 也能 `ALTER TABLE … DISABLE TRIGGER`。                                                                                                                                                                                                                                                                                         | 增加 `BEFORE TRUNCATE … FOR EACH STATEMENT` trigger；应用连接使用非 owner 角色，并 `REVOKE UPDATE, DELETE, TRUNCATE`；每行写入 `prev_hash` 构成哈希链（expand-only 加列）。                                                                                                        |
| S1-7  | `apps/web/vercel.json:6-11`、`jobs-and-peers-store.ts:61-62,88-93,95-116`                                           | 作业队列空转：① 生产代码**从不调用 `enqueueJob`**；② Cron 是 `0 22 * * 1-5`（工作日每天一次），每次最多领 5 个作业，而 ROADMAP 设计是每分钟一次；③ 缺 `CRON_SECRET`，路由直接 503；④ 租约过期回收不判断 `attempts < max_attempts`，函数超时被杀的毒作业会被**无限回收**；⑤ `completeJob / failJobWithBackoff` 不校验 `locked_by = workerId`，旧 worker 会覆盖新 worker 的结果。                         | 配置 `CRON_SECRET`；每日一次的 tick 改为「扇出 + 排空」：在 50s 预算内循环领取，每次最多 25 个，并按 thesis 关注列表补写 `sync_daily_bars / sync_sec / evaluate_alerts`；回收条件加 `attempts < max_attempts`，否则置 `failed`；完成/失败时用 `WHERE locked_by = $worker` 做栅栏。 |
| S1-8  | `sec-warehouse-sync.ts:102-113`                                                                                     | 每次 `/api/sec/[ticker]` 同步都会把同一份 8-K 红旗再写一遍收件箱，没有去重；而且只通知触发同步的那个用户，持有同一标的的其他用户收不到。                                                                                                                                                                                                                                                                | `inbox_items` 加唯一键 `(user_id, kind, source_url)` 并用 `onConflictDoNothing`；告警改由作业 `evaluate_alerts` 扇出到所有关注该标的的用户。                                                                                                                                       |
| S1-9  | `organizations-and-rls-store.ts:13-19`、`apps/web/src/app/api/orgs/route.ts:54`                                     | RBAC 用的是线性等级：`analyst(3) ≥ compliance(2)`，所以分析师和 PM 都能往限制名单里加票，合规与投研的职责分离失效。`addOrgMember` 没有任何路由可调用，组织永远只有 owner 一人；`theses.org_id` 已加列，但 `assertThesisOwnership` 只认 `user_id`，团队共享并未接通；文件名带 RLS，实际并没有 Postgres RLS。                                                                                             | 改为能力集合（`capabilities: Set<'ic.decide' \| 'compliance.restrict' \| …>`）而非等级比较；邀请流程放到 Wave M（P2）。                                                                                                                                                            |
| S1-10 | `inbox-and-forecasts-store.ts:167-176,211-219`、`apps/web/src/app/api/inbox/route.ts:23`                            | ① 日历令牌用「先查后插」签发，`calendar_tokens.user_id` 无唯一约束，并发 GET 会产生多个令牌；② GET 请求带写副作用，每次加载都把令牌回传；③ 令牌无法轮换或吊销；④ VEVENT 缺少 RFC 5545 必填的 `DTSTAMP`，严格客户端（Outlook）会拒收；⑤ 没有日期的催化剂一律落在「今天」，每次刷新都漂移。                                                                                                               | `user_id` 加唯一索引并用 `onConflictDoNothing` 后重读；令牌改为显式签发和轮换（`POST /api/inbox {op:"rotate_calendar"}`），库里只存 SHA-256；补 `DTSTAMP`；无日期的催化剂不进日历。                                                                                                |

### 1.3 S2 — 方法论与边界

| #    | 位置                                                                                                 | 问题                                                                                                                                                                                                                                                                                                                     | 修复方向                                                                                                                              |
| :--- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| S2-1 | `packages/core/src/math/simulation/monte-carlo.ts:123-126`、`institutional-models-panel.tsx:234-243` | 蒙特卡洛输出的是**第 N 年末、未折现**的每股价值（`NOPAT_N × 倍数 + 今天的净现金`），却与 DCF 现值并排展示，并与**今天的价格**比较出「高于现价概率」，系统性高估上行概率（价值口径高估 `(1+Ke)^N` 倍，5 年、10% 时约 1.61 倍）。`exitMultiple` 作用在 NOPAT 上，但 UI 和注释都没说明是 EV/NOPAT。                         | 结果按股权成本 `(1+Ke)^N` 折现后再与现价比较；或者改名为「N 年后价值分布」，比较对象换成 `现价 × (1+Ke)^N`。                          |
| S2-2 | `institutional-models-panel.tsx:176-179`                                                             | 缺少 SEC 数据时静默代入**虚构基数**：营收 50B、股本 1000M、现金 10B、债务 5B。更严重的是 `latest?.totalDebt ? … : 5` 这类写法：**无债公司（totalDebt=0）会被凭空加上 5B 债务**，现金为 0 时同理变成 10B。                                                                                                                | 缺数据时整块进入「暂无 SEC 基数」空态；判断用 `!= null`，不用真值判断。                                                               |
| S2-3 | `institutional-models-panel.tsx:68,108-116,138,143`                                                  | ① `Number(v) \|\| fallback`：输入 0%（零增长情景）会被替换成 12%，清空输入框时数字会跳；② 终值增速 3%、税率 21%、RONIC、CAP 的 RONIC（`max(wacc+6,22)`）、基期 NOPAT 的 0.79 都是**隐藏常量**，直接决定公允价值和 CAP 年限，却不可见、不可编辑；③ 模型快照只保存 4 个输入，不含基数、价格、SEC accession，**无法复现**。 | 隐含假设折叠成一行展示并允许编辑；快照增加 `lineage: {accession, priceDate, price, baseRevenueB, sharesM, …}`。                       |
| S2-4 | `packages/core/src/math/dcf/fcff-dcf.ts:65,87,123,127`                                               | ① 显式期按年中折现（`y − 0.5`），终值却按年末 `N` 折现，两者口径不一致，开启年中惯例时终值被低估约 `(1+WACC)^0.5`；② `ronic = max(wacc, input)` 强制 RONIC ≥ WACC，**无法表达「增长毁灭价值」**，而这正是红队情景要的；③ 不检查 `g ≤ Rf`（Damodaran 约束）。                                                             | 终值折现与年中惯例对齐，或显式标注口径；允许 RONIC < WACC 并给出警示；`g > Rf` 时阻断。黄金测试用 Damodaran 公开表格对账。            |
| S2-5 | `packages/ai/src/agent/claim-verifier.ts:43-70`                                                      | 数值核验是**不区分概念的「数字袋」**：「毛利率 72%」只要证据池里任何地方出现 72%（哪怕是税率）就判 verified。同时 `10-K`、`8-K`、`20-F` 里的 10/8/20 会被当成数值报 unverified（实测复现）；`bps` 被当作标量。                                                                                                           | 按概念绑定：提取「概念词 + 数值」对，再与 `financial_facts.concept` 对齐；剥离表单号（`/\b\d{1,2}-[KQF]\b/`）；`bps` 换算为 pct/100。 |
| S2-6 | `packages/ai/src/retrieval/hybrid-search.ts:39-44`                                                   | 分词器把连续汉字当成一个 token：中文问题对英文 10-K 的 BM25 得分恒为 0。向量检索是可选项，生产上没有 embedding，所以对中文用户来说混合检索实际**完全失效**（目前它也没有被任何路由调用，见 §0）。                                                                                                                        | 先把中文问题翻译/扩展成英文检索词（复用 `filing-search-tool.ts` 的中英词表），再做 BM25；跨语言才是引入向量检索的真正理由（见 §3）。  |
| S2-7 | `apps/web/src/app/api/_lib/byok-headers.ts:61-64`                                                    | AI 用量计量把 `promptTokens / completionTokens / costUsd` 全部写成 0，设置页的「本月用量」只有调用次数可信，成本恒为 $0。                                                                                                                                                                                                | 从 Vercel AI SDK 的 `result.usage` 取真实 token，按 `packages/ai/src/models/registry.ts` 的单价计费；计量未接通之前隐藏成本列。       |
| S2-8 | `packages/ai/src/market/daily-bars.ts:71`                                                            | Polygon API Key 放在 URL 查询串里，任何记录 URL 的报错或日志都会泄露它。                                                                                                                                                                                                                                                 | 改用 `Authorization: Bearer`。                                                                                                        |
| S2-9 | `migrations/v2/0019-portfolio-ledger.ts:7,18-20,35-36`、`portfolio-ledger-store.ts:134-139`          | 金额与数量用 `DOUBLE PRECISION`，长期累积会有浮点残差（`1e-8` lot 永不关闭）；已实现盈亏只在响应里返回，不落库，业绩归因无数据可用；券商 CSV 导入没有幂等键，重复导入会重复记账。                                                                                                                                        | 加列 `realized_pnl NUMERIC(20,4)`；新增字段用 `NUMERIC`；加 `external_ref TEXT` 与唯一索引 `(account_id, external_ref)`。             |

### 1.4 根因级发现（为什么上述问题能通过 `pnpm check && pnpm test`）

1. **客户端绕过 `kanonFetch`**：Wave D–H 新增的 4 个 `features/*/lib/*-api.ts`（`forecasts-ic-api`、`security-vault-api`、`inbox-ledger-api`、`model-versions-api`）全部直接调用 `fetch`，请求和响应都没有共享 Zod 契约，S0-7 的漂移由此产生。
2. **路由手写解析，不用契约**：ledger、forecasts、ic、inbox、orgs、ai-credentials 都用 `typeof rec.x === …` 和 `Number()` 手写解析，绕开了 AGENTS §3 规定的 `packages/core/src/contracts/`，S0-2 与 S1-5 由此产生。
3. **「测试即完成」**：引擎有黄金测试，但没有任何门禁要求它**被产品调用**，§0 第 3 点由此产生。
4. **多写不入事务**：仓储层没有规则约束「≥2 次写入必须放进 `db.transaction`」，S0-3、S0-5⑤、S1-6 由此产生。
5. **生产配置不可观测**：`/api/health` 不报告关键密钥是否就位，S0-1、S1-7 一直没人察觉。

---

## 2. 深度打磨：用减法提升机构质感

总原则：**隐藏常量必须显形，装饰文案必须消失，不可逆操作必须有分量。**

### Cockpit

- **账本抽屉**（`inbox-and-ledger-sheets.tsx:105-118,137-147`）：删掉预填的 `NVDA / 10 / 120`，它会诱发误登记；删掉「初始化主账本 ($100,000)」这笔虚构现金，改为在建账时输入初始现金（默认 0，再走入金）。`noLeverageConfirmed: true` 在客户端被硬编码（`inbox-ledger-api.ts:63`），是走过场的声明；改为建账时一次性勾选「本账户不使用融资与做空」，服务端记录声明时间。补上 `tradeDate` 输入。按钮「登记成交（零杠杆校验）」改为「登记成交」，抽屉标题「零杠杆实盘 FIFO 账本」改为「账本」，规则由闸门执行，不靠文案。
- **收件箱**：按 thesis 分组，严重度只用左侧色条表达（去掉 Badge），加「全部已读」；`.ics` 订阅收进 ⋯ 菜单，不再常驻。
- **信息密度**：驾驶舱首屏只放三个决策信号：待结算预测数、待审批 IC 数、未读红旗数。各点击进入对应抽屉，不再新增卡片。

### Step 3（财务法证）

- Beneish M、Altman Z、Piotroski F、DuPont 四个评分引擎已完成却没有展示。用**一行四个数字**接入（数值 + 阈值状态色 + `ProvenancePopover` 公式与 accession），不新增卡片；行内放不下的解释一律进 Popover。
- `detectFactRestatements` 接到事实表上：对被重述的数字加 1px 珊瑚色下划线，悬浮显示「原值 → 重述值 · accession」。这是最强的机构信号，成本最低。

### Step 4（估值工作台）

- **一条估值带替代四个格子**：DCF 现值、MC P10/P50/P90（S2-1 修正后的现值口径）、现价、历史 P/E 分位，全部画在同一条横轴上。读者一眼能看出「现价落在分布的哪里」，比四个孤立数字更有信息量。
- **删装饰**：去掉 `Seed 20261126` Badge、「2,000 次相关抽样」副文案，以及 toast 里的技术词（`editorial-craft.md` §1）。
- **隐含假设显形**：终值增速、税率、RONIC、CAP RONIC 折叠为一行「隐含假设 · g 3.0% · t 21% · RONIC 16%」，点击可编辑。
- **不可用即折叠**：「卖方预期未接入」「历史分位待接入」不再占一整张卡（Badge + 解释段落），收成一行灰字，数据接通后再展开。

### Step 5（预测账本与 IC）

- **结算要有分量**：未到 `resolveBy` 的预测不显示「兑现 / 证伪」，只在 ⋯ 菜单里提供「提前结算」并要求二次确认；结算后不可撤销，按钮旁写明。
- **Brier 要有参照**：显示样本数 n 和基线，例如「Brier 0.182 · n=7 · 抛硬币 0.500」（多类 Brier 二元时基线为 0.5）。n < 5 时显示「样本不足」，不显示分数。
- **行内去噪**：`SHA xxxxxxxx` 移进 Popover；`resolveBy` 默认值从硬编码的 `2027-06-30` 改为「今天 + 12 个月」。
- **IC 栏**：`in_review` 时隐藏「提交审批」，防止重复提交；补「驳回」并要求填写意见；显示「谁 · 何时 · 快照哈希」。个人工作区如实标注为「自审」，不伪装成投委会批准。

### Settings

- 2FA：二维码、恢复码一次性展示、停用流程，三件补齐（S0-7）。
- 密钥库：每个 provider 显示「最近使用时间」；成本计量接通之前隐藏 $ 列（S2-7）。toast「已通过 AES-256-GCM 加密存入服务端密钥库」改为「已保存」。

---

## 3. 真实生产数据飞轮：务实落地顺序

排序依据：**下游依赖、单位成本、对诚实度的边际贡献。** P/E 分位依赖 PIT EPS，向量检索依赖 chunk 已入库且检索已接线，像素回归与数据无关，可以并行。

| 顺序 | 工作                                                           | 理由与做法                                                                                                                                                                                                                                                                                                                        | 成本                 |
| :--- | :------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------- |
| ①    | **先接通管道**（S1-7）                                         | 配置 `CRON_SECRET`，加上作业生产者，否则后面所有数据任务都没有执行通道。若项目在 Vercel Hobby 计划（Cron 只能每天一次，与当前 `0 22 * * 1-5` 的配置一致），就用「每日 tick 内循环排空」+「打开 thesis 时按需入队」；需要更高频率时再升级 Pro（每分钟）或用 GitHub Actions 定时调用。                                              | $0                   |
| ②    | **SEC companyfacts 全量 PIT 回灌**（S1-1）                     | 免费且权威；每条 fact 自带 `accn / filed / fp / end`，是 PIT 的天然原料。修好之后，`getFactsAsOf`、`detectFactRestatements`、Q4 反推、TTM EPS 全部可以上线。遵守 SEC 每秒 10 次的限制并带声明 UA；按关注列表优先，再扩到 S&P 500。                                                                                                | $0                   |
| ③    | **Polygon 日频价格 + 拆股事件 → 真实 5 年 P/E 分位带**（S1-3） | Polygon `adjusted=true` 只调拆股、不调分红，正好是 P/E 要的口径；`/v3/reference/splits` 提供拆股事件，用来调整 EPS。Yahoo 只做本地开发兜底，不进生产（`adjclose` 含分红调整，且数据中心 IP 常被封）。FMP 适合补卖方一致预期，只在 `source:"live-market"` 门禁内展示。                                                             | Polygon Starter 级别 |
| ④    | **混合检索接线 + 离线评测集**（S2-6，§0 第 3 点）              | 先把 `searchFilingChunksLexical` + `hybridSearchChunks` 接进 `ask-ic`（feature flag），先建一份 50 条中英混合的标注集（问题 → 应命中的 `accession:section:para`），量出 recall@8 基线。现有 `packages/ai/evals/run-evals.mjs` 只是转调 `ai-ic-v2.test.ts` 单测，没有召回评测。不先接线就上 pgvector，只是给没人调用的函数加向量。 | $0                   |
| ⑤    | **pgvector 真实语义向量**                                      | Neon 原生支持 `vector` 扩展。只在 ④ 证明跨语言召回不足时引入：多语种或金融领域 embedding，按 chunk 内容哈希增量入库，作为作业 `embed_chunks`。验收标准是 recall@8 相对 ④ 的基线提升 ≥ 15pp，否则不上线。                                                                                                                          | embedding 按量计费   |
| ∥    | **Playwright 像素级防截断回归**（并行轨道）                    | 与数据无关，随时可以开工。在 CI（GitHub Actions + 官方 Playwright 容器，字体固定）中用 PGlite 种子数据启动 `pnpm dev`。每页 × {1280, 1440, 1920} × {light, dark} 截图；截断检测**以 DOM 为主、像素为辅**：文本元素 `scrollWidth > clientWidth` 且没有 `title` 或 Popover 时直接失败，像素 diff 只用于审美回归，阈值 0.1%。        | CI 分钟数            |

---

## 4. 可执行分波计划（P0 / P1）

每个工作项对应一次干净提交，完成后执行 AGENTS.md §4 交付闭环。

### Wave I — P0 安全与诚实热修复

| 项  | 内容                                                                                      | 验收标准                                                                                                                                                      |
| :-- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | 主密钥：生产 fail-closed + `v2` envelope（kid + AAD + HKDF）+ 存量重加密                  | Vercel 已配置 `KANON_CREDENTIALS_MASTER_KEY`；`/api/health` 返回 `secretsConfigured.credentials=true`；`v1` 密文可读，写入一律 `v2`；跨行互换密文后解密失败。 |
| I2  | 账本：Zod 契约 + 事务 + 行锁 + CHECK 约束 + 限制名单拦截买入                              | 负数、0、NaN、非 ISO 日期一律 400；两笔并发买入合计超过现金时，恰好一笔成功；DB 直接插入负数量被 CHECK 拒绝；组织限制名单内的标的买入返回 403。               |
| I3  | IC：approvalId 绑定 thesis、服务端派生 orgId、maker-checker、状态机、服务端快照哈希、事务 | 跨 thesis 的 approvalId 返回 404；组织模式下自批返回 403；`approved → approved` 返回 409；thesis 内容变化后快照哈希随之变化。                                 |
| I4  | TOTP：`begin` 防重置、条件 UPDATE 防重放、客户端契约修复、恢复码展示、二维码、停用        | 已开启时 `begin` 返回 409；同一码并发两次只有一次成功；设置页端到端开启 → 登录要求验证码 → 恢复码登录 → 停用，全部通过。                                      |
| I5  | 预测账本完整性（S1-5）+ 审计日志 TRUNCATE 防护与哈希链（S1-6）                            | 过去日期、越界 outcomeIndex、重复结算、DELETE、TRUNCATE 全部被 DB 或路由拒绝，并有测试覆盖。                                                                  |
| I6  | `CRON_SECRET` + 作业生产者 + 毒作业终止 + 完成栅栏（S1-7）                                | 生产 tick 返回 `claimed > 0`；连续超时的作业在 `max_attempts` 后变为 `failed`；`/api/health` 报告队列积压。                                                   |

### Wave J — P0 数据完整性

| 项  | 内容                                                                           | 验收标准                                                                                                                  |
| :-- | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| J1  | companyfacts 逐 fact PIT 写入（S1-1）+ `is_latest_for_period` 重算             | AAPL 的 `periodEnd` 为 9 月末；`getFactsAsOf(asOf)` 不返回 `filedAt > asOf` 的行；用 NVDA 拆股前后的 EPS 重述做黄金测试。 |
| J2  | 证券主数据不被覆盖（S1-2）                                                     | 打开 TSM 申报原文后 `adr_ratio`、`currency`、`cik` 保持不变。                                                             |
| J3  | PIT TTM EPS × 拆股调整价 → P/E 分位带（S1-3）；去掉 `price=100` 默认值（S1-4） | 前视属性测试通过；NVDA 2021–2025 分位带与手工对账误差 < 2%。                                                              |
| J4  | Step 4 去掉虚构基数与隐藏常量（S2-2、S2-3）                                    | 无 SEC 数据时显示空态；totalDebt=0 时 DCF 净债务为 0；快照带完整 lineage，并能从快照复算出同一公允价。                    |
| J5  | 8-K 去重 + 扇出给所有关注者（S1-8）                                            | 同一 8-K 同步 3 次，收件箱只有 1 条；关注同一标的的两个用户各收到 1 条。                                                  |

### Wave K — P1 方法论与闭环

| 项  | 内容                                                                          | 验收标准                                                                            |
| :-- | :---------------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| K1  | MC 折现口径（S2-1）+ DCF 终值年中口径、`g ≤ Rf`、允许 RONIC < WACC（S2-4）    | 黄金测试与 Damodaran 公开表格对账；UI 上 MC 与 DCF 同口径。                         |
| K2  | Step 3 一行法证评分 + 重述下划线（§2）                                        | 四个引擎都有生产调用方；Popover 显示公式与 accession。                              |
| K3  | 告警规则引擎：`evaluate_alerts` 作业（价格阈值、P/E 分位越界、预测到期、8-K） | 每类规则端到端各一条测试：规则 → 作业 → 收件箱 → `last_triggered_at`。              |
| K4  | 数值核验按概念绑定 + 表单号剥离（S2-5）                                       | 评测集上「概念错配」案例全部判为 unverified；`10-K` 不再误报。                      |
| K5  | 混合检索接线 + 中文查询扩展（S2-6）+ 真实 token 计量（S2-7）                  | 中文 recall@8 相对基线有提升（数值写进评测报告）；设置页成本与供应商账单误差 < 5%。 |
| K6  | §2 的减法打磨（Cockpit / Step 4 / Step 5 / Settings）                         | `pnpm check` 零新增装饰文案；Playwright 截图通过人工评审。                          |

### Wave L — P1 数据飞轮（按 §3 顺序）：Polygon 生产接入 → pgvector（以评测结果为前提）→ Playwright 回归进入 CI。

### Wave M — P2 团队能力：邀请成员、能力集 RBAC（S1-9）、`theses.org_id` 接入所有权校验、真正的 Postgres RLS、审计日志查看器。

---

## 5. 建议新增的 L2 门禁

每条都对应 §1.4 的一个根因，建议加在 `scripts/garden-guards.mjs` / `scripts/ast-guard-rules.mjs`。

| 门禁 | 规则                                                                                                                                                                                                                 | 拦截的问题类别              |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------- |
| G1   | `apps/web/src/features/**` 禁止直接调用 `fetch(`，只能用 `shared/lib/kanon-fetch.ts`（SSE 例外需登记白名单）。                                                                                                       | 契约漂移（S0-7）            |
| G2   | `apps/web/src/app/api/**` 禁止 `Number(rec.` / `Number(raw.`，以及对请求体字段的 `typeof … === "number"` 手写解析；请求体必须经过 `packages/core/src/contracts/` 的 Schema。                                         | 数值注入（S0-2、S1-5）      |
| G3   | **生产可达性**：`packages/core/src/index.ts`、`packages/core/src/db/index.ts`、`packages/ai/src/index.ts` 再导出的每个符号，必须在 `apps/web/src` 或 AI 路由链路中至少被引用一次；例外需在白名单中写明原因和到期日。 | 测试即完成（§0 第 3 点）    |
| G4   | **租户谓词**：`packages/core/src/db/repositories/**` 中 `.update()` / `.delete()` 的 `where` 若只按 `id` 过滤，必须同时包含 `userId / thesisId / orgId` 之一，或用 `// @kanon-tenant-checked: <理由>` 标注。         | IDOR（S0-4）                |
| G5   | **多写事务**：仓储函数里出现 ≥ 2 个 `await db.insert/update/delete` 时，必须位于 `db.transaction(` 回调内。                                                                                                          | 半状态与竞态（S0-3、S0-5⑤） |
| G6   | **诚实回落**：`features/valuation/**`、`features/journal/**` 禁止对财务输入使用 `\|\| <数字字面量>`、`?? <数字字面量>`，以及「可选链 ? … : <数字字面量>」三元表达式。                                                | 虚构基数（S2-2、S1-4）      |
| G7   | **生产配置**：`test:api` 断言 `/api/health` 的 `secretsConfigured.*` 字段存在；交付闭环第 4 步改为在线验证这些字段全部为 `true`。                                                                                    | 配置缺口（S0-1、S1-7）      |
| G8   | **DB 不变量测试**：`repository.test.ts` 用 PGlite 实际执行越权 UPDATE/DELETE/TRUNCATE、负数量 INSERT、重复结算，断言抛错；每个新 trigger 或 CHECK 必须带一条反例测试。                                               | 触发器缺口（S1-5、S1-6）    |
| G9   | **PIT 前视属性测试**：沿用 `properties.test.ts` 的 `createMulberry32` 种子随机方式生成 asOf，断言 `getFactsAsOf` 与 P/E 观测所用的 EPS 满足 `filedAt ≤ 观测日`。                                                     | 前视偏差（S1-1、S1-3）      |
| G10  | **Playwright 截断**：DOM 级 `scrollWidth > clientWidth` 且没有 `title` 或 Popover 即失败；像素 diff 阈值 0.1%，CI 固定字体。                                                                                         | 悬浮截断与像素回归          |

> 按 AGENTS.md：上述任一问题再次出现（第 2 次），必须把对应门禁写进 `.rules/postmortems.md` 并升级为 L1/L2/L3 守卫。
