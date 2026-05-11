import { KokoroTTS } from "kokoro-js";

let tts: KokoroTTS | null = null;
let generating = false;
let interruptFlag: Int32Array | null = null;

function extractAudio(result: unknown): { data: Float32Array; sampleRate: number } | null {
  const obj = result as Record<string, any>;
  const raw = obj?.audio ?? obj?.data;
  let data: Float32Array;
  if (raw instanceof Float32Array) {
    data = raw;
  } else if (raw && typeof raw === "object" && "audio" in raw) {
    const inner = raw.audio ?? raw.data;
    data = inner instanceof Float32Array ? inner : new Float32Array(inner);
  } else if (raw) {
    data = new Float32Array(raw);
  } else {
    return null;
  }
  if (data.length === 0) return null;
  return { data, sampleRate: obj?.sampling_rate ?? 24000 };
}

async function load(modelId: string) {
  try {
    self.postMessage({ type: "progress", status: "downloading", progress: 0 });

    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    const device = hasWebGPU ? ("webgpu" as const) : ("wasm" as const);
    const dtype = hasWebGPU ? ("fp32" as const) : ("q8" as const);

    tts = await KokoroTTS.from_pretrained(modelId, {
      dtype,
      device,
      progress_callback: (info: { status: string; progress?: number; file?: string }) => {
        if (typeof info.progress === "number") {
          self.postMessage({
            type: "progress",
            status: "downloading",
            progress: info.progress,
            file: info.file,
          });
        }
      },
    });

    const voices = tts.list_voices();
    self.postMessage({ type: "progress", status: "ready", voices });
  } catch (error) {
    self.postMessage({
      type: "progress",
      status: "error",
      error: error instanceof Error ? error.message : "Failed to load Kokoro model",
    });
  }
}

function isInterrupted(): boolean {
  return interruptFlag ? Atomics.load(interruptFlag, 0) === 1 : false;
}

async function generate(text: string, voice: string, requestId: string) {
  if (!tts) {
    self.postMessage({ type: "error", error: "Model not loaded" });
    return;
  }
  if (generating) return;
  generating = true;

  try {
    if (isInterrupted()) return;

    const result = await tts.generate(text, { voice: (voice || "af_heart") as "af_heart" });
    const audio = extractAudio(result);

    if (isInterrupted() || !audio) {
      if (!audio && !isInterrupted()) {
        self.postMessage({ type: "error", error: "Generated empty audio" });
      }
      return;
    }

    self.postMessage(
      { type: "audio", requestId, audio: audio.data, sampleRate: audio.sampleRate },
      { transfer: [audio.data.buffer] }
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Speech generation failed",
    });
  } finally {
    generating = false;
  }
}

type WorkerMessage =
  | { type: "load"; model: string }
  | { type: "generate"; text: string; voice: string; requestId: string }
  | { type: "set_interrupt_flag"; buffer: SharedArrayBuffer };

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;
  switch (type) {
    case "load":
      load(event.data.model);
      break;
    case "generate":
      generate(event.data.text, event.data.voice, event.data.requestId);
      break;
    case "set_interrupt_flag":
      interruptFlag = new Int32Array(event.data.buffer);
      break;
  }
});
