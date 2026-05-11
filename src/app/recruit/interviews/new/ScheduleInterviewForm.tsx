"use client";

import { useState, useEffect, useTransition, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Link2,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Send,
  User,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { proposeAndAdvance } from "@/actions/pipeline";
import { editInterview } from "@/actions/interviews";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/* -- Types ----------------------------------------------------------- */

interface StageInfo {
  id: string;
  name: string;
  type: string | null;
  durationMins: number | null;
  competencies: string[] | null;
  order: number;
}

interface ApplicationInfo {
  id: string;
  candidateName: string;
  candidateId: string;
  roleName: string;
  roleId: string;
}

interface MemberInfo {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  hasCalendar: boolean;
}

interface SlotEntry {
  id: string;
  date: string;
  time: string;
}

type InterviewFormat = "video_call" | "in_person" | "phone";
type VideoMode = "livekit" | "external";

const STATUSES = [
  { value: "proposed", label: "Proposed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export interface InterviewInitialData {
  interviewId: string;
  interviewType: string | null;
  durationMins: number | null;
  meetingLink: string | null;
  location: string | null;
  evidenceTarget: string | null;
  notes: string | null;
  status: string;
  proctored: boolean;
  proposedSlots: { startAt: string; endAt: string }[] | null;
  panelistUserIds: string[];
}

const FORMAT_OPTIONS: { value: InterviewFormat; label: string; icon: typeof Video }[] = [
  { value: "video_call", label: "Video Call", icon: Video },
  { value: "in_person", label: "In Person", icon: MapPin },
  { value: "phone", label: "Phone", icon: Phone },
];

const DURATION_PRESETS = [30, 45, 60, 90];

/* -- Time options (15-min increments) ------------------------------- */

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function formatTimeLabel(t: string) {
  return t; // 24-hour format: "09:00", "14:30", etc.
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

let slotIdCounter = 0;
function nextSlotId() {
  return `slot-${++slotIdCounter}`;
}

/* -- Availability Grid ---------------------------------------------- */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GRID_START_HOUR = 1;
const GRID_END_HOUR = 24;
const GRID_HOURS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

function AvailabilityGrid({
  busyBlocks,
  weekStart,
}: {
  busyBlocks: Record<string, { start: string; end: string }[]>;
  weekStart: Date;
}) {
  const allBusy = Object.values(busyBlocks).flat();

  function getBusyForDayHour(dayIndex: number, hour: number) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + dayIndex);

    // Calculate the start and end of this hour slot in local time
    const slotStart = new Date(dayDate);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(dayDate);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    return allBusy.some((block) => {
      const blockStart = new Date(block.start);
      const blockEnd = new Date(block.end);

      // Check if the busy block overlaps with this hour slot
      // Overlap exists if block starts before slot ends AND block ends after slot starts
      return blockStart < slotEnd && blockEnd > slotStart;
    });
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-px">
        <div />
        {WEEKDAYS.map((day, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return (
            <div key={day} className="text-center pb-2">
              <p className="text-[10px] font-medium text-muted-foreground">{day}</p>
              <p className="text-[10px] text-muted-foreground/60">{d.getDate()}</p>
            </div>
          );
        })}
        {GRID_HOURS.map((hour) => (
          <Fragment key={hour}>
            <div className="flex items-center justify-end pr-2">
              <span className="text-[9px] text-muted-foreground/60">{formatTimeLabel(`${String(hour).padStart(2, "0")}:00`)}</span>
            </div>
            {WEEKDAYS.map((_, dayIndex) => {
              const isBusy = getBusyForDayHour(dayIndex, hour);
              return (
                <div
                  key={`${dayIndex}-${hour}`}
                  className={cn(
                    "h-5 rounded-sm border",
                    isBusy
                      ? "bg-red-100 border-red-200 dark:bg-red-950/30 dark:border-red-900/40"
                      : "bg-green-50/50 border-border/40 dark:bg-green-950/10",
                  )}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-green-50 border border-border/40" />
          <span className="text-[9px] text-muted-foreground">Free</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-red-100 border border-red-200" />
          <span className="text-[9px] text-muted-foreground">Busy</span>
        </div>
      </div>
    </div>
  );
}

/* -- Section divider ------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{children}</span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

/* -- Component ------------------------------------------------------- */

export default function ScheduleInterviewForm({
  applicationId,
  stageId,
  roleId,
  initialData,
}: {
  applicationId: string;
  stageId: string;
  roleId: string;
  initialData?: InterviewInitialData;
}) {
  const isEditMode = !!initialData;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Data loaded from server
  const [stage, setStage] = useState<StageInfo | null>(null);
  const [application, setApplication] = useState<ApplicationInfo | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state — seed from initialData when editing
  const [format, setFormat] = useState<InterviewFormat>(
    (initialData?.interviewType as InterviewFormat) || "video_call",
  );
  const [videoMode, setVideoMode] = useState<VideoMode>(
    initialData?.meetingLink ? "external" : "livekit",
  );
  const [durationMins, setDurationMins] = useState(initialData?.durationMins ?? 45);
  const [meetingLink, setMeetingLink] = useState(initialData?.meetingLink ?? "");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [evidenceTarget, setEvidenceTarget] = useState(initialData?.evidenceTarget ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [status, setStatus] = useState(initialData?.status ?? "proposed");
  const [proctored, setProctored] = useState(initialData?.proctored ?? false);

  // Proposed time slots — convert ISO strings to date+time for edit mode
  const [slots, setSlots] = useState<SlotEntry[]>(() => {
    if (initialData?.proposedSlots?.length) {
      return initialData.proposedSlots.map((s) => {
        const d = new Date(s.startAt);
        return {
          id: nextSlotId(),
          date: d.toISOString().split("T")[0],
          time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        };
      });
    }
    return [{ id: nextSlotId(), date: "", time: "10:00" }];
  });

  // Panelists
  const [selectedPanelists, setSelectedPanelists] = useState<string[]>(
    initialData?.panelistUserIds ?? [],
  );
  const [panelistDropdownOpen, setPanelistDropdownOpen] = useState(false);

  // Availability
  const [showAvailability, setShowAvailability] = useState(false);
  const [availability, setAvailability] = useState<Record<string, { start: string; end: string }[]> | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Fetch stage, application, and members
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/interviews/schedule-context?applicationId=${applicationId}&stageId=${stageId}&roleId=${roleId}`);
        if (res.ok) {
          const data = await res.json();
          setStage(data.stage);
          setApplication(data.application);
          setMembers(data.members ?? []);
          // Only apply stage defaults when creating, not editing
          if (!isEditMode) {
            if (data.stage?.durationMins) setDurationMins(data.stage.durationMins);
            if (data.stage?.type && FORMAT_OPTIONS.some((o) => o.value === data.stage.type)) {
              setFormat(data.stage.type as InterviewFormat);
            }
            if (data.stage?.competencies?.length) {
              setEvidenceTarget(data.stage.competencies.join(", "));
            }
          }
        }
      } catch {
        // Fallback — continue with empty context
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [applicationId, stageId, roleId, isEditMode]);

  // Default date to tomorrow (only for new interviews)
  useEffect(() => {
    if (isEditMode) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];
    setSlots([{ id: nextSlotId(), date: dateStr, time: "10:00" }]);
  }, [isEditMode]);

  const selectedPanelistsWithCalendar = selectedPanelists.filter(
    (id) => members.find((m) => m.userId === id)?.hasCalendar,
  );

  // Fetch availability when panelists with calendar are selected and availability view is shown
  useEffect(() => {
    if (showAvailability && selectedPanelistsWithCalendar.length > 0) {
      fetchAvailability(weekOffset);
    }
  }, [showAvailability, selectedPanelistsWithCalendar.length, weekOffset]);

  const getWeekStart = useCallback((offset = 0) => {
    // Start from today instead of the first slot's date for better navigation
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    // Apply week offset
    weekStart.setDate(weekStart.getDate() + (offset * 7));
    return weekStart;
  }, []);

  const fetchAvailability = useCallback(async (offset = 0) => {
    if (selectedPanelistsWithCalendar.length === 0) return;
    setLoadingAvailability(true);
    try {
      const weekStart = getWeekStart(offset);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const res = await fetch(
        `/api/calendar/availability?userIds=${selectedPanelistsWithCalendar.join(",")}&timeMin=${weekStart.toISOString()}&timeMax=${weekEnd.toISOString()}`,
      );
      if (res.ok) {
        const data = await res.json();
        setAvailability(data.availability);
      }
    } catch {
      // Silently fail — availability is optional
    } finally {
      setLoadingAvailability(false);
    }
  }, [selectedPanelistsWithCalendar, getWeekStart]);

  const handleWeekChange = (direction: "prev" | "next") => {
    const newOffset = direction === "prev" ? weekOffset - 1 : weekOffset + 1;
    setWeekOffset(newOffset);
    fetchAvailability(newOffset);
  };

  const addSlot = () => {
    const lastSlot = slots[slots.length - 1];
    setSlots([...slots, { id: nextSlotId(), date: lastSlot?.date || "", time: "10:00" }]);
  };

  const removeSlot = (id: string) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((s) => s.id !== id));
  };

  const updateSlot = (id: string, field: "date" | "time", value: string) => {
    setSlots(slots.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const togglePanelist = (userId: string) => {
    setSelectedPanelists((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  // Get today's date for validation
  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = () => {
    setError(null);

    const validSlots = slots.filter((s) => s.date && s.time);
    if (validSlots.length === 0) {
      setError("At least one time slot is required");
      return;
    }

    // Validate that no slots are in the past
    const now = new Date();
    for (const slot of validSlots) {
      const slotDateTime = new Date(`${slot.date}T${slot.time}:00`);
      if (slotDateTime < now) {
        setError("Cannot schedule interviews in the past. Please select a future date and time.");
        return;
      }
    }

    const proposedSlots = validSlots.map((s) => {
      const start = new Date(`${s.date}T${s.time}:00`);
      const end = new Date(start.getTime() + durationMins * 60000);
      return { startAt: start.toISOString(), endAt: end.toISOString() };
    });

    // For LiveKit mode, don't send a meeting link — the room is created on join
    const effectiveMeetingLink = format === "video_call" && videoMode === "livekit"
      ? undefined
      : meetingLink || undefined;

    startTransition(async () => {
      try {
        if (isEditMode) {
          await editInterview(initialData!.interviewId, {
            interviewType: format,
            durationMins,
            meetingLink: effectiveMeetingLink,
            location: location || undefined,
            evidenceTarget: evidenceTarget || undefined,
            notes: notes || undefined,
            status,
            proctored,
            proposedSlots,
            scheduledAt: proposedSlots[0]?.startAt,
          }, selectedPanelists);
          router.push(`/recruit/interviews/${initialData!.interviewId}`);
        } else {
          await proposeAndAdvance(applicationId, stageId, {
            panelistUserIds: selectedPanelists,
            interviewType: format,
            proposedSlots,
            durationMins,
            meetingLink: effectiveMeetingLink,
            location: location || undefined,
            evidenceTarget: evidenceTarget || undefined,
            notes: notes || undefined,
            proctored,
          });
          router.push(`/recruit/roles/${roleId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : isEditMode ? "Failed to save changes" : "Failed to propose interview");
      }
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Back link */}
          <Link
            href={isEditMode ? `/recruit/interviews/${initialData!.interviewId}` : `/recruit/roles/${roleId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            {isEditMode ? (application?.candidateName ?? "Interview") : "Back to role"}
          </Link>

          {/* Header — compact with stage inline */}
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              {isEditMode ? "Edit Interview" : "Schedule Interview"}
            </h1>
            {application && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{application.candidateName}</span>
                <span>for</span>
                <span className="font-medium text-foreground">{application.roleName}</span>
              </div>
            )}
            {stage && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
                  {stage.name}
                </span>
                {stage.competencies && stage.competencies.length > 0 && stage.competencies.map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-amber-200/50 bg-amber-50/40 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* -- Single form card -- */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">

            {/* Status — edit mode only */}
            {isEditMode && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-[180px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-sm">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Format + Duration — single row */}
            <div className="flex items-start gap-6">
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-semibold text-foreground">Format</Label>
                <div className="flex gap-1.5">
                  {FORMAT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <Button
                        variant="unstyled"
                        key={opt.value}
                        onClick={() => setFormat(opt.value)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                          format === opt.value
                            ? "border-primary bg-primary/5 text-foreground shadow-sm"
                            : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">Duration</Label>
                <div className="flex gap-1">
                  {DURATION_PRESETS.map((d) => (
                    <Button
                      variant="unstyled"
                      key={d}
                      onClick={() => setDurationMins(d)}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-xs font-medium transition-all",
                        durationMins === d
                          ? "border-primary bg-primary/5 text-foreground shadow-sm"
                          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                      )}
                    >
                      {d}m
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Video mode toggle — LiveKit vs External */}
            {format === "video_call" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">Conference</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="unstyled"
                    onClick={() => setVideoMode("livekit")}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-all",
                      videoMode === "livekit"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-foreground/20",
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      videoMode === "livekit" ? "bg-primary/10" : "bg-secondary",
                    )}>
                      <Video className={cn("h-4 w-4", videoMode === "livekit" ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className={cn("text-xs font-semibold", videoMode === "livekit" ? "text-foreground" : "text-muted-foreground")}>
                        Dilliznt Video
                      </p>
                      <p className="text-[10px] text-muted-foreground">Built-in, recorded, AI notes</p>
                    </div>
                  </Button>
                  <Button
                    variant="unstyled"
                    onClick={() => setVideoMode("external")}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-all",
                      videoMode === "external"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-foreground/20",
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      videoMode === "external" ? "bg-primary/10" : "bg-secondary",
                    )}>
                      <Link2 className={cn("h-4 w-4", videoMode === "external" ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className={cn("text-xs font-semibold", videoMode === "external" ? "text-foreground" : "text-muted-foreground")}>
                        External Link
                      </p>
                      <p className="text-[10px] text-muted-foreground">Zoom, Meet, Teams, etc.</p>
                    </div>
                  </Button>
                </div>

                {videoMode === "external" && (
                  <Input
                    type="url"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            )}

            {/* In-person location */}
            {format === "in_person" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground">Location</Label>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Office address or room"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            <SectionLabel>Panel</SectionLabel>

            {/* Panelists */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Interviewers</Label>
                {selectedPanelistsWithCalendar.length > 0 && (
                  <Button
                    variant="link"
                    onClick={() => {
                      setShowAvailability(!showAvailability);
                      if (!showAvailability && !availability) fetchAvailability(weekOffset);
                    }}
                    className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <Eye className="h-3 w-3" />
                    {showAvailability ? "Hide" : "View"} availability
                  </Button>
                )}
              </div>

              {/* Selected panelists */}
              {selectedPanelists.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedPanelists.map((id) => {
                    const m = members.find((m) => m.userId === id);
                    if (!m) return null;
                    return (
                      <Button
                        variant="unstyled"
                        key={id}
                        onClick={() => togglePanelist(id)}
                        className="group flex items-center gap-1.5 rounded-full border border-border bg-background pl-1 pr-2 py-0.5 text-xs transition-colors hover:border-red-200 hover:bg-red-50"
                      >
                        <Avatar size="sm">
                          {m.image && <AvatarImage src={m.image} alt={m.name} />}
                          <AvatarFallback>{getInitials(m.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground group-hover:text-red-600">{m.name}</span>
                        {m.hasCalendar && <Calendar className="h-2.5 w-2.5 text-primary/60" />}
                        <X className="h-2.5 w-2.5 text-muted-foreground group-hover:text-red-500" />
                      </Button>
                    );
                  })}
                </div>
              )}

              {/* Member picker */}
              <div className="relative">
                <Button
                  variant="soft"
                  onClick={() => setPanelistDropdownOpen(!panelistDropdownOpen)}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>{selectedPanelists.length === 0 ? "Select interviewers..." : "Add more..."}</span>
                </Button>

                {panelistDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPanelistDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
                      {members
                        .filter((m) => !selectedPanelists.includes(m.userId))
                        .map((m) => (
                          <Button
                            variant="ghost"
                            key={m.userId}
                            onClick={() => {
                              togglePanelist(m.userId);
                              if (members.filter((mem) => !selectedPanelists.includes(mem.userId) && mem.userId !== m.userId).length === 0) {
                                setPanelistDropdownOpen(false);
                              }
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/50 transition-colors"
                          >
                            <Avatar size="sm">
                              {m.image && <AvatarImage src={m.image} alt={m.name} />}
                              <AvatarFallback>{getInitials(m.name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 text-left">
                              <p className="text-xs font-medium text-foreground">{m.name}</p>
                              <p className="text-[10px] text-muted-foreground">{m.email}</p>
                            </div>
                            {m.hasCalendar && (
                              <Calendar className="h-3 w-3 text-primary/60 shrink-0" />
                            )}
                          </Button>
                        ))}
                      {members.filter((m) => !selectedPanelists.includes(m.userId)).length === 0 && (
                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                          All members selected
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Availability grid */}
              {showAvailability && (
                <div className="space-y-2">
                  {/* Week navigation */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleWeekChange("prev")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium text-muted-foreground">
                      {(() => {
                        const ws = getWeekStart(weekOffset);
                        const we = new Date(ws);
                        we.setDate(we.getDate() + 6);
                        return `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${we.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
                      })()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleWeekChange("next")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  {loadingAvailability ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading availability...
                    </div>
                  ) : availability ? (
                    <AvailabilityGrid busyBlocks={availability} weekStart={getWeekStart(weekOffset)} />
                  ) : null}
                </div>
              )}
            </div>

            <SectionLabel>Schedule</SectionLabel>

            {/* Proposed time slots */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Proposed slots</Label>
                <Button
                  variant="link"
                  onClick={addSlot}
                  className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add slot
                </Button>
              </div>

              <div className="space-y-2">
                {slots.map((slot, i) => (
                  <div key={slot.id} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-muted-foreground">
                      {i + 1}
                    </span>
                    <Input
                      type="date"
                      value={slot.date}
                      min={today}
                      onChange={(e) => updateSlot(slot.id, "date", e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Select value={slot.time} onValueChange={(v) => updateSlot(slot.id, "time", v)}>
                      <SelectTrigger className="w-[120px] h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {formatTimeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeSlot(slot.id)}
                      disabled={slots.length <= 1}
                      className="p-1 rounded text-muted-foreground hover:text-red-500 disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground">
                The candidate will choose one of these slots in their portal.
              </p>
            </div>

            <SectionLabel>Notes</SectionLabel>

            {/* Evidence target + notes — inline, no extra card */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evidence target</Label>
                <Input
                  type="text"
                  value={evidenceTarget}
                  onChange={(e) => setEvidenceTarget(e.target.value)}
                  placeholder="What evidence should this interview gather?"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes for the interviewer..."
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Proctoring toggle */}
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">Proctoring</p>
                  <p className="text-[11px] text-muted-foreground">
                    Require screen sharing before joining
                  </p>
                </div>
                <Button
                  variant="unstyled"
                  type="button"
                  role="switch"
                  aria-checked={proctored}
                  onClick={() => setProctored(!proctored)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    proctored ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform",
                      proctored ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </Button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href={isEditMode ? `/recruit/interviews/${initialData!.interviewId}` : `/recruit/roles/${roleId}`}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </Link>
            <Button
              type="button"
              variant="default"
              onClick={handleSubmit}
              disabled={isPending || slots.every((s) => !s.date || !s.time)}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {isEditMode ? "Saving..." : "Proposing..."}
                </>
              ) : isEditMode ? (
                <>
                  <Check className="h-3 w-3" />
                  Save Changes
                </>
              ) : (
                <>
                  <Send className="h-3 w-3" />
                  Propose & Advance
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
