"use client";

import { use, Suspense } from "react";
import { redirect } from "next/navigation";
import { UnifiedSignIn } from "./unified-sign-in";
import { UnifiedSignUp } from "./unified-sign-up";

export default function Page({ params }: { params: Promise<{ path: string }> }) {
  const { path } = use(params);

  if (path === "sign-in") {
    return (
      <Suspense fallback={null}>
        <UnifiedSignIn />
      </Suspense>
    );
  }

  if (path === "sign-up") {
    return <UnifiedSignUp />;
  }

  // Other auth paths have dedicated pages (forgot-password, reset-password, callback)
  redirect("/auth/sign-in");
}
