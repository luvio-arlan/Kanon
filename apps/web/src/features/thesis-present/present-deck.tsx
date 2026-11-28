"use client";

import { Button, KanonMark } from "@kanon/ui";
import { IconArrowLeft, IconArrowRight, IconPrinter, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  type PresentSlideData,
  SlideConclusion,
  SlideHypotheses,
  SlideValuation,
} from "./present-slide";
import { SlideExit, SlideGuidance, SlideRedline } from "./present-slide-intel";

const SLIDE_TITLES = [
  "综合结论",
  "三情景估值",
  "核心假设",
  "Redline 变化",
  "指引信誉",
  "离场条件",
] as const;

function PresentHeader(p: { ticker: string; index: number; exitHref: string }) {
  return (
    <header className="no-print flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
      <div className="flex items-center gap-3">
        <KanonMark size={16} accent />
        <span className="font-mono text-xs font-semibold tracking-wider text-ink-primary">
          {p.ticker}
        </span>
        <span className="text-xs text-ink-muted">
          {p.index + 1} / {SLIDE_TITLES.length} · {SLIDE_TITLES[p.index]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <IconPrinter size={15} stroke={1.5} />
          <span>打印</span>
        </Button>
        <Link
          href={p.exitHref}
          aria-label="退出投委会演示"
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
        >
          <IconX size={14} stroke={1.5} />
          <span>退出</span>
        </Link>
      </div>
    </header>
  );
}

function PresentFooter(p: {
  index: number;
  onSelect: (i: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface px-6 py-3">
      <div className="flex flex-wrap items-center gap-1">
        {SLIDE_TITLES.map((title, idx) => (
          <button
            key={title}
            type="button"
            onClick={() => p.onSelect(idx)}
            className={
              idx === p.index
                ? "cursor-pointer rounded-control bg-ink-primary px-2.5 py-1 text-xs font-medium text-ink-inverse"
                : "cursor-pointer rounded-control px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink-primary"
            }
          >
            {idx + 1}. {title}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={p.onPrev} disabled={p.index === 0}>
          <IconArrowLeft size={14} stroke={1.5} />
          <span>上一页</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={p.onNext}
          disabled={p.index === SLIDE_TITLES.length - 1}
        >
          <span>下一页</span>
          <IconArrowRight size={14} stroke={1.5} />
        </Button>
      </div>
    </footer>
  );
}

export function ThesisPresentDeck({ data }: { data: PresentSlideData }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const exitHref = `/thesis/${data.thesis.id}`;
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(SLIDE_TITLES.length - 1, i + 1)), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
      else if (event.key === "Escape") router.push(exitHref);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitHref, goNext, goPrev, router]);

  const slides = [
    <SlideConclusion key="conclusion" data={data} />,
    <SlideValuation key="valuation" data={data} />,
    <SlideHypotheses key="hypotheses" data={data} />,
    <SlideRedline key="redline" data={data} />,
    <SlideGuidance key="guidance" data={data} />,
    <SlideExit key="exit" data={data} />,
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink-primary">
      <PresentHeader ticker={data.thesis.ticker} index={index} exitHref={exitHref} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-10">
        <div className="no-print">{slides[index]}</div>
        <div className="print-only space-y-10">
          {slides.map((slide, idx) => (
            <div
              key={SLIDE_TITLES[idx]}
              className="print-keep-together border-b border-hairline pb-8"
            >
              {slide}
            </div>
          ))}
        </div>
      </main>
      <PresentFooter index={index} onSelect={setIndex} onPrev={goPrev} onNext={goNext} />
    </div>
  );
}
