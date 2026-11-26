import { z } from "zod";
import { TickerSymbolSchema } from "../schemas/research";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) return false;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso;
}

export function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const IsoCalendarDateSchema = z
  .string()
  .trim()
  .refine(isValidCalendarDate, { message: "日期必须为合法的 YYYY-MM-DD 格式。" });

export const LedgerActionSchema = z.enum(["deposit", "withdraw", "buy", "sell", "dividend"]);

export const LedgerCreateAccountRequestSchema = z.object({
  op: z.literal("create_account"),
  name: z.string().trim().min(1, "账户名称不能为空。").max(60).default("主投研账户"),
  baseCurrency: z.string().trim().toUpperCase().min(3).max(6).default("USD"),
  initialCash: z.number().finite().min(0, "初始现金不能为负数。").max(1e12).default(0),
  noLeverageConfirmed: z.boolean().default(true),
});

export const LedgerTransactionRequestSchema = z
  .object({
    op: z.literal("record_transaction").optional(),
    accountId: z.string().trim().min(1, "缺少账户 ID。"),
    thesisId: z.string().trim().min(1).nullable().optional(),
    ticker: z.string().trim().toUpperCase().default("CASH"),
    action: LedgerActionSchema,
    quantity: z.number().finite("数量必须为有限数值。").positive("数量必须大于 0。").max(1e10),
    price: z.number().finite("价格必须为有限数值。").min(0, "价格不能为负数。").max(1e9),
    fees: z
      .number()
      .finite("手续费必须为有限数值。")
      .min(0, "手续费不能为负数。")
      .max(1e8)
      .default(0),
    tradeDate: IsoCalendarDateSchema.optional(),
    noLeverageConfirmed: z.boolean().default(false),
    note: z.string().trim().max(240).default(""),
    externalRef: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((val, ctx) => {
    const tradeDate = val.tradeDate ?? todayIsoUtc();
    if (tradeDate > todayIsoUtc()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tradeDate"],
        message: "成交日期不能晚于今天。",
      });
    }
    if (val.action === "buy" || val.action === "sell") {
      if (!TickerSymbolSchema.safeParse(val.ticker).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ticker"],
          message: "买卖成交必须提供合法的标的代码。",
        });
      }
      if (val.price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["price"],
          message: "买卖成交价格必须大于 0。",
        });
      }
    }
  });

export const LedgerPostRequestSchema = z.union([
  LedgerCreateAccountRequestSchema,
  LedgerTransactionRequestSchema,
]);

export const ForecastCreateRequestSchema = z
  .object({
    question: z.string().trim().min(4, "预测问题至少需要 4 个字符。").max(300),
    forecastKind: z.enum(["binary", "scenario_3", "quantile"]).default("binary"),
    probabilities: z
      .array(
        z.number().finite().min(0, "单项概率须在 0–1 之间。").max(1, "单项概率须在 0–1 之间。"),
      )
      .min(2, "至少需要 2 个互斥结果概率。")
      .max(10),
    resolveBy: IsoCalendarDateSchema,
    hypothesisId: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const sum = val.probabilities.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["probabilities"],
        message: "预测概率之和必须等于 1.0（误差 ≤ 2%）。",
      });
    }
    if (val.resolveBy <= todayIsoUtc()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resolveBy"],
        message: "到期日期必须晚于今天，禁止事后补录已知结果。",
      });
    }
  });

export const ForecastResolveRequestSchema = z.object({
  forecastId: z.string().trim().min(1, "缺少 forecastId。"),
  outcomeIndex: z.number().int().min(0, "outcomeIndex 必须为非负整数。").max(20),
  note: z.string().trim().max(400).optional(),
});

export const IcPostRequestSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("comment"),
    body: z.string().trim().min(1, "批注内容不能为空。").max(2000),
    anchorType: z.string().trim().min(1).max(40).default("thesis"),
    anchorId: z.string().trim().min(1).max(80).nullable().optional(),
  }),
  z.object({
    op: z.literal("submit"),
    note: z.string().trim().max(400).optional(),
  }),
]);

export const IcDecisionRequestSchema = z.object({
  approvalId: z.string().trim().min(1, "缺少审批 ID。"),
  decision: z.enum(["approved", "rejected", "archived"]),
  decisionNote: z.string().trim().max(500).default(""),
});

export const InboxPostRequestSchema = z.union([
  z.object({ op: z.literal("rotate_calendar") }),
  z.object({ op: z.literal("mark_all_read") }),
  z.object({
    op: z.literal("upsert_rule"),
    id: z.string().trim().min(1).optional(),
    thesisId: z.string().trim().min(1).nullable().optional(),
    kind: z.enum([
      "price_hurdle",
      "new_filing",
      "form8k_redflag",
      "kpi_breach",
      "catalyst_due",
      "pe_band_breach",
      "forecast_due",
    ]),
    configJson: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
  }),
  z.object({
    op: z.literal("create_item").optional(),
    thesisId: z.string().trim().min(1).nullable().optional(),
    kind: z.string().trim().min(1).max(60).default("manual"),
    severity: z.enum(["critical", "warn", "info"]).default("info"),
    title: z.string().trim().min(1, "标题不能为空。").max(160),
    body: z.string().trim().min(1, "内容不能为空。").max(1000),
    sourceUrl: z.string().trim().max(500).nullable().optional(),
  }),
]);

export const InboxPatchRequestSchema = z.union([
  z.object({ markAll: z.literal(true) }),
  z.object({ itemId: z.string().trim().min(1, "缺少 itemId。") }),
]);

export const OrgRoleSchema = z.enum(["owner", "pm", "analyst", "viewer", "compliance"]);

export const OrgPostRequestSchema = z.union([
  z.object({
    op: z.literal("restrict_ticker"),
    orgId: z.string().trim().min(1),
    ticker: TickerSymbolSchema,
    reason: z.string().trim().min(1).max(200).default("合规限制期"),
  }),
  z.object({
    op: z.literal("add_member"),
    orgId: z.string().trim().min(1),
    phone: z.string().trim().min(5).max(32),
    role: OrgRoleSchema,
  }),
  z.object({
    op: z.literal("assign_thesis"),
    orgId: z.string().trim().min(1).nullable(),
    thesisId: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal("create_org").optional(),
    name: z.string().trim().min(2, "组织名称需为 2–80 个字符。").max(80),
  }),
]);
