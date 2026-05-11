"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Mic, Square } from "lucide-react";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";

type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void;
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
  silenceTimeout?: number;
  onListeningStop?: () => void;
  /** Auto-restart recognition when browser stops it unexpectedly (useful for continuous input) */
  autoRestart?: boolean;
};

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") return "none";
  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) return "speech-recognition";
  if ("MediaRecorder" in window && "mediaDevices" in navigator) return "media-recorder";
  return "none";
};

export function SpeechInput({
  className,
  onTranscriptionChange,
  onAudioRecorded,
  lang = "en-US",
  silenceTimeout = 0,
  onListeningStop,
  autoRestart = false,
  ...props
}: SpeechInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [mode, setMode] = useState<SpeechInputMode>("none");
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const shouldAutoRestartRef = useRef(false);
  const isManualStopRef = useRef(false);

  useEffect(() => {
    setMode(detectSpeechInputMode());
  }, []);

  useEffect(() => {
    if (mode !== "speech-recognition") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechRecognition = new SpeechRecognition();

    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = lang;

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (silenceTimeout > 0) {
        silenceTimerRef.current = setTimeout(() => speechRecognition.stop(), silenceTimeout);
      }
    };

    speechRecognition.onstart = () => {
      setIsListening(true);
      shouldAutoRestartRef.current = autoRestart;
      isManualStopRef.current = false;
      resetSilenceTimer();
    };

    speechRecognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      // Auto-restart if enabled and not manually stopped (browser stopped it unexpectedly)
      if (shouldAutoRestartRef.current && !isManualStopRef.current) {
        try {
          setTimeout(() => {
            if (shouldAutoRestartRef.current) {
              speechRecognition.start();
            }
          }, 100);
          return; // Don't set isListening to false, we're restarting
        } catch {
          // If restart fails, fall through to normal stop behavior
        }
      }

      setIsListening(false);
      onListeningStop?.();
    };

    speechRecognition.onresult = (event) => {
      resetSilenceTimer();
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) finalTranscript += result[0]?.transcript ?? "";
      }
      if (finalTranscript) onTranscriptionChange?.(finalTranscript);
    };

    speechRecognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognitionRef.current = speechRecognition;
    setRecognition(speechRecognition);

    return () => {
      shouldAutoRestartRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [mode, onTranscriptionChange, lang, silenceTimeout, onListeningStop, autoRestart]);

  const startMediaRecorder = useCallback(async () => {
    if (!onAudioRecorded) return;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        for (const track of stream.getTracks()) track.stop();
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size > 0) {
          setIsProcessing(true);
          try {
            const transcript = await onAudioRecorded(audioBlob);
            if (transcript) onTranscriptionChange?.(transcript);
          } catch (error) {
            console.error("Transcription error:", error);
          } finally {
            setIsProcessing(false);
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (error) {
      const err = error as DOMException;
      if (err.name === "NotAllowedError") setMicError("Microphone permission denied.");
      else if (err.name === "NotFoundError") setMicError("No microphone found.");
      else setMicError("Could not access microphone.");
      setIsListening(false);
    }
  }, [onAudioRecorded, onTranscriptionChange]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (mode === "speech-recognition" && recognition) {
      if (isListening) {
        isManualStopRef.current = true;
        shouldAutoRestartRef.current = false;
        recognition.stop();
      } else {
        recognition.start();
      }
    } else if (mode === "media-recorder") {
      if (isListening) stopMediaRecorder();
      else startMediaRecorder();
    }
  }, [mode, recognition, isListening, startMediaRecorder, stopMediaRecorder]);

  const isDisabled =
    mode === "none" ||
    (mode === "speech-recognition" && !recognition) ||
    (mode === "media-recorder" && !onAudioRecorded) ||
    isProcessing;

  return (
    <div className="relative inline-flex items-center justify-center">
      {isListening &&
        [0, 1, 2].map((index) => (
          <div
            className="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
            key={index}
            style={{ animationDelay: `${index * 0.3}s`, animationDuration: "2s" }}
          />
        ))}
      <Button
        variant="unstyled"
        className={cn(
          "relative z-10 rounded-full transition-all duration-300",
          isListening
            ? "bg-destructive text-white hover:bg-destructive/80"
            : micError
              ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
              : "bg-primary text-primary-foreground hover:bg-primary/80",
          className
        )}
        disabled={isDisabled}
        onClick={toggleListening}
        title={micError ?? undefined}
        {...props}
      >
        {isProcessing && <Loader2 className="size-4 animate-spin" />}
        {!isProcessing && isListening && <Square className="size-4" />}
        {!(isProcessing || isListening) && <Mic className="size-4" />}
      </Button>
    </div>
  );
}
