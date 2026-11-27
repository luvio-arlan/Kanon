// fin-lexicon/1

export interface FinLexiconEntry {
  pattern: RegExp;
  english: readonly string[];
  concept?: string;
}

export const BILINGUAL_FINANCE_LEXICON: readonly FinLexiconEntry[] = [
  {
    pattern: /毛利|毛利率|gross\s+margin/i,
    english: ['"gross margin"', "gross", "margin"],
    concept: "gross_margin",
  },
  {
    pattern: /营业利润率|经营利润率|operating\s+margin|ebit\s+margin/i,
    english: ['"operating margin"', "operating", "margin"],
    concept: "operating_margin",
  },
  {
    pattern: /净利率|net\s+margin/i,
    english: ['"net margin"', "net", "margin"],
    concept: "net_margin",
  },
  {
    pattern: /营收|营业收入|收入|增速|revenue|sales/i,
    english: ["revenue", "sales", "growth"],
    concept: "revenue",
  },
  {
    pattern: /净利润|盈利|net\s+income|profit/i,
    english: ['"net income"', "earnings", "profit"],
    concept: "net_income",
  },
  {
    pattern: /每股收益|稀释|eps/i,
    english: ['"diluted eps"', "earnings", "share", "eps"],
    concept: "diluted_eps",
  },
  {
    pattern: /资本开支|资本支出|扩产|capex/i,
    english: ['"capital expenditure"', "capex", "capacity"],
    concept: "capex",
  },
  {
    pattern: /自由现金流|现金流|fcf/i,
    english: ['"free cash flow"', '"operating cash flow"', "cash"],
    concept: "free_cash_flow",
  },
  { pattern: /回购|库藏股|buyback|repurchase/i, english: ["repurchase", "buyback", "shares"] },
  { pattern: /分红|股息|派息|dividend/i, english: ["dividend", "distribution", "payout"] },
  { pattern: /指引|展望|预期|guidance|outlook/i, english: ["guidance", "outlook", "expect"] },
  { pattern: /库存|存货|减值|inventory/i, english: ["inventory", "inventories", "provisions"] },
  { pattern: /应收账款|回款|receivable/i, english: ["receivable", "receivables"] },
  { pattern: /云计算|云服务|云|cloud/i, english: ["cloud", "azure", "aws", "infrastructure"] },
  {
    pattern: /数据中心|算力|芯片|gpu|blackwell|hopper/i,
    english: ['"data center"', "compute", "gpu", "accelerator"],
  },
  {
    pattern: /人工智能|大模型|\bai\b/i,
    english: ['"artificial intelligence"', "generative", "ai"],
  },
  { pattern: /定价权|提价|均价|pricing|asp/i, english: ["pricing", "price", "asp"] },
  {
    pattern: /股权激励|股票薪酬|sbc/i,
    english: ['"stock-based compensation"', '"share-based"', "dilution"],
  },
  {
    pattern: /订单|积压|合同|backlog|rpo/i,
    english: ["backlog", "rpo", '"remaining performance obligations"'],
  },
  { pattern: /折旧|摊销|depreciation/i, english: ["depreciation", "amortization"] },
  {
    pattern: /出口管制|制裁|关税|监管|反垄断|tariff|export/i,
    english: ['"export control"', "tariff", "sanction", "regulatory", "antitrust"],
  },
  {
    pattern: /竞争|市占率|份额|competition/i,
    english: ["competition", '"market share"', "competitors"],
  },
  { pattern: /债务|负债|借款|公司债|debt/i, english: ["debt", "notes", "maturities", "borrowing"] },
  { pattern: /税率|所得税|税收|欧盟|tax/i, english: ["tax", "income", '"state aid"', "effective"] },
  {
    pattern: /留存收益|累计亏损|资不抵债|retained|deficit/i,
    english: ['"accumulated deficit"', '"retained earnings"', "insolvency"],
  },
  { pattern: /研发|架构|r&d|research/i, english: ["research", "development", "engineering"] },
  { pattern: /客户|集中度|customer/i, english: ["customer", "concentration", "hyperscale"] },
  {
    pattern: /代工|晶圆|封装|供应链|foundry|wafer/i,
    english: ["foundry", "wafer", "packaging", '"supply chain"'],
  },
  {
    pattern: /分部|业务部|地区|北美|segment|geographic/i,
    english: ["segment", '"north america"', "geographic", "reportable"],
  },
  {
    pattern: /拆股|分拆|stock\s+split|split/i,
    english: ['"stock split"', "split", "retrospectively"],
  },
  { pattern: /重述|修正|restat/i, english: ["restated", "restatement", "originally"] },
  {
    pattern: /审计师|辞任|迟延|auditor|nt\s*10-k/i,
    english: ["auditor", "resigned", '"item 4.01"', '"nt 10-k"'],
  },
  {
    pattern: /新台币|汇率|币种|twd|ads|adr/i,
    english: ["twd", '"new taiwan"', "ads", "depositary", '"exchange rate"'],
  },
  { pattern: /外国发行人|20-f|6-k/i, english: ['"20-f"', '"6-k"', '"foreign private issuer"'] },
  {
    pattern: /现实实验室|reality\s+labs|亏损/i,
    english: ['"reality labs"', '"operating loss"', "segment"],
  },
  {
    pattern: /伯克希尔|投资损益|a股|b股|class\s+[ab]/i,
    english: ["berkshire", "investment", '"class b"', '"class a"', "operating"],
  },
  {
    pattern: /季度|单季|三季度|q[1-4]|three\s+months/i,
    english: ['"three months"', '"first fiscal quarter"', "quarter", "standalone"],
  },
];

export function expandLexiconTerms(raw: string): {
  englishTerms: string[];
  concepts: string[];
} {
  const terms = new Set<string>();
  const concepts = new Set<string>();
  for (const entry of BILINGUAL_FINANCE_LEXICON) {
    if (entry.pattern.test(raw)) {
      for (const e of entry.english) terms.add(e);
      if (entry.concept) concepts.add(entry.concept);
    }
  }
  const rawAscii = raw
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  for (const tok of rawAscii) terms.add(tok);
  return { englishTerms: [...terms], concepts: [...concepts] };
}
