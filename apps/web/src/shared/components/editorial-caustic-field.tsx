"use client";

import { useEffect, useRef } from "react";

export interface EditorialCausticFieldProps {
  className?: string;
}

export function EditorialCausticField({ className = "" }: EditorialCausticFieldProps) {
  const coralRef = useRef<HTMLDivElement>(null);
  const titaniumRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let rafId = 0;
    let nx = 0;
    let ny = 0;

    function flush() {
      rafId = 0;
      if (coralRef.current) {
        coralRef.current.style.transform = `translate3d(${(nx * 54).toFixed(1)}px, ${(ny * 40).toFixed(1)}px, 0)`;
      }
      if (titaniumRef.current) {
        titaniumRef.current.style.transform = `translate3d(${(-nx * 42).toFixed(1)}px, ${(-ny * 32).toFixed(1)}px, 0)`;
      }
    }

    function onMove(e: PointerEvent) {
      nx = e.clientX / Math.max(1, window.innerWidth) - 0.5;
      ny = e.clientY / Math.max(1, window.innerHeight) - 0.5;
      if (!rafId) rafId = window.requestAnimationFrame(flush);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        ref={coralRef}
        className="kanon-caustic-coral absolute -left-24 -top-24 h-[520px] w-[520px] rounded-pill transition-transform duration-700 ease-out will-change-transform"
      />
      <div
        ref={titaniumRef}
        className="kanon-caustic-titanium absolute -bottom-28 -right-24 h-[560px] w-[560px] rounded-pill transition-transform duration-700 ease-out will-change-transform"
      />
    </div>
  );
}
