"use client";

import type { EmotionState, TradeAction } from "@kanon/core";
import { Button, cn, DisciplineSwitch, Input } from "@kanon/ui";
import { IconAlertCircle, IconShieldLock } from "@tabler/icons-react";

const ACTION_OPTIONS: ReadonlyArray<{ id: TradeAction; label: string }> = [
  { id: "buy", label: "首次建仓" },
  { id: "add", label: "分批加仓" },
  { id: "hold", label: "耐心持有" },
  { id: "trim", label: "纪律减仓" },
  { id: "pass", label: "放弃观望" },
];

const EMOTION_OPTIONS: ReadonlyArray<{ id: EmotionState; label: string }> = [
  { id: "calm", label: "冷静理性" },
  { id: "hesitant", label: "犹豫观望" },
  { id: "fomo", label: "FOMO 焦虑" },
  { id: "fearful", label: "恐慌想割" },
];

export function TradeActionRow({
  action,
  onAction,
}: {
  action: TradeAction;
  onAction: (next: TradeAction) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACTION_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onAction(opt.id)}
          className={cn(
            "cursor-pointer rounded-pill border px-3.5 py-1.5 text-xs font-medium transition-colors",
            action === opt.id
              ? "border-ink-primary bg-ink-primary text-ink-inverse"
              : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function EmotionButtons({
  emotion,
  onEmotion,
}: {
  emotion: EmotionState;
  onEmotion: (next: EmotionState) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-ink-muted">情绪自检</div>
      <div className="flex flex-wrap gap-1.5">
        {EMOTION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onEmotion(opt.id)}
            className={cn(
              "cursor-pointer rounded-control border px-3 py-1.5 text-xs font-medium transition-colors",
              emotion === opt.id
                ? "border-strong bg-muted text-ink-primary"
                : "border-hairline bg-surface text-ink-secondary hover:text-ink-primary",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmotionAndPriceRow(props: {
  emotion: EmotionState;
  priceAnchor: number;
  onEmotion: (next: EmotionState) => void;
  onPrice: (next: number) => void;
}) {
  const highEmotion = props.emotion === "fomo" || props.emotion === "fearful";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <EmotionButtons emotion={props.emotion} onEmotion={props.onEmotion} />
        <div className="w-36">
          <label htmlFor="disc-price" className="mb-1.5 block text-xs text-ink-muted">
            锚定参考价 ($)
          </label>
          <Input
            id="disc-price"
            type="number"
            min={0.5}
            step={0.5}
            value={props.priceAnchor}
            onChange={(e) => props.onPrice(Number(e.target.value) || 0)}
            className="h-8 font-mono tabular-nums"
          />
        </div>
      </div>
      {highEmotion ? (
        <div className="flex items-center gap-1.5 text-xs text-status-warn">
          <IconAlertCircle size={14} stroke={1.5} />
          <span>检测到情绪波动，建议冷静 24 小时后再执行真实仓位动作</span>
        </div>
      ) : null}
    </div>
  );
}

function SignatureButtons(props: {
  disabled: boolean;
  submitting: boolean;
  onCancel?: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2">
      {props.onCancel ? (
        <Button variant="ghost" size="sm" onClick={props.onCancel}>
          收起
        </Button>
      ) : null}
      <Button variant="primary" size="sm" disabled={props.disabled} onClick={props.onSave}>
        <span>{props.submitting ? "正在落库..." : "签字入账"}</span>
      </Button>
    </div>
  );
}

export function DisciplineSignatureStrip(props: {
  noLeverage: boolean;
  positionCap: boolean;
  blocked: boolean;
  submitting: boolean;
  canSubmit: boolean;
  onNoLeverage: (next: boolean) => void;
  onPositionCap: (next: boolean) => void;
  onCancel?: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="space-y-2.5 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5">
          <DisciplineSwitch
            compact
            label="零杠杆确认"
            isSelected={props.noLeverage}
            onChange={props.onNoLeverage}
            tone="danger"
          />
          <DisciplineSwitch
            compact
            label="严守单票仓位上限"
            isSelected={props.positionCap}
            onChange={props.onPositionCap}
          />
        </div>
        <SignatureButtons
          disabled={props.submitting || props.blocked || !props.canSubmit}
          submitting={props.submitting}
          onCancel={props.onCancel}
          onSave={props.onSave}
        />
      </div>
      {props.blocked ? (
        <div className="flex items-center gap-1.5 text-xs font-medium text-status-fail">
          <IconShieldLock size={14} stroke={1.5} />
          <span>未确认「零杠杆铁律」前禁止提交仓位记录</span>
        </div>
      ) : null}
    </div>
  );
}
