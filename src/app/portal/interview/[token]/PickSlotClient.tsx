"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  Clock,
  Loader2,
  MapPin,
  User,
  Video,
  CheckCircle,
} from "lucide-react";
import { confirmInterviewSlot } from "@/actions/interviews";
import { useRoomTimeStatus } from "@/components/shared/join-room-button";
import type { PortalInterviewProps } from "./serialize";
import { Button } from "@/components/ui/button";

interface PickSlotClientProps extends PortalInterviewProps {
  token: string;
}

function formatDate(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeRange(startAt: string, endAt: string) {
  return `${formatTime(startAt)} – ${formatTime(endAt)}`;
}

export default function PickSlotClient({
  token,
  id,
  status,
  roleName,
  stageName,
  candidateName,
  interviewType,
  scheduledAt,
  durationMins,
  proposedSlots,
  panelistNames,
  meetingLink,
  location,
  notes,
}: PickSlotClientProps) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(status === "confirmed");

  const handleConfirm = () => {
    if (selectedIndex === null) return;
    const selectedSlot = proposedSlots[selectedIndex];
    if (!selectedSlot) return;

    setError(null);
    startTransition(async () => {
      const result = await confirmInterviewSlot(token, selectedSlot);
      if (result.success) {
        setConfirmed(true);
      } else {
        setError(result.error ?? "Failed to confirm interview");
      }
    });
  };

  // Already confirmed state
  if (confirmed) {
    const confirmedSlot = selectedIndex !== null ? proposedSlots[selectedIndex] : proposedSlots[0];
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
        <div className="mx-auto max-w-lg px-4 py-12">
          <div className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="font-display text-2xl font-bold text-stone-900">
              Interview Confirmed
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              Thank you, {candidateName}! Your interview has been scheduled.
            </p>

            <div className="mt-6 rounded-xl bg-stone-50 p-4 text-left">
              <p className="text-sm font-semibold text-stone-900">{roleName}</p>
              <p className="text-xs text-stone-500">{stageName}</p>
              {confirmedSlot && (
                <div className="mt-3 space-y-1">
                  <p className="flex items-center gap-2 text-sm text-stone-700">
                    <Calendar className="h-4 w-4 text-stone-400" />
                    {formatDate(confirmedSlot.startAt)}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-stone-700">
                    <Clock className="h-4 w-4 text-stone-400" />
                    {formatTimeRange(confirmedSlot.startAt, confirmedSlot.endAt)}
                  </p>
                </div>
              )}
              {/* Video room — available 15min before to 30min after */}
              <JoinVideoButton interviewId={id} scheduledAt={scheduledAt} durationMins={durationMins} token={token} meetingLink={meetingLink} />
              {location && (
                <p className="mt-3 flex items-center gap-2 text-sm text-stone-600">
                  <MapPin className="h-4 w-4 text-stone-400" />
                  {location}
                </p>
              )}
            </div>

            <p className="mt-6 text-xs text-stone-400">
              A calendar invite has been sent to your email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Cancelled state
  if (status === "cancelled") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
        <div className="mx-auto max-w-lg px-4 py-12">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
            <h1 className="font-display text-2xl font-bold text-stone-900">
              Interview Cancelled
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              This interview has been cancelled. Please contact the recruiter for more information.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No slots available
  if (proposedSlots.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
        <div className="mx-auto max-w-lg px-4 py-12">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
            <h1 className="font-display text-2xl font-bold text-stone-900">
              No Time Slots Available
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              The recruiter hasn&apos;t proposed any time slots yet. Please check back later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Slot selection UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900">
              Schedule Your Interview
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Hi {candidateName}, please select a time that works for you.
            </p>
          </div>

          {/* Interview details card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900">{roleName}</p>
                <p className="text-xs text-stone-500">{stageName}</p>
              </div>
              {durationMins && (
                <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                  <Clock className="h-3 w-3" />
                  {durationMins} min
                </span>
              )}
            </div>

            {interviewType && (
              <p className="mt-2 text-xs text-stone-500">
                Format: {interviewType.replace(/_/g, " ")}
              </p>
            )}

            {panelistNames.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-stone-400" />
                <p className="text-xs text-stone-600">
                  {panelistNames.join(", ")}
                </p>
              </div>
            )}

            {location && (
              <div className="mt-2 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-stone-400" />
                <p className="text-xs text-stone-600">{location}</p>
              </div>
            )}

            {notes && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {notes}
              </p>
            )}
          </div>

          {/* Time slots */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Available times
            </p>
            <div className="space-y-2">
              {proposedSlots.map((slot, idx) => (
                <Button
                  key={idx}
                  variant="unstyled"
                  onClick={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                    selectedIndex === idx
                      ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                      : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      {formatDate(slot.startAt)}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatTimeRange(slot.startAt, slot.endAt)}
                    </p>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      selectedIndex === idx
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-stone-300"
                    }`}
                  >
                    {selectedIndex === idx && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Confirm button */}
          <Button
            variant="unstyled"
            onClick={handleConfirm}
            disabled={selectedIndex === null || isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Confirm Interview
              </>
            )}
          </Button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="text-center text-xs text-stone-400">
            Can&apos;t make any of these times? Reply to the scheduling email to request alternatives.
          </p>
        </div>
      </div>
    </div>
  );
}

/* -- Join Video Button (room availability aware) --------------- */

function JoinVideoButton({
  interviewId,
  scheduledAt,
  durationMins,
  token,
  meetingLink,
}: {
  interviewId: string;
  scheduledAt: string | null;
  durationMins: number | null;
  token: string;
  meetingLink?: string | null;
}) {
  const { status, countdown } = useRoomTimeStatus(scheduledAt, durationMins);

  if (!scheduledAt) return null;

  if (status === "after") {
    return (
      <p className="mt-3 text-xs text-stone-400">Interview room has closed.</p>
    );
  }

  // Use external meeting link if provided, otherwise use LiveKit room
  const joinUrl = meetingLink || `/interviews/${interviewId}/room?token=${token}`;
  const isExternal = !!meetingLink;

  if (status === "before") {
    return (
      <div className="mt-3 space-y-1">
        <Button
          variant="unstyled"
          disabled
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm font-medium text-blue-400 opacity-60"
        >
          <Video className="h-4 w-4" />
          Join Video Interview
        </Button>
        <p className="text-center text-[11px] text-stone-400">{countdown}</p>
      </div>
    );
  }

  return (
    <a
      href={joinUrl}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
    >
      <Video className="h-4 w-4" />
      Join Video Interview
    </a>
  );
}
