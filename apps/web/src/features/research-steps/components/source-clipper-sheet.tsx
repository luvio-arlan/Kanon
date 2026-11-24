"use client";

import type { EarningsDigest } from "@kanon/core";
import { Badge, Button, cn, Input, Sheet, Textarea } from "@kanon/ui";
import { IconAlertTriangle, IconQuote, IconScissors } from "@tabler/icons-react";
import { useState } from "react";
import {
  buildParagraphItems,
  filterParagraphsBySignal,
  SIGNAL_FILTER_OPTIONS,
  type SignalCategory,
  tokenizeSignals,
} from "../lib/cross-check-helpers";

export interface SourceClipperSheetProps {
  open: boolean;
  ticker: string;
  sourceText: string;
  digest: EarningsDigest | null;
  onChangeSource: (next: string) => void;
  onOpenChange: (open: boolean) => void;
  onClipCrossCheck: (excerpt: string, anchor: string) => void;
  onClipExitRule?: (excerpt: string) => void;
}

function HighlightedText({ text }: { text: string }) {
  return (
    <>
      {tokenizeSignals(text).map((tok) =>
        tok.highlight ? (
          <mark
            key={tok.id}
            className="rounded-sm bg-accent-coral-soft px-1 py-0.5 font-medium text-ink-primary"
          >
            {tok.text}
          </mark>
        ) : (
          <span key={tok.id}>{tok.text}</span>
        ),
      )}
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
  const filtered = filterParagraphsBySignal(paragraphs, category);
  const handleSelectOrDrag = (paraText: string) => {
    const sel = window.getSelection()?.toString().trim();
    onSelect(sel && sel.length >= 6 ? sel : paraText);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>拖选任意原文词句，或点击整段直接选中摘录</span>
        <Badge variant="titanium">
          命中 {filtered.length}/{paragraphs.length} 段
        </Badge>
      </div>
      <SignalCategoryPills category={category} onSelect={setCategory} />
      {filtered.map((para) => (
        <button
          key={para.id}
          type="button"
          onClick={() => handleSelectOrDrag(para.text)}
          className={cn(
            "block w-full cursor-pointer rounded-control border p-3.5 text-left text-sm leading-relaxed transition-colors",
            selected === para.text
              ? "border-accent-coral bg-accent-coral-soft/40 text-ink-primary"
              : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
          )}
        >
          <HighlightedText text={para.text} />
        </button>
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
    <div className="space-y-3 rounded-card border border-hairline bg-titanium-subtle p-5">
      <div className="text-sm font-semibold text-ink-primary">粘贴财报原文或电话会纪要</div>
      <p className="text-xs leading-relaxed text-ink-secondary">
        将 Earnings Call Q&A、10-K 风险段落粘贴至下方，精读器将自动高亮
        CapEx、毛利率、指引与库存信号词，支持划词一键摘录。
      </p>
      <Textarea
        value={sourceText}
        onChange={(e) => onChangeSource(e.target.value)}
        placeholder="在此粘贴多段财报/电话会原文..."
        className="min-h-[160px]"
      />
    </div>
  );
}

function ClipperQuotePreview({ quote, onClear }: { quote: string; onClear: () => void }) {
  return (
    <div className="rounded-control border border-hairline bg-surface px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2 text-ink-muted">
        <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
          <IconQuote size={13} stroke={1.5} />
          <span>当前摘录片段</span>
        </span>
        {quote ? (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-ink-muted hover:text-ink-primary"
          >
            清空
          </button>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-ink-primary">
        {quote || "尚未选中片段：请在上方划词或点击任意段落"}
      </p>
    </div>
  );
}

function ClipperFooter(p: {
  activeQuote: string;
  anchor: string;
  hasExitHandler: boolean;
  onClear: () => void;
  onAnchor: (v: string) => void;
  onClipCheck: () => void;
  onClipExit: () => void;
}) {
  return (
    <div className="space-y-3">
      <ClipperQuotePreview quote={p.activeQuote} onClear={p.onClear} />
      <div className="space-y-2">
        <Input
          value={p.anchor}
          onChange={(e) => p.onAnchor(e.target.value)}
          placeholder="出处锚点（如 FY26 Q4 Call / 10-K）"
          className="w-full"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="titanium" size="sm" disabled={!p.activeQuote} onClick={p.onClipCheck}>
            <IconScissors size={14} stroke={1.5} />
            <span>摘录至 Step 3 互证</span>
          </Button>
          {p.hasExitHandler ? (
            <Button variant="primary" size="sm" disabled={!p.activeQuote} onClick={p.onClipExit}>
              <IconAlertTriangle size={14} stroke={1.5} />
              <span>带入 Step 5 红线</span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SourceClipperSheet(props: SourceClipperSheetProps) {
  const [selected, setSelected] = useState("");
  const [anchor, setAnchor] = useState(props.digest?.quarterLabel ?? "Earnings Call / 10-K");
  const paragraphs = buildParagraphItems(props.sourceText, props.digest);
  const activeQuote = selected.trim();

  const clipCheck = () => {
    if (!activeQuote) return;
    props.onClipCrossCheck(activeQuote, anchor.trim() || "一阶原文精读");
    setSelected("");
    props.onOpenChange(false);
  };
  const clipExit = () => {
    if (!activeQuote || !props.onClipExitRule) return;
    props.onClipExitRule(activeQuote);
    setSelected("");
    props.onOpenChange(false);
  };

  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`一阶原文精读器 · ${props.ticker}`}
      subtitle="高亮买方关键信号词 · 划词一键沉淀为交叉验证或离场红线"
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
      {paragraphs.length > 0 ? (
        <ParagraphReader paragraphs={paragraphs} selected={selected} onSelect={setSelected} />
      ) : (
        <EmptySourcePrompt sourceText={props.sourceText} onChangeSource={props.onChangeSource} />
      )}
    </Sheet>
  );
}
