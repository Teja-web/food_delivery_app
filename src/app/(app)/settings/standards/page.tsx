import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

import {
  getOrgStandardsReadiness,
  listOrgStandards,
} from "@/operations/standards";
import {
  OrgStandardsEditor,
  type OrgStandardEditorItem,
} from "@/components/feature/standards/OrgStandardsEditor";

function serializeStandardsForEditor(rows: Awaited<ReturnType<typeof listOrgStandards>>): OrgStandardEditorItem[] {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    body: row.body,
    format: row.format,
    version: row.version,
    hash: row.contentHash,
    sourceFileName: row.sourceFileName,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export default async function OrgStandardsSettingsPage() {
  const [standards, readiness] = await Promise.all([
    listOrgStandards(),
    getOrgStandardsReadiness(),
  ]);
  const initialStandards = serializeStandardsForEditor(standards);

  return (
    <div className="max-w-7xl space-y-4">
      <header className="rounded-sm border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <Link
            href="/settings"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Settings
          </Link>
            <div className="mt-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm border bg-background">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                </span>
                <div>
                <h1 className="font-display text-2xl font-semibold">
                    Organization Standards
                  </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Exact org-wide files inherited by projects and distributed to agents.
                  </p>
                </div>
              </div>
            </div>
          <div className="grid min-w-[260px] gap-2 sm:grid-cols-2">
            <div className="rounded-sm border bg-background px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Required
                </div>
              <div className="mt-1 text-sm font-semibold">
                {readiness.presentRequired.length}/3 ready
              </div>
            </div>
            <div className="rounded-sm border bg-background px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Files
                </div>
              <div className="mt-1 text-sm font-semibold">
                  {initialStandards.length} saved
                </div>
              </div>
            </div>
          </div>
        </header>

        <OrgStandardsEditor
          mode="settings"
          initialStandards={initialStandards}
          missingRequired={readiness.missingRequired}
        />
    </div>
  );
}
