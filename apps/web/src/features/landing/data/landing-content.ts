export const OFFICIAL_SITE_URL = "https://kanon.hk";

export interface LandingSpecimen {
  ticker: string;
  companyName: string;
  sectorTag: string;
  currentPrice: number;
  bearTarget: number;
  baseTarget: number;
  bullTarget: number;
  riskReward: number;
  baseCagrPct: number;
  readinessPct: number;
  variantPerception: string;
  hypotheses: readonly { label: string; state: "validated" | "watching" }[];
}

export const LANDING_SPECIMENS: readonly LandingSpecimen[] = [
  {
    ticker: "NVDA",
    companyName: "英伟达",
    sectorTag: "AI 算力基础设施 · 数据中心",
    currentPrice: 132.5,
    bearTarget: 108,
    baseTarget: 198.4,
    bullTarget: 262,
    riskReward: 2.69,
    baseCagrPct: 14.4,
    readinessPct: 96,
    variantPerception:
      "市场将 GPU 视作周期性硬件，但 CUDA + NVLink 机柜级生态正在把一次性资本开支沉淀为长期软件税。",
    hypotheses: [
      { label: "数据中心毛利率守住 72%+", state: "validated" },
      { label: "主权 AI 与推理集群对冲云厂商 ASIC", state: "watching" },
      { label: "Owner FCF 转化率维持 85% 以上", state: "validated" },
    ],
  },
  {
    ticker: "MU",
    companyName: "美光科技",
    sectorTag: "HBM 高带宽内存 · 半导体",
    currentPrice: 108.0,
    bearTarget: 90,
    baseTarget: 175.0,
    bullTarget: 256,
    riskReward: 3.72,
    baseCagrPct: 17.5,
    readinessPct: 100,
    variantPerception:
      "HBM3E 产能锁定与良率壁垒正在重塑存储芯片的供需纪律，周期谷底盈利中枢较历史周期显著抬升。",
    hypotheses: [
      { label: "HBM 市场份额稳步迈向 22%+", state: "validated" },
      { label: "DRAM 合约价与资本开支保持理性", state: "validated" },
      { label: "自由现金流转正覆盖扩产支出", state: "watching" },
    ],
  },
  {
    ticker: "TSM",
    companyName: "台积电",
    sectorTag: "先进制程代工 · CoWoS 封装",
    currentPrice: 192.0,
    bearTarget: 162,
    baseTarget: 274.0,
    bullTarget: 336,
    riskReward: 2.73,
    baseCagrPct: 12.6,
    readinessPct: 92,
    variantPerception:
      "无论推理芯片最终归属 GPU 还是云巨头自研 ASIC，3nm/2nm 与 CoWoS 先进封装的稀缺溢价都不可绕开。",
    hypotheses: [
      { label: "3nm/2nm 节点定价权驱动毛利率 > 55%", state: "validated" },
      { label: "CoWoS 扩产节奏匹配 AI 机柜交付", state: "watching" },
      { label: "海外晶圆厂爬坡对整体折旧可控", state: "watching" },
    ],
  },
];

export interface WorkflowPillar {
  index: string;
  title: string;
  subtitle: string;
  description: string;
  metric: string;
}

export const WORKFLOW_PILLARS: readonly WorkflowPillar[] = [
  {
    index: "01",
    title: "生意滤网与反共识",
    subtitle: "Business Filter & Variant Perception",
    description:
      "四维质量红线一票否决平庸生意，强制写清市场共识、你的非共识洞察以及事前验尸失败路径。",
    metric: "4 维滤网 + Pre-Mortem",
  },
  {
    index: "02",
    title: "可证伪假设 & SEC 审计",
    subtitle: "Falsifiable Hypotheses & XBRL",
    description:
      "将模糊看好拆解为 3–5 条量化红线，直连 SEC EDGAR 一手 10-K/10-Q 财报，自动核验真实 Owner FCF 与 SBC 稀释。",
    metric: "SEC 一手 XBRL 穿透",
  },
  {
    index: "03",
    title: "产业链交叉验证",
    subtitle: "Supply-Chain Cross-Check",
    description:
      "对照上游设备、代工伙伴与竞争对手管理层表述，双向锚定研究标的，构建跨公司的认知图谱。",
    metric: "跨标的图谱联动",
  },
  {
    index: "04",
    title: "双引擎估值与 5×5 赔率",
    subtitle: "Reverse-DCF & 5×5 Sensitivity",
    description:
      "同步推演 PE 与 EV/Owner FCF 估值，实时输出悲观/中性/乐观三情景赔率、隐含预期反推与 5×5 敏感性矩阵。",
    metric: "赔率 × 隐含 CAGR",
  },
  {
    index: "05",
    title: "零杠杆纪律与季度复盘",
    subtitle: "Zero-Leverage Iron Rule",
    description:
      "每笔建仓/加仓行动必须通过系统级零杠杆铁律与情绪自检，季度财报后自动沉淀认知版本快照。",
    metric: "代码级零杠杆拦截",
  },
];

export interface IcPersona {
  code: string;
  role: string;
  focus: string;
}

export const IC_PERSONAS: readonly IcPersona[] = [
  { code: "BULL", role: "多头首席", focus: "验证增长引擎、定价权复利与三情景上行空间" },
  { code: "RED", role: "红队空头", focus: "专攻逻辑盲区、技术颠覆路径与竞争格局恶化" },
  { code: "AUDIT", role: "法务会计", focus: "拆解 SBC 稀释、应收存货异动与真实自由现金流" },
  { code: "CHAIR", role: "投委会主席", focus: "综合赔率与证据强度，给出带仓位上限的行动建议" },
];

export interface CommercialTier {
  id: string;
  name: string;
  badge: string;
  priceLabel: string;
  priceSub: string;
  summary: string;
  features: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
}

export const COMMERCIAL_TIERS: readonly CommercialTier[] = [
  {
    id: "individual",
    name: "独立研究员",
    badge: "现已开放注册",
    priceLabel: "¥0",
    priceSub: "/ 长期免费起步",
    summary: "面向深度个人价值投资者，拥有完全隔离的独立云端研究空间。",
    features: [
      "+86 手机号独立账号与私有数据隔离",
      "完整 5 步研究画布 + SEC XBRL 财报审计",
      "双引擎估值、Reverse-DCF 与 5×5 敏感性矩阵",
      "支持自带 BYOK（DeepSeek / OpenAI / Claude / Gemini）",
      "全量 Markdown / Google Doc / JSON 自由导出",
    ],
    ctaLabel: "免费注册个人空间",
    ctaHref: "/register",
    highlighted: true,
  },
  {
    id: "pro",
    name: "买方专业版 Pro",
    badge: "即将开放",
    priceLabel: "¥198",
    priceSub: "/ 月 · 早鸟锁定",
    summary: "面向高频深研投资者与独立基金经理，内置云端大模型配额与多组合风控。",
    features: [
      "包含独立研究员全部能力",
      "内置官方高速投研 Agent 配额，无需自配 API Key",
      "跨标的组合相关性压力测试与凯利仓位建议",
      "每季度 SEC 财报自动提醒与认知演进时间轴",
      "优先体验 MCP 外部研究接口与移动端同步",
    ],
    ctaLabel: "先注册锁定早鸟资格",
    ctaHref: "/register",
  },
  {
    id: "institutional",
    name: "买方团队 & 机构版",
    badge: "私有部署",
    priceLabel: "Custom",
    priceSub: "按席位与合规架构定制",
    summary: "为家族办公室与私募投研团队打造共享投委会记忆与专属数据库隔离。",
    features: [
      "专属 PostgreSQL / VPC 独立部署与数据主权",
      "投研团队协同审阅、红队批注与 IC 投票留痕",
      "定制化投研备忘录模版与内外部合规归档",
      "创始人 Caius Lu 团队专属交付与深度支持",
    ],
    ctaLabel: "访问官网联系团队",
    ctaHref: OFFICIAL_SITE_URL,
  },
];
