"use client";

import { use, Suspense } from "react";
import { redirect } from "next/navigation";
import { UnifiedSignIn } from "./unified-sign-in";

export default function Page({ params }: { params: Promise<{ path: string }> }) {
  const { path } = use(params);

  if (path === "sign-in") {
    return (
      <Suspense fallback={null}>
        <UnifiedSignIn />
      </Suspense>
    );
  }

  // Other auth paths have dedicated pages (forgot-password, reset-password, callback)
  redirect("/auth/sign-in");
}
