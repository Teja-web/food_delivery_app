"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKokoroTTS } from "./use-kokoro-tts";

const TARGET_SAMPLE_RATE = 16000;
const CLAUSE_PATTERN = /(?<=[.!?,;:\n])\s+/;
const MAX_AUDIO_SAMPLES = 1920000; // ~40s at 48kHz native rate

type VoicePrepState =
  | "idle"
  | "loading"
  | "listening"
  | "processing"
  | "speaking"
  | "mic-error";

type Message = {
  role: "user" | "assistant";
  content: string;
  interrupted?: boolean;
};

type ModelLoadingProgress = {
  vad: { status: string; progress: number };
  kokoro: { status: string; progress: number };
};

function downsample(buffer: Float32Array, sourceSR: number, targetSR: number): Float32Array {
  if (sourceSR === targetSR) return buffer;
  const ratio = sourceSR / targetSR;
  const newLength = Math.floor(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, buffer.length - 1);
    const frac = srcIndex - low;
    result[i] = buffer[low]! * (1 - frac) + buffer[high]! * frac;
  }
  return result;
}

type UseVoicePrepConfig = {
  interviewId?: string;
  roleId?: string;
  voice?: string;
  onTranscript?: (text: string) => void;
  onStateChange?: (state: VoicePrepState) => void;
};

export function useVoicePrep(config: UseVoicePrepConfig) {
  const { interviewId, roleId, voice = "af_heart", onTranscript, onStateChange } = config;

  const [state, setState] = useState<VoicePrepState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<ModelLoadingProgress>({
    vad: { status: "idle", progress: 0 },
    kokoro: { status: "idle", progress: 0 },
  });

  const stateRef = useRef<VoicePrepState>("idle");
  const messagesRef = useRef<Message[]>([]);
  const vadWorkerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const nativeSampleRateRef = useRef(48000);
  const audioSamplesRef = useRef<Float32Array[]>([]);
  const preBufferRef = useRef<Float32Array[]>([]); // rolling ~500ms pre-speech buffer
  const isSpeechActiveRef = useRef(false);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SEND_DELAY = 2000; // 2s of true silence after speech_end before sending
  const abortControllerRef = useRef<AbortController | null>(null);
  const vadReadyRef = useRef(false);
  const generationIdRef = useRef(0);
  const interruptFlagRef = useRef<Int32Array | null>(null);
  const sabRef = useRef<SharedArrayBuffer | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onStateChangeRef = useRef(onStateChange);

  onTranscriptRef.current = onTranscript;
  onStateChangeRef.current = onStateChange;

  // -- Kokoro TTS ---------------------------------------------

  const onQueueDrainedCallback = useCallback(() => {
    if (stateRef.current === "speaking") {
      stateRef.current = "listening";
      setState("listening");
      vadWorkerRef.current?.postMessage({ type: "set_mode", mode: "listening" });
      onStateChangeRef.current?.("listening");
    }
  }, []);

  const kokoroTts = useKokoroTTS({
    voice,
    onModelProgress: (p) => {
      const progress = p.progress ?? 0;
      setLoadingProgress((prev) => ({
        ...prev,
        kokoro: { status: p.status, progress: Math.max(prev.kokoro.progress, progress) },
      }));
    },
    onQueueDrained: onQueueDrainedCallback,
  });

  const kokoroTtsRef = useRef(kokoroTts);
  kokoroTtsRef.current = kokoroTts;

  // -- State helpers ------------------------------------------

  const updateState = useCallback((newState: VoicePrepState) => {
    stateRef.current = newState;
    setState(newState);
    onStateChangeRef.current?.(newState);
    if (newState === "speaking") {
      vadWorkerRef.current?.postMessage({ type: "set_mode", mode: "speaking" });
    } else if (newState === "listening") {
      vadWorkerRef.current?.postMessage({ type: "set_mode", mode: "listening" });
      if (interruptFlagRef.current) Atomics.store(interruptFlagRef.current, 0, 0);
    }
  }, []);

  const interrupt = useCallback(() => {
    generationIdRef.current++;
    kokoroTtsRef.current.stop();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last && last.role === "assistant" && last.content.length > 0) {
      messagesRef.current = [...messagesRef.current];
      messagesRef.current[messagesRef.current.length - 1] = { ...last, interrupted: true };
      setMessages([...messagesRef.current]);
    }
    updateState("listening");
  }, [updateState]);

  // -- Send audio to server -----------------------------------

  const sendAudioToServer = useCallback(async () => {
    const chunks = audioSamplesRef.current;
    if (chunks.length === 0) return;
    audioSamplesRef.current = [];
    preBufferRef.current = [];

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    if (totalLength === 0) return;

    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const resampled = downsample(combined, nativeSampleRateRef.current, TARGET_SAMPLE_RATE);

    generationIdRef.current++;
    const myGenId = generationIdRef.current;
    const sessionId = `gen-${myGenId}`;

    kokoroTtsRef.current.stop();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    updateState("processing");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/voice/prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: Array.from(resampled),
          sampleRate: TARGET_SAMPLE_RATE,
          ...(interviewId ? { interviewId } : { roleId }),
          history: messagesRef.current.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.status}`);
      }
      if (generationIdRef.current !== myGenId) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      let transcriptReceived = false;

      kokoroTtsRef.current.startSession(sessionId);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (generationIdRef.current !== myGenId) {
          reader.cancel();
          return;
        }

        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);

            if (msg.type === "transcript" && !transcriptReceived) {
              transcriptReceived = true;
              setCurrentTranscript(msg.text);
              onTranscriptRef.current?.(msg.text);

              // Add user message
              messagesRef.current = [...messagesRef.current, { role: "user", content: msg.text }];
              setMessages([...messagesRef.current]);

              // Add empty assistant message and switch to speaking
              messagesRef.current = [...messagesRef.current, { role: "assistant", content: "" }];
              setMessages([...messagesRef.current]);
              updateState("speaking");
              if (interruptFlagRef.current) Atomics.store(interruptFlagRef.current, 0, 0);
            }

            if (msg.type === "text") {
              fullText += msg.text;
              buffer += msg.text;

              // Update assistant message
              const lastIdx = messagesRef.current.length - 1;
              if (lastIdx >= 0 && messagesRef.current[lastIdx]!.role === "assistant") {
                messagesRef.current = [...messagesRef.current];
                messagesRef.current[lastIdx] = { ...messagesRef.current[lastIdx]!, content: fullText };
              }
              setMessages([...messagesRef.current]);

              // Send complete clauses to TTS
              const parts = buffer.split(CLAUSE_PATTERN);
              if (parts.length > 1) {
                const remainder = parts.pop()!;
                for (const clause of parts) {
                  const trimmed = clause.trim();
                  if (trimmed && generationIdRef.current === myGenId) {
                    kokoroTtsRef.current.speak(trimmed);
                  }
                }
                buffer = remainder;
              }
            }

            if (msg.type === "done") {
              // If LLM responded with just "..." it means candidate wasn't done speaking — go back to listening
              const finalText = fullText.trim();
              if (finalText === "..." || finalText === "…") {
                // Remove the empty assistant message
                const lastIdx = messagesRef.current.length - 1;
                if (lastIdx >= 0 && messagesRef.current[lastIdx]!.role === "assistant") {
                  messagesRef.current = messagesRef.current.slice(0, -1);
                  setMessages([...messagesRef.current]);
                }
                updateState("listening");
                return;
              }

              // Flush remaining buffer to TTS
              if (buffer.trim() && generationIdRef.current === myGenId) {
                kokoroTtsRef.current.speak(buffer.trim());
              }
            }
          } catch {
            // Ignore malformed lines
          }
        }
      }

      abortControllerRef.current = null;

      // Fallback: if TTS queue doesn't drain within 10s, go back to listening
      setTimeout(() => {
        if (generationIdRef.current === myGenId && stateRef.current === "speaking") {
          updateState("listening");
        }
      }, 10000);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      console.error("Voice prep error:", error);
      if (generationIdRef.current === myGenId) {
        updateState("listening");
      }
    }
  }, [interviewId, roleId, updateState]);

  // -- VAD worker ---------------------------------------------

  const initWorkers = useCallback(() => {
    const hasSAB = typeof SharedArrayBuffer !== "undefined";
    if (hasSAB) {
      const sab = new SharedArrayBuffer(4);
      sabRef.current = sab;
      interruptFlagRef.current = new Int32Array(sab);
    }

    const vadWorker = new Worker(
      new URL("../../../workers/vad-worker.ts", import.meta.url),
      { type: "module" },
    );
    vadWorker.onerror = (e) => console.error("[voice-prep] VAD worker error:", e.message, e);
    vadWorker.onmessage = (event) => {
      const data = event.data;
      if (data.type === "progress") {
        const p = data.progress ?? 0;
        setLoadingProgress((prev) => ({
          ...prev,
          vad: { status: data.status, progress: Math.max(prev.vad.progress, p) },
        }));
        if (data.status === "ready") {
          vadReadyRef.current = true;
          checkAllReady();
        }
      }
      if (data.type === "speech_start") {
        isSpeechActiveRef.current = true;
        // Cancel pending send — user is still talking
        if (sendTimerRef.current) {
          clearTimeout(sendTimerRef.current);
          sendTimerRef.current = null;
        }
        // Prepend pre-buffer so we don't lose the first syllables
        if (preBufferRef.current.length > 0) {
          audioSamplesRef.current.push(...preBufferRef.current);
          preBufferRef.current = [];
        }
        setIsSpeechDetected(true);
        if (stateRef.current === "speaking") interrupt();
      }
      if (data.type === "speech_end") {
        isSpeechActiveRef.current = false;
        setIsSpeechDetected(false);
        // Don't send immediately — wait for true end-of-turn
        if (stateRef.current === "listening") {
          if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
          sendTimerRef.current = setTimeout(() => {
            sendTimerRef.current = null;
            sendAudioToServer();
          }, SEND_DELAY);
        }
      }
    };
    vadWorkerRef.current = vadWorker;
    if (sabRef.current) vadWorker.postMessage({ type: "set_interrupt_flag", buffer: sabRef.current });
  }, [interrupt, sendAudioToServer]);

  const startRef = useRef<(() => Promise<void>) | null>(null);

  const checkAllReady = useCallback(() => {
    if (vadReadyRef.current && kokoroTtsRef.current.modelStatus === "ready") {
      setModelsReady(true);
      // Auto-start when models are ready
      startRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (kokoroTts.modelStatus === "ready") checkAllReady();
  }, [kokoroTts.modelStatus, checkAllReady]);

  // -- Mic capture --------------------------------------------

  const startMicCapture = useCallback(async () => {
    const onAudioSamples = (samples: Float32Array) => {
      const resampled = downsample(samples, nativeSampleRateRef.current, TARGET_SAMPLE_RATE);
      vadWorkerRef.current?.postMessage({ type: "process", audio: resampled }, { transfer: [resampled.buffer] });
      if (stateRef.current === "listening") {
        if (isSpeechActiveRef.current) {
          // Actively speaking — buffer all audio
          const currentLength = audioSamplesRef.current.reduce((sum, c) => sum + c.length, 0);
          if (currentLength < MAX_AUDIO_SAMPLES) {
            audioSamplesRef.current.push(new Float32Array(samples));
          }
        } else {
          // Not speaking yet — keep a rolling ~500ms pre-buffer to capture speech onset
          preBufferRef.current.push(new Float32Array(samples));
          const PRE_BUFFER_SAMPLES = nativeSampleRateRef.current * 0.5; // 500ms
          let total = preBufferRef.current.reduce((sum, c) => sum + c.length, 0);
          while (total > PRE_BUFFER_SAMPLES && preBufferRef.current.length > 1) {
            total -= preBufferRef.current.shift()!.length;
          }
        }
      }
    };

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      const audioContext = new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      audioContextRef.current = audioContext;
      nativeSampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);

      try {
        await audioContext.audioWorklet.addModule("/mic-processor.js");
        const workletNode = new AudioWorkletNode(audioContext, "mic-processor");
        workletNodeRef.current = workletNode;
        workletNode.port.onmessage = (e) => {
          if (e.data.type === "audio") onAudioSamples(e.data.samples as Float32Array);
        };
        source.connect(workletNode);
        workletNode.connect(audioContext.destination);
      } catch {
        const processor = audioContext.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (e) => {
          const channel = e.inputBuffer.getChannelData(0);
          onAudioSamples(new Float32Array(channel));
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
      }
    } catch (error) {
      if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
      if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
      if (streamRef.current) { for (const track of streamRef.current.getTracks()) track.stop(); streamRef.current = null; }

      const err = error as DOMException;
      if (err.name === "NotReadableError" || err.name === "AbortError") {
        setMicError("Microphone is in use by another application. Close the other app and try again.");
      } else if (err.name === "NotAllowedError") {
        setMicError("Microphone permission was denied. Please allow access and try again.");
      } else if (err.name === "NotFoundError") {
        setMicError("No microphone found. Please connect a microphone and try again.");
      } else {
        setMicError("Could not access microphone. Please check your settings and try again.");
      }
      updateState("mic-error");
    }
  }, [updateState]);

  const stopMicCapture = useCallback(() => {
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (streamRef.current) { for (const track of streamRef.current.getTracks()) track.stop(); streamRef.current = null; }
    audioSamplesRef.current = [];
  }, []);

  // -- Public API ---------------------------------------------

  const loadModels = useCallback(() => {
    updateState("loading");
    initWorkers();
    vadWorkerRef.current?.postMessage({ type: "load" });
    kokoroTtsRef.current.loadModel();
    if (sabRef.current) kokoroTtsRef.current.setInterruptFlag(sabRef.current);
  }, [initWorkers, updateState]);

  const start = useCallback(async () => {
    setMicError(null);
    updateState("listening");
    setMessages([]);
    messagesRef.current = [];
    setCurrentTranscript("");
    audioSamplesRef.current = [];
    await startMicCapture();
  }, [startMicCapture, updateState]);

  // Keep startRef updated so checkAllReady can call it
  startRef.current = start;

  const pause = useCallback(() => {
    kokoroTtsRef.current.stop();
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    if (sendTimerRef.current) { clearTimeout(sendTimerRef.current); sendTimerRef.current = null; }
    stopMicCapture();
    vadWorkerRef.current?.postMessage({ type: "reset" });
    updateState("idle");
  }, [stopMicCapture, updateState]);

  const resume = useCallback(async () => {
    setMicError(null);
    audioSamplesRef.current = [];
    preBufferRef.current = [];
    updateState("listening");
    await startMicCapture();
  }, [startMicCapture, updateState]);

  const end = useCallback(() => {
    generationIdRef.current++;
    kokoroTtsRef.current.stop();
    if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    if (sendTimerRef.current) { clearTimeout(sendTimerRef.current); sendTimerRef.current = null; }
    stopMicCapture();
    vadWorkerRef.current?.postMessage({ type: "reset" });
    updateState("idle");
    // Return transcript for saving
    return [...messagesRef.current];
  }, [stopMicCapture, updateState]);

  useEffect(() => {
    return () => {
      stopMicCapture();
      vadWorkerRef.current?.terminate();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [stopMicCapture]);

  return {
    loadModels,
    start,
    pause,
    resume,
    end,
    state,
    modelsReady,
    loadingProgress,
    messages,
    currentTranscript,
    isSpeechDetected,
    micError,
  };
}
