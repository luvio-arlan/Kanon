"use client";

import {
  calculateLinkedOperatingModel,
  deriveDefaultLinkedDrivers,
  type LinkedOperatingDrivers,
  type LinkedOperatingModelResult,
  type OperatingCaseDrivers,
  type SecAnnualFinancial,
} from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconArrowDownRight, IconTableOptions } from "@tabler/icons-react";
import { useState } from "react";
import { DriverNumInput } from "../ev-owner-fcf-card";
import {
  type BaseSeedInputs,
  deriveHistoricalSeed,
  isSeedComplete,
  LinkedSeedSetup,
} from "./linked-seed-setup";

type CaseKey = "bear" | "base" | "bull";

const CASE_ROWS: ReadonlyArray<{ key: CaseKey; label: string }> = [
  { key: "bear", label: "悲观" },
  { key: "base", label: "中性" },
  { key: "bull", label: "乐观" },
];

type NumericDriverField = {
  key: keyof OperatingCaseDrivers;
  label: string;
  step: number;
  read: (v: OperatingCaseDrivers) => number;
};

const CORE_FIELDS: readonly NumericDriverField[] = [
  { key: "revenueCagrPct", label: "营收增速%", step: 1, read: (v) => v.revenueCagrPct },
  {
    key: "targetOperatingMarginPct",
    label: "营业利润%",
    step: 1,
    read: (v) => v.targetOperatingMarginPct,
  },
  {
    key: "daPctOfRev",
    label: "D&A%",
    step: 0.5,
    read: (v) => v.daPctOfRev ?? Number((v.capexPctOfRev * 0.65).toFixed(1)),
  },
  {
    key: "maintenanceCapexPctOfRev",
    label: "维护CapEx%",
    step: 0.5,
    read: (v) => v.maintenanceCapexPctOfRev ?? v.capexPctOfRev,
  },
  {
    key: "nwcPctOfIncrementalRev",
    label: "ΔNWC%",
    step: 0.5,
    read: (v) => v.nwcPctOfIncrementalRev ?? 0,
  },
  {
    key: "evFcfMultiple",
    label: "EV/FCF×",
    step: 1,
    read: (v) => v.evFcfMultiple ?? v.terminalMultiple,
  },
];

function CaseDriverRow(p: {
  label: string;
  val: OperatingCaseDrivers;
  targetPrice: number;
  eps: number;
  ownerFcfB: number;
  growthCapexB: number;
  onPatch: (next: Partial<OperatingCaseDrivers>) => void;
}) {
  return (
    <div className="grid grid-cols-2 items-end gap-2.5 py-3 sm:grid-cols-7">
      <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block">
        <span className="text-xs font-semibold text-ink-primary">{p.label}</span>
        <div className="font-mono text-xs text-accent-coral tabular-nums">
          ${p.targetPrice.toFixed(1)} · EPS ${p.eps.toFixed(1)}
        </div>
        <div className="font-mono text-xs text-ink-muted tabular-nums">
          FCF ${p.ownerFcfB}B{p.growthCapexB > 0 ? ` · 增长CapEx $${p.growthCapexB}B` : ""}
        </div>
      </div>
      {CORE_FIELDS.map((f) => (
        <DriverNumInput
          key={f.key}
          label={f.label}
          value={f.read(p.val)}
          step={f.step}
          onChange={(nextVal) =>
            p.onPatch(
              f.key === "evFcfMultiple"
                ? { evFcfMultiple: nextVal, terminalMultiple: nextVal }
                : { [f.key]: nextVal },
            )
          }
        />
      ))}
    </div>
  );
}

function LinkedModelBody(p: {
  drivers: LinkedOperatingDrivers;
  model: LinkedOperatingModelResult;
  onPatchCase: (key: CaseKey, patch: Partial<OperatingCaseDrivers>) => void;
  onToggleSbc: () => void;
  onApply: () => void;
}) {
  return (
    <>
      <div className="divide-y divide-hairline">
        {CASE_ROWS.map((row) => (
          <CaseDriverRow
            key={row.key}
            label={row.label}
            val={p.drivers[row.key]}
            targetPrice={p.model[row.key].evFcfTargetPrice}
            eps={p.model[row.key].impliedEps}
            ownerFcfB={p.model[row.key].endingOwnerFcfB}
            growthCapexB={p.model[row.key].endingGrowthCapexB}
            onPatch={(patch) => p.onPatchCase(row.key, patch)}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3.5">
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-ink-secondary tabular-nums">
          <span>
            中性远期营收{" "}
            <strong className="text-ink-primary">${p.model.base.endingRevenueB}B</strong> · 期间累积
            FCF <strong className="text-ink-primary">${p.model.base.cumulativeFcfB}B</strong> · 年化{" "}
            <strong className="text-accent-coral">{p.model.base.cagrPct}%</strong>
          </span>
          <button
            type="button"
            onClick={p.onToggleSbc}
            className="cursor-pointer rounded-pill border border-hairline px-2.5 py-0.5 font-sans text-xs text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
          >
            {p.drivers.treatSbcAsCashCost ? "SBC 按现金成本再扣减：开" : "GAAP EBIT 已含 SBC：默认"}
          </button>
        </div>
        <Button variant="primary" size="sm" onClick={p.onApply}>
          <IconArrowDownRight size={14} stroke={1.5} />
          <span>联动写入三情景</span>
        </Button>
      </div>
    </>
  );
}

interface LinkedOperatingCardProps {
  currentPrice: number;
  horizonYears: number;
  currentRevenueB: number;
  currentSharesM: number;
  cashB: number;
  totalDebtB: number;
  secAnnuals: readonly SecAnnualFinancial[];
  latestAnnual: SecAnnualFinancial | null;
  linkedDrivers?: LinkedOperatingDrivers;
  onChangeDrivers: (next: LinkedOperatingDrivers) => void;
  onApplyAllCases: (targets: { bear: number; base: number; bull: number }) => void;
}

function LinkedCardHeader({
  horizonYears,
  endingNetCashB,
}: {
  horizonYears: number;
  endingNetCashB: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <IconTableOptions size={16} stroke={1.5} className="text-ink-muted" />
        <h3 className="text-sm font-semibold text-ink-primary">
          三情景联动经营与现金流模型（{horizonYears} 年）
        </h3>
      </div>
      {endingNetCashB !== null ? (
        <Badge variant="titanium">中性期末净现金 ${endingNetCashB}B</Badge>
      ) : null}
    </div>
  );
}

export function LinkedOperatingCard(props: LinkedOperatingCardProps) {
  const [draftSeed, setDraftSeed] = useState<BaseSeedInputs>(() =>
    deriveHistoricalSeed(props.secAnnuals, props.latestAnnual),
  );
  const drivers = props.linkedDrivers;
  const model = drivers ? calculateLinkedOperatingModel({ ...props, drivers }) : null;
  return (
    <Card className="space-y-4 p-5">
      <LinkedCardHeader
        horizonYears={props.horizonYears}
        endingNetCashB={model ? model.base.endingNetCashB : null}
      />
      {drivers && model ? (
        <LinkedModelBody
          drivers={drivers}
          model={model}
          onPatchCase={(key, patch) =>
            props.onChangeDrivers({ ...drivers, [key]: { ...drivers[key], ...patch } })
          }
          onToggleSbc={() =>
            props.onChangeDrivers({
              ...drivers,
              treatSbcAsCashCost: !(drivers.treatSbcAsCashCost ?? false),
            })
          }
          onApply={() =>
            props.onApplyAllCases({
              bear: model.bear.evFcfTargetPrice,
              base: model.base.evFcfTargetPrice,
              bull: model.bull.evFcfTargetPrice,
            })
          }
        />
      ) : (
        <LinkedSeedSetup
          seed={draftSeed}
          onPatchSeed={(patch) => setDraftSeed((prev) => ({ ...prev, ...patch }))}
          onInitialize={() => {
            if (isSeedComplete(draftSeed))
              props.onChangeDrivers(deriveDefaultLinkedDrivers(draftSeed));
          }}
        />
      )}
    </Card>
  );
}
