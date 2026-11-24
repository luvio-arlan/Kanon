"use client";

import type { EarningsDigest } from "@kanon/core";
import { Badge, Button, cn, Input, Sheet, Textarea } from "@kanon/ui";
import { IconAlertTriangle, IconQuote, IconScissors } from "@tabler/icons-react";
import { useState } from "react";

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

const SIGNAL_REGEX =
  /(CapEx|Gross Margin|Operating Margin|Guidance|HBM|FCF|Free Cash Flow|ROIC|Inventory|Buyback|Backlog|ASP|毛利率|资本开支|指引|库存|回购|现金流|订单|产能)/gi;

interface TextToken {
  id: string;
  text: string;
  highlight: boolean;
}

function tokenizeSignals(text: string): TextToken[] {
  const parts = text.split(SIGNAL_REGEX);
  let cursor = 0;
  return parts.map((part, i) => {
    const token = { id: `tok-${cursor}-${part.length}`, text: part, highlight: i % 2 === 1 };
    cursor += part.length;
    return token;
  });
}

function buildParagraphItems(sourceText: string, digest: EarningsDigest | null) {
  const lines = sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 0) {
    let offset = 0;
    return lines.map((text) => {
      const id = `src-${offset}-${text.length}`;
      offset += text.length + 1;
      return { id, text };
    });
  }
  if (!digest) return [];
  return [
    { id: "dig-guidance", text: digest.guidanceSummary },
    ...digest.quotesWithAnchors.map((q) => ({
      id: `dig-q-${q.sourceAnchor}-${q.topic}`,
      text: `[${q.sourceAnchor}] ${q.topic}：${q.summary}`,
    })),
    ...digest.capexSignals.map((s) => ({
      id: `dig-c-${s.slice(0, 18)}`,
      text: `CapEx 信号：${s}`,
    })),
    ...digest.toneShifts.map((t) => ({ id: `dig-t-${t.slice(0, 18)}`, text: `管理层措辞：${t}` })),
  ];
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

function ParagraphReader({
  paragraphs,
  selected,
  onSelect,
}: {
  paragraphs: readonly { id: string; text: string }[];
  selected: string;
  onSelect: (text: string) => void;
}) {
  const handleSelectOrDrag = (paraText: string) => {
    const sel = window.getSelection()?.toString().trim();
    onSelect(sel && sel.length >= 6 ? sel : paraText);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>拖选任意原文词句，或点击整段直接选中摘录</span>
        <Badge variant="titanium">买方信号词已自动高亮</Badge>
      </div>
      {paragraphs.map((para) => (
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

interface ClipperFooterProps {
  activeQuote: string;
  anchor: string;
  hasExitHandler: boolean;
  onClear: () => void;
  onAnchor: (v: string) => void;
  onClipCheck: () => void;
  onClipExit: () => void;
}

function ClipperFooter(p: ClipperFooterProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-control border border-hairline bg-surface px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2 text-ink-muted">
          <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
            <IconQuote size={13} stroke={1.5} />
            <span>当前摘录片段</span>
          </span>
          {p.activeQuote ? (
            <button
              type="button"
              onClick={p.onClear}
              className="cursor-pointer text-ink-muted hover:text-ink-primary"
            >
              清空
            </button>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-ink-primary">
          {p.activeQuote || "尚未选中片段：请在上方划词或点击任意段落"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={p.anchor}
          onChange={(e) => p.onAnchor(e.target.value)}
          placeholder="出处锚点（如 FY26 Q4 Call）"
          className="min-w-[160px] flex-1"
        />
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
