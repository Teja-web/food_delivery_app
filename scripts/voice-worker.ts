/**
 * Voice Worker — LiveKit Agent for real-time interview transcription.
 *
 * Pipeline: AudioStream → continuous raw buffer + VAD timing → merge → Groq Whisper
 *
 * Raw audio frames are stored continuously. VAD only provides timing
 * (start/end of speech). On END_OF_SPEECH, we slice the raw buffer
 * from the marked start index — no gaps, no overlap, no VAD frame mixing.
 *
 * Flush triggers:
 *   - 2.2s of confirmed silence after last speech
 *   - Buffer exceeds 25s
 *   - Participant disconnects
 *
 * Run: pnpm start:voice dev
 */

import {
  type JobContext,
  type JobProcess,
  defineAgent,
  WorkerOptions,
  cli,
  VADEventType,
} from "@livekit/agents";
import type { VAD } from "@livekit/agents-plugin-silero";
import type { RemoteParticipant, RemoteTrack, RemoteTrackPublication, AudioFrame } from "@livekit/rtc-node";

// Suppress known @livekit/agents VAD teardown bug
process.on("unhandledRejection", (err: unknown) => {
  if (err instanceof TypeError && (err as TypeError).message.includes("WritableStream is locked")) return;
  console.error("Unhandled rejection:", err);
});

// Prevent ONNX C++ destructor mutex crash on exit.
// The Silero ONNX runtime's thread pool destructor hits a bad mutex during
// normal process teardown. SIGKILL skips C++ destructors entirely.
// Only in forked child processes (process.send exists via IPC), not the parent supervisor.
if (process.send) {
  process.on("exit", () => {
    process.kill(process.pid, "SIGKILL");
  });
}

// -- Config -------------------------------------------------------

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const FLUSH_SILENCE_MS = 3500;
const MAX_BUFFER_SECS = 22;
const MIN_CHUNK_SECS = 4;
const PRE_ROLL_FRAMES = 50;  // ~1s ring buffer to capture speech onset

const VAD_OPTIONS = {
  minSilenceDuration: 600,
  minSpeechDuration: 300,
  prefixPaddingDuration: 500,
} as const;

// -- Groq Whisper HTTP --------------------------------------------

function encodeWav(pcm: Int16Array, sampleRate: number, channels: number): ArrayBuffer {
  const byteLength = pcm.length * 2;
  const buf = new ArrayBuffer(44 + byteLength);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + byteLength, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, byteLength, true);
  new Int16Array(buf, 44).set(pcm);
  return buf;
}

async function transcribe(frames: AudioFrame[]): Promise<string | null> {
  if (frames.length === 0) return null;
  const sr = frames[0].sampleRate;
  const ch = frames[0].channels;

  // Use subarray (not buffer+offset) to avoid reading past valid data
  let total = 0;
  for (const f of frames) total += f.samplesPerChannel * ch;
  const pcm = new Int16Array(total);
  let off = 0;
  for (const f of frames) {
    const len = f.samplesPerChannel * ch;
    pcm.set(f.data.subarray(0, len), off);
    off += len;
  }

  const durSec = total / ch / sr;
  const wavBuffer = encodeWav(pcm, sr, ch);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: (() => {
        const form = new FormData();
        form.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "audio.wav");
        form.append("model", "whisper-large-v3-turbo");
        form.append("language", "en");
        form.append("prompt", "This is a job interview between a panel of interviewers and a candidate. The conversation is professional, in English, and may include technical terminology, company names, and role-specific vocabulary.");
        return form;
      })(),
    });
    if (!res.ok) { console.error(`[stt] Groq ${res.status}`); return null; }
    const data = await res.json();
    return data.text?.trim() || null;
  } catch (e) {
    console.error("[stt] fetch failed:", e);
    return null;
  }
}

// -- Helpers ------------------------------------------------------

function bufferDuration(frames: AudioFrame[]): number {
  if (frames.length === 0) return 0;
  let samples = 0;
  for (const f of frames) samples += f.samplesPerChannel * f.channels;
  return samples / frames[0].sampleRate;
}

// -- Agent --------------------------------------------------------

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    // Lazy-load heavy native modules to keep idle memory low
    const [{ VAD: VADLoader }, { RoomEvent, AudioStream, TrackKind }] = await Promise.all([
      import("@livekit/agents-plugin-silero"),
      import("@livekit/rtc-node"),
    ]);
    const vad = await VADLoader.load(VAD_OPTIONS);

    const jobMeta = JSON.parse(ctx.job.metadata || "{}");
    const interviewId: string | undefined = jobMeta.interviewId;
    console.log(`[transcription] Room: ${ctx.room.name}, interview: ${interviewId ?? "MISSING"}`);

    const transcript: Array<{ speaker: string; text: string; timestamp: string; seq: number }> = [];
    let seqCounter = 0;
    const participantDone = new Map<string, Promise<void>>();
    // Track active sessions so we can flush + tear down on rejoin/shutdown
    const activeSessions = new Map<string, { stop: () => void; flushAndWait: () => Promise<void> }>();

    ctx.room.on(RoomEvent.TrackSubscribed, async (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;

      const name = participant.name || participant.identity;

      // Tear down previous session if participant is rejoining
      const prev = activeSessions.get(participant.identity);
      if (prev) {
        console.log(`[transcription] ${name} rejoined — flushing + cleaning up previous session`);
        await prev.flushAndWait();
        prev.stop();
        activeSessions.delete(participant.identity);
      }

      console.log(`[transcription] Subscribed: ${name}`);

      // Each participant gets its own stream from the shared VAD model
      const vadStream = vad.stream();

      let stopped = false;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let lastSpeechAt = 0;
      let speechActive = false;

      // Pre-roll ring buffer: keeps last ~1s for speech onset capture.
      // For the first speech event, we use a larger initial buffer (~3s)
      // to handle VAD warmup latency.
      const preRollBuffer: AudioFrame[] = [];
      let firstSpeech = true;
      const INITIAL_PRE_ROLL = 150; // ~3s for first speech (VAD warmup)

      // Merge buffer: frames pushed inline while speech is active
      let mergeBuffer: AudioFrame[] = [];
      const pendingSTT: Promise<void>[] = [];

      let shortRetries = 0;

      function flushBuffer(force = false) {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (mergeBuffer.length === 0) return;

        const dur = bufferDuration(mergeBuffer);

        // Wait for more speech if buffer is short — but only retry once.
        // If no new speech arrives after the second silence gap, send it.
        if (!force && dur < MIN_CHUNK_SECS && shortRetries === 0) {
          shortRetries++;
    
          scheduleFlush();
          return;
        }
        shortRetries = 0;

        const frames = mergeBuffer;
        mergeBuffer = [];
        const seq = seqCounter++;
        const timestamp = new Date().toISOString();

        const p = (async () => {
          const text = await transcribe(frames);
          if (!text) return;
          transcript.push({ speaker: name, text, timestamp, seq });

          if (ctx.room.localParticipant) {
            try {
              await ctx.room.localParticipant.publishData(
                new TextEncoder().encode(JSON.stringify({
                  type: "transcript", speaker: name, text, timestamp,
                })),
                { reliable: true },
              );
            } catch (e) {
              console.warn("[publishData failed]", e);
            }
          }
        })();
        pendingSTT.push(p);
      }

      function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          if (Date.now() - lastSpeechAt >= FLUSH_SILENCE_MS) {
            flushBuffer();
          }
        }, FLUSH_SILENCE_MS);
      }

      // Audio loop: feed VAD + capture frames inline while speech is active
      (async () => {
        const audioStream = new AudioStream(track);
        for await (const frame of audioStream) {
          if (stopped) break;

          // Feed VAD
          vadStream.pushFrame(frame);

          // Always maintain pre-roll buffer (larger limit until first speech detected)
          preRollBuffer.push(frame);
          const maxPreRoll = firstSpeech ? INITIAL_PRE_ROLL : PRE_ROLL_FRAMES;
          if (preRollBuffer.length > maxPreRoll) preRollBuffer.shift();

          // Capture frames inline while speech is active
          if (speechActive) {
            mergeBuffer.push(frame);
            if (bufferDuration(mergeBuffer) >= MAX_BUFFER_SECS) {
              flushBuffer(false);
            }
          }
        }

      })();

      // VAD loop: controls speechActive flag, schedules flushes
      (async () => {
        try {
          for await (const ev of vadStream) {
            if (stopped) break;

            if (ev.type === VADEventType.START_OF_SPEECH) {
              lastSpeechAt = Date.now();
              speechActive = true;

              // Cancel pending flush — more speech coming
              if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

              // Inject pre-roll frames to capture speech onset
              mergeBuffer.push(...preRollBuffer);
              firstSpeech = false;
              continue;
            }

            if (ev.type === VADEventType.END_OF_SPEECH) {
              lastSpeechAt = Date.now();
              speechActive = false;
              // Clear pre-roll so next START doesn't inject frames already in mergeBuffer
              preRollBuffer.length = 0;
              // Schedule flush after silence gap
              scheduleFlush();
              continue;
            }
          }
        } catch { /* vad closed */ }
      })();

      function teardown() {
        stopped = true;
        speechActive = false;
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }

        // Close this participant's VAD stream (shared model stays alive)
        try { vadStream.close(); } catch { /* already closed */ }
      }

      /** Flush remaining audio and wait for all STT to complete */
      async function flushAndWait() {
        if (mergeBuffer.length > 0) {
          flushBuffer(true);
        }
        await Promise.allSettled(pendingSTT);
      }

      // Register session so rejoin/shutdown can flush + tear down
      activeSessions.set(participant.identity, { stop: teardown, flushAndWait });

      // Disconnect → flush → wait for STT → done
      const done = new Promise<void>((resolve) => {
        ctx.room.on(RoomEvent.ParticipantDisconnected, async (p: RemoteParticipant) => {
          if (p.identity !== participant.identity) return;
            // Flush whatever is in the buffer — always send on disconnect
          if (mergeBuffer.length > 0) {
            flushBuffer(true);
          }

          teardown();
          activeSessions.delete(participant.identity);

          // Wait for all STT requests to complete
          await Promise.allSettled(pendingSTT);
          resolve();
        });
      });
      participantDone.set(participant.identity, done);
    });

    // Fallback shutdown callback (for external kills — normal flow saves before exit)
    ctx.addShutdownCallback(async () => {
      console.log(`[transcription] Shutdown callback: ${transcript.length} segments`);
      // Only save if we haven't already (check if sessions still active)
      if (activeSessions.size > 0 && interviewId && transcript.length > 0) {
        await saveTranscript(interviewId, transcript);
      }
    });

    await new Promise<void>((resolve) => {
      ctx.room.on(RoomEvent.Disconnected, () => resolve());
    });

    // Room disconnected — save transcript before exiting
    console.log(`[transcription] Room disconnected: ${transcript.length} segments, ${activeSessions.size} active sessions`);

    // Flush all active sessions' buffers
    const flushPromises: Promise<void>[] = [];
    for (const [id, session] of activeSessions) {
      flushPromises.push(session.flushAndWait());
    }
    await Promise.race([
      Promise.allSettled(flushPromises),
      new Promise((r) => setTimeout(r, 8000)),
    ]);

    // Tear down sessions
    for (const [id, session] of activeSessions) {
      session.stop();
      activeSessions.delete(id);
    }

    // Wait for any participants that disconnected normally
    await Promise.race([
      Promise.allSettled([...participantDone.values()]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);

    // Save transcript to DB
    if (!interviewId) {
      console.error(`[transcription] No interviewId`);
    } else if (transcript.length === 0) {
      console.warn(`[transcription] Empty transcript`);
    } else {
      await saveTranscript(interviewId, transcript);
    }

    // Child process handled one job — exit so the pool reclaims memory.
    // The parent process will spawn a fresh lightweight child for the next job.
    console.log("[voice-worker] Job done — exiting child process to free memory");
    process.exit(0);
  },
});

// -- Save transcript to DB ----------------------------------------

async function saveTranscript(
  interviewId: string,
  transcript: Array<{ speaker: string; text: string; timestamp: string; seq: number }>,
) {
  try {
    const { db } = await import("../src/db/client.js");
    const { interviews } = await import("../src/db/schema/index.js");
    const { eq } = await import("drizzle-orm");

    // Check if interview is past its scheduled end
    const interview = await db.query.interviews.findFirst({
      where: eq(interviews.id, interviewId),
      columns: { scheduledAt: true, durationMins: true },
    });
    const scheduledEnd = interview?.scheduledAt && interview?.durationMins
      ? new Date(new Date(interview.scheduledAt).getTime() + interview.durationMins * 60_000)
      : null;
    const isPastEnd = scheduledEnd ? new Date() >= scheduledEnd : false;

    transcript.sort((a, b) => a.seq - b.seq);
    const diarizedText = transcript
      .map((t) => `[${t.speaker}] ${t.text}`)
      .join("\n");

    await db
      .update(interviews)
      .set({
        transcript: diarizedText,
        recordingStatus: "ready",
        ...(isPastEnd && { status: "completed" }),
        updatedAt: new Date(),
      })
      .where(eq(interviews.id, interviewId));

    console.log(`[transcription] Saved: ${interviewId} (${transcript.length} segments, completed=${isPastEnd})`);
  } catch (e) {
    console.error("[transcription] Save failed:", e);
  }
}

// -- CLI ----------------------------------------------------------

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "transcriber";
cli.runApp(new WorkerOptions({ agent: import.meta.filename, agentName: AGENT_NAME, numIdleProcesses: 0 }));
