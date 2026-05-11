"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock } from "lucide-react";

interface AssessmentTimerProps {
  deadlineAt: string;
  onExpired: () => void;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AssessmentTimer({ deadlineAt, onExpired }: AssessmentTimerProps) {
  const [remaining, setRemaining] = useState(() => {
    const diff = Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  const handleExpired = useCallback(onExpired, [onExpired]);

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((new Date(deadlineAt).getTime() - Date.now()) / 1000);
      const next = Math.max(0, diff);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(timer);
        handleExpired();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [deadlineAt, handleExpired]);

  const isUrgent = remaining <= 120; // < 2 minutes

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-mono font-medium ${
        isUrgent
          ? "bg-red-500/10 text-red-400"
          : "bg-white/5 text-neutral-400"
      }`}
    >
      <Clock className="h-3 w-3" />
      <span>{formatTime(remaining)}</span>
    </div>
  );
}
