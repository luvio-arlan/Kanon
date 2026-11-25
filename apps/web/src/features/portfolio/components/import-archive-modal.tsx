"use client";

import type { ThesisDetail } from "@kanon/core";
import { Button, ButtonGroup, ButtonGroupItem, DialogModal, Textarea } from "@kanon/ui";
import { IconCheck, IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { apiImportThesisArchive } from "../lib/portfolio-api";

export interface ImportArchiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (thesis: ThesisDetail, mode: "create_copy" | "overwrite") => void;
}

const IMPORT_MODES = [
  { id: "create_copy", label: "新建独立副本" },
  { id: "overwrite", label: "覆盖同代码档案" },
] as const;

function ImportToolbar({
  mode,
  onMode,
  onFileSelected,
}: {
  mode: "create_copy" | "overwrite";
  onMode: (next: "create_copy" | "overwrite") => void;
  onFileSelected: (file: File | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <ButtonGroup ariaLabel="导入模式">
        {IMPORT_MODES.map((opt) => (
          <ButtonGroupItem
            key={opt.id}
            size="sm"
            selected={mode === opt.id}
            onClick={() => onMode(opt.id)}
          >
            {opt.label}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => onFileSelected(e.target.files?.[0])}
      />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
        <IconUpload size={14} stroke={1.5} />
        <span>选择 .json 文件</span>
      </Button>
    </div>
  );
}

function ImportModalFooter({
  disabled,
  importing,
  onCancel,
  onImport,
}: {
  disabled: boolean;
  importing: boolean;
  onCancel: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onCancel}>
        取消
      </Button>
      <Button variant="primary" size="md" disabled={disabled} onClick={onImport}>
        <IconCheck size={14} stroke={1.5} />
        <span>{importing ? "导入中..." : "验证并导入"}</span>
      </Button>
    </div>
  );
}

export function ImportArchiveModal({ open, onOpenChange, onImported }: ImportArchiveModalProps) {
  const [rawJson, setRawJson] = useState("");
  const [mode, setMode] = useState<"create_copy" | "overwrite">("create_copy");
  const [importing, setImporting] = useState(false);

  async function handleImport() {
    if (!rawJson.trim() || importing) return;
    setImporting(true);
    const res = await apiImportThesisArchive(rawJson, mode).finally(() => setImporting(false));
    if (res) {
      setRawJson("");
      onImported(res.thesis, res.mode);
      onOpenChange(false);
    }
  }

  return (
    <DialogModal
      open={open}
      onOpenChange={onOpenChange}
      title="导入研究备份"
      footer={
        <ImportModalFooter
          disabled={!rawJson.trim() || importing}
          importing={importing}
          onCancel={() => onOpenChange(false)}
          onImport={() => void handleImport()}
        />
      }
    >
      <div className="space-y-4">
        <ImportToolbar
          mode={mode}
          onMode={setMode}
          onFileSelected={(file) => {
            if (file) void file.text().then(setRawJson);
          }}
        />
        <Textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          placeholder='粘贴由 KANON 导出的 archive.json 内容（包含 "thesis" 字段）...'
          className="min-h-[160px] font-mono text-xs"
        />
      </div>
    </DialogModal>
  );
}
