"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  ControlBar,
  useRoomContext,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import "@livekit/components-styles";
import { RoomSidebar } from "@/components/livekit/RoomSidebar";
import { RecordingControls } from "@/components/livekit/RecordingControls";
import {
  LiveAssessmentPanel,
  type AssessmentMirrorState,
} from "@/components/livekit/LiveAssessmentPanel";
import { SSEProvider, useEntityEvent } from "@/hooks/use-entity-event";
import { updateLiveAssessment, fetchInterviewLiveAttempts } from "@/actions/assessments";
import type { InterviewRoomProps, RoomAssessmentData } from "./serialize";
import type { RoomInfoTab, RoomGuideTab, RoomFeedbackTab, RoomAssessmentLauncher } from "./serialize";
import { Button } from "@/components/ui/button";

/* -- Pre-join gate (all candidates) ----------------------------- */

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

interface PreJoinResult {
  screenCount: number;
  displayStreams: MediaStream[];
}

interface ScreenInfo {
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

function PreJoinGate({
  proctored,
  onReady,
}: {
  proctored: boolean;
  onReady: (result: PreJoinResult) => void;
}) {
  // All hooks must be declared before any conditional returns (React rules of hooks)

  // Use state for mobile detection to avoid hydration mismatch
  // Server and client both start with false, then client updates after mount
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState<
    "permissions" | "detecting" | "sharing" | "done"
  >("permissions");
  const [micGranted, setMicGranted] = useState(false);
  const [camGranted, setCamGranted] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  // null = unknown (Firefox/Safari), populated on Chromium
  const [screenInfos, setScreenInfos] = useState<ScreenInfo[] | null>(null);
  const [streams, setStreams] = useState<MediaStream[]>([]);
  const [shareError, setShareError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  const knownCount = screenInfos?.length ?? null;

  // Request mic + camera permissions (unlocks browser audio autoplay)
  // On mobile, request separately for better compatibility
  const handleRequestMedia = useCallback(async () => {
    setMediaError(null);
    setRequesting(true);

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[PreJoinGate] mediaDevices API not available");
      setRequesting(false);
      setMediaError(
        "Your browser does not support camera/microphone access. Please use a modern browser like Chrome or Safari.",
      );
      return;
    }

    try {
      // Request audio first (more likely to succeed on mobile)
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach((t) => t.stop());
      setMicGranted(true);

      // Then request video
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoStream.getTracks().forEach((t) => t.stop());
      setCamGranted(true);

      if (proctored) {
        // Move to screen detection/sharing
        setStep("detecting");
        if ("getScreenDetails" in window) {
          try {
            const details = await (window as any).getScreenDetails();
            const infos: ScreenInfo[] = Array.from(details.screens).map(
              (s: any) => ({
                label: s.label || `${s.width}x${s.height}`,
                width: s.width,
                height: s.height,
                isPrimary: s.isPrimary,
              }),
            );
            setScreenInfos(infos);
          } catch {
            // denied — proceed without info
          }
        }
        setStep("sharing");
      } else {
        // Non-proctored: permissions granted, join directly
        setStep("done");
        onReady({ screenCount: 0, displayStreams: [] });
      }
    } catch (err) {
      setRequesting(false);
      const error = err as Error;
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (error.name === "NotAllowedError") {
        setMediaError(
          isMobileDevice
            ? "Camera and microphone access was denied. Please tap the address bar, find site settings, and allow camera and microphone access. Then refresh the page."
            : "Microphone and camera access is required to join the interview. Please allow access in your browser settings and try again.",
        );
      } else if (error.name === "NotFoundError") {
        setMediaError(
          "No camera or microphone found. Please connect a camera and microphone to join the interview.",
        );
      } else if (error.name === "NotReadableError") {
        setMediaError(
          "Camera or microphone is in use by another app. Please close other apps using your camera or microphone and try again.",
        );
      } else {
        setMediaError(
          isMobileDevice
            ? "Unable to access camera and microphone. Please check your browser settings and ensure this site has permission to use your camera and microphone."
            : "Microphone and camera access is required to join the interview. Please allow access in your browser settings and try again.",
        );
      }
    }
  }, [proctored, onReady]);

  // Request one screen share (proctored only)
  const handleShareScreen = useCallback(async () => {
    setShareError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          frameRate: 1,
        } as MediaTrackConstraints,
        audio: false,
      });

      // Reject tab or window shares — only full screen is allowed
      const surface =
        stream.getVideoTracks()[0]?.getSettings()?.displaySurface;
      if (surface && surface !== "monitor") {
        stream.getTracks().forEach((t) => t.stop());
        setShareError(
          'Please share your entire screen, not a browser tab or window. ' +
          'Select the "Entire Screen" option in the sharing prompt.',
        );
        return;
      }

      // Reject duplicate screen
      if (
        streams.some(
          (s) =>
            s.getVideoTracks()[0]?.label === stream.getVideoTracks()[0]?.label,
        )
      ) {
        stream.getTracks().forEach((t) => t.stop());
        setShareError(
          "You already shared this screen. Please select a different one.",
        );
        return;
      }

      const next = [...streams, stream];
      setStreams(next);

      // If we know the exact count (Chromium) and have all screens, auto-finish
      if (knownCount !== null && next.length >= knownCount) {
        setStep("done");
        onReady({ screenCount: knownCount, displayStreams: next });
      }
      // Otherwise stay on sharing step — user decides when they're done
    } catch {
      // Denied or cancelled — if we already have at least one, let them join
      if (streams.length > 0) {
        setStep("done");
        onReady({
          screenCount: knownCount ?? streams.length,
          displayStreams: streams,
        });
      }
      // If no streams yet and they cancelled, stay on the step
    }
  }, [streams, knownCount, onReady]);

  // Finish with whatever we have
  const handleJoin = useCallback(() => {
    setStep("done");
    onReady({
      screenCount: knownCount ?? streams.length,
      displayStreams: streams,
    });
  }, [knownCount, streams, onReady]);

  const sharedCount = streams.length;

  // Block proctored tests on mobile - screen sharing not supported
  if (proctored && isMobile) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0f0f0f]">
        <div className="mx-4 max-w-md rounded-2xl bg-neutral-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-6 w-6 text-amber-400"
            >
              <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm2 0v10h12V6H6ZM2 20h20v2H2v-2Z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-white">
            Desktop Required
          </h2>
          <p className="text-sm text-neutral-400 mb-6">
            This proctored assessment requires screen sharing, which is not
            supported on mobile devices. Please join from a desktop or laptop
            computer.
          </p>
          <div className="rounded-lg bg-neutral-800 px-4 py-3 text-left">
            <p className="text-xs text-neutral-500 mb-1">What you&apos;ll need:</p>
            <ul className="text-sm text-neutral-300 space-y-1">
              <li>• Desktop or laptop computer</li>
              <li>• Chrome, Edge, or Firefox browser</li>
              <li>• Working camera and microphone</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#0f0f0f]">
      <div className="mx-4 max-w-md rounded-2xl bg-neutral-900 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-6 w-6 text-white"
          >
            {step === "permissions" ? (
              <path d="M7 4a3 3 0 0 1 6 0v6a3 3 0 1 1-6 0V4Zm-1.5 6a4.5 4.5 0 0 0 9 0V4a4.5 4.5 0 0 0-9 0v6ZM10 15.5a5.5 5.5 0 0 0 5.5-5.5h1a6.5 6.5 0 0 1-6 6.481V18.5h3v1h-7v-1h3v-2.019A6.5 6.5 0 0 1 3.5 10h1A5.5 5.5 0 0 0 10 15.5Z" />
            ) : (
              <path
                fillRule="evenodd"
                d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 1 1.1 1.677A.75.75 0 0 1 13.026 18H6.974a.75.75 0 0 1-.719-1.323A3.501 3.501 0 0 1 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z"
                clipRule="evenodd"
              />
            )}
          </svg>
        </div>

        {step === "permissions" && (
          <>
            <h2 className="mb-2 text-lg font-semibold text-white">
              {proctored ? "Proctored Interview" : "Join Interview"}
            </h2>
            <p className="mb-4 text-sm text-neutral-400">
              {proctored
                ? "This is a proctored session. Your screen will be monitored during the interview."
                : "Allow microphone and camera access to join the call."}
            </p>
            {proctored && (
              <p className="mb-4 text-xs text-neutral-500">
                Please close any sensitive applications, browser tabs, and
                interview assistance tools before continuing.
              </p>
            )}

            {/* Permission status indicators */}
            <div className="mb-5 flex items-center justify-center gap-4 text-xs">
              <span className={`flex items-center gap-1.5 ${micGranted ? "text-emerald-400" : "text-neutral-500"}`}>
                <span className={`h-2 w-2 rounded-full ${micGranted ? "bg-emerald-500" : "bg-neutral-600"}`} />
                Microphone
              </span>
              <span className={`flex items-center gap-1.5 ${camGranted ? "text-emerald-400" : "text-neutral-500"}`}>
                <span className={`h-2 w-2 rounded-full ${camGranted ? "bg-emerald-500" : "bg-neutral-600"}`} />
                Camera
              </span>
            </div>

            {mediaError && (
              <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
                <p className="text-sm text-red-400">{mediaError}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleRequestMedia}
              disabled={requesting}
              className="w-full rounded-lg bg-white px-4 py-3.5 text-base font-medium text-black transition-colors hover:bg-neutral-200 active:bg-neutral-300 touch-manipulation min-h-[48px] disabled:opacity-70 cursor-pointer"
            >
              {requesting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Requesting access...
                </span>
              ) : (
                proctored ? "I understand — Continue" : "Allow Camera & Microphone"
              )}
            </button>
          </>
        )}

        {step === "detecting" && (
          <>
            <h2 className="mb-2 text-lg font-semibold text-white">
              Detecting displays...
            </h2>
            <p className="text-sm text-neutral-400">
              Please allow display detection when prompted.
            </p>
          </>
        )}

        {step === "sharing" && (
          <>
            {/* Screen name for Chromium, generic for others */}
            {screenInfos && sharedCount < screenInfos.length ? (
              <>
                <h2 className="mb-2 text-lg font-semibold text-white">
                  Share screen {sharedCount + 1} of {screenInfos.length}
                </h2>
                <div className="mb-4 rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                  <p className="text-sm font-medium text-white">
                    {screenInfos[sharedCount].label}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {screenInfos[sharedCount].width}x
                    {screenInfos[sharedCount].height}
                    {screenInfos[sharedCount].isPrimary ? " — Primary" : ""}
                  </p>
                </div>
                <p className="mb-4 text-xs text-neutral-500">
                  Select this screen in the browser prompt.
                </p>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-semibold text-white">
                  {sharedCount === 0
                    ? "Share your screen"
                    : `Screen ${sharedCount + 1}`}
                </h2>
                <p className="mb-4 text-sm text-neutral-400">
                  Select &quot;Entire Screen&quot; in the prompt.
                </p>
              </>
            )}

            {/* Progress dots for known count */}
            {knownCount !== null && knownCount > 1 && (
              <div className="mb-4 flex justify-center gap-1.5">
                {Array.from({ length: knownCount }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full ${
                      i < sharedCount ? "bg-emerald-500" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
            )}

            {shareError && (
              <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
                <p className="text-sm text-red-400">{shareError}</p>
              </div>
            )}

            <Button
              variant="unstyled"
              onClick={handleShareScreen}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              {screenInfos && sharedCount < screenInfos.length
                ? `Share "${screenInfos[sharedCount].label}"`
                : sharedCount === 0
                  ? "Share Screen"
                  : "Share Next Screen"}
            </Button>

            {/* Join once all known screens are shared, or let candidate confirm on unknown-count browsers */}
            {sharedCount > 0 &&
              (knownCount === null || sharedCount >= knownCount) && (
                <Button
                  variant="unstyled"
                  onClick={handleJoin}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  Screens shared — Join Interview
                </Button>
              )}
          </>
        )}

        {step === "done" && (
          <>
            <h2 className="mb-2 text-lg font-semibold text-white">
              Joining interview...
            </h2>
            <span className="inline-block h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </>
        )}
      </div>
    </div>
  );
}

/* -- Broadcast screen count + screenshots every 2 min ---------- */

const BROADCAST_INTERVAL_MS = 60_000; // 1 minute
const SCREENSHOT_MAX_WIDTH = 640;
const SCREENSHOT_QUALITY = 0.5;

function ScreenInfoBroadcaster({
  screenCount,
  displayStreams,
}: {
  screenCount: number;
  displayStreams: MediaStream[];
}) {
  const room = useRoomContext();

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const tracks = displayStreams.map((s) => s.getVideoTracks()[0]).filter(Boolean);

    const publishJson = (data: object) => {
      if (room.state !== "connected") return;
      room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(data)), { reliable: true })
        .catch(() => {});
    };

    // Capture a frame from a track — use ImageCapture when available, video fallback otherwise
    const captureFrame = async (track: MediaStreamTrack): Promise<ImageBitmap | null> => {
      if (typeof ImageCapture !== "undefined") {
        try {
          const ic = new ImageCapture(track);
          return await ic.grabFrame();
        } catch { /* track may be ended or paused */ }
      }
      // Fallback: pump through a temporary video element
      const video = document.createElement("video");
      video.srcObject = new MediaStream([track]);
      video.muted = true;
      video.playsInline = true;
      document.body.appendChild(video);
      try {
        await video.play();
        // Wait for at least one frame
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) { resolve(); return; }
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          setTimeout(resolve, 2000);
        });
        if (video.videoWidth === 0) return null;
        return await createImageBitmap(video);
      } catch { return null; }
      finally { video.pause(); video.srcObject = null; video.remove(); }
    };

    const captureAndSend = async () => {
      // Re-check screen count (may have changed)
      let currentCount = screenCount;
      if ("getScreenDetails" in window) {
        try {
          const details = await (window as any).getScreenDetails();
          currentCount = details.screens.length;
        } catch { /* use initial */ }
      }

      publishJson({ type: "screen_count", count: currentCount });

      // Persist screen count in participant metadata so panelists get it on join
      try {
        room.localParticipant.setMetadata(
          JSON.stringify({ screenCount: currentCount }),
        );
      } catch { /* metadata update failed — data channel still delivers */ }

      // Capture a screenshot from each track
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track.readyState !== "live") continue;

        const bitmap = await captureFrame(track);
        if (!bitmap || room.state !== "connected") continue;

        const scale = Math.min(1, SCREENSHOT_MAX_WIDTH / bitmap.width);
        canvas.width = bitmap.width * scale;
        canvas.height = bitmap.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) { bitmap.close(); continue; }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((r) =>
          canvas.toBlob(r, "image/jpeg", SCREENSHOT_QUALITY),
        );
        if (!blob || room.state !== "connected") continue;

        const buf = await blob.arrayBuffer();
        // Tag: [0x01 = screenshot marker] [screen index byte] [jpeg data]
        const tagged = new Uint8Array(buf.byteLength + 2);
        tagged[0] = 0x01;
        tagged[1] = i;
        tagged.set(new Uint8Array(buf), 2);
        room.localParticipant.publishData(tagged, { reliable: true }).catch(() => {});
      }
    };

    // Broadcast immediately + every interval
    const initialTimeout = setTimeout(captureAndSend, 3000);
    const interval = setInterval(captureAndSend, BROADCAST_INTERVAL_MS);

    // Re-send when a new participant joins (so panelist gets screenshots on join/reconnect)
    const onParticipantConnected = () => {
      setTimeout(captureAndSend, 1000);
    };
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);

    // Detect if candidate stops a screen share
    const trackHandlers: Array<[MediaStreamTrack, () => void]> = [];
    for (const stream of displayStreams) {
      const track = stream.getVideoTracks()[0];
      if (!track) continue;
      const onEnded = () => publishJson({ type: "screen_share_ended" });
      track.addEventListener("ended", onEnded);
      trackHandlers.push([track, onEnded]);
    }

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      // No persistent video elements to clean up (captureFrame creates/destroys its own)
      for (const [track, handler] of trackHandlers) track.removeEventListener("ended", handler);
    };
  }, [room, screenCount, displayStreams]);

  return null;
}

/* -- Video content ------------------------------------------- */

function RoomContent() {
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Filter out agent participants (transcriber) from the video grid
  const tracks = allTracks.filter(
    (t) => !t.participant.isAgent,
  );

  // Create stable key based on track sources to force re-mount when tracks change
  const gridKey = tracks.map((t) => `${t.participant.identity}_${t.source}_${t.publication?.trackSid ?? 'placeholder'}`).join('|');

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <GridLayout key={gridKey} tracks={tracks} style={{ flex: 1, minHeight: 0 }}>
        <ParticipantTile />
      </GridLayout>
      <ControlBar controls={{ settings: false }} />
      <RoomAudioRenderer />
    </div>
  );
}

/* -- Data channel + assessment wiring ----------------------- */

function RoomWithAssessments({
  interviewId,
  isPanelist,
  sidebar,
  sidebarOpen,
  setSidebarOpen,
  initialRecordingStatus,
  initialAssessments,
}: {
  interviewId: string;
  isPanelist: boolean;
  sidebar: InterviewRoomProps["sidebar"];
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  initialRecordingStatus: string;
  initialAssessments: RoomAssessmentData[];
}) {
  const room = useRoomContext();
  const [assessments, setAssessments] = useState<RoomAssessmentData[]>(initialAssessments);
  const [mirrorState, setMirrorState] = useState<AssessmentMirrorState | null>(null);

  // -- Shared refetch helper ----------------------------------
  const refetchAssessments = useCallback(async () => {
    const updated = await fetchInterviewLiveAttempts(interviewId);
    setAssessments(updated.map((a) => ({
      attemptId: a.attemptId,
      assessmentId: a.assessmentId,
      title: a.title,
      status: a.status,
      questions: a.questions,
      existingAnswers: a.existingAnswers,
      deadlineAt: a.deadlineAt,
      startedAt: a.startedAt,
    })));
  }, [interviewId]);

  // -- Broadcast assessment refresh to candidate via data channel --
  const broadcastAssessmentRefresh = useCallback(() => {
    if (!isPanelist || room.state !== "connected") return;
    room.localParticipant
      .publishData(
        new TextEncoder().encode(JSON.stringify({ type: "assessment_refresh" })),
        { reliable: true },
      )
      .catch(() => {});
  }, [room, isPanelist]);

  // -- SSE: detect assessment changes (works for panelists; candidates
  //    may not have a session so SSE might not connect — the data
  //    channel listener below covers that gap) -------------------
  useEntityEvent("assessment_attempt", undefined, async () => {
    await refetchAssessments();
  });

  // -- Data channel: receive assessment refresh + mirror state --
  useEffect(() => {
    const handler = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === "assessment_state" && isPanelist) {
          setMirrorState(data as AssessmentMirrorState);
        } else if (data.type === "assessment_refresh" && !isPanelist) {
          refetchAssessments();
        }
      } catch {
        // Non-JSON or unrecognised message
      }
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, isPanelist, refetchAssessments]);

  // -- Data channel: candidate broadcasts state ---------------
  const broadcastState = useCallback(
    (state: AssessmentMirrorState) => {
      if (isPanelist || room.state !== "connected") return;
      room.localParticipant
        .publishData(
          new TextEncoder().encode(
            JSON.stringify({ type: "assessment_state", ...state }),
          ),
          { reliable: true },
        )
        .catch(() => {
          // Room disconnected between check and publish
        });
    },
    [room, isPanelist],
  );

  // -- Auto-save handler --------------------------------------
  const handleAutoSave = useCallback(
    async (answers: Record<string, string>) => {
      const active = assessments[0];
      if (!active) return;
      await updateLiveAssessment(active.attemptId, { answers });
    },
    [assessments],
  );

  // -- Submit handler (answers already auto-saved, just flip status) --
  const handleSubmit = useCallback(
    async () => {
      const active = assessments[0];
      if (!active) return;
      await updateLiveAssessment(active.attemptId, { status: "submitted" });
      // Refresh to update UI with submitted status
      await refetchAssessments();
    },
    [assessments, refetchAssessments],
  );

  // -- Layout widths ------------------------------------------
  const hasAssessment = assessments.length > 0;
  const hasSidebar = !!sidebar && sidebarOpen;

  const videoWidth = hasAssessment && hasSidebar
    ? "w-[40%]"
    : hasAssessment
      ? "w-[50%]"
      : hasSidebar
        ? "w-[70%]"
        : "w-full";

  const assessmentWidth = hasSidebar ? "w-[30%]" : "w-[50%]";

  // Multi-assessment tab support
  const [activeAssessmentIndex, setActiveAssessmentIndex] = useState(0);
  const activeAssessment = assessments[activeAssessmentIndex] ?? assessments[0] ?? null;

  return (
    <>
      {/* Video area */}
      <div className={`relative h-full ${videoWidth} transition-all duration-200`}>
        <RoomContent />
        <RecordingControls
          interviewId={interviewId}
          isPanelist={isPanelist}
          initialStatus={initialRecordingStatus}
        />
      </div>

      {/* Assessment panel */}
      {activeAssessment && (
        <div className={`h-full ${assessmentWidth} border-l border-white/10 transition-all duration-200 flex flex-col`}>
          {assessments.length > 1 && (
            <div className="flex border-b border-white/10 shrink-0">
              {assessments.map((a, i) => (
                <button
                  key={a.attemptId}
                  onClick={() => setActiveAssessmentIndex(i)}
                  className={`px-3 py-2 text-xs transition-colors ${
                    i === activeAssessmentIndex
                      ? "border-b-2 border-primary text-white font-medium"
                      : "text-white/60 hover:text-white/80"
                  }`}
                >
                  {a.title ?? `Assessment ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          {isPanelist ? (
            <LiveAssessmentPanel
              key={`panelist-${activeAssessment.attemptId}`}
              attemptId={activeAssessment.attemptId}
              title={activeAssessment.title}
              questions={activeAssessment.questions}
              deadlineAt={activeAssessment.deadlineAt}
              room={room}
              readOnly
              mirrorState={mirrorState ?? {
                questionIndex: 0,
                answers: activeAssessment.existingAnswers ?? {},
                status: activeAssessment.status,
              }}
            />
          ) : (
            <LiveAssessmentPanel
              key={`candidate-${activeAssessment.attemptId}`}
              attemptId={activeAssessment.attemptId}
              title={activeAssessment.title}
              questions={activeAssessment.questions}
              deadlineAt={activeAssessment.deadlineAt}
              room={room}
              initialAnswers={activeAssessment.existingAnswers}
              onStateChange={broadcastState}
              onAutoSave={handleAutoSave}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      )}

      {/* Sidebar (panelists only) */}
      {sidebar && sidebarOpen && (
        <div className="w-[30%] border-l border-neutral-200 bg-[#fafafa] overflow-hidden flex flex-col">
          <RoomSidebar
            info={sidebar.info}
            guide={sidebar.guide}
            feedback={sidebar.feedback}
            assessment={sidebar.assessment}
            interviewId={interviewId}
            mirrorState={mirrorState}
            activeAssessment={activeAssessment}
            onAssessmentChange={broadcastAssessmentRefresh}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Sidebar toggle when collapsed */}
      {sidebar && !sidebarOpen && (
        <Button
          variant="unstyled"
          onClick={() => setSidebarOpen(true)}
          className="absolute right-4 top-4 z-50 rounded-lg bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20 transition-colors"
        >
          Open Panel
        </Button>
      )}
    </>
  );
}

/* -- Main component ------------------------------------------ */

export function InterviewRoom({
  connection,
  sidebar,
  interviewId,
  initialRecordingStatus,
  proctored,
  assessments: initialAssessments,
}: InterviewRoomProps) {
  const [sidebarOpen, setSidebarOpen] = useState(!!sidebar);
  const isPanelist = connection.participantRole === "panelist";
  const [preJoinResult, setPreJoinResult] = useState<PreJoinResult | null>(null);
  // Only panelists skip the pre-join gate
  const [joined, setJoined] = useState(isPanelist);

  const handlePreJoinReady = useCallback((result: PreJoinResult) => {
    setPreJoinResult(result);
    setJoined(true);
  }, []);

  const handleDisconnected = useCallback(() => {
    window.location.href = isPanelist ? `/recruit/interviews/${interviewId}` : `/coach`;
  }, [interviewId, isPanelist]);

  // All candidates see the pre-join gate (permissions + optional screen share)
  if (!joined) {
    return <PreJoinGate proctored={proctored} onReady={handlePreJoinReady} />;
  }

  // Panelists use SSE for org-wide events; candidates rely on the
  // LiveKit data channel so no SSE connection is needed.
  const content = (
    <div className="flex h-screen w-screen bg-[#0f0f0f]">
      <LiveKitRoom
        serverUrl={connection.serverUrl}
        token={connection.participantToken}
        connect={true}
        onDisconnected={handleDisconnected}
        data-lk-theme="default"
        style={{ height: "100%", width: "100%", display: "contents" }}
      >
        {/* Candidate: broadcast screen count + screenshots to panelists */}
        {!isPanelist && preJoinResult && preJoinResult.displayStreams.length > 0 && (
          <ScreenInfoBroadcaster
            screenCount={preJoinResult.screenCount}
            displayStreams={preJoinResult.displayStreams}
          />
        )}
        <RoomWithAssessments
          interviewId={interviewId}
          isPanelist={isPanelist}
          sidebar={sidebar}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          initialRecordingStatus={initialRecordingStatus}
          initialAssessments={initialAssessments}
        />
      </LiveKitRoom>
    </div>
  );

  return isPanelist
    ? <SSEProvider url="/api/events/stream">{content}</SSEProvider>
    : content;
}
