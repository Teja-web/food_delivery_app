import * as ort from "onnxruntime-web";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/";

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 480; // 30ms at 16kHz

// Listening mode thresholds
const LISTEN_START_THRESHOLD = 0.5;
const LISTEN_END_THRESHOLD = 0.3;
const LISTEN_START_FRAMES = 3;   // ~90ms
const LISTEN_END_FRAMES = 40;    // ~1.2s — let candidate pause to think
const MIN_SPEECH_FRAMES = 15;    // ~450ms — ignore short bursts

// Speaking mode thresholds (for interruption)
const SPEAK_START_THRESHOLD = 0.65;
const SPEAK_END_THRESHOLD = 0.35;
const SPEAK_START_FRAMES = 1;    // ~30ms — instant interrupt
const SPEAK_END_FRAMES = 8;      // ~240ms

const ENERGY_THRESHOLD = 0.01;

let session: ort.InferenceSession | null = null;
let state: ort.Tensor | null = null;
let sr: ort.Tensor | null = null;
let isSpeaking = false;
let speechFrameCount = 0;
let silenceFrameCount = 0;
let totalSpeechFrames = 0;

let mode: "listening" | "speaking" = "listening";
let startThreshold = LISTEN_START_THRESHOLD;
let endThreshold = LISTEN_END_THRESHOLD;
let startFrames = LISTEN_START_FRAMES;
let endFrames = LISTEN_END_FRAMES;

// SharedArrayBuffer interrupt flag — written on speech_start in speaking mode
let interruptFlag: Int32Array | null = null;

function setMode(newMode: "listening" | "speaking") {
  mode = newMode;
  if (mode === "speaking") {
    startThreshold = SPEAK_START_THRESHOLD;
    endThreshold = SPEAK_END_THRESHOLD;
    startFrames = SPEAK_START_FRAMES;
    endFrames = SPEAK_END_FRAMES;
  } else {
    startThreshold = LISTEN_START_THRESHOLD;
    endThreshold = LISTEN_END_THRESHOLD;
    startFrames = LISTEN_START_FRAMES;
    endFrames = LISTEN_END_FRAMES;
  }
}

function resetState() {
  state = new ort.Tensor("float32", new Float32Array(2 * 1 * 128).fill(0), [2, 1, 128]);
  sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]), []);
  isSpeaking = false;
  speechFrameCount = 0;
  silenceFrameCount = 0;
  totalSpeechFrames = 0;
}

async function loadModel() {
  try {
    self.postMessage({ type: "progress", status: "downloading", progress: 0 });

    const modelUrl = "https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx";
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Failed to fetch model: ${response.status}`);

    const contentLength = response.headers.get("content-length");
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total > 0) {
        self.postMessage({ type: "progress", status: "downloading", progress: (loaded / total) * 100 });
      }
    }

    const modelBuffer = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      modelBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    self.postMessage({ type: "progress", status: "loading" });
    ort.env.wasm.numThreads = 1;

    session = await ort.InferenceSession.create(modelBuffer.buffer, {
      executionProviders: ["wasm"],
    });

    resetState();
    self.postMessage({ type: "progress", status: "ready" });
  } catch (error) {
    self.postMessage({
      type: "progress",
      status: "error",
      error: error instanceof Error ? error.message : "Failed to load VAD model",
    });
  }
}

function rmsEnergy(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i]! * frame[i]!;
  }
  return Math.sqrt(sum / frame.length);
}

async function processAudio(audio: Float32Array) {
  if (!session || !state || !sr) return;

  for (let i = 0; i + FRAME_SIZE <= audio.length; i += FRAME_SIZE) {
    const frame = audio.slice(i, i + FRAME_SIZE);
    const energy = rmsEnergy(frame);

    // Energy pre-filter in speaking mode: skip echo
    if (mode === "speaking" && energy < ENERGY_THRESHOLD) {
      if (isSpeaking) {
        silenceFrameCount++;
        if (silenceFrameCount >= endFrames) {
          isSpeaking = false;
          self.postMessage({ type: "speech_end" });
        }
      }
      self.postMessage({ type: "vad", probability: 0 });
      continue;
    }

    const input = new ort.Tensor("float32", frame, [1, FRAME_SIZE]);

    try {
      const result = await session.run({ input, state, sr });
      const probability = (result.output!.data as Float32Array)[0]!;
      state = result.stateN as ort.Tensor;

      self.postMessage({ type: "vad", probability });

      if (!isSpeaking) {
        if (probability > startThreshold) {
          speechFrameCount++;
          silenceFrameCount = 0;
          if (speechFrameCount >= startFrames) {
            isSpeaking = true;
            totalSpeechFrames = speechFrameCount;

            // In speaking mode, set SharedArrayBuffer flag INSTANTLY
            // before postMessage — Kokoro worker reads this with zero latency
            if (mode === "speaking" && interruptFlag) {
              Atomics.store(interruptFlag, 0, 1);
            }

            self.postMessage({ type: "speech_start" });
          }
        } else {
          speechFrameCount = Math.max(0, speechFrameCount - 1);
        }
      } else {
        if (probability > endThreshold) {
          totalSpeechFrames++;
        }

        if (probability < endThreshold) {
          silenceFrameCount++;
          speechFrameCount = 0;
          const effectiveEndFrames =
            mode === "listening" && totalSpeechFrames < MIN_SPEECH_FRAMES
              ? endFrames * 2
              : endFrames;
          if (silenceFrameCount >= effectiveEndFrames) {
            isSpeaking = false;
            totalSpeechFrames = 0;
            self.postMessage({ type: "speech_end" });
          }
        } else {
          silenceFrameCount = 0;
        }
      }
    } catch (error) {
      console.error("VAD inference error:", error);
    }
  }
}

type WorkerMessage =
  | { type: "load" }
  | { type: "process"; audio: Float32Array }
  | { type: "reset" }
  | { type: "set_mode"; mode: "listening" | "speaking" }
  | { type: "set_interrupt_flag"; buffer: SharedArrayBuffer }
  | { type: "set_config"; endFrames?: number; startFrames?: number; endThreshold?: number; startThreshold?: number };

self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;
  switch (type) {
    case "load":
      loadModel();
      break;
    case "process":
      processAudio(event.data.audio);
      break;
    case "reset":
      resetState();
      break;
    case "set_mode":
      setMode(event.data.mode);
      break;
    case "set_interrupt_flag":
      interruptFlag = new Int32Array(event.data.buffer);
      break;
    case "set_config":
      if (event.data.endFrames !== undefined) endFrames = event.data.endFrames;
      if (event.data.endThreshold !== undefined) endThreshold = event.data.endThreshold;
      if (event.data.startFrames !== undefined) startFrames = event.data.startFrames;
      if (event.data.startThreshold !== undefined) startThreshold = event.data.startThreshold;
      break;
  }
});
