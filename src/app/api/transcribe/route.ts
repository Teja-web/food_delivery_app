import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { requireCandidateContext } from "@/lib/auth/context";

const MAX_AUDIO_SAMPLES = 16000 * 60; // 60 seconds at 16kHz

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function pcmToWav(pcmFloat32: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmFloat32.length * 2;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Convert Float32 PCM to Int16 PCM
  for (let i = 0; i < pcmFloat32.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmFloat32[i]!));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(int16, headerSize + i * 2);
  }

  return buffer;
}

export async function POST(request: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    await requireCandidateContext();

    const body = await request.json();
    const { audio, sampleRate } = body;

    if (!audio || !Array.isArray(audio)) {
      return NextResponse.json({ error: "Invalid audio data" }, { status: 400 });
    }

    if (audio.length > MAX_AUDIO_SAMPLES) {
      return NextResponse.json({ error: "Audio too long (max 60 seconds)" }, { status: 400 });
    }

    const pcmFloat32 = new Float32Array(audio);
    const wavBuffer = pcmToWav(pcmFloat32, sampleRate || 16000);

    const file = new File([wavBuffer as unknown as BlobPart], "audio.wav", { type: "audio/wav" });

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "en",
    });

    return NextResponse.json({ text: transcription.text });
  } catch (error) {
    console.error("[transcribe] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
