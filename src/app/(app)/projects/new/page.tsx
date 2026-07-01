import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listApproverEligibleMembers } from "@/operations/auth/members";
import { getOrgStandardsReadiness, STANDARD_KIND_LABELS } from "@/operations/standards";

import { NewProjectForm } from "./NewProjectForm";
import { OrgStandardsSetupForm } from "./OrgStandardsSetupForm";

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
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="font-medium text-foreground">Organization standards are required</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Missing:{" "}
              {standardsReadiness.missingRequired
                .map((kind) => STANDARD_KIND_LABELS[kind])
                .join(", ")}
              . Add these once and every project can inherit them by default.
            </p>
          </div>
          <OrgStandardsSetupForm />
        </>
      )}
    </div>
  );
}
