"use client";

import type { AgentProposal } from "@kanon/core";
import { Badge, Button, cn, KANON_ROW_ITEM, KANON_ROW_STAGGER } from "@kanon/ui";
import { IconCheck, IconChecks } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";

const TARGET_LABELS: Record<AgentProposal["target"], string> = {
  variant_perception: "预期差",
  key_debate: "核心分歧",
  pre_mortem: "逆向推演",
  hypothesis_update: "核心假设",
  catalyst_draft: "催化剂",
  cross_check_draft: "产业链互证",
  exit_rule: "离场条件",
};

function ProposalRow({
  proposal,
  applied,
  applying,
  onApply,
}: {
  proposal: AgentProposal;
  applied: boolean;
  applying: boolean;
  onApply: () => Promise<void>;
}) {
  return (
    <motion.div
      variants={KANON_ROW_ITEM}
      className={cn(
        "px-5 py-4 transition-colors duration-200 sm:px-6",
        applied && "bg-status-pass-soft/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-primary">{proposal.title}</span>
            <Badge variant="titanium">{TARGET_LABELS[proposal.target]}</Badge>
          </div>
          {proposal.beforePreview ? (
            <p className="text-xs text-ink-muted line-through opacity-75">
              {proposal.beforePreview}
            </p>
          ) : null}
        </div>
        <Button
          variant={applied ? "ghost" : "outline"}
          size="xs"
          loading={applying}
          disabled={applied || applying}
          onClick={() => void onApply()}
          className="shrink-0 whitespace-nowrap"
        >
          {!applying ? <IconCheck size={13} stroke={1.5} /> : null}
          <span>{applied ? "已采纳" : "采纳"}</span>
        </Button>
      </div>
      <p className="mt-2.5 border-l-2 border-accent-coral/55 pl-3 text-sm leading-[1.7] text-ink-secondary">
        {proposal.content}
      </p>
    </motion.div>
  );
}

function useProposalApplyQueue(
  proposals: readonly AgentProposal[],
  appliedIds: readonly string[],
  onApplyProposals: (proposalIds: readonly string[]) => Promise<void>,
) {
  const [batching, setBatching] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const pending = proposals.filter((p) => !appliedIds.includes(p.id));
  const applyOne = async (id: string) => {
    if (batching || pendingIds.includes(id)) return;
    setPendingIds((prev) => [...prev, id]);
    try {
      await onApplyProposals([id]);
    } finally {
      setPendingIds((prev) => prev.filter((item) => item !== id));
    }
  };
  const applyAll = async () => {
    setBatching(true);
    try {
      await onApplyProposals(pending.map((p) => p.id));
    } finally {
      setBatching(false);
    }
  };
  return { batching, pendingIds, pending, applyOne, applyAll };
}

export function AgentProposalsSection({
  proposals,
  appliedIds,
  onApplyProposals,
}: {
  proposals: readonly AgentProposal[];
  appliedIds: readonly string[];
  onApplyProposals: (proposalIds: readonly string[]) => Promise<void>;
}) {
  const q = useProposalApplyQueue(proposals, appliedIds, onApplyProposals);
  return (
    <motion.section
      variants={KANON_ROW_STAGGER}
      initial="hidden"
      animate="visible"
      className="overflow-hidden rounded-panel border border-hairline bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-5 py-3.5 sm:px-6">
        <span className="text-xs font-medium text-ink-muted">修订提案 · {proposals.length}</span>
        {q.pending.length >= 2 ? (
          <Button variant="ghost" size="xs" loading={q.batching} onClick={() => void q.applyAll()}>
            {!q.batching ? <IconChecks size={13} stroke={1.5} /> : null}
            <span>全部采纳 ({q.pending.length})</span>
          </Button>
        ) : null}
      </div>
      <div className="divide-y divide-hairline">
        {proposals.map((prop) => (
          <ProposalRow
            key={prop.id}
            proposal={prop}
            applied={appliedIds.includes(prop.id)}
            applying={q.batching || q.pendingIds.includes(prop.id)}
            onApply={() => q.applyOne(prop.id)}
          />
        ))}
      </div>
    </motion.section>
  );
}
