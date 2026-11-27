import fs from "node:fs";
import { MockAgent, setGlobalDispatcher } from "undici";

const STATE_FILE = process.env.KANON_E2E_STATE_FILE || "";
const METRICS_FILE = process.env.KANON_E2E_METRICS_FILE || "";

function readState() {
  if (!STATE_FILE || !fs.existsSync(STATE_FILE)) return { quotes: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { quotes: {} };
  }
}

function recordCall(key) {
  if (!METRICS_FILE) return;
  let data = { counts: {} };
  try {
    if (fs.existsSync(METRICS_FILE)) data = JSON.parse(fs.readFileSync(METRICS_FILE, "utf8"));
  } catch {
    data = { counts: {} };
  }
  data.counts[key] = (data.counts[key] || 0) + 1;
  fs.writeFileSync(METRICS_FILE, JSON.stringify(data), "utf8");
}

function jsonReply(body, status = 200) {
  return {
    statusCode: status,
    data: JSON.stringify(body),
    responseOptions: { headers: { "content-type": "application/json" } },
  };
}

function buildTickerTable() {
  return {
    0: { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
    1: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
    2: { cik_str: 1046179, ticker: "TSM", title: "TAIWAN SEMICONDUCTOR MANUFACTURING CO LTD" },
    3: { cik_str: 1326801, ticker: "META", title: "Meta Platforms, Inc." },
    4: { cik_str: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" },
    5: { cik_str: 2488, ticker: "AMD", title: "ADVANCED MICRO DEVICES INC" },
  };
}

function buildNvdaSubmissions() {
  return {
    cik: "0001045810",
    name: "NVIDIA CORP",
    tickers: ["NVDA"],
    filings: {
      recent: {
        accessionNumber: [
          "0001045810-25-000023",
          "0001045810-24-000210",
          "0001045810-24-000029",
          "0001045810-23-000017",
        ],
        filingDate: ["2025-02-26", "2024-11-20", "2024-02-21", "2023-02-24"],
        reportDate: ["2025-01-26", "2024-10-27", "2024-01-28", "2023-01-29"],
        form: ["10-K", "10-Q", "10-K", "10-K"],
        primaryDocument: [
          "nvda-20250126.htm",
          "nvda-20241027.htm",
          "nvda-20240128.htm",
          "nvda-20230129.htm",
        ],
        items: [[], [], [], []],
      },
    },
  };
}

function buildNvdaCompanyFacts() {
  const rev = [
    {
      start: "2022-01-31",
      end: "2023-01-29",
      val: 26974000000,
      accn: "0001045810-23-000017",
      fy: 2023,
      fp: "FY",
      form: "10-K",
      filed: "2023-02-24",
    },
    {
      start: "2022-01-31",
      end: "2023-01-29",
      val: 27510000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 60922000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 130497000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
    {
      start: "2024-07-29",
      end: "2024-10-27",
      val: 35082000000,
      accn: "0001045810-24-000210",
      fy: 2025,
      fp: "Q3",
      form: "10-Q",
      filed: "2024-11-20",
    },
  ];
  const gp = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 44301000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 97858000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const oi = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 32972000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 81453000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const ni = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 29760000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 72880000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const cfo = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 28090000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 64089000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const capex = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 1069000000,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 3236000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  // FY2024 EPS: $11.93 pre-split -> $1.193 post 10:1 split (MUST NOT be flagged as restatement!)
  const eps = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 11.93,
      accn: "0001045810-24-000029",
      fy: 2024,
      fp: "FY",
      form: "10-K",
      filed: "2024-02-21",
    },
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 1.193,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 2.94,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const shares = [
    {
      start: "2023-01-30",
      end: "2024-01-28",
      val: 24940000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
    {
      start: "2024-01-29",
      end: "2025-01-26",
      val: 24804000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const cash = [
    {
      end: "2025-01-26",
      val: 43210000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  const debt = [
    {
      end: "2025-01-26",
      val: 8463000000,
      accn: "0001045810-25-000023",
      fy: 2025,
      fp: "FY",
      form: "10-K",
      filed: "2025-02-26",
    },
  ];
  return {
    cik: 1045810,
    entityName: "NVIDIA CORP",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: rev } },
        GrossProfit: { units: { USD: gp } },
        OperatingIncomeLoss: { units: { USD: oi } },
        NetIncomeLoss: { units: { USD: ni } },
        NetCashProvidedByUsedInOperatingActivities: { units: { USD: cfo } },
        PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: capex } },
        EarningsPerShareDiluted: { units: { "USD/shares": eps } },
        WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares } },
        CashCashEquivalentsAndShortTermInvestments: { units: { USD: cash } },
        LongTermDebt: { units: { USD: debt } },
      },
    },
  };
}

function buildFilingHtml(year, includeExportControl) {
  const extraRisk = includeExportControl
    ? "<p>Expanded export control restrictions and licensing mandates on advanced data center accelerators could materially reduce our international revenue and constrain product shipments to restricted jurisdictions.</p>"
    : "";
  return `<!doctype html><html><body>
  <p>NVIDIA Corporation | ${year} Form 10-K | 1</p>
  <p>Item 1A. Risk Factors</p>
  <p>Our semiconductor supply chain relies on third-party foundry and advanced packaging partners whose manufacturing capacity constraints may delay product ramps across fiscal ${year}.</p>
  <p>Demand for accelerated computing platforms depends on cloud hyperscaler capital expenditure cycles and sustained adoption of generative artificial intelligence workloads.</p>
  <p>Intense competition from custom silicon accelerators developed internally by major cloud customers could pressure pricing and gross margins over time.</p>
  ${extraRisk}
  <p>Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations</p>
  <p>Data center revenue expanded significantly during fiscal ${year} driven by Hopper and Blackwell architecture deployments across global cloud service providers.</p>
  <p>Gross margin remained elevated due to favorable data center product mix while operating expenses scaled moderately to support next-generation platform engineering.</p>
  <p>Operating cash flow funded ongoing capital expenditures, share repurchases, and quarterly cash dividends while maintaining a net cash balance sheet.</p>
  <p>Item 8. Financial Statements and Supplementary Data</p>
  </body></html>`;
}

function resolveMockBasePrice(ticker) {
  const state = readState();
  const override = state.quotes?.[ticker];
  if (typeof override === "number" && override > 0) return override;
  if (ticker === "SPY") return 590;
  if (ticker === "NVDA") return 135;
  return 150;
}

function buildWeekdayTimestamps(nowSec, lookbackDays) {
  const daySec = 86400;
  const timestamps = [];
  for (let cursor = nowSec - lookbackDays * daySec; cursor <= nowSec; cursor += daySec) {
    const dow = new Date(cursor * 1000).getUTCDay();
    if (dow !== 0 && dow !== 6) timestamps.push(cursor);
  }
  return timestamps;
}

function buildOhlcSeries(n, basePrice) {
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const adjCloses = [];
  const volumes = [];
  for (let i = 0; i < n; i += 1) {
    const frac = n > 1 ? i / (n - 1) : 1;
    const price = i === n - 1 ? basePrice : Number((basePrice * (0.88 + 0.12 * frac)).toFixed(2));
    opens.push(price);
    highs.push(Number((price * 1.01).toFixed(2)));
    lows.push(Number((price * 0.99).toFixed(2)));
    closes.push(price);
    adjCloses.push(price);
    volumes.push(42000000);
  }
  return { opens, highs, lows, closes, adjCloses, volumes };
}

function buildYahooEvents(ticker, timestamps, nowSec) {
  const n = timestamps.length;
  const daySec = 86400;
  const splitTs = Math.floor(Date.parse("2024-06-10T00:00:00Z") / 1000);
  const div1Ts = timestamps[Math.max(0, n - 90)] ?? nowSec - 90 * daySec;
  const div2Ts = timestamps[Math.max(0, n - 20)] ?? nowSec - 20 * daySec;
  const divAmt = ticker === "SPY" ? 1.75 : 0.01;
  return {
    dividends: {
      [String(div1Ts)]: { amount: divAmt, date: div1Ts },
      [String(div2Ts)]: { amount: divAmt, date: div2Ts },
    },
    ...(ticker === "NVDA"
      ? {
          splits: {
            [String(splitTs)]: { date: splitTs, numerator: 10, denominator: 1, splitRatio: "10:1" },
          },
        }
      : {}),
  };
}

function buildYahooChart(ticker) {
  const basePrice = resolveMockBasePrice(ticker);
  const nowSec = Math.floor(Date.now() / 1000);
  const timestamps = buildWeekdayTimestamps(nowSec, 410);
  const n = timestamps.length;
  const ohlc = buildOhlcSeries(n, basePrice);
  const events = buildYahooEvents(ticker, timestamps, nowSec);
  return {
    chart: {
      result: [
        {
          meta: {
            currency: "USD",
            exchangeName: "NMS",
            shortName: ticker === "NVDA" ? "NVIDIA Corporation" : ticker,
            regularMarketPrice: basePrice,
            chartPreviousClose: ohlc.closes[Math.max(0, n - 2)] ?? basePrice,
            regularMarketChangePercent: 0.85,
            regularMarketDayHigh: Number((basePrice * 1.015).toFixed(2)),
            regularMarketDayLow: Number((basePrice * 0.985).toFixed(2)),
            fiftyTwoWeekHigh: Number((basePrice * 1.15).toFixed(2)),
            fiftyTwoWeekLow: Number((basePrice * 0.72).toFixed(2)),
            regularMarketVolume: 42000000,
            regularMarketTime: nowSec,
          },
          timestamp: timestamps,
          events,
          indicators: {
            quote: [
              {
                open: ohlc.opens,
                high: ohlc.highs,
                low: ohlc.lows,
                close: ohlc.closes,
                volume: ohlc.volumes,
              },
            ],
            adjclose: [{ adjclose: ohlc.adjCloses }],
          },
        },
      ],
      error: null,
    },
  };
}

const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect(/^(127\.0\.0\.1|localhost)(:\d+)?$/);

const secWww = agent.get("https://www.sec.gov");
secWww
  .intercept({ path: "/files/company_tickers.json", method: "GET" })
  .reply(() => {
    recordCall("www.sec.gov/files/company_tickers.json");
    return jsonReply(buildTickerTable());
  })
  .persist();
secWww
  .intercept({
    path: /^\/Archives\/edgar\/data\/1045810\/000104581025000023\/.*\.htm$/,
    method: "GET",
  })
  .reply(() => {
    recordCall("www.sec.gov/Archives/nvda-2025");
    return {
      statusCode: 200,
      data: buildFilingHtml(2025, true),
      responseOptions: { headers: { "content-type": "text/html" } },
    };
  })
  .persist();
secWww
  .intercept({
    path: /^\/Archives\/edgar\/data\/1045810\/000104581024000029\/.*\.htm$/,
    method: "GET",
  })
  .reply(() => {
    recordCall("www.sec.gov/Archives/nvda-2024");
    return {
      statusCode: 200,
      data: buildFilingHtml(2024, false),
      responseOptions: { headers: { "content-type": "text/html" } },
    };
  })
  .persist();

const secData = agent.get("https://data.sec.gov");
secData
  .intercept({ path: /^\/submissions\/CIK\d+\.json$/, method: "GET" })
  .reply((opts) => {
    recordCall(`data.sec.gov${opts.path}`);
    return jsonReply(buildNvdaSubmissions());
  })
  .persist();
secData
  .intercept({ path: /^\/api\/xbrl\/companyfacts\/CIK\d+\.json$/, method: "GET" })
  .reply((opts) => {
    recordCall(`data.sec.gov${opts.path}`);
    return jsonReply(buildNvdaCompanyFacts());
  })
  .persist();

const yahoo = agent.get("https://query1.finance.yahoo.com");
yahoo
  .intercept({ path: /^\/v8\/finance\/chart\/([^/?]+).*$/, method: "GET" })
  .reply((opts) => {
    const match = /^\/v8\/finance\/chart\/([^/?]+)/.exec(opts.path);
    const ticker = decodeURIComponent(match?.[1] || "NVDA").toUpperCase();
    recordCall(`query1.finance.yahoo.com/chart/${ticker}`);
    return jsonReply(buildYahooChart(ticker));
  })
  .persist();

setGlobalDispatcher(agent);
