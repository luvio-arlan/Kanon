import type { ThesisDetail } from "../../schemas/research";
import { evaluatePortfolioReviewRadar, parseCatalystSortKey } from "./catalyst-radar";
import type { PortfolioCalibrationReport } from "./portfolio-calibration";

export interface DigestCatalystItem {
  ticker: string;
  companyName: string;
  title: string;
  dateLabel: string;
  impact: string;
}

export interface DigestWarningItem {
  ticker: string;
  companyName: string;
  title: string;
  threshold: string;
}

export interface DigestStaleItem {
  ticker: string;
  companyName: string;
  level: "urgent" | "attention" | "healthy";
  reason: string;
}

export interface WeeklyIcDigest {
  generatedAt: string;
  activeCount: number;
  weightedCalibrationScore: number;
  upcomingCatalysts: DigestCatalystItem[];
  warningHypotheses: DigestWarningItem[];
  divergentCrossChecks: DigestWarningItem[];
  attentionTheses: DigestStaleItem[];
  summaryLine: string;
}

function collectUpcomingCatalysts(active: readonly ThesisDetail[]): DigestCatalystItem[] {
  return active
    .flatMap((t) =>
      t.catalysts
        .filter((c) => c.status === "upcoming")
        .map((c) => ({
          ticker: t.ticker,
          companyName: t.companyName,
          title: c.title,
          dateLabel: c.dateLabel,
          impact: c.impact,
        })),
    )
    .sort((a, b) => parseCatalystSortKey(a.dateLabel) - parseCatalystSortKey(b.dateLabel))
    .slice(0, 6);
}

function collectDigestSignals(active: readonly ThesisDetail[], now: Date) {
  const radar = evaluatePortfolioReviewRadar(active, now.toISOString());
  const upcomingCatalysts = collectUpcomingCatalysts(active);
  const warningHypotheses = active
    .flatMap((t) =>
      t.hypotheses
        .filter((h) => h.status === "warning")
        .map((h) => ({
          ticker: t.ticker,
          companyName: t.companyName,
          title: h.title,
          threshold: h.threshold,
        })),
    )
    .slice(0, 6);
  const divergentCrossChecks = active
    .flatMap((t) =>
      t.crossChecks
        .filter((cc) => cc.alignment === "divergent")
        .map((cc) => ({
          ticker: t.ticker,
          companyName: t.companyName,
          title: `${cc.peerCompany} · ${cc.topic}`,
          threshold: cc.takeaway,
        })),
    )
    .slice(0, 6);
  const attentionTheses: DigestStaleItem[] = radar.items
    .filter((i) => i.level !== "healthy")
    .slice(0, 5)
    .map((i) => ({
      ticker: i.ticker,
      companyName: i.companyName,
      level: i.level === "urgent_review" ? "urgent" : "attention",
      reason: i.reason || "需核对假设与催化剂进展",
    }));
  return { upcomingCatalysts, warningHypotheses, divergentCrossChecks, attentionTheses };
}

export function buildWeeklyIcDigest(
  theses: readonly ThesisDetail[],
  calibration: PortfolioCalibrationReport,
  now = new Date(),
): WeeklyIcDigest {
  const active = theses.filter((t) => t.status !== "archived_veto");
  const signals = collectDigestSignals(active, now);
  const summaryLine = `在研 ${active.length} 标的 · 加权纪律分 ${calibration.weightedCalibrationScore} · 待验证催化剂 ${signals.upcomingCatalysts.length} 项 · 预警假设 ${signals.warningHypotheses.length} 条`;

  return {
    generatedAt: now.toISOString(),
    activeCount: active.length,
    weightedCalibrationScore: calibration.weightedCalibrationScore,
    ...signals,
    summaryLine,
  };
}

export function formatWeeklyDigestMarkdown(digest: WeeklyIcDigest): string {
  const dateStr = digest.generatedAt.slice(0, 10);
  const lines: string[] = [
    `# KANON IC 投研周报 (${dateStr})`,
    "",
    `> ${digest.summaryLine}`,
    "",
    "## 重点关注与复核预警",
    ...(digest.attentionTheses.length > 0
      ? digest.attentionTheses.map((i) => `- **${i.ticker} (${i.companyName})**: ${i.reason}`)
      : ["- 暂无逾期或证伪告警标的。"]),
    "",
    "## 证伪预警假设",
    ...(digest.warningHypotheses.length > 0
      ? digest.warningHypotheses.map((w) => `- **${w.ticker}**: ${w.title}（阈值：${w.threshold}）`)
      : ["- 核心假设暂无预警项。"]),
    "",
    "## 待兑现催化剂",
    ...(digest.upcomingCatalysts.length > 0
      ? digest.upcomingCatalysts.map((c) => `- **${c.ticker}** [${c.dateLabel}] ${c.title}`)
      : ["- 近期无待验证催化剂。"]),
    "",
    "## 产业链分歧印证",
    ...(digest.divergentCrossChecks.length > 0
      ? digest.divergentCrossChecks.map((d) => `- **${d.ticker}** · ${d.title}: ${d.threshold}`)
      : ["- 暂无重大分歧印证项。"]),
  ];
  return lines.join("\n");
}
