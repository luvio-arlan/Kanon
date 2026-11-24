"use client";

import type { PublicUser } from "@kanon/core";
import { LandingCommercialSections } from "./landing-commercial";
import { LandingHero } from "./landing-hero";
import { LandingMethodology } from "./landing-methodology";
import { LandingTopbar } from "./landing-topbar";

export interface LandingShellProps {
  currentUser: PublicUser | null;
  isDemo: boolean;
}

export function LandingShell({ currentUser, isDemo }: LandingShellProps) {
  return (
    <div className="kanon-ambient-canvas min-h-dvh">
      <LandingTopbar currentUser={currentUser} isDemo={isDemo} />
      <main>
        <LandingHero />
        <LandingMethodology />
        <LandingCommercialSections />
      </main>
    </div>
  );
}
