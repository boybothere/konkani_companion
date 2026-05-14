import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, language, stream } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "A valid messages array is required." }, { status: 400 });
    }

    const payload = {
      messages: messages,
      language: language || "en",
      stream: stream !== undefined ? stream : true
    };

    // Replace with your active Ngrok URL
    const backendUrl = "https://nonvisiting-coessentially-rosette.ngrok-free.dev/openai/v1/chat/completions";

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Upstream Backend Error:", response.status, errorText);
      return NextResponse.json({ error: "Backend inference failure." }, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error("API Route Execution Error:", error);
    return NextResponse.json({ error: "Internal server routing error." }, { status: 500 });
  }
}