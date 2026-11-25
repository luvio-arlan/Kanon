"use client";

import type { EarningsDigest, SecFilingItem } from "@kanon/core";
import { Badge, cn, Input, Sheet, Textarea } from "@kanon/ui";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import {
  buildParagraphItems,
  filterParagraphsBySignal,
  SIGNAL_FILTER_OPTIONS,
  type SignalCategory,
  tokenizeSignals,
} from "../lib/cross-check-helpers";
import { ClipperFooter } from "./filing/clipper-footer";
import { FilingLivePanel } from "./filing/filing-live-panel";

export interface SourceClipperSheetProps {
  open: boolean;
  ticker: string;
  filings?: readonly SecFilingItem[];
  sourceText: string;
  digest: EarningsDigest | null;
  onChangeSource: (next: string) => void;
  onOpenChange: (open: boolean) => void;
  onClipCrossCheck: (excerpt: string, anchor: string) => void;
  onClipExitRule?: (excerpt: string) => void;
}

function HighlightedText({ text, keyword }: { text: string; keyword: string }) {
  const cleanKw = keyword.trim().toLowerCase();
  return (
    <>
      {tokenizeSignals(text).map((tok) => {
        const kwHit = cleanKw.length >= 2 && tok.text.toLowerCase().includes(cleanKw);
        return tok.highlight || kwHit ? (
          <mark
            key={tok.id}
            className="rounded-badge bg-accent-coral-soft px-1 py-0.5 font-medium text-ink-primary"
          >
            {tok.text}
          </mark>
        ) : (
          <span key={tok.id}>{tok.text}</span>
        );
      })}
    </>
  );
}

function SignalCategoryPills({
  category,
  onSelect,
}: {
  category: SignalCategory;
  onSelect: (next: SignalCategory) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SIGNAL_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onSelect(opt.id)}
          className={cn(
            "cursor-pointer rounded-pill border px-2.5 py-1 text-xs font-medium leading-none transition-colors",
            category === opt.id
              ? "border-strong bg-titanium text-ink-primary"
              : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function KeywordSearchInput({
  keyword,
  onChange,
}: {
  keyword: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="relative">
      <IconSearch
        size={14}
        stroke={1.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <Input
        value={keyword}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索原文关键词（如 Blackwell, margin, capex）…"
        className="pl-8 text-xs"
      />
    </div>
  );
}

function ParagraphItemCard(p: {
  text: string;
  keyword: string;
  isSelected: boolean;
  onDragSelect: () => void;
  onSelectWhole: () => void;
}) {
  return (
    <article
      onMouseUp={p.onDragSelect}
      className={cn(
        "group block w-full select-text rounded-control border p-3.5 text-left text-sm leading-relaxed transition-colors",
        p.isSelected
          ? "border-accent-coral bg-accent-coral-soft/40 text-ink-primary"
          : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
      )}
    >
      <p className="cursor-text">
        <HighlightedText text={p.text} keyword={p.keyword} />
      </p>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={p.onSelectWhole}
          className="cursor-pointer text-xs font-medium text-ink-muted transition-colors hover:text-accent-coral"
        >
          {p.isSelected ? "已选整段" : "选取整段"}
        </button>
      </div>
    </article>
  );
}

function ParagraphReader({
  paragraphs,
  selected,
  onSelect,
}: {
  paragraphs: readonly { id: string; text: string }[];
  selected: string;
  onSelect: (text: string) => void;
}) {
  const [category, setCategory] = useState<SignalCategory>("all");
  const [keyword, setKeyword] = useState("");
  const bySignal = filterParagraphsBySignal(paragraphs, category);
  const kwLower = keyword.trim().toLowerCase();
  const filtered =
    kwLower.length >= 2 ? bySignal.filter((p) => p.text.toLowerCase().includes(kwLower)) : bySignal;
  const handleSelectOrDrag = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length >= 6) onSelect(sel);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>拖选任意原文词句，或点击「选取整段」摘录</span>
        <Badge variant="titanium">
          命中 {filtered.length}/{paragraphs.length} 段
        </Badge>
      </div>
      <KeywordSearchInput keyword={keyword} onChange={setKeyword} />
      <SignalCategoryPills category={category} onSelect={setCategory} />
      {filtered.map((para) => (
        <ParagraphItemCard
          key={para.id}
          text={para.text}
          keyword={keyword}
          isSelected={selected === para.text}
          onDragSelect={handleSelectOrDrag}
          onSelectWhole={() => onSelect(para.text)}
        />
      ))}
    </div>
  );
}

function EmptySourcePrompt({
  sourceText,
  onChangeSource,
}: {
  sourceText: string;
  onChangeSource: (next: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-panel border border-hairline bg-surface p-5">
      <div className="text-sm font-semibold text-ink-primary">财报原文 / 电话会纪要</div>
      <Textarea
        variant="editorial"
        value={sourceText}
        onChange={(e) => onChangeSource(e.target.value)}
        placeholder="粘贴财报或电话会原文，自动高亮核心信号词…"
        className="min-h-[160px]"
      />
    </div>
  );
}

export function SourceClipperSheet(props: SourceClipperSheetProps) {
  const [selected, setSelected] = useState("");
  const [anchor, setAnchor] = useState(props.digest?.quarterLabel ?? "Earnings Call / 10-K");
  const paragraphs = buildParagraphItems(props.sourceText, props.digest);
  const activeQuote = selected.trim();
  const commitClip = (fn: () => void) => {
    fn();
    setSelected("");
    props.onOpenChange(false);
  };
  const clipCheck = () =>
    activeQuote &&
    commitClip(() => props.onClipCrossCheck(activeQuote, anchor.trim() || "一阶原文精读"));
  const clipExit = () =>
    activeQuote && props.onClipExitRule && commitClip(() => props.onClipExitRule?.(activeQuote));

  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`原文精读 · ${props.ticker}`}
      footer={
        <ClipperFooter
          activeQuote={activeQuote}
          anchor={anchor}
          hasExitHandler={Boolean(props.onClipExitRule)}
          onClear={() => setSelected("")}
          onAnchor={setAnchor}
          onClipCheck={clipCheck}
          onClipExit={clipExit}
        />
      }
    >
      <FilingLivePanel
        ticker={props.ticker}
        filings={props.filings ?? []}
        onLoadedText={(text, nextAnchor) => {
          props.onChangeSource(text);
          setAnchor(nextAnchor);
        }}
        onSelectExcerpt={(snippet) => setSelected(snippet)}
      />
      {paragraphs.length > 0 ? (
        <ParagraphReader paragraphs={paragraphs} selected={selected} onSelect={setSelected} />
      ) : (
        <EmptySourcePrompt sourceText={props.sourceText} onChangeSource={props.onChangeSource} />
      )}
    </Sheet>
  );
}
