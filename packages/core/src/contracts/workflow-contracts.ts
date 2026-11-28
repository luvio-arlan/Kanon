import { z } from "zod";
import { TickerSymbolSchema } from "../schemas/research";
import { CurrencyCodeSchema, IsoDateSchema, inferCurrencyFromTicker } from "./intel/primitives";

export const todayIsoUtc = () => new Date().toISOString().slice(0, 10);
/** Max allowed trade date using UTC+14 so UTC+8 early-morning entries are never rejected (U0-11 / P2-5). */
export const maxTradeDateIsoUtc14 = () =>
  new Date(Date.now() + 14 * 3600 * 1000).toISOString().slice(0, 10);

export const IsoCalendarDateSchema = IsoDateSchema;

export const LedgerActionSchema = z.enum(["deposit", "withdraw", "buy", "sell", "dividend"]);

export const LedgerCreateAccountRequestSchema = z.object({
  op: z.literal("create_account"),
  orgId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1, "账户名称不能为空。").max(60).default("主投研账户"),
  baseCurrency: CurrencyCodeSchema.default("USD"),
  initialCash: z.number().finite().min(0, "初始现金不能为负数。").max(1e12).default(0),
  noLeverageConfirmed: z.boolean().default(true),
});

export const LedgerReverseTransactionRequestSchema = z.object({
  op: z.literal("reverse_transaction"),
  accountId: z.string().trim().min(1, "缺少账户 ID。"),
  transactionId: z.string().trim().min(1, "缺少原成交 ID。"),
  note: z.string().trim().max(200).default(""),
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
    tradeCurrency: CurrencyCodeSchema.optional(),
    fxToBase: z.number().finite().positive().max(1e6).optional(),
    tradeDate: IsoCalendarDateSchema.optional(),
    noLeverageConfirmed: z.boolean().default(false),
    note: z.string().trim().max(240).default(""),
    externalRef: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((val, ctx) => {
    const tradeDate = val.tradeDate ?? todayIsoUtc();
    if (tradeDate > maxTradeDateIsoUtc14()) {
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
      if (!val.tradeCurrency && inferCurrencyFromTicker(val.ticker) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ticker"],
          message:
            "CURRENCY_UNSUPPORTED: 该交易所币种暂未覆盖（ECB 覆盖 USD/HKD/CNY/EUR/GBP/JPY）。",
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
  LedgerReverseTransactionRequestSchema,
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

export const AlertRuleUpsertSchema = z.discriminatedUnion("kind", [
  z.object({
    op: z.literal("upsert_rule"),
    thesisId: z.string().trim().min(1, "价格提醒必须绑定标的。"),
    kind: z.literal("price_hurdle"),
    configJson: z.object({
      targetPrice: z.number().finite().positive("目标价格必须大于 0。"),
      direction: z.enum(["below", "above"]).default("below"),
    }),
    enabled: z.boolean().default(true),
  }),
  z.object({
    op: z.literal("upsert_rule"),
    thesisId: z.string().trim().min(1, "分位带提醒必须绑定标的。"),
    kind: z.literal("pe_band_breach"),
    configJson: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
  }),
  z.object({
    op: z.literal("upsert_rule"),
    thesisId: z.string().trim().min(1, "8-K 提醒必须绑定标的。"),
    kind: z.literal("form8k_redflag"),
    configJson: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
  }),
  z.object({
    op: z.literal("upsert_rule"),
    thesisId: z.string().trim().min(1).nullable().optional(),
    kind: z.literal("forecast_due"),
    configJson: z.record(z.string(), z.unknown()).default({}),
    enabled: z.boolean().default(true),
  }),
]);

export const InboxPostRequestSchema = z.union([
  z.object({ op: z.literal("rotate_calendar") }),
  z.object({ op: z.literal("mark_all_read") }),
  AlertRuleUpsertSchema,
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
    op: z.literal("invite"),
    orgId: z.string().trim().min(1),
    phone: z.string().trim().min(5).max(32),
    role: OrgRoleSchema,
  }),
  z.object({
    op: z.literal("accept_invite"),
    invitationId: z.string().trim().min(1).optional(),
    token: z.string().trim().min(1).optional(),
  }),
  z.object({
    op: z.literal("revoke_invite"),
    orgId: z.string().trim().min(1),
    invitationId: z.string().trim().min(1),
  }),
  z.object({
    op: z.literal("update_role"),
    orgId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    role: OrgRoleSchema,
  }),
  z.object({
    op: z.literal("remove_member"),
    orgId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
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
