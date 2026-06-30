import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workItems } from "@/db/schema/work-item";
import { listCommentsForPlan, createComment } from "@/actions/plan/comments";
import { getPlan } from "@/actions/plan/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/auth/actions";
import { listEvidenceForPlan } from "@/operations/evidence";
import { listRecordsForPlan } from "@/operations/governance/records";
import { getOutboundBinding } from "@/operations/choreography/adapter-bindings";
import {
  getPlanAncestry,
  listChildPlans,
  listPlanRevisions,
} from "@/operations/plan/plans";
import { listRelationshipsForPlan } from "@/operations/plan/relationships";

import { ApprovalActions } from "./ApprovalActions";
import { PlanEditor } from "./PlanEditor";
import { PushPlansToJiraButton } from "../PushPlansToJiraButton";

async function addComment(planId: string, formData: FormData) {
  "use server";
  const { currentUser } = await getCurrentUser();
  if (!currentUser) return;
  await createComment({
    planId,
    authorId: currentUser.id,
    authorName: currentUser.name,
    body: String(formData.get("body") ?? "").trim(),
  });
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) notFound();

  const [
    comments,
    records,
    evidence,
    relationships,
    revisions,
    children,
    ancestry,
    bodyHtml,
    jiraBinding,
    jiraWorkItem,
  ] =
    await Promise.all([
      listCommentsForPlan(id),
      listRecordsForPlan(id),
      listEvidenceForPlan(id),
      listRelationshipsForPlan(id),
      listPlanRevisions(id),
      listChildPlans(id),
      getPlanAncestry(id),
      plan.body
        ? (marked.parse(plan.body, { gfm: true, breaks: false }) as Promise<string>)
        : Promise.resolve(""),
      getOutboundBinding(plan.organizationId, plan.projectId, "jira"),
      db.query.workItems.findFirst({
        where: and(eq(workItems.planArtifactId, id), eq(workItems.source, "jira")),
        columns: { externalUrl: true, externalId: true },
      }),
    ]);

  const pendingApprovals = records.filter(
    (r) => r.kind === "approval" && r.status === "pending",
  );
  const editable = plan.status === "draft" || plan.status === "in_review";

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-6">
        {pendingApprovals.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-state-pending/40 bg-state-pending/10 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-0.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-state-pending">
                Approval pending
              </div>
              <div className="text-sm">
                {pendingApprovals.length === 1
                  ? "1 pending approval"
                  : `${pendingApprovals.length} pending approvals`}
                {pendingApprovals[0].decisionNote ? (
                  <span className="text-muted-foreground">
                    {" "}· {pendingApprovals[0].decisionNote}
                  </span>
                ) : null}
              </div>
            </div>
            <ApprovalActions
              recordId={pendingApprovals[0].id}
              planTitle={plan.title}
            />
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {ancestry.length > 0 ? (
              <nav className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                {ancestry.map((a, i) => (
                  <span key={a.id} className="flex items-center gap-1">
                    {i > 0 ? <span>›</span> : null}
                    <Link href={`/plans/${a.id}`} className="hover:underline">
                      [{a.kind}] {a.title}
                    </Link>
                  </span>
                ))}
              </nav>
            ) : null}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {plan.kind.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {plan.status.replace("_", " ")}
              </Badge>
              {plan.externalRef && jiraWorkItem?.externalUrl ? (
                <a
                  href={jiraWorkItem.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {jiraWorkItem.externalId}
                </a>
              ) : plan.externalRef ? (
                <span className="text-xs text-muted-foreground">{plan.externalRef}</span>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{plan.title}</h1>
            {plan.summary ? (
              <p className="mt-2 text-sm text-muted-foreground">{plan.summary}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {jiraBinding ? <PushPlansToJiraButton mode="single" planId={id} /> : null}
            <Button asChild variant="outline" size="sm">
              <a href={`/api/v1/plans/${id}/export?format=md`}>Export .md</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/v1/plans/${id}/export?format=html`}>Export .html</a>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="details" className="space-y-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="revisions">
              Revisions{revisions.length ? ` · ${revisions.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="comments">
              Comments{comments.length ? ` · ${comments.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="governance">
              Governance{records.length ? ` · ${records.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="evidence">
              Evidence{evidence.length ? ` · ${evidence.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="relationships">
              Relationships{relationships.length ? ` · ${relationships.length}` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            {plan.body ? (
              <article
                className="prose prose-sm dark:prose-invert max-w-none rounded border bg-muted/20 p-4"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : (
              <article className="rounded border bg-muted/20 p-4 text-sm">
                <em className="text-muted-foreground">No body yet.</em>
              </article>
            )}

            <PlanEditor
              planId={id}
              initialTitle={plan.title}
              initialSummary={plan.summary}
              initialBody={plan.body}
              editable={editable}
            />

            {children.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Children</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y rounded border text-sm">
                    {children.map((c) => (
                      <li key={c.id} className="flex items-center justify-between px-4 py-2">
                        <Link href={`/plans/${c.id}`} className="hover:underline">
                          <span className="mr-2 text-xs uppercase text-muted-foreground">
                            {c.kind}
                          </span>
                          {c.title}
                        </Link>
                        <span className="text-xs capitalize text-muted-foreground">
                          {c.status.replace("_", " ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="revisions">
            {revisions.length === 0 ? (
              <div className="rounded border bg-muted/20 p-4 text-sm text-muted-foreground">
                No revisions yet.
              </div>
            ) : (
              <ul className="divide-y rounded border text-sm">
                {revisions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2">
                    <span>v{r.revisionNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="comments" className="space-y-3">
            <form action={addComment.bind(null, id)} className="flex flex-col gap-2">
              <Textarea name="body" rows={3} placeholder="Leave a comment…" required />
              <Button type="submit" className="self-end">
                Comment
              </Button>
            </form>
            {comments.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {comments.map((c) => (
                  <li key={c.id} className="rounded border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">
                      {c.authorName ?? c.authorId} · {new Date(c.createdAt).toLocaleString()}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded border bg-muted/20 p-4 text-sm text-muted-foreground">
                No comments yet.
              </div>
            )}
          </TabsContent>

          <TabsContent value="governance">
            {records.length === 0 ? (
              <div className="rounded border bg-muted/20 p-4 text-sm text-muted-foreground">
                No governance records for this plan.
              </div>
            ) : (
              <ul className="divide-y rounded border text-sm">
                {records.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {r.kind}
                      </Badge>
                      <span className="capitalize">{r.status}</span>
                      {r.decisionNote ? (
                        <span className="text-xs text-muted-foreground">
                          · {r.decisionNote}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {r.decidedByName ?? r.decidedById ?? "—"} ·{" "}
                      {new Date(r.updatedAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="evidence">
            {evidence.length === 0 ? (
              <div className="rounded border bg-muted/20 p-4 text-sm text-muted-foreground">
                No evidence attached yet.
              </div>
            ) : (
              <ul className="divide-y rounded border text-sm">
                {evidence.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {e.evidenceType}
                      </Badge>
                      {e.role ? (
                        <span className="text-xs capitalize text-muted-foreground">
                          {e.role}
                        </span>
                      ) : null}
                      {e.note ? <span className="text-xs">· {e.note}</span> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {e.externalUrl ? (
                        <a
                          href={e.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          link
                        </a>
                      ) : (
                        e.evidenceId
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="relationships">
            {relationships.length === 0 ? (
              <div className="rounded border bg-muted/20 p-4 text-sm text-muted-foreground">
                No relationships yet.
              </div>
            ) : (
              <ul className="divide-y rounded border text-sm">
                {relationships.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {r.kind}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {r.fromPlanArtifactId === id
                          ? `→ ${r.toPlanArtifactId.slice(0, 8)}`
                          : `← ${r.fromPlanArtifactId.slice(0, 8)}`}
                      </span>
                    </div>
                    {r.note ? (
                      <span className="text-xs text-muted-foreground">{r.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <div className="text-xs text-muted-foreground">
          <Link href={`/projects/${plan.projectId}`} className="hover:underline">
            ← Back to project
          </Link>
        </div>
      </div>
      <Toaster />
    </>
  );
}
