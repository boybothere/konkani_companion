import { NextResponse } from "next/server";
import Groq from "groq-sdk";

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: Request) {
try {
    // 1. Grab the form data from the incoming request
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // 2. Send the audio file directly to Groq's Whisper model
    const transcription = await groq.audio.transcriptions.create({
    file: file,
      model: "whisper-large-v3-turbo", // The turbo model is incredibly fast
    response_format: "json",
      language: "en", // Optional: Forces English output, remove if you want multi-lingual detection
    });

    // 3. Send the transcribed text back to the frontend
    return NextResponse.json({ text: transcription.text });
    
} catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
}
}