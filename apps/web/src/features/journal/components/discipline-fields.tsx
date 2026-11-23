"use client";

import type { EmotionState, TradeAction } from "@kanon/core";
import { Button, cn, DisciplineSwitch, Input } from "@kanon/ui";
import { IconShieldLock } from "@tabler/icons-react";

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

export function ActionAndIronSwitches(props: {
  action: TradeAction;
  noLeverage: boolean;
  positionCap: boolean;
  onAction: (next: TradeAction) => void;
  onNoLeverage: (next: boolean) => void;
  onPositionCap: (next: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ACTION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => props.onAction(opt.id)}
            className={cn(
              "cursor-pointer rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-colors",
              props.action === opt.id
                ? "border-ink-primary bg-ink-primary text-ink-inverse"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong hover:text-ink-primary",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DisciplineSwitch
          label="铁律一：绝不使用任何杠杆"
          description="严禁融资融券、期权豪赌或两倍杠杆 ETF，仅用自有长钱。"
          isSelected={props.noLeverage}
          onChange={props.onNoLeverage}
          tone="danger"
        />
        <DisciplineSwitch
          label="铁律二：严守单票仓位上限"
          description="即便看错触发证伪红线，也不会造成不可逆组合回撤。"
          isSelected={props.positionCap}
          onChange={props.onPositionCap}
        />
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
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <div className="mb-2 text-xs font-medium text-ink-muted">当前情绪自检</div>
        <div className="flex flex-wrap gap-2">
          {EMOTION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => props.onEmotion(opt.id)}
              className={cn(
                "cursor-pointer rounded-control border px-3 py-1.5 text-xs font-medium transition-colors",
                props.emotion === opt.id
                  ? "border-accent-coral bg-accent-coral-soft text-accent-coral"
                  : "border-hairline bg-muted/50 text-ink-secondary hover:text-ink-primary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="disc-price" className="mb-2 block text-xs font-medium text-ink-muted">
          当前决策价格锚点 ($)
        </label>
        <Input
          id="disc-price"
          type="number"
          min={0.5}
          step={0.5}
          value={props.priceAnchor}
          onChange={(e) => props.onPrice(Number(e.target.value) || 0)}
          className="font-mono tabular-nums"
        />
      </div>
    </div>
  );
}

export function DisciplineSubmitFooter(props: {
  blocked: boolean;
  submitting: boolean;
  canSubmit: boolean;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {props.blocked ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-fail">
          <IconShieldLock size={15} stroke={1.5} />
          未确认「零杠杆铁律」前禁止提交仓位记录
        </span>
      ) : (
        <span className="text-xs text-ink-muted">签字后将永久写入 PostgreSQL 决策复盘台账</span>
      )}
      <Button
        variant="primary"
        size="md"
        disabled={props.submitting || props.blocked || !props.canSubmit}
        onClick={props.onSave}
      >
        <span>{props.submitting ? "正在落库..." : "签字并存入复盘卡"}</span>
      </Button>
    </div>
  );
}
