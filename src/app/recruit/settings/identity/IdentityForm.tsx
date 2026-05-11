"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Sparkles,
  Upload,
  X,
  Loader2,
  Heart,
  Eye,
  Scale,
  Users,
  AlertTriangle,
} from "lucide-react";
import { saveOrgIdentity, uploadIdentityDocument, removeIdentityDocument, extractIdentity } from "@/actions/org-identity";
import type { ExtractedIdentity, UploadedDocument } from "@/db/schema/organization";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const ACCEPTED_TYPES = ".pdf,.docx,.txt,.md,.rtf,.html";

interface OrgIdentityData {
  id: string;
  rawText: string | null;
  uploadedDocuments: UploadedDocument[] | null;
  extractedIdentity: ExtractedIdentity | null;
  extractedAt: Date | null;
}

export function IdentityClient({
  initialIdentity,
}: {
  initialIdentity: OrgIdentityData | null;
}) {
  const [rawText, setRawText] = useState(initialIdentity?.rawText ?? "");
  const [documents, setDocuments] = useState<UploadedDocument[]>(
    initialIdentity?.uploadedDocuments ?? [],
  );
  const [extracted, setExtracted] = useState<ExtractedIdentity | null>(
    initialIdentity?.extractedIdentity ?? null,
  );
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(!initialIdentity?.extractedIdentity);
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const doSave = useCallback(
    (text: string) => {
      startTransition(async () => {
        await saveOrgIdentity({ rawText: text || undefined });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    },
    [],
  );

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setRawText(value);
    setSaved(false);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => doSave(value), 2000);
  }

  function handleBlur() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    doSave(rawText);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const doc = await uploadIdentityDocument(formData);
        if (doc) {
          setDocuments((prev) => [...prev, doc]);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveDocument(docId: string) {
    await removeIdentityDocument(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }

  async function handleExtract() {
    setExtracting(true);
    try {
      const result = await extractIdentity();
      if (result) {
        setExtracted(result);
      }
    } finally {
      setExtracting(false);
    }
  }

  const hasInput = rawText.length > 0 || documents.length > 0;
  const canExtract = hasInput && !extracting;
  const sourceCount = documents.length + (rawText.length > 0 ? 1 : 0);

  return (
    <div className="p-8">
      {/* Page header */}
      <h1 className="text-lg font-semibold text-foreground">
        Organization Identity
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        How the AI understands your company. This shapes candidate evaluation,
        outreach tone, and interview questions.
      </p>

      {/* Identity — primary content */}
      {extracted ? (
        <IdentityView identity={extracted} />
      ) : (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <Sparkles className="h-5 w-5 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No identity extracted yet
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add source material below, then extract
          </p>
        </div>
      )}

      {/* Re-extract button — sits between identity and source */}
      {hasInput && extracted && (
        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="soft"
            onClick={handleExtract}
            disabled={!canExtract}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            {extracting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Re-extracting...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Re-extract
              </>
            )}
          </Button>
          <span className="text-[10px] text-muted-foreground/60">
            Run again after updating source material
          </span>
        </div>
      )}

      {/* Source material — collapsible, secondary, constrained width */}
      <div className="mt-8 max-w-xl">
        <Button
          variant="ghost"
          onClick={() => setSourceOpen((o) => !o)}
          className="flex items-center gap-2 w-full group"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 ${
              sourceOpen ? "" : "-rotate-90"
            }`}
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground transition-colors">
            Source Material
          </span>
          {sourceCount > 0 && (
            <span className="text-[10px] text-muted-foreground/60">
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
            </span>
          )}
          {saved && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 ml-auto">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </Button>

        {sourceOpen && (
          <div className="mt-3 space-y-3">
            {/* Guiding prompts — only when empty */}
            {!rawText && documents.length === 0 && (
              <div className="rounded-lg bg-secondary/50 border border-border px-4 py-3 text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground">
                  What helps the AI make better decisions:
                </p>
                <p>What does your company stand for?</p>
                <p>What do you look for in people beyond skills?</p>
                <p>What makes someone thrive here? What kind of person struggles?</p>
                <p>How do people work together? What behaviors matter?</p>
              </div>
            )}

            {/* Text area */}
            <Textarea
              value={rawText}
              onChange={handleTextChange}
              onBlur={handleBlur}
              rows={8}
              placeholder="Describe your company — values, culture, what you look for in people, how your team works..."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-[120px]"
            />

            {/* File upload */}
            <div>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                multiple
                accept={ACCEPTED_TYPES}
                className="hidden"
              />
              <Button
                variant="unstyled"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary/30 transition-all w-full justify-center disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Upload culture decks, handbooks, value docs
                    <span className="text-muted-foreground/50">&middot;</span>
                    <span className="text-muted-foreground/50">PDF, DOCX, TXT, MD, RTF, HTML</span>
                  </>
                )}
              </Button>
            </div>

            {/* Uploaded documents */}
            {documents.length > 0 && (
              <div className="space-y-1">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-1.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-foreground truncate">
                        {doc.filename}
                      </span>
                      {doc.content && (
                        <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded shrink-0">
                          extracted
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleRemoveDocument(doc.id)}
                      className="rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 ml-2"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Extract button — primary action when no identity exists yet */}
            {hasInput && !extracted && (
              <Button
                variant="unstyled"
                onClick={handleExtract}
                disabled={!canExtract}
                className="flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                {extracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting identity...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Extract identity
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Identity display (primary content) -----------------------------------

function IdentityListSection({
  label,
  icon: Icon,
  items,
  color,
  dotColor,
}: {
  label: string;
  icon: typeof Heart;
  items: string[];
  color: string;
  dotColor: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 mb-2 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground flex items-start gap-2.5">
            <span className={`mt-[7px] h-1.5 w-1.5 rounded-full ${dotColor} shrink-0`} />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IdentityView({ identity }: { identity: ExtractedIdentity }) {
  return (
    <div className="mt-6">
      {/* Summary — lead element */}
      {identity.summary && (
        <p className="text-sm text-foreground leading-relaxed">
          {identity.summary}
        </p>
      )}

      {/* 4-column grid — one pillar per column */}
      <div className="grid grid-cols-4 gap-6 mt-6">
        <IdentityListSection
          label="Core Values"
          icon={Heart}
          items={identity.values ?? []}
          color="text-rose-600"
          dotColor="bg-rose-400"
        />
        <IdentityListSection
          label="Cultural Signals"
          icon={Eye}
          items={identity.culturalSignals ?? []}
          color="text-violet-600"
          dotColor="bg-violet-400"
        />
        <IdentityListSection
          label="Hiring Principles"
          icon={Scale}
          items={identity.hiringPrinciples ?? []}
          color="text-blue-600"
          dotColor="bg-blue-400"
        />
        <IdentityListSection
          label="Behavioral Expectations"
          icon={Users}
          items={identity.behavioralExpectations ?? []}
          color="text-emerald-600"
          dotColor="bg-emerald-400"
        />
      </div>

      {/* Red flags — warning treatment, full width */}
      {identity.redFlags && identity.redFlags.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
          <div className="flex items-center gap-2 mb-2 text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Red Flags
            </span>
          </div>
          <ul className="space-y-1.5">
            {identity.redFlags.map((item, i) => (
              <li key={i} className="text-sm text-amber-900 flex items-start gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
