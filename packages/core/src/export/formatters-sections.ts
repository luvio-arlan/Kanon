import type { SavedAgentRun } from "../contracts/api-contracts";
import { analyzeSecForensics } from "../math/sec-forensics";
import type {
  QuarterlyReview,
  ResearchNote,
  SavedCopilotOutput,
  SecSnapshot,
  ThesisDetail,
  ThesisRevision,
} from "../schemas/research";

export interface ThesisExportExtras {
  secSnapshot?: SecSnapshot | null;
  revisions?: readonly ThesisRevision[];
  quarterlyReviews?: readonly QuarterlyReview[];
  copilotOutputs?: readonly SavedCopilotOutput[];
  agentRuns?: readonly SavedAgentRun[];
  researchNotes?: readonly ResearchNote[];
}

function formatForensicsMd(extras?: ThesisExportExtras): string[] {
  const forensics = analyzeSecForensics(
    extras?.secSnapshot?.annuals ?? [],
    extras?.secSnapshot?.quarterlies ?? [],
  );
  if (!forensics) return [];
  const flagLines =
    forensics.redFlags.length > 0
      ? forensics.redFlags.map((f) => `- **警示 [${f.severity}] ${f.label}**：${f.detail}`)
      : ["- 核心财务法证指标未触发异常警示。"];
  return [
    "",
    "## 六、SEC 财务法证评级与风控警示",
    `- **法证评分**：${forensics.forensicScore}/100（${forensics.forensicGradeLabel}） · ROIC ${forensics.roicPct ?? "—"}% · Sloan 应计 ${forensics.sloanAccrualPct ?? "—"}% · SBC/OCF ${forensics.sbcPctOfOcf ?? "—"}%`,
    ...flagLines,
  ];
}

function formatCatalystsMd(thesis: ThesisDetail): string[] {
  if (thesis.catalysts.length === 0) return [];
  return [
    "",
    "## 七、催化剂日程与验证口径",
    ...thesis.catalysts.map(
      (c) =>
        `- **[${c.status}] ${c.dateLabel} · ${c.title}**（${c.impact}/${c.direction}）— 核验：${c.verificationMetric}`,
    ),
  ];
}

function formatDisciplineMd(thesis: ThesisDetail): string[] {
  if (thesis.disciplineEntries.length === 0) return [];
  const omitted = Math.max(0, thesis.disciplineEntries.length - 5);
  return [
    "",
    "## 八、交易纪律与离场红线",
    ...thesis.disciplineEntries
      .slice(0, 5)
      .map(
        (d) =>
          `- \`${d.createdAt.slice(0, 10)}\` **${d.action.toUpperCase()} @ $${d.priceAnchor.toFixed(2)}**（零杠杆确认：${d.noLeverageConfirmed ? "是" : "否"}）— 离场：${d.exitRule}`,
      ),
    ...(omitted > 0 ? [`- *（其余 ${omitted} 条历史记录已归档至 JSON 备份）*`] : []),
  ];
}

function formatReviewAndAgentMd(extras?: ThesisExportExtras): string[] {
  const latestReview = extras?.quarterlyReviews?.[0];
  const latestRun = extras?.agentRuns?.[0];
  if (!latestReview && !latestRun) return [];
  const lines = ["", "## 九、最新季度复盘与投委会裁决"];
  if (latestReview) {
    lines.push(`- **${latestReview.quarterLabel} 季度复盘**：${latestReview.summary}`);
  }
  if (latestRun) {
    lines.push(
      `- **投委会综合裁决（置信度 ${latestRun.briefing.convictionScore}）**：${latestRun.briefing.verdict}`,
    );
  }
  return lines;
}

export function formatMarkdownExtras(thesis: ThesisDetail, extras?: ThesisExportExtras): string[] {
  return [
    ...formatForensicsMd(extras),
    ...formatCatalystsMd(thesis),
    ...formatDisciplineMd(thesis),
    ...formatReviewAndAgentMd(extras),
  ];
}
