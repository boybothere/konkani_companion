import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Extract the audio blob from the frontend
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // 2. Prepare the payload for your Colab Backend
    // We send it as a fresh FormData object
    const colabFormData = new FormData();
    colabFormData.append("file", file);

    // ⚠️ REPLACE WITH YOUR CURRENT NGROK URL ⚠️
    // Note: We are hitting the '/transcribe' endpoint we'll add to Colab
    const colabUrl = "https://nonvisiting-coessentially-rosette.ngrok-free.dev/transcribe";

    const response = await fetch(colabUrl, {
      method: "POST",
      body: colabFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Colab Transcription Error:", errorText);
      throw new Error("Colab failed to process audio");
    }

    const data = await response.json();

    // 3. Return the Konkani Devanagari text back to the UI
    return NextResponse.json({ text: data.text });

  } catch (error) {
    console.error("Transcription Proxy Error:", error);
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
  }
}