export interface CuratedPeerRef {
  ticker: string;
  companyName: string;
  sector: string;
  revenueGrowthPct: number;
  grossMarginPct: number;
  roicPct: number;
  forwardPe: number;
  evFcf: number;
}

const mk = (
  ticker: string,
  companyName: string,
  sector: string,
  revenueGrowthPct: number,
  grossMarginPct: number,
  roicPct: number,
  forwardPe: number,
  evFcf: number,
): CuratedPeerRef => ({
  ticker,
  companyName,
  sector,
  revenueGrowthPct,
  grossMarginPct,
  roicPct,
  forwardPe,
  evFcf,
});

export const PEER_CATALOG: Record<string, CuratedPeerRef> = {
  MSFT: mk("MSFT", "Microsoft", "云计算与企业软件", 14.5, 69.5, 28.5, 30, 34),
  AMZN: mk("AMZN", "Amazon", "消费互联网与云", 11.8, 48.5, 16.5, 32, 36),
  GOOGL: mk("GOOGL", "Alphabet", "消费互联网与云", 13.0, 58.0, 29.0, 21, 25),
  ORCL: mk("ORCL", "Oracle", "云计算与企业软件", 11.2, 71.5, 15.8, 26, 32),
  CRM: mk("CRM", "Salesforce", "云计算与企业软件", 9.5, 76.5, 14.2, 25, 22),
  NVDA: mk("NVDA", "NVIDIA", "AI 与半导体周期", 55.0, 74.5, 72.0, 32, 38),
  AVGO: mk("AVGO", "Broadcom", "AI 与半导体周期", 24.0, 64.0, 22.5, 29, 31),
  AMD: mk("AMD", "AMD", "AI 与半导体周期", 18.0, 51.0, 11.5, 28, 35),
  TSM: mk("TSM", "TSMC", "AI 与半导体周期", 22.0, 56.0, 24.5, 21, 26),
  ASML: mk("ASML", "ASML", "AI 与半导体周期", 14.0, 51.5, 36.0, 30, 34),
  MU: mk("MU", "Micron", "AI 与半导体周期", 32.0, 38.0, 14.0, 14, 22),
  LRCX: mk("LRCX", "Lam Research", "AI 与半导体周期", 13.5, 47.5, 34.0, 22, 24),
  AMAT: mk("AMAT", "Applied Materials", "AI 与半导体周期", 10.5, 47.5, 30.0, 20, 23),
  AAPL: mk("AAPL", "Apple", "消费硬件生态", 6.5, 46.2, 54.0, 29, 30),
  META: mk("META", "Meta Platforms", "消费互联网与平台", 18.0, 81.5, 29.0, 24, 27),
  COST: mk("COST", "Costco", "消费品牌与连锁零售", 7.5, 12.6, 24.0, 46, 50),
  WMT: mk("WMT", "Walmart", "消费品牌与连锁零售", 5.2, 24.5, 14.5, 31, 38),
  BABA: mk("BABA", "Alibaba", "消费互联网与平台", 7.5, 38.5, 11.2, 11, 10),
  PDD: mk("PDD", "PDD Holdings", "消费互联网与平台", 24.0, 61.0, 38.0, 11, 10),
  NVO: mk("NVO", "Novo Nordisk", "医疗健康与生物制药", 20.0, 84.5, 48.0, 24, 29),
  LLY: mk("LLY", "Eli Lilly", "医疗健康与生物制药", 28.0, 81.0, 28.0, 38, 48),
};

export const PEER_GRAPH: Record<string, readonly string[]> = {
  MSFT: ["AMZN", "GOOGL", "ORCL", "CRM"],
  NVDA: ["AVGO", "AMD", "TSM", "ASML"],
  MU: ["LRCX", "AMAT", "TSM", "AVGO"],
  AAPL: ["MSFT", "GOOGL", "AMZN", "META"],
  AMZN: ["MSFT", "GOOGL", "WMT", "META"],
  GOOGL: ["META", "MSFT", "AMZN", "ORCL"],
  META: ["GOOGL", "AMZN", "MSFT", "AAPL"],
  TSM: ["ASML", "NVDA", "AVGO", "AMAT"],
  ASML: ["LRCX", "AMAT", "TSM", "NVDA"],
  COST: ["WMT", "AAPL", "AMZN"],
  BABA: ["PDD", "AMZN", "META"],
  PDD: ["BABA", "AMZN", "META"],
  NVO: ["LLY", "MSFT", "COST"],
};
