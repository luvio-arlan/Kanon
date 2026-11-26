"use client";

import type { MarketBootstrapResponse, ThesisDetail } from "@kanon/core";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import {
  apiBootstrapTicker,
  apiCreateThesis,
  isDraftSubmittable,
  mergeLiveIntoPreset,
  type NewThesisDraft,
} from "./cockpit-api";

const EMPTY_DRAFT: NewThesisDraft = {
  ticker: "",
  companyName: "",
  sectorTag: "",
  currentPrice: "",
  convictionSummary: "",
};

function mergeBootstrapInfo(prev: NewThesisDraft, info: MarketBootstrapResponse): NewThesisDraft {
  const sameTicker = prev.ticker.trim().toUpperCase() === info.ticker.toUpperCase();
  return {
    ...prev,
    ticker: info.ticker,
    companyName: (sameTicker ? prev.companyName.trim() : "") || info.companyName || info.ticker,
    sectorTag: (sameTicker ? prev.sectorTag.trim() : "") || "美股深度跟踪",
    currentPrice: info.currentPrice !== null ? String(info.currentPrice) : prev.currentPrice,
    latestSecEps: info.latestEps ?? (sameTicker ? prev.latestSecEps : undefined),
    priceHistory: info.sparkline ?? (sameTicker ? prev.priceHistory : undefined),
  };
}

function useTickerResolver() {
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapNote, setBootstrapNote] = useState<string | null>(null);
  const resolvedTickerRef = useRef<string | null>(null);
  const requestSeqRef = useRef(0);

  async function resolveTicker(ticker: string, apply: (info: MarketBootstrapResponse) => void) {
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;
    const seq = ++requestSeqRef.current;
    setBootstrapping(true);
    const info = await apiBootstrapTicker(clean, { quiet: true }).finally(() => {
      if (seq === requestSeqRef.current) setBootstrapping(false);
    });
    if (seq !== requestSeqRef.current) return;
    resolvedTickerRef.current = clean;
    setBootstrapNote(info ? info.notice : "未能自动识别，可继续手动填写公司信息与参考价");
    if (info) apply(info);
  }

  function invalidate(nextTicker?: string) {
    if (nextTicker !== undefined && nextTicker.trim().toUpperCase() === resolvedTickerRef.current) {
      return;
    }
    requestSeqRef.current += 1;
    resolvedTickerRef.current = null;
    setBootstrapping(false);
    setBootstrapNote(null);
  }

  const isResolved = (ticker: string) => ticker.trim().toUpperCase() === resolvedTickerRef.current;

  return { bootstrapping, bootstrapNote, resolveTicker, invalidate, isResolved };
}

function buildDraftMutators(
  setDraft: Dispatch<SetStateAction<NewThesisDraft>>,
  resolver: ReturnType<typeof useTickerResolver>,
) {
  const patch = (p: Partial<NewThesisDraft>) => {
    if (p.ticker !== undefined) resolver.invalidate(p.ticker);
    setDraft((prev) => ({ ...prev, ...p }));
  };
  const pickPreset = (preset: NewThesisDraft) => {
    resolver.invalidate();
    setDraft(preset);
    void resolver.resolveTicker(preset.ticker, (info) =>
      setDraft((prev) => (prev.ticker === preset.ticker ? mergeLiveIntoPreset(prev, info) : prev)),
    );
  };
  return { patch, pickPreset };
}

export function useNewThesisDraft(
  onOpenChange: (open: boolean) => void,
  onCreated: (thesis: ThesisDetail) => void,
) {
  const [draft, setDraft] = useState<NewThesisDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const resolver = useTickerResolver();
  const { patch, pickPreset } = buildDraftMutators(setDraft, resolver);
  const handleBootstrap = () =>
    resolver.resolveTicker(draft.ticker, (info) =>
      setDraft((prev) => mergeBootstrapInfo(prev, info)),
    );
  /** Zero-click identification: resolve once when the ticker field loses focus. */
  const handleTickerBlur = () => {
    if (!draft.ticker.trim() || resolver.isResolved(draft.ticker) || resolver.bootstrapping) return;
    void handleBootstrap();
  };

  async function handleCreate() {
    if (!isDraftSubmittable(draft)) return;
    setSubmitting(true);
    const created = await apiCreateThesis(draft).finally(() => setSubmitting(false));
    if (!created) return;
    setDraft(EMPTY_DRAFT);
    resolver.invalidate();
    onOpenChange(false);
    onCreated(created);
  }

  return {
    draft,
    submitting,
    bootstrapping: resolver.bootstrapping,
    bootstrapNote: resolver.bootstrapNote,
    canSubmit: isDraftSubmittable(draft) && !submitting && !resolver.bootstrapping,
    patch,
    pickPreset,
    handleBootstrap,
    handleTickerBlur,
    handleCreate,
  };
}
