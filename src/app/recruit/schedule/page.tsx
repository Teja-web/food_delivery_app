"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* -- Mock Data ------------------------------------------------------- */

const INTERVIEWERS = [
  { name: "David Okonkwo", role: "Head of Revenue (Hiring Manager)", available: ["Apr 7 10:00 AM", "Apr 7 2:00 PM", "Apr 8 11:00 AM", "Apr 9 10:00 AM"] },
  { name: "Sarah Kim", role: "Senior AE", available: ["Apr 7 11:00 AM", "Apr 7 3:00 PM", "Apr 8 10:00 AM"] },
  { name: "Alex Nguyen", role: "Enterprise Sales Lead", available: ["Apr 7 2:00 PM", "Apr 8 11:00 AM", "Apr 8 3:00 PM", "Apr 9 10:00 AM", "Apr 9 2:00 PM"] },
];

const CANDIDATES_TO_SCHEDULE = [
  { name: "Leila M.", stage: "Interview", pendingType: "Domain Case", competencyGap: "Marketplace expertise" },
  { name: "David O.", stage: "Screening", pendingType: "Stakeholder Assessment", competencyGap: "Stakeholder influence" },
];

const STAGE_TYPES = ["Phone Screen", "Technical Case", "Domain Case", "Cross-functional Interview", "Final Panel", "Custom"];

/* -- Page ------------------------------------------------------------ */

export default function SchedulePage() {
  const [selectedCandidate, setSelectedCandidate] = useState(CANDIDATES_TO_SCHEDULE[0]!.name);
  const [selectedInterviewer, setSelectedInterviewer] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [selectedType, setSelectedType] = useState(CANDIDATES_TO_SCHEDULE[0]!.pendingType);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-8">
          <Link href="/recruit/roles/role-1" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back to role
          </Link>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Schedule Interview</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">Founding Sales Manager</h1>
            <p className="mt-1 text-sm text-muted-foreground">Select a candidate, interviewer, and time slot. The system will send calendar invites automatically.</p>
          </div>

          {/* Step 1: Candidate */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xs font-semibold text-foreground">1. Select candidate</h2>
            <div className="space-y-2">
              {CANDIDATES_TO_SCHEDULE.map((c) => (
                <Button key={c.name} variant="unstyled" onClick={() => { setSelectedCandidate(c.name); setSelectedType(c.pendingType); }} className={cn("flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all", selectedCandidate === c.name ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary/50")}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.stage} &middot; Needs: {c.pendingType}</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Gap: {c.competencyGap}</span>
                </Button>
              ))}
              <Button variant="ghost" className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-xs font-medium text-muted-foreground hover:bg-secondary/50">
                <Search className="h-3 w-3" />
                Search for another candidate...
              </Button>
            </div>
          </div>

          {/* Step 2: Interview type */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xs font-semibold text-foreground">2. Interview type</h2>
            <div className="flex flex-wrap gap-2">
              {STAGE_TYPES.map((type) => (
                <Button key={type} variant="unstyled" onClick={() => setSelectedType(type)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium transition-all", selectedType === type ? "border-primary bg-primary/5 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary/50")}>{type}</Button>
              ))}
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">Evidence target</Label>
              <Input type="text" defaultValue={CANDIDATES_TO_SCHEDULE.find((c) => c.name === selectedCandidate)?.competencyGap || ""} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              <p className="mt-1 text-[11px] text-muted-foreground">What should this interview assess? This will be visible to the interviewer.</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground">Duration</Label>
              <Select defaultValue="30">
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Step 3: Interviewer + time */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xs font-semibold text-foreground">3. Select interviewer &amp; time</h2>
            <div className="space-y-3">
              {INTERVIEWERS.map((iv) => (
                <div key={iv.name} className="rounded-xl border border-border bg-background overflow-hidden">
                  <Button variant="ghost" onClick={() => setSelectedInterviewer(selectedInterviewer === iv.name ? "" : iv.name)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{iv.name}</p>
                      <p className="text-xs text-muted-foreground">{iv.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{iv.available.length} slots available</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", selectedInterviewer === iv.name && "rotate-180")} />
                    </div>
                  </Button>
                  {selectedInterviewer === iv.name && (
                    <div className="border-t border-border px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {iv.available.map((slot) => (
                          <Button key={slot} variant="unstyled" onClick={() => setSelectedSlot(slot)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium transition-all", selectedSlot === slot ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-secondary")}>{slot}</Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedSlot && selectedInterviewer && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-5">
              <p className="text-xs font-semibold text-emerald-900 mb-2">Ready to schedule</p>
              <div className="space-y-1 text-xs text-foreground">
                <p><span className="font-medium">Candidate:</span> {selectedCandidate}</p>
                <p><span className="font-medium">Interviewer:</span> {selectedInterviewer}</p>
                <p><span className="font-medium">Time:</span> {selectedSlot}</p>
                <p><span className="font-medium">Type:</span> {selectedType}</p>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Calendar invites will be sent to both parties.</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Link href="/recruit/roles/role-1" className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancel</Link>
            <Button variant="default" size="auto" disabled={!selectedSlot || !selectedInterviewer} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-30">
              <CalendarClock className="h-3 w-3" />
              Schedule &amp; send invites
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
