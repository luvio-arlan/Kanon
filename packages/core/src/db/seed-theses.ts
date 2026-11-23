import type {
  BusinessFilter,
  CrossCheck,
  DisciplineEntry,
  ThesisStatus,
} from "../schemas/research";
import type { Hypothesis, SparklinePoint } from "../schemas/thesis";

export interface SeedThesisRecord {
  id: string;
  indexOrder: number;
  ticker: string;
  companyName: string;
  sectorTag: string;
  currentPrice: number;
  horizonYears: number;
  convictionSummary: string;
  status: ThesisStatus;
  lastReviewedLabel: string;
  businessFilter: BusinessFilter;
  hypotheses: [Hypothesis, Hypothesis, Hypothesis];
  crossChecks: CrossCheck[];
  valuationInput: {
    bearEps: number;
    bearPe: number;
    baseEps: number;
    basePe: number;
    bullEps: number;
    bullPe: number;
    priceHistory: SparklinePoint[];
  };
  disciplineEntries: Omit<DisciplineEntry, "createdAt">[];
}

export const SEED_THESIS_RECORDS: readonly SeedThesisRecord[] = [
  {
    id: "thesis-mu",
    indexOrder: 1,
    ticker: "MU",
    companyName: "美光科技",
    sectorTag: "AI 存储 · HBM3E",
    currentPrice: 108,
    horizonYears: 3,
    convictionSummary:
      "HBM3E 良率与产能卡位推动存储周期抬升，数据中心高毛利占比突破一半，盈利中枢结构性上移。",
    status: "active",
    lastReviewedLabel: "2 天前复盘 · Q4 10-K",
    businessFilter: {
      recurringRevenue: "watch",
      pricingPower: "pass",
      capitalReturn: "pass",
      governance: "pass",
      notes: "传统 DRAM 仍有周期性，但 HBM3E 定制化与提前锁单使数据中心业务具备准长期协议特征。",
      vetoReason: "",
    },
    hypotheses: [
      {
        id: "mu-h1",
        title: "HBM3E 12 层封装市占突破 22%",
        metricLabel: "HBM 市占率",
        threshold: "> 22%",
        status: "validated",
        note: "2026 年 HBM 产能已提前锁单售罄，定价能见度在最新管理层电话会中再次确认。",
      },
      {
        id: "mu-h2",
        title: "跨周期综合毛利率站稳 42% 以上",
        metricLabel: "综合毛利率",
        threshold: "底部 > 42%",
        status: "validated",
        note: "高带宽内存溢价显著削弱传统消费电子库存周期的利润回撤幅度。",
      },
      {
        id: "mu-h3",
        title: "行业晶圆资本开支未现 2027 过剩",
        metricLabel: "位元供给增速",
        threshold: "< 20% 同比",
        status: "watching",
        note: "持续追踪海力士与三星未来两个季度的洁净室扩产节奏与 CapEx 指引。",
      },
    ],
    crossChecks: [
      {
        id: "mu-cc-1",
        peerCompany: "英伟达（NVIDIA）",
        peerRole: "downstream",
        topic: "Blackwell 与 Rubin 单卡 HBM3E 容量配比",
        sourceAnchor: "NVDA Q3 电话会 & 架构白皮书",
        statement: "下一代推理机柜单卡高带宽内存配置继续提升 50%，成为算力吞吐关键瓶颈。",
        alignment: "aligned",
        takeaway: "下游需求口径与美光 2026 年产能售罄说法高度互证。",
      },
      {
        id: "mu-cc-2",
        peerCompany: "SK 海力士（SK Hynix）",
        peerRole: "competitor",
        topic: "HBM 产能扩张与常规 DRAM 晶圆挤出效应",
        sourceAnchor: "海力士季报电话会管理层问答",
        statement: "高堆叠 HBM 消耗约 3 倍常规 DRAM 晶圆面积，2026 供给仍偏紧。",
        alignment: "aligned",
        takeaway: "寡头竞争格局理性，未出现恶性价格战信号。",
      },
      {
        id: "mu-cc-3",
        peerCompany: "台积电（TSMC）",
        peerRole: "upstream",
        topic: "CoWoS 先进封装月产能爬坡节奏",
        sourceAnchor: "TSMC 法说会 CapEx 与 CoWoS 扩产说明",
        statement: "CoWoS 产能继续倍增但交期仍紧，高端逻辑与 HBM4 协同验证按计划推进。",
        alignment: "pending",
        takeaway: "需在下一季法说会继续确认 2027 年 CapEx 增速是否拐头。",
      },
    ],
    valuationInput: {
      bearEps: 7.5,
      bearPe: 12,
      baseEps: 12.5,
      basePe: 14,
      bullEps: 16.0,
      bullPe: 16,
      priceHistory: [
        { label: "25Q1", price: 89.4 },
        { label: "25Q2", price: 96.2 },
        { label: "25Q3", price: 102.8 },
        { label: "25Q4", price: 94.5 },
        { label: "26Q1", price: 112.4 },
        { label: "现价", price: 108.0 },
      ],
    },
    disciplineEntries: [
      {
        id: "mu-disc-1",
        action: "buy",
        noLeverageConfirmed: true,
        positionCapConfirmed: true,
        exitRule: "若三星率先大举降价抢单且美光单季毛利率跌破 38%，无条件减半仓复盘。",
        emotion: "calm",
        priceAnchor: 104.5,
        note: "对照 10-K 与上下游电话会后建立底仓，绝不碰任何两倍杠杆 ETF。",
      },
    ],
  },
  {
    id: "thesis-nvda",
    indexOrder: 2,
    ticker: "NVDA",
    companyName: "英伟达",
    sectorTag: "AI 算力 · 全栈平台",
    currentPrice: 138,
    horizonYears: 3,
    convictionSummary:
      "机柜级 NVLink 互联与 CUDA 软件生态护城河稳固，长思考推理需求持续扩大系统级算力溢价。",
    status: "active",
    lastReviewedLabel: "5 天前复盘 · Q3 电话会",
    businessFilter: {
      recurringRevenue: "pass",
      pricingPower: "pass",
      capitalReturn: "pass",
      governance: "pass",
      notes:
        "全栈硬件 + NVLink 网络 + CUDA 软件形成极高转换成本，ROIC 与 FCF 质量处于全球顶尖梯队。",
      vetoReason: "",
    },
    hypotheses: [
      {
        id: "nvda-h1",
        title: "推理算力需求增速快于云厂自研芯片",
        metricLabel: "数据中心年化营收",
        threshold: "> $1800 亿",
        status: "validated",
        note: "推理扩展定律与主权 AI 采购持续拉长旗舰机柜交付周期，定制芯片替代率低于预期。",
      },
      {
        id: "nvda-h2",
        title: "NVLink 网络配套稳守 72%+ 毛利率",
        metricLabel: "稳态毛利率",
        threshold: "> 72%",
        status: "validated",
        note: "Blackwell 机柜级封装良率趋于稳定，软件与高速网络配套维持高定价权。",
      },
      {
        id: "nvda-h3",
        title: "北美四大云厂商资本开支回报兑现",
        metricLabel: "云 AI 收入占比",
        threshold: "> 35%",
        status: "warning",
        note: "证伪红线：若两家及以上云巨头连续下调 CapEx，32 倍中性 PE 估值锚点将明显承压。",
      },
    ],
    crossChecks: [
      {
        id: "nvda-cc-1",
        peerCompany: "微软 / Meta / Google（云厂商）",
        peerRole: "downstream",
        topic: "年度 AI 基础设施 CapEx 强度与云收入变现",
        sourceAnchor: "北美四大云厂 Q3 财报 CapEx 指引",
        statement: "管理层强调投资不足的风险远大于过度投资，但市场开始审视折旧对利润率的拖累。",
        alignment: "divergent",
        takeaway: "短期订单无忧，但 2027 年 ROI 兑现节奏是当前最核心的证伪观察点。",
      },
      {
        id: "nvda-cc-2",
        peerCompany: "台积电（TSMC）",
        peerRole: "upstream",
        topic: "3nm / 2nm 与 CoWoS 先进封装排产",
        sourceAnchor: "TSMC 季度营收结构与 HPC 占比",
        statement: "HPC 高性能计算占比持续攀升，先进封装产能全年满载。",
        alignment: "aligned",
        takeaway: "上游晶圆与封装满载直接印证英伟达出货景气度。",
      },
    ],
    valuationInput: {
      bearEps: 4.4,
      bearPe: 24,
      baseEps: 6.2,
      basePe: 32,
      bullEps: 7.5,
      bullPe: 36,
      priceHistory: [
        { label: "25Q1", price: 116.0 },
        { label: "25Q2", price: 124.5 },
        { label: "25Q3", price: 131.2 },
        { label: "25Q4", price: 128.4 },
        { label: "26Q1", price: 142.8 },
        { label: "现价", price: 138.0 },
      ],
    },
    disciplineEntries: [
      {
        id: "nvda-disc-1",
        action: "hold",
        noLeverageConfirmed: true,
        positionCapConfirmed: true,
        exitRule: "若两家以上北美云巨头明确下调年度 CapEx 且毛利率跌破 70%，执行纪律减仓。",
        emotion: "calm",
        priceAnchor: 138.0,
        note: "当前赔率 1.86× 处于均衡区间，耐心持有观察 H3 指标，不追高加杠杆。",
      },
    ],
  },
];
