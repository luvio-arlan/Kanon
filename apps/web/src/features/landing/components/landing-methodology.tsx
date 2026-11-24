"use client";

import { Badge } from "@kanon/ui";
import { IconCheck, IconX } from "@tabler/icons-react";
import { WORKFLOW_PILLARS } from "../data/landing-content";

const CONTRAST_POINTS = [
  {
    no: "没有闪烁跳动的分时 K 线与情绪噪音",
    yes: "按需校准收盘参考价，用 3 年赔率锚定安全边际",
  },
  {
    no: "没有空泛的 AI 算命对话与黑盒推荐",
    yes: "所有 AI 推演强制回链 SEC 一手 10-K/10-Q 与假设条款",
  },
  {
    no: "没有社交跟单广场与游戏化打卡诱导",
    yes: "私密独立的个人研究档案，完整留痕每次认知修正",
  },
] as const;

function NonGoalsContrastBox() {
  return (
    <div className="rounded-card border border-hairline bg-titanium-subtle/75 p-6 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-primary">
          KANON 的克制原则 · 为什么我们刻意删掉 90% 的行情噪音？
        </h3>
        <span className="font-mono text-xs text-ink-muted">HARD NON-GOALS</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {CONTRAST_POINTS.map((item) => (
          <div
            key={item.no}
            className="space-y-3 rounded-control border border-hairline bg-surface p-4"
          >
            <div className="flex items-start gap-2 text-xs text-ink-muted">
              <IconX size={15} stroke={1.5} className="mt-0.5 shrink-0 text-status-fail" />
              <span className="line-through">{item.no}</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-ink-primary">
              <IconCheck size={16} stroke={1.5} className="mt-0.5 shrink-0 text-status-pass" />
              <span>{item.yes}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingMethodology() {
  return (
    <section id="methodology" className="border-t border-hairline bg-surface/65 py-20">
      <div className="mx-auto max-w-6xl space-y-14 px-5 sm:px-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="space-y-3">
            <Badge variant="mono">01 / FIVE-STEP RESEARCH OS</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
              把买方机构的五步深研纪律，装进你的个人工作台
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-ink-secondary">
            从生意滤网一票否决，到零杠杆执行卡落笔签字，每一步都有确定性数学模型与 SEC
            原始数据校验。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW_PILLARS.map((pillar) => (
            <article
              key={pillar.index}
              className="flex flex-col justify-between rounded-card border border-hairline bg-surface p-5 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-strong hover:shadow-card-hover"
            >
              <div className="space-y-3">
                <span className="font-mono text-xs font-semibold text-accent-coral">
                  STEP {pillar.index}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-ink-primary">{pillar.title}</h3>
                  <p className="mt-0.5 font-mono text-xs text-ink-muted">{pillar.subtitle}</p>
                </div>
                <p className="text-sm leading-relaxed text-ink-secondary">{pillar.description}</p>
              </div>
              <div className="mt-5 border-t border-hairline pt-3 font-mono text-xs text-ink-primary">
                {pillar.metric}
              </div>
            </article>
          ))}
        </div>

        <NonGoalsContrastBox />
      </div>
    </section>
  );
}
