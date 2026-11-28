// Every visible word of the film lives here (fonts are subset from this file).
window.COPY = {
  prelude: "在噪音里，",
  steps: ["商业质量评估", "核心假设与催化剂", "一阶资料印证", "三情景估值与赔率", "纪律与备忘录"],
  m1: {
    title: "生意，先于价格。",
    hero: { label: "投入资本回报率", value: "68.4%" },
    side: [
      { label: "自由现金流转化率", value: "94%" },
      { label: "毛利率", value: "75.0%" },
    ],
  },
  m2: {
    title: "写下必须成立的事。",
    hyps: [
      { id: "H1", text: "推理需求接棒训练", note: "已印证" },
      { id: "H2", text: "CUDA 生态维持系统级溢价", note: "跟踪中" },
      { id: "H3", text: "毛利率中枢守住 70%", note: "连续两季低于 70% 即离场" },
    ],
    horizon: ["今日", "90 天"],
    events: [
      { day: 12, text: "财报电话会" },
      { day: 41, text: "开发者大会" },
      { day: 78, text: "10-K 披露" },
    ],
  },
  m3: {
    title: "每一个数字，都回到原件。",
    tag: "us-gaap:Revenues",
    source: "FORM 10-K · FY2025 · SEC EDGAR",
    verified: "已与原件核对",
    redlineLabel: "跨期措辞比对 · FY2024 → FY2025",
    sentence: ["Supply of certain components", "remained constrained", "has improved", "during the fiscal year."],
  },
  m4: {
    title: "价格里，藏着市场的假设。",
    price: { label: "当前价格", value: "$138.40" },
    implied: { label: "价格隐含增速", value: "11.6%", note: "REVERSE-DCF · 未来十年营收复合增速" },
    rowsLabel: "终值市盈率",
    colsLabel: "三年远期每股收益",
    rows: [25, 28, 31, 34, 37],
    cols: [5.8, 6.3, 6.8, 7.3, 7.8],
    result: [
      { label: "中性情景目标价", value: "$211" },
      { label: "盈亏赔率", value: "2.02×" },
      { label: "年化回报", value: "+15.2%" },
    ],
  },
  m5: {
    title: "四种声音，一个结论。",
    voices: [
      { role: "基本面主笔", line: "ROIC 远高于资本成本" },
      { role: "财务法证", line: "利润与现金流逐项对账" },
      { role: "空头质询", line: "推理降本会否压缩毛利？" },
      { role: "组合纪律", line: "单一持仓上限 6%" },
    ],
    verdict: "通过 · 首仓 2%",
    caption: "AI 只提案，签字的是你。",
    signLabel: "研究者签批",
  },
  m6: {
    label: "杠杆",
    title: "零杠杆，没有例外。",
    ticker: "NVDA",
    tickerName: "英伟达",
    cards: [
      { k: "商业质量", v: "68.4%", s: "投入资本回报率" },
      { k: "核心假设", v: "3 / 3", s: "全部印证" },
      { k: "原件印证", v: "130,497", s: "us-gaap:Revenues" },
      { k: "估值与赔率", v: "$211", s: "赔率 2.02× · 年化 +15.2%" },
      { k: "投委会", v: "通过", s: "四声部 · 一致" },
      { k: "纪律", v: "0.00×", s: "杠杆上限" },
    ],
  },
  coda: {
    word: "KANON",
    en: ["Conviction,", "composed"],
    zh: ["在噪音里，", "谱出自己的确定性。"],
    url: "kanon.hk",
  },
};
