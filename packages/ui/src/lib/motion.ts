import type { Transition, Variants } from "framer-motion";

export const KANON_SPRING = {
  type: "spring",
  stiffness: 440,
  damping: 36,
  mass: 0.78,
} as const satisfies Transition;

export const KANON_TRANSITION_FAST = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
} as const satisfies Transition;

export const KANON_STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.015,
    },
  },
};

export const KANON_FADE_UP_ITEM: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: KANON_SPRING,
  },
};

export const KANON_STEP_VARIANTS: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 10,
    filter: "blur(2px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -8,
    filter: "blur(1.5px)",
    transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
  }),
};

export const KANON_CARD_HOVER = {
  y: -2,
  transition: KANON_SPRING,
} as const;

export const KANON_TAP_PRESS = {
  scale: 0.97,
  transition: KANON_TRANSITION_FAST,
} as const;
