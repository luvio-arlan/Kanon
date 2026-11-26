import {
  ForecastCreateResponseSchema,
  ForecastListResponseSchema,
  GenericOkResponseSchema,
  IcApprovalMutationResponseSchema,
  IcApprovalsListResponseSchema,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

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
  orgId?: string | null;
  state: "draft" | "in_review" | "approved" | "rejected" | "archived";
  submittedBy?: string;
  decidedBy?: string | null;
  decisionNote: string;
  snapshotHash?: string;
  createdAt: string;
  updatedAt?: string;
}

export async function apiLoadForecastsAndIc(thesisId: string) {
  const [fc, ic] = await Promise.all([
    kanonFetch(`/api/theses/${thesisId}/forecasts`, ForecastListResponseSchema),
    kanonFetch(`/api/theses/${thesisId}/ic`, IcApprovalsListResponseSchema),
  ]);
  const forecasts = fc.ok ? fc.data.forecasts : [];
  const resolvedCount = fc.ok
    ? (fc.data.resolvedCount ?? forecasts.filter((f) => f.outcomeJson !== null).length)
    : 0;
  return {
    forecasts,
    resolvedCount,
    brierScore: fc.ok ? fc.data.brierScore : null,
    approvals: ic.ok ? ic.data.approvals : [],
  };
}

export async function apiCreateForecast(
  thesisId: string,
  input: { question: string; probabilities: number[]; resolveBy: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch(`/api/theses/${thesisId}/forecasts`, ForecastCreateResponseSchema, {
    method: "POST",
    body: input,
    fallbackError: "锁定预测失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiResolveForecast(
  thesisId: string,
  forecastId: string,
  outcomeIndex: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch(`/api/theses/${thesisId}/forecasts`, GenericOkResponseSchema, {
    method: "PATCH",
    body: { forecastId, outcomeIndex },
    fallbackError: "预测结算失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiSubmitIcApproval(
  thesisId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch(`/api/theses/${thesisId}/ic`, IcApprovalMutationResponseSchema, {
    method: "POST",
    body: { op: "submit" },
    fallbackError: "提交审批失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiDecideIcApproval(
  thesisId: string,
  approvalId: string,
  decision: "approved" | "rejected",
  decisionNote?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch(`/api/theses/${thesisId}/ic`, IcApprovalMutationResponseSchema, {
    method: "PATCH",
    body: {
      approvalId,
      decision,
      ...(decisionNote?.trim() ? { decisionNote: decisionNote.trim() } : {}),
    },
    fallbackError: "审批决议失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
