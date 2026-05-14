import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlan } from "@/actions/plans";
import { listCommentsForPlan, createComment } from "@/actions/comments";
import { listApprovalsForPlan, requestPlanApproval } from "@/actions/approvals";
import { listPlanRevisions, listChildPlans, getPlanAncestry } from "@/operations/plans";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentUser } from "@/lib/auth/actions";

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

async function requestApproval(planId: string) {
  "use server";
  await requestPlanApproval(planId);
}

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getPlan(id);
  if (!plan) notFound();

  const [comments, approvals, revisions, children, ancestry] = await Promise.all([
    listCommentsForPlan(id),
    listApprovalsForPlan(id),
    listPlanRevisions(id),
    listChildPlans(id),
    getPlanAncestry(id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
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
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {plan.kind.replace("_", " ")} · {plan.status.replace("_", " ")}
          </div>
          <h1 className="text-2xl font-semibold">{plan.title}</h1>
          {plan.summary ? <p className="mt-2 text-sm text-muted-foreground">{plan.summary}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/v1/plans/${id}/export?format=md`}>Export .md</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/v1/plans/${id}/export?format=html`}>Export .html</a>
          </Button>
          {plan.status === "draft" ? (
            <form action={requestApproval.bind(null, id)}>
              <Button type="submit" variant="outline">
                Request approval
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <article className="prose prose-sm max-w-none rounded border bg-muted/20 p-4 font-mono whitespace-pre-wrap">
        {plan.body || <em className="text-muted-foreground">No body yet.</em>}
      </article>

      {children.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Children</h2>
          <ul className="divide-y rounded border text-sm">
            {children.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2">
                <Link href={`/plans/${c.id}`} className="hover:underline">
                  <span className="text-xs uppercase text-muted-foreground mr-2">{c.kind}</span>
                  {c.title}
                </Link>
                <span className="text-xs text-muted-foreground capitalize">{c.status.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Approvals</h2>
        {approvals.length === 0 ? (
          <div className="text-sm text-muted-foreground">No approval requests yet.</div>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {approvals.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2">
                <span className="capitalize">{a.status}</span>
                <span className="text-xs text-muted-foreground">{a.requestedByName ?? a.requestedById}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Comments</h2>
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
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Revisions</h2>
        {revisions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No revisions yet.</div>
        ) : (
          <ul className="divide-y rounded border text-sm">
            {revisions.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2">
                <span>v{r.revisionNumber}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="text-xs text-muted-foreground">
        <Link href={`/projects/${plan.projectId}`} className="hover:underline">
          ← Back to project
        </Link>
      </div>
    </div>
  );
}
