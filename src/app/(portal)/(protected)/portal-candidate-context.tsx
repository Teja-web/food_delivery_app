"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PortalCandidateContextValue } from "@/operations/portal";

const PortalCandidateContext = createContext<PortalCandidateContextValue | null>(null);

export function PortalCandidateProvider({
  value,
  children,
}: {
  value: PortalCandidateContextValue;
  children: ReactNode;
}) {
  return (
    <PortalCandidateContext.Provider value={value}>
      {children}
    </PortalCandidateContext.Provider>
  );
}

export function usePortalCandidate(): PortalCandidateContextValue {
  const value = useContext(PortalCandidateContext);
  if (!value) {
    throw new Error("usePortalCandidate must be used within PortalCandidateProvider");
  }
  return value;
}
