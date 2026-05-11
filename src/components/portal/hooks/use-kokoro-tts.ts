"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "af_heart";

type ModelStatus = "idle" | "loading" | "ready" | "error";

type ModelProgress = {
  status: string;
  progress?: number;
  file?: string;
};

type UseKokoroTTSOptions = {
  voice?: string;
  onModelProgress?: (progress: ModelProgress) => void;
  onQueueDrained?: () => void;
};

export function useKokoroTTS(options: UseKokoroTTSOptions = {}) {
  const { voice = DEFAULT_VOICE, onModelProgress, onQueueDrained } = options;

  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState<ModelProgress>({ status: "idle" });
  const [voices, setVoices] = useState<string[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const onModelProgressRef = useRef(onModelProgress);
  const onQueueDrainedRef = useRef(onQueueDrained);
  const queueRef = useRef<string[]>([]);
  const generatingRef = useRef(false);
  const audioQueueRef = useRef<{ audio: Float32Array; sampleRate: number }[]>([]);
  const playingRef = useRef(false);
  const activeSessionRef = useRef<string | null>(null);

  onModelProgressRef.current = onModelProgress;
  onQueueDrainedRef.current = onQueueDrained;

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Play queued audio clips back-to-back
  const playNextClip = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      playingRef.current = false;
      setIsSpeaking(false);
      // If no more text to generate either, we're done
      if (queueRef.current.length === 0 && !generatingRef.current) {
        onQueueDrainedRef.current?.();
      }
      return;
    }

    playingRef.current = true;
    setIsSpeaking(true);

    const { audio: audioData, sampleRate } = audioQueueRef.current.shift()!;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const buffer = ctx.createBuffer(1, audioData.length, sampleRate);
    buffer.copyToChannel(audioData as Float32Array<ArrayBuffer>, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSourceRef.current = source;

    source.onended = () => {
      currentSourceRef.current = null;
      playNextClip();
    };

    source.start();
  }, [getAudioContext]);

  // Send next text in queue to worker for generation
  const generateNext = useCallback(() => {
    if (generatingRef.current || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    if (next && workerRef.current && activeSessionRef.current) {
      generatingRef.current = true;
      workerRef.current.postMessage({
        type: "generate",
        text: next,
        voice,
        requestId: activeSessionRef.current,
      });
    }
  }, [voice]);

  const loadModel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(
      new URL("../../../workers/kokoro-worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onerror = (e) => console.error("[kokoro-tts] Worker error:", e.message, e);

    worker.onmessage = (event) => {
      const data = event.data;

      if (data.type === "progress") {
        const p: ModelProgress = {
          status: data.status,
          progress: data.progress,
          file: data.file,
        };
        setProgress(p);
        onModelProgressRef.current?.(p);

        if (data.status === "downloading" || data.status === "loading") {
          setModelStatus("loading");
        } else if (data.status === "ready") {
          setModelStatus("ready");
          if (data.voices) setVoices(data.voices);
        } else if (data.status === "error") {
          setModelStatus("error");
        }
      }

      if (data.type === "audio") {
        generatingRef.current = false;

        // Ignore audio from stale sessions
        if (data.requestId !== activeSessionRef.current) return;

        if (data.audio && data.audio.length > 0) {
          audioQueueRef.current.push({
            audio: data.audio,
            sampleRate: data.sampleRate,
          });
          if (!playingRef.current) {
            playNextClip();
          }
        }

        // Pre-buffer: start generating next chunk immediately
        generateNext();
      }

      if (data.type === "error") {
        console.error("Kokoro worker error:", data.error);
        generatingRef.current = false;
        setIsSpeaking(false);
        generateNext();
      }
    };

    workerRef.current = worker;
    setModelStatus("loading");
    worker.postMessage({ type: "load", model: MODEL });
  }, [playNextClip, generateNext]);

  const speak = useCallback(
    (text: string) => {
      if (modelStatus !== "ready" || !text.trim()) return;
      queueRef.current.push(text.trim());
      generateNext();
    },
    [modelStatus, generateNext]
  );

  // Start a new TTS session — sets the active session ID
  const startSession = useCallback((sessionId: string) => {
    activeSessionRef.current = sessionId;
  }, []);

  const setInterruptFlag = useCallback((buffer: SharedArrayBuffer) => {
    workerRef.current?.postMessage({ type: "set_interrupt_flag", buffer });
  }, []);

  const stop = useCallback(() => {
    activeSessionRef.current = null;
    queueRef.current = [];
    audioQueueRef.current = [];
    generatingRef.current = false;
    playingRef.current = false;
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (currentSourceRef.current) currentSourceRef.current.stop();
      if (audioContextRef.current) audioContextRef.current.close();
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  return {
    loadModel,
    speak,
    stop,
    startSession,
    setInterruptFlag,
    isSpeaking,
    modelStatus,
    progress,
    voices,
  };
}
