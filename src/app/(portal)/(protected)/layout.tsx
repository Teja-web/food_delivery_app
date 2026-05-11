import { PortalAuthGuard } from "@/components/portal/auth-guard";
import { requirePortalCandidateSession } from "@/lib/auth/portal";
import { SSEProvider } from "@/hooks/use-entity-event";
import { getPortalCandidateContext } from "@/operations/portal";
import { PortalCandidateProvider } from "./portal-candidate-context";
import { PortalShell } from "./portal-shell";

export default async function PortalProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePortalCandidateSession();
  const candidateContext = await getPortalCandidateContext();

  return (
    <PortalAuthGuard>
      <SSEProvider url="/api/events/portal-stream">
        <PortalCandidateProvider value={candidateContext}>
          <PortalShell
            initials={candidateContext.initials}
            userName={candidateContext.name}
          >
            {children}
          </PortalShell>
        </PortalCandidateProvider>
      </SSEProvider>
    </PortalAuthGuard>
  );
}
