"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ScheduleInterviewForm from "./ScheduleInterviewForm";

function ScheduleInterviewContent() {
  const params = useSearchParams();
  const applicationId = params.get("applicationId") ?? "";
  const stageId = params.get("stageId") ?? "";
  const roleId = params.get("roleId") ?? "";

  if (!applicationId || !stageId || !roleId) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Missing required parameters. Navigate here from a role pipeline.</p>
      </div>
    );
  }

  return (
    <ScheduleInterviewForm
      applicationId={applicationId}
      stageId={stageId}
      roleId={roleId}
    />
  );
}

export default function NewInterviewPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-6 py-12 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ScheduleInterviewContent />
    </Suspense>
  );
}
