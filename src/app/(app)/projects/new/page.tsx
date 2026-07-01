import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listApproverEligibleMembers } from "@/operations/auth/members";
import { getOrgStandardsReadiness } from "@/operations/standards";

import { NewProjectForm } from "./NewProjectForm";
import { StandardsMissingRedirectDialog } from "./StandardsMissingRedirectDialog";

export default async function NewProjectPage() {
  const [approverCandidates, standardsReadiness] = await Promise.all([
    listApproverEligibleMembers().catch(() => []),
    getOrgStandardsReadiness(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Projects
      </Link>
      <h1 className="text-2xl font-semibold">New project</h1>
      {standardsReadiness.requiredComplete ? (
        <NewProjectForm approverCandidates={approverCandidates} />
      ) : (
        <>
          <div className="rounded-sm border bg-card/30 p-6 text-sm text-muted-foreground">
            Project creation is paused until required organization standards are configured.
          </div>
          <StandardsMissingRedirectDialog />
        </>
      )}
    </div>
  );
}
