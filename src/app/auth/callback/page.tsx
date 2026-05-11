"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuthSessionInfo, setCandidateRole } from "@/actions/auth";

const CALLBACK_URL_KEY = "auth_callback_url";
const PENDING_INVITATION_KEY = "pendingInvitationId";

function CallbackHandler() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function handleCallback() {
            let callbackUrl = searchParams.get("callbackUrl");

            if (!callbackUrl && typeof window !== "undefined") {
                callbackUrl = sessionStorage.getItem(CALLBACK_URL_KEY);
            }

            let pendingInvitationId: string | null = null;
            if (typeof window !== "undefined") {
                pendingInvitationId = sessionStorage.getItem(PENDING_INVITATION_KEY);
                sessionStorage.removeItem(CALLBACK_URL_KEY);
                sessionStorage.removeItem(PENDING_INVITATION_KEY);
            }

            try {
                const result = await getAuthSessionInfo();

                if (!result.success) {
                    setError(result.error || "Failed to authenticate");
                    setStatus("error");
                    return;
                }

                // Org members/admins are recruiters; everyone else is a candidate.
                // Public signups are always candidates — they have no org membership.
                const isRecruiter = !!result.organizationId || result.isAdmin;

                // Set candidate role for non-recruiter users
                if (!isRecruiter) {
                    await setCandidateRole();
                }

                setStatus("success");

                if (pendingInvitationId && !callbackUrl?.includes("accept-invitation")) {
                    router.push(`/accept-invitation/${pendingInvitationId}`);
                    return;
                }

                const defaultRedirect = isRecruiter ? "/recruit/today" : "/coach";

                // Non-recruiters always go to candidate portal
                if (!isRecruiter) {
                    router.push(defaultRedirect);
                } else if (callbackUrl) {
                    if (callbackUrl.startsWith("/")) {
                        router.push(callbackUrl);
                    } else {
                        window.location.href = callbackUrl;
                    }
                } else {
                    router.push(defaultRedirect);
                }
            } catch (err) {
                console.error("Auth callback error:", err);
                setError("An unexpected error occurred");
                setStatus("error");
            }
        }

        handleCallback();
    }, [searchParams, router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
                {status === "loading" && (
                    <>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                        <p className="text-muted-foreground">Completing sign in...</p>
                    </>
                )}
                {status === "success" && (
                    <>
                        <div className="text-green-500 text-2xl mb-4">&#10003;</div>
                        <p className="text-muted-foreground">Redirecting...</p>
                    </>
                )}
                {status === "error" && (
                    <>
                        <div className="text-red-500 text-2xl mb-4">&#10007;</div>
                        <p className="text-red-500 mb-4">{error}</p>
                        <a href="/auth/sign-in" className="text-primary underline">
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
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        }>
            <CallbackHandler />
        </Suspense>
    );
}
