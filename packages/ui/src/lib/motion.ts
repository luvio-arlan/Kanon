import type { Transition, Variants } from "framer-motion";

export const KANON_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
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
      staggerChildren: 0.055,
      delayChildren: 0.02,
    },
  },
};

export const KANON_FADE_UP_ITEM: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: KANON_SPRING,
  },
};

export const KANON_CARD_HOVER = {
  y: -2,
  transition: KANON_SPRING,
} as const;

export const KANON_TAP_PRESS = {
  scale: 0.985,
  transition: KANON_SPRING,
} as const;
