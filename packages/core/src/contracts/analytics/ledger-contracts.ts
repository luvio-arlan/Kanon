import { z } from "zod";
import { TickerSymbolSchema } from "../../schemas/research";
import { CurrencyCodeSchema, inferCurrencyFromTicker } from "../intel/primitives";
import { IsoCalendarDateSchema, maxTradeDateIsoUtc14, todayIsoUtc } from "../workflow-contracts";

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
    fxDeviationAck: z.boolean().default(false),
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

/** One-shot legacy-account currency confirmation that clears `ledger_inconsistent` (V0-4). */
export const LedgerConfirmLegacyCurrencyRequestSchema = z.object({
  op: z.literal("confirm_legacy_currency"),
  accountId: z.string().trim().min(1, "缺少账户 ID。"),
  mode: z.enum(["as_base", "infer_by_ticker"]),
});

export const LedgerPostRequestSchema = z.union([
  LedgerCreateAccountRequestSchema,
  LedgerReverseTransactionRequestSchema,
  LedgerConfirmLegacyCurrencyRequestSchema,
  LedgerTransactionRequestSchema,
]);
