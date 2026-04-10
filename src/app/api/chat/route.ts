import { NextResponse } from "next/server";

// THIS IS CRITICAL: Stops Next.js from buffering the stream!
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ⚠️ REPLACE WITH YOUR CURRENT NGROK URL ⚠️
    const response = await fetch("https://nonvisiting-coessentially-rosette.ngrok-free.dev/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Pipe it directly with stream headers
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error("Error calling Python backend:", error);
    return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
  }
}