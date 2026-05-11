"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Paperclip,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/* -- Mock Data ------------------------------------------------------- */

const TEMPLATES = [
  { id: "t1", name: "Initial outreach", description: "First touch for passive candidates from sourcing", subject: "Exciting opportunity at [Company]" },
  { id: "t2", name: "Follow-up (no response)", description: "Second touch after 5 days of no response", subject: "Following up — [Role] at [Company]" },
  { id: "t3", name: "Interview confirmation", description: "Confirm interview details and share prep materials", subject: "Interview confirmed: [Role] on [Date]" },
  { id: "t4", name: "Post-interview thank you", description: "Thank candidate and set expectations for next steps", subject: "Thank you for interviewing — next steps" },
  { id: "t5", name: "Offer preview", description: "Warm candidate before formal offer letter", subject: "We'd like to make you an offer" },
  { id: "t6", name: "Rejection — kind", description: "Decline with dignity and keep the door open", subject: "Update on your application for [Role]" },
];

const RECENT_CANDIDATES = [
  { name: "Amina K.", email: "amina.k@example.com", role: "Founding Sales Manager" },
  { name: "Priya S.", email: "priya.s@example.com", role: "Founding Sales Manager (Recommended)" },
  { name: "Samuel R.", email: "samuel.r@example.com", role: "Founding Sales Manager" },
  { name: "Jordan P.", email: "jordan.p@example.com", role: "Senior Product Designer" },
];

/* -- Page ------------------------------------------------------------ */

export default function ComposePage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedRecipient] = useState(RECENT_CANDIDATES[0]!);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-8">
          <Link href="/recruit/candidates/c-1" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back
          </Link>

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Compose message</h1>
            <p className="mt-1 text-sm text-muted-foreground">Send an email or internal note. Use a template or write from scratch.</p>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-6 py-3 flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-10">To</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{selectedRecipient.name}</span>
                  <span className="text-[10px] text-muted-foreground">{selectedRecipient.email}</span>
                </div>
              </div>
            </div>
            <div className="border-b border-border px-6 py-3 flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-10">CC</span>
              <Input type="text" placeholder="Add hiring manager, team member..." className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
            </div>
            <div className="border-b border-border px-6 py-3 flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-10">Subj</span>
              <Input type="text" defaultValue={selectedTemplate ? TEMPLATES.find((t) => t.id === selectedTemplate)?.subject : ""} placeholder="Subject line..." className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
            </div>
            <div className="px-6 py-4">
              <Textarea rows={10} placeholder="Write your message..." className="w-full bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none" />
            </div>
            <div className="border-t border-border px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="soft" size="auto" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium"><Paperclip className="h-3 w-3" />Attach</Button>
                <Button variant="soft" size="auto" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium"><FileText className="h-3 w-3" />Attach job brief</Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="soft" size="auto" className="rounded-md px-3 py-1.5 text-[11px] font-medium">Save draft</Button>
                <Button variant="default" size="auto" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold hover:opacity-90 transition-opacity"><Send className="h-3 w-3" />Send</Button>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Templates</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEMPLATES.map((tmpl) => (
                <Button key={tmpl.id} variant="unstyled" onClick={() => setSelectedTemplate(selectedTemplate === tmpl.id ? null : tmpl.id)} className={cn("rounded-xl border p-4 text-left transition-all", selectedTemplate === tmpl.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-border hover:shadow-sm")}>
                  <p className="text-xs font-semibold text-foreground">{tmpl.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{tmpl.description}</p>
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-card/50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">✦</div>
              <p className="text-xs font-semibold text-foreground">AI can help draft this</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Describe what you want to say and the system will draft the message using the candidate&apos;s
              profile, role context, and your communication style.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Input type="text" placeholder='e.g. "Write initial outreach emphasizing the team-building scope"' className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary" />
              <Button variant="unstyled" className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"><Sparkles className="h-3 w-3" />Draft</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
