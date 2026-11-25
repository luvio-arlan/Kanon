import type { Transition, Variants } from "framer-motion";

export const KANON_SPRING = {
  type: "spring",
  stiffness: 480,
  damping: 38,
  mass: 0.72,
} as const satisfies Transition;

export const KANON_TAB_TRANSITION = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.65,
} as const satisfies Transition;

const KANON_EASE_EDITORIAL = [0.16, 1, 0.3, 1] as const;
const KANON_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const KANON_EASE_EXIT = [0.4, 0, 1, 1] as const;

export const KANON_TRANSITION_FAST = {
  duration: 0.15,
  ease: KANON_EASE_OUT,
} as const satisfies Transition;

export const KANON_MASK_RISE: Variants = {
  hidden: { y: "108%" },
  visible: {
    y: "0%",
    transition: { duration: 0.88, ease: KANON_EASE_EDITORIAL },
  },
};

export const KANON_EDITORIAL_FADE: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.68, ease: KANON_EASE_EDITORIAL },
  },
};

export const KANON_STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.01,
    },
  },
};

export const KANON_FADE_UP_ITEM: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.988 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: KANON_SPRING,
  },
};

export const KANON_LENS_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: {
    opacity: 1,
    transition: { duration: 0.16, ease: KANON_EASE_OUT },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.09, ease: KANON_EASE_EXIT },
  },
};

export const KANON_STEP_VARIANTS: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 6,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: KANON_EASE_OUT },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -4,
    transition: { duration: 0.09, ease: KANON_EASE_EXIT },
  }),
};

export const KANON_CARD_HOVER = {
  y: -2,
  transition: KANON_SPRING,
} as const;

export const KANON_DRAWER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8,
} as const satisfies Transition;

export const KANON_TITLE_SWAP: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
};

export const KANON_ROW_STAGGER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.028, delayChildren: 0.015 },
  },
};

export const KANON_ROW_ITEM: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
};
