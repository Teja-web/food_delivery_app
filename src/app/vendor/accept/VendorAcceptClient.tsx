"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Tiny client shell that runs after the server has accepted the invitation.
 * Most of the work happened server-side; this just gives the user a brief
 * confirmation and routes them into the vendor app shell.
 */
export function VendorAcceptClient({
  vendorOrgId: _vendorOrgId,
  vendorOrgName,
}: {
  vendorOrgId: string;
  vendorOrgName: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/recruit"), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8 text-center">
      <h1 className="mb-2 text-lg font-semibold">Welcome to {vendorOrgName}</h1>
      <p className="text-sm text-muted-foreground">
        Partnership active. Taking you to your dashboard…
      </p>
    </main>
  );
}
