/**
 * Voice Prep API — audio in, streaming text out.
 *
 * Browser sends PCM audio (from mic, after client-side VAD detects end-of-turn).
 * Server does: Groq STT → LLM streamText → NDJSON stream back.
 *
 * Standard tier: streams text (browser does Kokoro TTS)
 * Premium tier: TODO — stream audio bytes (server does Deepgram TTS)
 */

import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import Groq from "groq-sdk";
import { requireCandidateContext } from "@/lib/auth/context";
import { buildPrepContext, buildRolePrepContext, prepContextToVoicePrompt } from "@/domain/portal/prep-context";
import { DEFAULT_MODEL } from "@/lib/ai";

export const maxDuration = 60;

const groqSdk = new Groq({ apiKey: process.env.GROQ_API_KEY });
const groqAi = createGroq();

// -- PCM → WAV ------------------------------------------------

function pcmToWav(pcmFloat32: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmFloat32.length * 2;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < pcmFloat32.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmFloat32[i]!));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    buffer.writeInt16LE(int16, headerSize + i * 2);
  }

  return buffer;
}

// -- Main handler ---------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireCandidateContext();
    const primary = ctx.linkedCandidates[0];
    if (!primary) {
      return NextResponse.json({ error: "No linked candidate" }, { status: 404 });
    }

    const body = await request.json();
    const {
      audio,
      sampleRate = 16000,
      interviewId,
      roleId,
      history = [],
    } = body as {
      audio: number[];
      sampleRate?: number;
      interviewId?: string;
      roleId?: string;
      history?: Array<{ role: string; content: string }>;
    };

    if (!audio || !Array.isArray(audio) || (!interviewId && !roleId)) {
      return NextResponse.json(
        { error: "audio array and interviewId or roleId are required" },
        { status: 400 },
      );
    }

    // 1. Groq STT
    const pcmFloat32 = new Float32Array(audio);
    const wavBuffer = pcmToWav(pcmFloat32, sampleRate);
    const file = new File([wavBuffer as unknown as BlobPart], "audio.wav", {
      type: "audio/wav",
    });

    const transcription = await groqSdk.audio.transcriptions.create({
      file,
      model: "whisper-large-v3-turbo",
      language: "en",
    });

    const userText = transcription.text?.trim();
    if (!userText) {
      return NextResponse.json({ transcript: "", text: "" });
    }

    // 2. Build system prompt (interview-based or role-based)
    const prepCtx = interviewId
      ? await buildPrepContext({ candidateId: primary.id, interviewId })
      : await buildRolePrepContext({ candidateId: primary.id, roleId: roleId! });
    const systemPrompt = prepContextToVoicePrompt(prepCtx);

    // 3. Build conversation for LLM
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userText },
    ];

    // 4. Stream LLM response as NDJSON
    const result = streamText({
      model: groqAi(DEFAULT_MODEL),
      system: systemPrompt,
      messages,
      temperature: 0.7,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send transcript first
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "transcript", text: userText }) + "\n"),
        );

        // Stream LLM chunks
        for await (const chunk of result.textStream) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "text", text: chunk }) + "\n"),
          );
        }

        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[voice/prep] Error:", error);
    const message = error instanceof Error ? error.message : "Voice prep failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
