"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Button } from "@/components/ui/button";
import {
  startInterviewRecording,
  stopInterviewRecording,
} from "@/actions/livekit";

export function RecordingControls({
  interviewId,
  isPanelist,
  initialStatus,
}: {
  interviewId: string;
  isPanelist: boolean;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState<"connecting" | "active" | "off">("connecting");

  const room = useRoomContext();
  const [screenCount, setScreenCount] = useState<number | null>(null);
  const [screenshots, setScreenshots] = useState<Map<number, string>>(new Map());
  const [screenshotExpanded, setScreenshotExpanded] = useState(false);
  const urlsRef = useRef<Map<number, string>>(new Map());

  // Panelist: read screen count from candidate participant metadata on mount
  useEffect(() => {
    if (!isPanelist) return;
    for (const p of room.remoteParticipants.values()) {
      if (p.metadata) {
        try {
          const meta = JSON.parse(p.metadata);
          if (typeof meta.screenCount === "number") {
            setScreenCount(meta.screenCount);
            break;
          }
        } catch { /* ignore */ }
      }
    }
  }, [room, isPanelist]);

  // Panelist: receive screen count + screenshots from candidate
  useEffect(() => {
    if (!isPanelist) return;
    const handler = (payload: Uint8Array) => {
      // Screenshot: binary with [0x01 marker] [screen index] [jpeg data]
      if (payload[0] === 0x01) {
        const screenIdx = payload[1];
        const jpegData = payload.slice(2);
        const blob = new Blob([jpegData], { type: "image/jpeg" });
        // Revoke previous URL for this screen
        const prev = urlsRef.current.get(screenIdx);
        if (prev) URL.revokeObjectURL(prev);
        const url = URL.createObjectURL(blob);
        urlsRef.current.set(screenIdx, url);
        setScreenshots(new Map(urlsRef.current));
        return;
      }

      // JSON messages
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === "screen_count" && typeof data.count === "number") {
          setScreenCount(data.count);
        }
      } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    };
  }, [room, isPanelist]);

  // Track transcriber agent presence
  useEffect(() => {
    const checkAgent = () => {
      for (const p of room.remoteParticipants.values()) {
        if (p.isAgent) { setTranscribing("active"); return; }
      }
      setTranscribing((prev) => prev === "active" ? "off" : prev);
    };

    checkAgent();
    // Poll until agent arrives or 30s elapses (agent connect can take ~17s)
    const poll = setInterval(checkAgent, 2000);
    const stopPolling = setTimeout(() => {
      clearInterval(poll);
      // If still connecting after timeout, give up
      setTranscribing((prev) => prev === "connecting" ? "off" : prev);
    }, 30000);

    const onConnect = () => checkAgent();
    const onDisconnect = () => checkAgent();

    room.on(RoomEvent.ParticipantConnected, onConnect);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnect);
    return () => {
      clearInterval(poll);
      clearTimeout(stopPolling);
      room.off(RoomEvent.ParticipantConnected, onConnect);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnect);
    };
  }, [room]);

  const isRecording = status === "recording";

  const handleToggle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isRecording) {
        await stopInterviewRecording(interviewId);
        setStatus("processing");
      } else {
        await startInterviewRecording(interviewId);
        setStatus("recording");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recording failed");
    } finally {
      setLoading(false);
    }
  }, [interviewId, isRecording]);

  const hasScreenshots = screenshots.size > 0;

  return (
    <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
      {/* Transcription status */}
      {transcribing === "connecting" ? (
        <div className="flex items-center gap-1.5 rounded-full bg-amber-600/80 px-2.5 py-1 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          <span className="text-[10px] font-semibold text-white">
            Transcription connecting...
          </span>
        </div>
      ) : transcribing === "active" ? (
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-600/80 px-2.5 py-1 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-semibold text-white">
            Transcribing
          </span>
        </div>
      ) : null}

      {/* Screen count badge — panelists only, click to expand screenshots */}
      {isPanelist && screenCount !== null && (
        <Button
          variant="unstyled"
          onClick={() => hasScreenshots && setScreenshotExpanded((v) => !v)}
          className={`flex items-center gap-1 rounded-full px-2 py-1 backdrop-blur-sm transition-colors ${
            screenCount > 1 ? "bg-amber-500/80" : "bg-white/10"
          } ${hasScreenshots ? "cursor-pointer hover:bg-white/20" : "cursor-default"}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3 text-white">
            <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 1 1.1 1.677A.75.75 0 0 1 13.026 18H6.974a.75.75 0 0 1-.719-1.323A3.501 3.501 0 0 1 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z" clipRule="evenodd" />
          </svg>
          <span className="text-[10px] font-semibold text-white">
            {screenCount > 1 ? `${screenCount} displays` : "1 display"}
          </span>
          {hasScreenshots && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`size-2.5 text-white/60 transition-transform ${screenshotExpanded ? "rotate-180" : ""}`}>
              <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          )}
        </Button>
      )}

      {/* Recording indicator - visible to everyone */}
      {isRecording && (
        <div className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-semibold text-white uppercase tracking-wider">
            Rec
          </span>
        </div>
      )}

      {/* Processing indicator */}
      {status === "processing" && (
        <div className="flex items-center gap-1.5 rounded-full bg-amber-600/90 px-2.5 py-1 backdrop-blur-sm">
          <span className="text-[10px] font-semibold text-white">
            Processing...
          </span>
        </div>
      )}

      {/* Record toggle - panelists only */}
      {isPanelist && status !== "processing" && (
        <Button
          variant="unstyled"
          onClick={handleToggle}
          disabled={loading}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors backdrop-blur-sm ${
            isRecording
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
          } disabled:opacity-50`}
        >
          {loading ? (
            <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <span
              className={`h-3 w-3 rounded-full ${
                isRecording ? "bg-red-500" : "bg-red-500/60"
              }`}
            />
          )}
          {loading
            ? isRecording
              ? "Stopping..."
              : "Starting..."
            : isRecording
              ? "Stop Recording"
              : "Record"}
        </Button>
      )}

      {/* Error toast */}
      {error && (
        <div className="rounded-lg bg-red-900/90 px-3 py-1.5 text-[11px] text-red-200 backdrop-blur-sm">
          {error}
        </div>
      )}

      {/* Expanded screenshots popover — panelists only */}
      {isPanelist && screenshotExpanded && hasScreenshots && (
        <div className="absolute top-full left-0 mt-2 z-50">
          <div className="flex gap-2 rounded-xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-sm bg-black/80 p-2">
            {Array.from(screenshots.entries())
              .sort(([a], [b]) => a - b)
              .map(([idx, url]) => (
                <div key={idx} className="flex flex-col items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Screen ${idx + 1}`}
                    className="max-w-[400px] max-h-[280px] rounded-lg object-contain"
                  />
                  <span className="mt-1 text-[9px] text-white/40">
                    Screen {idx + 1}
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-1 text-center text-[9px] text-white/30">
            Updates every 2 min
          </div>
        </div>
      )}
    </div>
  );
}
