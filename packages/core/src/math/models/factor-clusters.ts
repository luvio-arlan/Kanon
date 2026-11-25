export interface FactorClusterRule {
  id: string;
  label: string;
  tickers: readonly string[];
  keywords: readonly string[];
}

const FACTOR_RULES: readonly FactorClusterRule[] = [
  {
    id: "ai_semis",
    label: "AI 与半导体周期",
    tickers: [
      "NVDA",
      "MU",
      "TSM",
      "AVGO",
      "AMD",
      "ASML",
      "INTC",
      "QCOM",
      "LRCX",
      "AMAT",
      "KLAC",
      "ARM",
      "MRVL",
      "TXN",
      "SMCI",
    ],
    keywords: [
      "半导体",
      "芯片",
      "算力",
      "gpu",
      "hbm",
      "存储",
      "晶圆",
      "光刻",
      "semi",
      "chip",
      "foundry",
      "memory",
      "wafer",
    ],
  },
  {
    id: "cloud_saas",
    label: "云计算与企业软件",
    tickers: [
      "MSFT",
      "ORCL",
      "CRM",
      "NOW",
      "ADBE",
      "SNOW",
      "PLTR",
      "DDOG",
      "CRWD",
      "PANW",
      "INTU",
      "SAP",
      "WDAY",
    ],
    keywords: [
      "云计算",
      "云服务",
      "企业软件",
      "saas",
      "软件",
      "cloud",
      "enterprise",
      "software",
      "cyber",
    ],
  },
  {
    id: "consumer_internet",
    label: "消费互联网与平台",
    tickers: [
      "AMZN",
      "GOOGL",
      "GOOG",
      "META",
      "NFLX",
      "BABA",
      "PDD",
      "JD",
      "TCEHY",
      "0700.HK",
      "UBER",
      "ABNB",
      "SPOT",
      "MELI",
      "SHOP",
    ],
    keywords: [
      "互联网",
      "电商",
      "社交",
      "广告",
      "流媒体",
      "平台",
      "internet",
      "ecommerce",
      "advertising",
      "media",
      "platform",
    ],
  },
  {
    id: "consumer_staples_retail",
    label: "消费品牌与连锁零售",
    tickers: [
      "AAPL",
      "COST",
      "WMT",
      "PG",
      "KO",
      "PEP",
      "NKE",
      "SBUX",
      "MCD",
      "LVMUY",
      "HD",
      "LOW",
      "TGT",
      "BJ",
      "600519.SS",
    ],
    keywords: [
      "消费",
      "零售",
      "连锁",
      "会员店",
      "白酒",
      "餐饮",
      "硬件生态",
      "retail",
      "consumer",
      "brand",
      "staples",
    ],
  },
  {
    id: "healthcare_bio",
    label: "医疗健康与生物制药",
    tickers: ["LLY", "NVO", "UNH", "JNJ", "ABBV", "TMO", "ISRG", "DHR", "MRK", "VRTX"],
    keywords: ["医疗", "医药", "创新药", "生物", "器械", "health", "pharma", "biotech", "medtech"],
  },
  {
    id: "financials",
    label: "金融、支付与保险",
    tickers: [
      "BRK.B",
      "BRK.A",
      "V",
      "MA",
      "JPM",
      "BAC",
      "BLK",
      "SPGI",
      "MCO",
      "AXP",
      "GS",
      "MS",
      "SCHW",
    ],
    keywords: [
      "金融",
      "银行",
      "保险",
      "支付",
      "评级",
      "券商",
      "fintech",
      "bank",
      "payment",
      "insurance",
      "financial",
    ],
  },
  {
    id: "industrials_energy",
    label: "高端制造、能源与基建",
    tickers: ["TSLA", "GE", "CAT", "DE", "HON", "ETN", "VRT", "XOM", "CVX", "NEE", "UNP"],
    keywords: [
      "制造",
      "工业",
      "能源",
      "电力",
      "新能源",
      "汽车",
      "基建",
      "industrial",
      "energy",
      "auto",
      "power",
      "grid",
    ],
  },
];

const KEYWORD_MATCH_ORDER = [
  "healthcare_bio",
  "financials",
  "ai_semis",
  "cloud_saas",
  "industrials_energy",
  "consumer_staples_retail",
  "consumer_internet",
] as const;

function matchesKeyword(lower: string, kw: string): boolean {
  if (/^[a-z0-9]+$/.test(kw)) {
    return new RegExp(`\\b${kw}`, "i").test(lower);
  }
  return lower.includes(kw);
}

export function classifyEconomicFactor(sectorTag: string, ticker?: string): string {
  const upperTicker = ticker?.trim().toUpperCase() ?? "";
  if (upperTicker) {
    for (const rule of FACTOR_RULES) {
      if (rule.tickers.includes(upperTicker)) return rule.label;
    }
  }
  const lower = sectorTag.toLowerCase();
  for (const id of KEYWORD_MATCH_ORDER) {
    const rule = FACTOR_RULES.find((r) => r.id === id);
    if (rule?.keywords.some((kw) => matchesKeyword(lower, kw))) return rule.label;
  }
  return sectorTag.trim() || "其他行业因子";
}
