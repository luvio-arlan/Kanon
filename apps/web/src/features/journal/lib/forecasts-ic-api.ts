export interface ForecastRow {
  id: string;
  question: string;
  probabilitiesJson: number[];
  resolveBy: string;
  lockedHash: string;
  outcomeJson: { outcomeIndex: number; note?: string } | null;
}

export interface IcApprovalRow {
  id: string;
  state: "draft" | "in_review" | "approved" | "rejected" | "archived";
  decisionNote: string;
  createdAt: string;
}

async function fetchJsonObj(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const raw: unknown = await res.json().catch(() => null);
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export async function apiLoadForecastsAndIc(thesisId: string) {
  const [fc, ic] = await Promise.all([
    fetchJsonObj(`/api/theses/${thesisId}/forecasts`),
    fetchJsonObj(`/api/theses/${thesisId}/ic`),
  ]);
  return {
    forecasts: Array.isArray(fc?.forecasts) ? (fc.forecasts as ForecastRow[]) : [],
    brierScore: typeof fc?.brierScore === "number" ? fc.brierScore : null,
    approvals: Array.isArray(ic?.approvals) ? (ic.approvals as IcApprovalRow[]) : [],
  };
}

export async function apiCreateForecast(
  thesisId: string,
  input: { question: string; probabilities: number[]; resolveBy: string },
): Promise<boolean> {
  const res = await fetch(`/api/theses/${thesisId}/forecasts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function apiResolveForecast(
  thesisId: string,
  forecastId: string,
  outcomeIndex: number,
): Promise<boolean> {
  const res = await fetch(`/api/theses/${thesisId}/forecasts`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forecastId, outcomeIndex }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function apiSubmitIcApproval(thesisId: string): Promise<boolean> {
  const res = await fetch(`/api/theses/${thesisId}/ic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "submit" }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function apiDecideIcApproval(
  thesisId: string,
  approvalId: string,
  decision: "approved" | "rejected",
): Promise<boolean> {
  const res = await fetch(`/api/theses/${thesisId}/ic`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId, decision }),
  }).catch(() => null);
  return Boolean(res?.ok);
}
