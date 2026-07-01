import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listApproverEligibleMembers } from "@/operations/auth/members";

import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const approverCandidates = await listApproverEligibleMembers().catch(() => []);

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
      <NewProjectForm approverCandidates={approverCandidates} />
    </div>
  );
}
