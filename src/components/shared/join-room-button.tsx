"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Video } from "lucide-react";

interface JoinRoomButtonProps {
  interviewId: string;
  scheduledAt: string | null;
  durationMins: number | null;
  variant?: "default" | "compact";
}

type RoomTimeStatus = "before" | "open" | "after";

export function useRoomTimeStatus(
  scheduledAt: string | null,
  durationMins: number | null,
): { status: RoomTimeStatus; countdown: string } {
  const [status, setStatus] = useState<RoomTimeStatus>("before");
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!scheduledAt) return;

    const duration = durationMins ?? 45;
    const scheduled = new Date(scheduledAt).getTime();
    const opensAt = scheduled - 15 * 60_000;
    const closesAt = scheduled + (duration + 30) * 60_000;

    const tick = () => {
      const now = Date.now();
      if (now < opensAt) {
        setStatus("before");
        const diff = opensAt - now;
        const mins = Math.floor(diff / 60_000);
        const hrs = Math.floor(mins / 60);
        setCountdown(hrs > 0 ? `Opens in ${hrs}h ${mins % 60}m` : `Opens in ${mins}m`);
      } else if (now <= closesAt) {
        setStatus("open");
        const diff = closesAt - now;
        const mins = Math.floor(diff / 60_000);
        setCountdown(`${mins}m remaining`);
      } else {
        setStatus("after");
        setCountdown("");
      }
    };

    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [scheduledAt, durationMins]);

  return { status, countdown };
}

export function JoinRoomButton({ interviewId, scheduledAt, durationMins, variant = "default" }: JoinRoomButtonProps) {
  const { status, countdown } = useRoomTimeStatus(scheduledAt, durationMins);

  if (!scheduledAt) return null;
  if (status === "after") return null;

  if (variant === "compact") {
    if (status === "before") {
      return (
        <span className="flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-400 cursor-default" title={countdown}>
          <Video className="h-3 w-3" />
          Join
        </span>
      );
    }
    return (
      <Link
        href={`/interviews/${interviewId}/room`}
        target="_blank"
        className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
      >
        <Video className="h-3 w-3" />
        Join
      </Link>
    );
  }

  if (status === "before") {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/30 px-4 py-3 space-y-1">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
          <Video className="h-3.5 w-3.5" />
          Join Video Interview
        </div>
        <p className="text-[10px] text-blue-300">{countdown}</p>
      </div>
    );
  }

  return (
    <Link
      href={`/interviews/${interviewId}/room`}
      target="_blank"
      className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-600 px-4 py-3 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
    >
      <Video className="h-3.5 w-3.5" />
      Join Video Interview
      <span className="ml-auto text-[10px] font-normal text-blue-200">{countdown}</span>
    </Link>
  );
}
