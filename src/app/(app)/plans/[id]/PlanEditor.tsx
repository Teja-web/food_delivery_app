"use client";

import { marked } from "marked";
import { Eye, FileText, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { savePlanRevision } from "@/actions/plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  planId: string;
  initialTitle: string;
  initialSummary: string | null;
  initialBody: string | null;
  editable: boolean;
};

export function PlanEditor({
  planId,
  initialTitle,
  initialSummary,
  initialBody,
  editable,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!editing) {
      setTitle(initialTitle);
      setSummary(initialSummary ?? "");
      setBody(initialBody ?? "");
      setChangeNote("");
    }
  }, [editing, initialTitle, initialSummary, initialBody]);

  const previewHtml = useMemo(() => {
    if (!body.trim()) return "";
    return marked.parse(body, { gfm: true, breaks: false, async: false }) as string;
  }, [body]);

  if (!editable) return null;

  if (!editing) {
    return (
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
        </Button>
      </div>
    );
  }

  const dirty =
    title.trim() !== initialTitle ||
    summary.trim() !== (initialSummary ?? "") ||
    body !== (initialBody ?? "");

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title can't be empty");
      return;
    }
    startTransition(async () => {
      try {
        const note = changeNote.trim();
        await savePlanRevision({
          planId,
          title: trimmedTitle,
          summary: summary.trim() || null,
          body,
          changeNote: note.length > 0 ? note : undefined,
        });
        toast.success("Saved");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(`Failed to save: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    });
  };

  return (
    <div className="space-y-4 rounded border bg-muted/10 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Editing plan</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={isPending}
          aria-label="Cancel edit"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Cancel
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-title" className="text-xs">
          Title
        </Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-summary" className="text-xs">
          Summary
        </Label>
        <Textarea
          id="edit-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Body <span className="text-muted-foreground">(markdown)</span>
        </Label>
        <Tabs defaultValue="write" className="w-full">
          <TabsList>
            <TabsTrigger value="write">
              <FileText className="h-3.5 w-3.5" aria-hidden /> Write
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="h-3.5 w-3.5" aria-hidden /> Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="mt-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="font-mono text-xs"
              placeholder="Write the plan body in markdown…"
            />
          </TabsContent>
          <TabsContent value="preview" className="mt-2">
            {previewHtml ? (
              <article
                className="prose prose-sm dark:prose-invert min-h-[20rem] max-w-none rounded border bg-background p-4"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex min-h-[20rem] items-center justify-center rounded border bg-background text-sm text-muted-foreground">
                Nothing to preview yet.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-note" className="text-xs">
          Change note <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="edit-note"
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="What changed and why?"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isPending || !dirty}>
          {isPending ? "Saving…" : "Save revision"}
        </Button>
      </div>
    </div>
  );
}
