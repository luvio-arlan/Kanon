"use client";

import type { MarketBootstrapResponse, ThesisDetail } from "@kanon/core";
import { useState } from "react";
import { apiBootstrapTicker, apiCreateThesis, type NewThesisDraft } from "./cockpit-api";

const EMPTY_DRAFT: NewThesisDraft = {
  ticker: "",
  companyName: "",
  sectorTag: "",
  currentPrice: "150",
  convictionSummary: "",
};

function mergeBootstrapInfo(prev: NewThesisDraft, info: MarketBootstrapResponse): NewThesisDraft {
  const sameTicker = prev.ticker.trim().toUpperCase() === info.ticker.toUpperCase();
  return {
    ...prev,
    ticker: info.ticker,
    companyName: info.companyName || (sameTicker ? prev.companyName.trim() : "") || info.ticker,
    sectorTag: (sameTicker ? prev.sectorTag.trim() : "") || "美股深度跟踪",
    currentPrice: info.currentPrice !== null ? String(info.currentPrice) : prev.currentPrice,
    latestSecEps: info.latestEps ?? (sameTicker ? prev.latestSecEps : undefined),
    priceHistory: info.sparkline ?? (sameTicker ? prev.priceHistory : undefined),
  };
}

export function useNewThesisDraft(
  onOpenChange: (open: boolean) => void,
  onCreated: (thesis: ThesisDetail) => void,
) {
  const [draft, setDraft] = useState<NewThesisDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState({ submitting: false, bootstrapping: false });
  const [bootstrapNote, setBootstrapNote] = useState<string | null>(null);
  const patch = (p: Partial<NewThesisDraft>) => setDraft((prev) => ({ ...prev, ...p }));
  const pickPreset = (preset: NewThesisDraft) => {
    setBootstrapNote(null);
    setDraft(preset);
  };

  async function handleBootstrap() {
    setBusy((b) => ({ ...b, bootstrapping: true }));
    const info = await apiBootstrapTicker(draft.ticker).finally(() =>
      setBusy((b) => ({ ...b, bootstrapping: false })),
    );
    if (!info) return;
    setBootstrapNote(info.notice);
    setDraft((prev) => mergeBootstrapInfo(prev, info));
  }

  async function handleCreate() {
    setBusy((b) => ({ ...b, submitting: true }));
    const created = await apiCreateThesis(draft).finally(() =>
      setBusy((b) => ({ ...b, submitting: false })),
    );
    if (!created) return;
    setDraft(EMPTY_DRAFT);
    setBootstrapNote(null);
    onOpenChange(false);
    onCreated(created);
  }

  return { draft, ...busy, bootstrapNote, patch, pickPreset, handleBootstrap, handleCreate };
}
