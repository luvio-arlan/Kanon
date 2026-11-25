"use client";

import { useState } from "react";

export function useHasOpened(open: boolean): boolean {
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) {
    setEverOpened(true);
  }
  return everOpened;
}
