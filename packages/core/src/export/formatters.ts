import { calculateImpliedExpectations } from "../math/implied-expectations";
import { calculateResearchReadiness } from "../math/research-readiness";
import { analyzeSecQuality } from "../math/sec-analytics";
import type { ThesisDetail } from "../schemas/research";
import { formatGoogleDocHtml, type ThesisExportExtras } from "./formatters-html";
import { formatMarkdownExtras } from "./formatters-sections";

export { formatGoogleDocHtml, type ThesisExportExtras };

function escapeCsvCell(value: string | number): string {
  const raw = String(value);
  const trimmedStart = raw.replace(/^[\s\t\r]+/, "");
  const isStrictNumber = /^-?\d+(?:\.\d+)?$/.test(trimmedStart);
  const formulaRisk =
    typeof value === "string" &&
    !isStrictNumber &&
    (/^[=+\-@\t\r]/.test(raw) || /^[=+\-@]/.test(trimmedStart));
  const safe = formulaRisk ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

function formatExpectationsSection(thesis: ThesisDetail, extras?: ThesisExportExtras): string[] {
  const quality = analyzeSecQuality(extras?.secSnapshot?.annuals ?? []);
  const exp = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: quality?.latestEps,
  });
  const lines = [
    "## 五、反向估值预期与买点标尺（Expectations Investing）",
    `- **相对中性目标安全边际**：${exp.marginOfSafetyPct}%（相对概率期望：${exp.expectedMarginOfSafetyPct}%）`,
    `- **15% 年化回报安全买点**：$${exp.hurdleEntry15.toFixed(2)} ｜ **20% 年化回报安全买点**：$${exp.hurdleEntry20.toFixed(2)}`,
    `- **现价隐含远期 EPS（按中性 PE）**：$${exp.impliedEpsAtBasePe.toFixed(2)}${exp.impliedEpsCagrPct !== null ? `（隐含复合增速 ${exp.impliedEpsCagrPct}%）` : ""}`,
  ];
  if (quality) {
    lines.push(
      `- **SEC 历史质量画像（${quality.yearsCovered} 年）**：${quality.qualityLabel} · 营收 CAGR ${quality.revenueCagrPct ?? "—"}% · 均值毛利率 ${quality.avgGrossMarginPct ?? "—"}% · FCF 转化率 ${quality.fcfConversionPct ?? "—"}%`,
    );
  }
  return lines;
}

function formatResearchBullets(thesis: ThesisDetail) {
  const hypothesisLines = thesis.hypotheses
    .map(
      (h, idx) =>
        `${idx + 1}. **[${h.status.toUpperCase()}] ${h.title}** — 指标：${h.metricLabel}（红线：${h.threshold}）\n   - 佐证：${h.note}`,
    )
    .join("\n");
  const crossCheckLines =
    thesis.crossChecks.length === 0
      ? "- 暂未记录上下游交叉印证。"
      : thesis.crossChecks
          .map(
            (cc) =>
              `- **${cc.peerCompany}**（${cc.topic} · ${cc.sourceAnchor}）：${cc.statement} → 结论：${cc.takeaway}`,
          )
          .join("\n");
  return { hypothesisLines, crossCheckLines };
}

function formatVariantSection(thesis: ThesisDetail): string[] {
  const f = thesis.businessFilter;
  const rows = [
    f.consensusView ? `- **市场一致预期**：${f.consensusView}` : "",
    f.variantPerception ? `- **我的核心预期差**：${f.variantPerception}` : "",
    f.keyDebate ? `- **未来 18 个月核心分歧**：${f.keyDebate}` : "",
    f.preMortem ? `- **逆向压力推演**：${f.preMortem}` : "",
  ].filter(Boolean);
  return rows.length > 0 ? ["", "### 买方预期差与逆向推演", ...rows] : [];
}

export function formatThesisMarkdown(thesis: ThesisDetail, extras?: ThesisExportExtras): string {
  const { valuation } = thesis;
  const ratio =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";
  const readiness = calculateResearchReadiness(thesis);
  const { hypothesisLines, crossCheckLines } = formatResearchBullets(thesis);

  return [
    `# ${thesis.indexLabel} · ${thesis.companyName} (${thesis.ticker}) — KANON 深度研究档案`,
    "",
    `> 赛道：${thesis.sectorTag} | 当前参考价：$${thesis.currentPrice.toFixed(2)} | 研究成熟度：${readiness.completedCount}/5 (${readiness.scorePct}%) | 最近复盘：${thesis.lastReviewedAt}`,
    "",
    "## 一、核心投资论点",
    thesis.convictionSummary,
    ...formatVariantSection(thesis),
    "",
    `## 二、可证伪核心假设（${thesis.hypotheses.length} 条）`,
    hypothesisLines,
    "",
    "## 三、一阶资料与产业链交叉印证",
    crossCheckLines,
    "",
    `## 四、三情景估值赔率表（${thesis.horizonYears} 年）`,
    "| 情景 | EPS | 合理 PE | 权重 | 目标价 | 总空间 | 年化 CAGR |",
    "| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
    `| 悲观 | $${valuation.bear.eps} | ${valuation.bear.peMultiple}x | ${Math.round(valuation.bear.probability * 100)}% | $${valuation.bear.targetPrice.toFixed(2)} | ${valuation.bear.returnPct}% | ${valuation.bear.cagrPct}% |`,
    `| 中性 | $${valuation.base.eps} | ${valuation.base.peMultiple}x | ${Math.round(valuation.base.probability * 100)}% | $${valuation.base.targetPrice.toFixed(2)} | ${valuation.base.returnPct}% | ${valuation.base.cagrPct}% |`,
    `| 乐观 | $${valuation.bull.eps} | ${valuation.bull.peMultiple}x | ${Math.round(valuation.bull.probability * 100)}% | $${valuation.bull.targetPrice.toFixed(2)} | ${valuation.bull.returnPct}% | ${valuation.bull.cagrPct}% |`,
    "",
    `- **赔率比（Upside / Downside）**：${ratio} ｜ **概率期望目标价**：$${valuation.expectedTargetPrice.toFixed(2)}`,
    "",
    ...formatExpectationsSection(thesis, extras),
    ...formatMarkdownExtras(thesis, extras),
    "",
    "---",
    "*Generated by KANON（卡农）— Conviction, composed.*",
  ].join("\n");
}

export function formatThesisArchiveJson(thesis: ThesisDetail, extras?: ThesisExportExtras): string {
  const secQuality = analyzeSecQuality(extras?.secSnapshot?.annuals ?? []);
  const expectations = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: secQuality?.latestEps,
  });
  return JSON.stringify(
    {
      schemaVersion: "kanon-archive/v3",
      exportedAt: new Date().toISOString(),
      thesis,
      readiness: calculateResearchReadiness(thesis),
      expectations,
      secQuality,
      secSnapshot: extras?.secSnapshot ?? null,
      revisions: extras?.revisions ?? [],
      quarterlyReviews: extras?.quarterlyReviews ?? [],
      copilotOutputs: extras?.copilotOutputs ?? [],
      agentRuns: extras?.agentRuns ?? [],
      researchNotes: extras?.researchNotes ?? [],
    },
    null,
    2,
  );
}

const PORTFOLIO_CSV_HEADER = [
  "编号",
  "代码",
  "公司名称",
  "赛道",
  "状态",
  "仓位角色",
  "当前权重(%)",
  "单票上限(%)",
  "持仓成本($)",
  "参考浮盈(%)",
  "当前参考价($)",
  "悲观目标($)",
  "中性目标($)",
  "乐观目标($)",
  "中性空间(%)",
  "安全边际(%)",
  "15%买点($)",
  "年化CAGR(%)",
  "赔率比",
  "已验证假设",
  "待验证催化剂",
  "最近复盘",
];

function formatPortfolioCsvRow(t: ThesisDetail): string {
  const validated = t.hypotheses.filter((h) => h.status === "validated").length;
  const ratio = t.valuation.riskRewardRatio !== null ? `${t.valuation.riskRewardRatio}x` : "INF";
  const exp = calculateImpliedExpectations({ summary: t.valuation });
  const costGainPct =
    t.avgCostBasis && t.avgCostBasis > 0
      ? (((t.currentPrice - t.avgCostBasis) / t.avgCostBasis) * 100).toFixed(1)
      : "";
  const upcomingCatalysts = t.catalysts.filter((c) => c.status === "upcoming").length;
  return [
    t.indexLabel,
    t.ticker,
    t.companyName,
    t.sectorTag,
    t.status === "active" ? "跟踪中" : "已否决归档",
    t.portfolioRole,
    t.currentWeightPct.toFixed(1),
    t.targetMaxWeightPct.toFixed(1),
    t.avgCostBasis ? t.avgCostBasis.toFixed(2) : "",
    costGainPct,
    t.currentPrice.toFixed(2),
    t.valuation.bear.targetPrice.toFixed(2),
    t.valuation.base.targetPrice.toFixed(2),
    t.valuation.bull.targetPrice.toFixed(2),
    t.valuation.upsidePct.toFixed(1),
    exp.marginOfSafetyPct.toFixed(1),
    exp.hurdleEntry15.toFixed(2),
    t.valuation.base.cagrPct.toFixed(1),
    ratio,
    `${validated}/${t.hypotheses.length}`,
    upcomingCatalysts,
    t.lastReviewedAt,
  ]
    .map(escapeCsvCell)
    .join(",");
}

export function formatPortfolioCsv(theses: readonly ThesisDetail[]): string {
  const rows = theses.map(formatPortfolioCsvRow);
  return `\uFEFF${[PORTFOLIO_CSV_HEADER.map(escapeCsvCell).join(","), ...rows].join("\n")}`;
}
