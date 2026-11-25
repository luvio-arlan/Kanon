import { calculateImpliedExpectations } from "../math/implied-expectations";
import { analyzeSecQuality } from "../math/sec-analytics";
import type { ThesisDetail } from "../schemas/research";
import type { ThesisExportExtras } from "./formatters-sections";

export type { ThesisExportExtras };

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const VERDICT_CN: Record<string, string> = { pass: "通过", watch: "观察", veto: "排除" };

function buildFilterHtml(thesis: ThesisDetail): string {
  const f = thesis.businessFilter;
  const rows: ReadonlyArray<[string, string]> = [
    ["收入韧性与客户粘性", VERDICT_CN[f.recurringRevenue] ?? f.recurringRevenue],
    ["定价权与竞争壁垒", VERDICT_CN[f.pricingPower] ?? f.pricingPower],
    ["资本回报与现金流质量", VERDICT_CN[f.capitalReturn] ?? f.capitalReturn],
    ["治理透明度与资本配置", VERDICT_CN[f.governance] ?? f.governance],
  ];
  return rows
    .map(([k, v]) => `<tr><td>${k}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`)
    .join("");
}

function buildScenarioHtml(thesis: ThesisDetail): string {
  const { valuation } = thesis;
  const rows = [
    ["悲观", valuation.bear],
    ["中性", valuation.base],
    ["乐观", valuation.bull],
  ] as const;
  return rows
    .map(
      ([label, item]) =>
        `<tr><td>${label}</td><td>$${item.eps}</td><td>${item.peMultiple}x</td><td>$${item.targetPrice.toFixed(2)}</td><td>${Math.round(item.probability * 100)}%</td><td>${item.cagrPct}%</td></tr>`,
    )
    .join("");
}

function buildExpectationsHtml(thesis: ThesisDetail, extras?: ThesisExportExtras): string {
  const quality = analyzeSecQuality(extras?.secSnapshot?.annuals ?? []);
  const exp = calculateImpliedExpectations({
    summary: thesis.valuation,
    trailingEps: quality?.latestEps,
  });
  const impliedLine =
    exp.impliedEpsCagrPct !== null
      ? ` ｜ <strong>市场隐含 EPS 增速：</strong>${exp.impliedEpsCagrPct}%`
      : "";
  return `<p><strong>安全边际：</strong>${exp.marginOfSafetyPct}% ｜ <strong>15% CAGR 买点：</strong>$${exp.hurdleEntry15.toFixed(2)} ｜ <strong>20% CAGR 买点：</strong>$${exp.hurdleEntry20.toFixed(2)}${impliedLine}</p>`;
}

export function formatGoogleDocHtml(thesis: ThesisDetail, extras?: ThesisExportExtras): string {
  const { valuation } = thesis;
  const ratio =
    valuation.riskRewardRatio !== null ? `${valuation.riskRewardRatio.toFixed(2)}×` : "∞";
  const hypHtml = thesis.hypotheses
    .map(
      (h) =>
        `<li><strong>${escapeHtml(h.title)}</strong>（${escapeHtml(h.metricLabel)}：${escapeHtml(h.threshold)}）<br/>${escapeHtml(h.note)}</li>`,
    )
    .join("");
  const discHtml = thesis.disciplineEntries
    .slice(0, 5)
    .map(
      (d) =>
        `<li><code>${escapeHtml(d.createdAt.slice(0, 10))}</code> [${escapeHtml(d.action.toUpperCase())} @ $${d.priceAnchor.toFixed(2)}] 离场条件：${escapeHtml(d.exitRule)}</li>`,
    )
    .join("");

  return [
    "<!doctype html>",
    '<html lang="zh-CN"><head><meta charset="utf-8" />',
    `<title>${escapeHtml(thesis.companyName)} (${escapeHtml(thesis.ticker)}) — KANON 机构研报</title>`,
    "<style>body{font-family:-apple-system,PingFang SC,sans-serif;max-width:780px;margin:40px auto;padding:0 24px;line-height:1.7;color:CanvasText;background:Canvas}h1{font-size:24px;letter-spacing:-0.02em;border-bottom:2px solid CanvasText;padding-bottom:10px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid silver;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}th,td{border:1px solid silver;padding:8px 10px;text-align:left}code{font-family:ui-monospace,monospace}@media print{body{margin:0;max-width:none}}</style>",
    "</head><body>",
    `<h1>${escapeHtml(thesis.indexLabel)} · ${escapeHtml(thesis.companyName)} (${escapeHtml(thesis.ticker)})</h1>`,
    `<p><strong>赛道：</strong>${escapeHtml(thesis.sectorTag)} ｜ <strong>当前价：</strong>$${thesis.currentPrice.toFixed(2)} ｜ <strong>赔率比：</strong>${ratio} ｜ <strong>期望目标价：</strong>$${valuation.expectedTargetPrice.toFixed(2)}</p>`,
    buildExpectationsHtml(thesis, extras),
    `<h2>一、核心投资论点与商业质量评估</h2><p>${escapeHtml(thesis.convictionSummary)}</p>`,
    `<table><thead><tr><th>商业模式维度</th><th>评审结论</th></tr></thead><tbody>${buildFilterHtml(thesis)}</tbody></table>`,
    `<h2>二、三条可证伪核心假设</h2><ol>${hypHtml}</ol>`,
    `<h2>三、${thesis.horizonYears} 年三情景估值赔率表</h2>`,
    `<table><thead><tr><th>情景</th><th>EPS</th><th>PE</th><th>目标价</th><th>权重</th><th>年化 CAGR</th></tr></thead><tbody>${buildScenarioHtml(thesis)}</tbody></table>`,
    discHtml ? `<h2>四、交易纪律与复盘留痕</h2><ul>${discHtml}</ul>` : "",
    "<p><em>由 KANON（卡农）机构投研操作系统生成 · Conviction, composed.</em></p>",
    "</body></html>",
  ]
    .filter(Boolean)
    .join("\n");
}
