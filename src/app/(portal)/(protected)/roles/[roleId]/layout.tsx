import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin, Building2 } from "lucide-react";
import { fetchPortalRoleDetail } from "@/actions/portal";
import { RoleTabNav } from "@/components/portal/role-tab-nav";
import { serializeRoleDetail } from "./serialize";

export default async function RoleDetailLayout({
  params,
  children,
}: {
  params: Promise<{ roleId: string }>;
  children: React.ReactNode;
}) {
  const { roleId } = await params;
  const raw = await fetchPortalRoleDetail(roleId);
  if (!raw) notFound();

  const role = serializeRoleDetail(raw);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4">
        {/* Back + header */}
        <div className="pt-6 pb-4">
          <Link
            href="/roles"
            className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            Roles
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">
                {role.jobTitle}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {role.jobDepartment && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {role.jobDepartment}
                  </span>
                )}
                {role.jobLocation && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {role.jobLocation}
                  </span>
                )}
                {role.stage && (
                  <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground capitalize">
                    {role.stage}
                  </span>
                )}
              </div>
            </div>

            {role.fitScore != null && (
              <div className="flex flex-col items-center">
                <span className={`text-xl font-bold tabular-nums ${
                  role.fitScore >= 85
                    ? "text-emerald-600"
                    : role.fitScore >= 70
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}>
                  {role.fitScore}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  fit
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tab nav */}
        <RoleTabNav baseHref={`/roles/${roleId}`} hasOffer={role.stage === "offer"} />

        {/* Tab content */}
        <div className="py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
