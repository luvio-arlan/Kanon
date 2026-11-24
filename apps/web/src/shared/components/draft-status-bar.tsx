"use client";

import { Button, KANON_TRANSITION_FAST } from "@kanon/ui";
import { IconArrowBackUp, IconCheck, IconCloudDownload, IconRestore } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";

export interface DraftBannerState {
  isDirty: boolean;
  canUndo: boolean;
  hasRecoveredDraft: boolean;
  remoteChanged: boolean;
  undo: () => void;
  revert: () => void;
  save: () => Promise<void>;
  restoreRecovered: () => void;
  dismissRecovered: () => void;
  acceptRemote: () => void;
}

function RecoveryNotice({
  onRestore,
  onDismiss,
}: {
  onRestore: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline bg-titanium-subtle px-4 py-2 text-xs">
      <span className="inline-flex items-center gap-2 text-ink-secondary">
        <IconRestore size={14} stroke={1.5} className="text-accent-coral" />
        <span>检测到上次未保存的本地草稿，是否一键恢复？</span>
      </span>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          忽略
        </Button>
        <Button variant="primary" size="sm" onClick={onRestore}>
          恢复草稿
        </Button>
      </div>
    </div>
  );
}

function RemoteSyncNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline bg-titanium-subtle px-4 py-2 text-xs">
      <span className="inline-flex items-center gap-2 text-ink-secondary">
        <IconCloudDownload size={14} stroke={1.5} className="text-status-pass" />
        <span>档案已通过外部操作（如 Agent 采纳）更新，当前保留你的本地草稿。</span>
      </span>
      <Button variant="outline" size="sm" onClick={onAccept}>
        同步最新版本
      </Button>
    </div>
  );
}

function DirtyActionBar(props: { draft: DraftBannerState; saving: boolean }) {
  const { draft, saving } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline bg-surface px-4 py-2 text-xs shadow-card">
      <span className="inline-flex items-center gap-2 font-medium text-ink-primary">
        <span className="h-1.5 w-1.5 rounded-pill bg-accent-coral" />
        <span>有未保存修改 · 已自动暂存本地草稿</span>
      </span>
      <div className="flex items-center gap-1.5">
        {draft.canUndo ? (
          <Button variant="ghost" size="sm" onClick={draft.undo}>
            <IconArrowBackUp size={13} stroke={1.5} />
            <span>撤销</span>
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={draft.revert}>
          放弃修改
        </Button>
        <Button variant="primary" size="sm" disabled={saving} onClick={() => void draft.save()}>
          <IconCheck size={13} stroke={1.5} />
          <span>{saving ? "保存中..." : "保存 (⌘S)"}</span>
        </Button>
      </div>
    </div>
  );
}

export function DraftStatusBar({ draft, saving }: { draft: DraftBannerState; saving: boolean }) {
  const showAnything = draft.hasRecoveredDraft || draft.remoteChanged || draft.isDirty;
  return (
    <AnimatePresence initial={false}>
      {showAnything ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={KANON_TRANSITION_FAST}
          className="no-print space-y-2"
        >
          {draft.hasRecoveredDraft ? (
            <RecoveryNotice onRestore={draft.restoreRecovered} onDismiss={draft.dismissRecovered} />
          ) : null}
          {draft.remoteChanged ? <RemoteSyncNotice onAccept={draft.acceptRemote} /> : null}
          {draft.isDirty ? <DirtyActionBar draft={draft} saving={saving} /> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
