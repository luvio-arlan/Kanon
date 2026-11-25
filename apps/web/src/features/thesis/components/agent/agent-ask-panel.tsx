"use client";

import type { AgentAskResponse } from "@kanon/core";
import { Button, Input } from "@kanon/ui";
import { IconSend } from "@tabler/icons-react";
import { useState } from "react";

const QUICK_PROMPTS = [
  "若毛利率下滑 3pct 对买点的影响？",
  "最新 10-K/Q 新增风险措辞是什么？",
  "现价隐含增速最脆弱的核心假设？",
] as const;

function AskQuickChips({
  asking,
  onSelect,
}: {
  asking: boolean;
  onSelect: (chip: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-medium text-ink-muted">投委会定向质询</span>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={asking}
            onClick={() => onSelect(chip)}
            className="cursor-pointer rounded-pill border border-hairline bg-canvas/70 px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

function AskAnswerBox({ answer }: { answer: AgentAskResponse }) {
  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      <p className="whitespace-pre-line text-sm leading-[1.7] text-ink-primary">{answer.answer}</p>
      {answer.citations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 font-mono text-xs text-ink-muted">
          {answer.citations.map((c) => (
            <span key={c} className="rounded-badge border border-hairline px-2 py-0.5">
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AskForm({
  question,
  asking,
  onChange,
  onSubmit,
}: {
  question: string;
  asking: boolean;
  onChange: (next: string) => void;
  onSubmit: (q: string) => void;
}) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(question);
      }}
    >
      <Input
        value={question}
        onChange={(e) => onChange(e.target.value)}
        placeholder="输入压力测试或 SEC 原文核验问题…"
        className="min-w-0 flex-1 text-sm"
      />
      <Button
        type="submit"
        variant="titanium"
        size="sm"
        loading={asking}
        disabled={question.trim().length < 4}
        className="shrink-0"
      >
        {!asking ? <IconSend size={13} stroke={1.5} /> : null}
        <span>质询</span>
      </Button>
    </form>
  );
}

export function AgentAskPanel({
  asking,
  answer,
  onAsk,
}: {
  asking: boolean;
  answer: AgentAskResponse | null;
  onAsk: (question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length >= 4 && !asking) await onAsk(trimmed);
  };

  return (
    <section className="space-y-3 rounded-panel border border-hairline bg-surface p-4 sm:p-5">
      <AskQuickChips
        asking={asking}
        onSelect={(chip) => {
          setQuestion(chip);
          void submit(chip);
        }}
      />
      <AskForm
        question={question}
        asking={asking}
        onChange={setQuestion}
        onSubmit={(q) => void submit(q)}
      />
      {answer ? <AskAnswerBox answer={answer} /> : null}
    </section>
  );
}
