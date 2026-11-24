"use client";

import { MotionConfig } from "framer-motion";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";

export type ThemeMode = "light" | "dark";
export interface ThemeOrigin {
  x: number;
  y: number;
}

const STORAGE_KEY = "kanon-theme";
const TRANSITION_STYLE_ID = "kanon-theme-reveal-style";
const TRANSITION_MS = 680;

export const THEME_INIT_SCRIPT = `(() => {
  try {
    const stored = window.localStorage.getItem("${STORAGE_KEY}");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored === "dark" || stored === "light" ? stored : (prefersDark ? "dark" : "light");
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
  } catch {}
})();`;

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

type TransitionDoc = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

interface ThemeContextValue {
  theme: ThemeMode;
  mounted: boolean;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: (origin?: ThemeOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDom(theme: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (storageError) {
    void storageError;
  }
}

function readInitialTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function installCircularRevealStyle(origin: ThemeOrigin, radius: number): HTMLStyleElement {
  document.getElementById(TRANSITION_STYLE_ID)?.remove();
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs><circle cx="50" cy="50" r="42" fill="currentColor" filter="url(#b)"/></svg>';
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const size = radius * 2.5;
  const endX = origin.x - size / 2;
  const endY = origin.y - size / 2;
  const style = document.createElement("style");
  style.id = TRANSITION_STYLE_ID;
  style.textContent = `
    ::view-transition-new(root){-webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;animation:kanon-theme-reveal ${TRANSITION_MS}ms cubic-bezier(0.16,1,0.3,1) both;transform-origin:${origin.x}px ${origin.y}px;will-change:mask-size,mask-position;}
    @keyframes kanon-theme-reveal{from{-webkit-mask-position:${origin.x}px ${origin.y}px;mask-position:${origin.x}px ${origin.y}px;-webkit-mask-size:0 0;mask-size:0 0;}to{-webkit-mask-position:${endX}px ${endY}px;mask-position:${endX}px ${endY}px;-webkit-mask-size:${size}px ${size}px;mask-size:${size}px ${size}px;}}
  `;
  document.head.appendChild(style);
  return style;
}

async function runCircularReveal(apply: () => void, origin?: ThemeOrigin): Promise<void> {
  if (typeof document === "undefined") return apply();
  const doc = document as TransitionDoc;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced || !origin) return apply();
  const x = Math.min(Math.max(origin.x, 0), window.innerWidth);
  const y = Math.min(Math.max(origin.y, 0), window.innerHeight);
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  document.documentElement.classList.add("theme-transitioning");
  const style = installCircularRevealStyle({ x, y }, radius);
  try {
    const t = doc.startViewTransition(() => flushSync(apply));
    await t.finished;
  } catch (err) {
    void err;
  } finally {
    style.remove();
    document.documentElement.classList.remove("theme-transitioning");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readInitialTheme());
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyThemeToDom(next);
  }, []);

  const toggleTheme = useCallback(
    (origin?: ThemeOrigin) => {
      const next: ThemeMode = theme === "dark" ? "light" : "dark";
      void runCircularReveal(() => setTheme(next), origin);
    },
    [setTheme, theme],
  );

  const value = useMemo(
    () => ({ theme, mounted, setTheme, toggleTheme }),
    [theme, mounted, setTheme, toggleTheme],
  );

  return (
    <MotionConfig reducedMotion="user">
      <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    </MotionConfig>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return ctx;
}
