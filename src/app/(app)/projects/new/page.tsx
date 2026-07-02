import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listApproverEligibleMembers } from "@/operations/auth/members";
import { listOrgStandards } from "@/operations/standards";

import { NewProjectForm, type OrgStandardOption } from "./NewProjectForm";

function serializeOrgStandards(rows: Awaited<ReturnType<typeof listOrgStandards>>): OrgStandardOption[] {
  return rows.map((row) => ({
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    format: row.format,
    sourceFileName: row.sourceFileName,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export default async function NewProjectPage() {
  const [approverCandidates, orgStandards] = await Promise.all([
    listApproverEligibleMembers().catch(() => []),
    listOrgStandards(),
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
      <NewProjectForm
        approverCandidates={approverCandidates}
        orgStandards={serializeOrgStandards(orgStandards)}
      />
    </div>
  );
}
