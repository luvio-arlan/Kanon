"use client";

import {
  KANON_EDITORIAL_FADE,
  KANON_MASK_RISE,
  KANON_STAGGER_CONTAINER,
  KanonMark,
} from "@kanon/ui";
import { motion } from "framer-motion";
import Image from "next/image";
import { EditorialCausticField } from "@/shared/components/editorial-caustic-field";

const OFFICIAL_SITE_URL = "https://kanon.hk";

function MonolithHeader() {
  return (
    <div className="flex items-center">
      <a
        href={OFFICIAL_SITE_URL}
        aria-label="返回 KANON 官网"
        title="返回 KANON 官网"
        className="inline-flex items-center gap-3.5 text-ink-primary transition-opacity hover:opacity-75"
      >
        <KanonMark size={24} accent />
        <span className="text-sm font-medium tracking-[0.26em]">KANON</span>
      </a>
    </div>
  );
}

function MonolithHeadline() {
  return (
    <motion.div
      variants={KANON_STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={KANON_EDITORIAL_FADE} className="h-[1.5px] w-9 bg-accent-coral" />
      <h2 className="font-serif text-6xl font-normal leading-[0.94] tracking-[-0.03em] text-ink-primary xl:text-7xl">
        <span className="block overflow-hidden pb-2">
          <motion.span variants={KANON_MASK_RISE} className="block">
            Conviction,
          </motion.span>
        </span>
        <span className="-mt-2 block overflow-hidden pb-3">
          <motion.span variants={KANON_MASK_RISE} className="block">
            <em className="kanon-serif-italic pr-1">composed</em>
            <span className="text-accent-coral">.</span>
          </motion.span>
        </span>
      </h2>
      <motion.p
        variants={KANON_EDITORIAL_FADE}
        className="text-lg font-light tracking-[0.06em] text-ink-primary/85 xl:text-xl"
      >
        在噪音里，谱出自己的确定性。
      </motion.p>
    </motion.div>
  );
}

export function AuthMonolithStage() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-hairline bg-canvas lg:col-span-6 lg:flex">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Image
          src="/images/titanium-monolith.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="kanon-editorial-photo scale-[1.03] object-cover object-[68%_center]"
        />
        <div className="kanon-editorial-split-scrim absolute inset-0" />
        <EditorialCausticField />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
        <MonolithHeader />
        <MonolithHeadline />
        <div aria-hidden="true" className="h-5" />
      </div>
    </aside>
  );
}
