"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSessionInfo } from "@/lib/auth/actions";

const CALLBACK_URL_KEY = "auth_callback_url";
const DEFAULT_REDIRECT = "/projects";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      let callbackUrl = searchParams.get("callbackUrl");
      if (!callbackUrl && typeof window !== "undefined") {
        callbackUrl = sessionStorage.getItem(CALLBACK_URL_KEY);
      }
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(CALLBACK_URL_KEY);
      }

      try {
        const { currentUser } = await getSessionInfo();
        if (!currentUser) {
          setError("Not authenticated");
          setStatus("error");
          return;
        }

        const target =
          callbackUrl && callbackUrl.startsWith("/") && callbackUrl !== "/dashboard"
            ? callbackUrl
            : DEFAULT_REDIRECT;
        router.replace(target);
      } catch {
        setError("An unexpected error occurred");
        setStatus("error");
      }
    }
    run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-sm text-muted-foreground">Completing sign in…</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mb-4 text-sm text-destructive">{error}</p>
            <a href="/auth/sign-in" className="text-sm text-primary underline">
              Try signing in again
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
