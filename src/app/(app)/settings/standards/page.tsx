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
    <div className="-m-6 min-h-[calc(100vh-3rem)] bg-[#f7f8fb] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[20px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Settings
          </Link>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-blue-600 text-white shadow-sm shadow-blue-600/20">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-slate-950">
                    Organization Standards
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Exact org-wide files inherited by projects and distributed to agents.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
              <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  Required
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
                  3 baseline files
                </div>
              </div>
              <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                  <FileText className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                  Files
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-950">
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
    </div>
  );
}
