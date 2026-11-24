"use client";

import { KANON_TRANSITION_FAST } from "@kanon/ui";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function RouteProgressBar() {
  const pathname = usePathname();
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    setActivePath(pathname);
    const timer = window.setTimeout(() => setActivePath(null), 320);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <AnimatePresence>
      {activePath ? (
        <motion.div
          key={activePath}
          aria-hidden="true"
          initial={{ scaleX: 0.12, opacity: 0.9 }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={KANON_TRANSITION_FAST}
          className="no-print pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-accent-coral"
        />
      ) : null}
    </AnimatePresence>
  );
}
