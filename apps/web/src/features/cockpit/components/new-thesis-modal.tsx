"use client";

import type { ThesisDetail } from "@kanon/core";
import { Button, DialogModal, Input, Textarea } from "@kanon/ui";
import { IconLoader2, IconSparkles, IconWand } from "@tabler/icons-react";
import { INSTITUTIONAL_THESIS_PRESETS, type NewThesisDraft } from "../lib/cockpit-api";
import { useNewThesisDraft } from "../lib/use-new-thesis-draft";

export interface NewThesisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (thesis: ThesisDetail) => void;
}

function PresetQuickPickRow({
  activeTicker,
  onPick,
}: {
  activeTicker: string;
  onPick: (preset: NewThesisDraft) => void;
}) {
  return (
    <div className="mb-4 border-b border-hairline pb-4">
      <div className="mb-2.5 text-xs font-medium text-ink-muted">常用样本</div>
      <div className="flex flex-wrap gap-2">
        {INSTITUTIONAL_THESIS_PRESETS.map((preset) => (
          <button
            key={preset.ticker}
            type="button"
            onClick={() => onPick(preset)}
            className={`cursor-pointer rounded-control border px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTicker === preset.ticker
                ? "border-strong bg-titanium font-semibold text-ink-primary shadow-button"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary"
            }`}
          >
            {preset.ticker} · {preset.companyName}
          </button>
        ))}
      </div>
    </div>
  );
}

function TickerInputControl(props: {
  ticker: string;
  bootstrapping: boolean;
  onChange: (next: string) => void;
  onBootstrap: () => void;
  onBlur: () => void;
}) {
  return (
    <div>
      <label htmlFor="new-ticker" className="mb-1.5 block text-xs font-medium text-ink-muted">
        股票代码
      </label>
      <div className="flex gap-1.5">
        <Input
          id="new-ticker"
          value={props.ticker}
          onChange={(e) => props.onChange(e.target.value.toUpperCase().replace(/\s+/g, ""))}
          onBlur={props.onBlur}
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          onKeyDown={(e) => {
            if (e.key === "Enter" && props.ticker.trim()) {
              e.preventDefault();
              props.onBootstrap();
            }
          }}
          placeholder="如 AVGO / TSM"
          className="font-mono uppercase"
        />
        <Button
          variant="titanium"
          size="sm"
          disabled={props.bootstrapping || !props.ticker.trim()}
          onClick={props.onBootstrap}
          title="自动匹配 SEC CIK、近 5 年 XBRL 与收盘价"
          className="shrink-0"
        >
          {props.bootstrapping ? (
            <IconLoader2 size={14} stroke={1.5} className="animate-spin" />
          ) : (
            <IconWand size={14} stroke={1.5} />
          )}
          <span>识别</span>
        </Button>
      </div>
    </div>
  );
}

function CompanyMetaFields({
  draft,
  onPatch,
}: {
  draft: NewThesisDraft;
  onPatch: (patch: Partial<NewThesisDraft>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className="mb-1.5 block text-xs font-medium text-ink-muted">
            公司名称
          </label>
          <Input
            id="new-name"
            value={draft.companyName}
            onChange={(e) => onPatch({ companyName: e.target.value })}
            placeholder="例如 台积电"
          />
        </div>
        <div>
          <label htmlFor="new-sector" className="mb-1.5 block text-xs font-medium text-ink-muted">
            核心赛道标签
          </label>
          <Input
            id="new-sector"
            value={draft.sectorTag}
            onChange={(e) => onPatch({ sectorTag: e.target.value })}
            placeholder="例如 晶圆代工 · 先进封装"
          />
        </div>
      </div>
      <div>
        <label htmlFor="new-summary" className="mb-1.5 block text-xs font-medium text-ink-muted">
          核心投资逻辑
        </label>
        <Textarea
          id="new-summary"
          value={draft.convictionSummary}
          onChange={(e) => onPatch({ convictionSummary: e.target.value })}
          placeholder="记录初步判断…"
          className="min-h-[76px]"
        />
      </div>
    </>
  );
}

function PriceField({
  value,
  loading,
  onChange,
}: {
  value: string;
  loading: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor="new-price" className="mb-1.5 block text-xs font-medium text-ink-muted">
        当前参考价 ($)
      </label>
      <Input
        id="new-price"
        type="number"
        inputMode="decimal"
        min={0.01}
        step={0.01}
        value={value}
        placeholder={loading ? "正在获取实时报价…" : "识别后自动填入"}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono tabular-nums"
      />
    </div>
  );
}

export function NewThesisModal({ open, onOpenChange, onCreated }: NewThesisModalProps) {
  const s = useNewThesisDraft(onOpenChange, onCreated);

  return (
    <DialogModal
      open={open}
      onOpenChange={onOpenChange}
      title="新建研究标的"
      icon={<IconSparkles size={18} stroke={1.5} />}
      footer={
        <>
          <Button variant="outline" size="md" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" size="md" disabled={!s.canSubmit} onClick={s.handleCreate}>
            {s.submitting ? "创建中..." : "创建并开始研究"}
          </Button>
        </>
      }
    >
      <PresetQuickPickRow activeTicker={s.draft.ticker} onPick={s.pickPreset} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TickerInputControl
            ticker={s.draft.ticker}
            bootstrapping={s.bootstrapping}
            onChange={(ticker) => s.patch({ ticker })}
            onBootstrap={() => void s.handleBootstrap()}
            onBlur={s.handleTickerBlur}
          />
          <PriceField
            value={s.draft.currentPrice}
            loading={s.bootstrapping}
            onChange={(currentPrice) => s.patch({ currentPrice })}
          />
        </div>
        {s.bootstrapNote ? (
          <div className="rounded-control bg-titanium-subtle px-3 py-1.5 font-mono text-xs text-ink-secondary">
            {s.bootstrapNote}
          </div>
        ) : null}
        <CompanyMetaFields draft={s.draft} onPatch={s.patch} />
      </div>
    </DialogModal>
  );
}
