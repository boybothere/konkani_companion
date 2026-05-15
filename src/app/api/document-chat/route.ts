import { NextRequest } from "next/server";

const COLAB_URL = process.env.NEXT_PUBLIC_COLAB_URL || "";

export async function POST(req: NextRequest) {
    const body = await req.json();

    const res = await fetch(`${COLAB_URL}/document-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return new Response(res.body, {
        headers: { "Content-Type": "text/event-stream" },
    });
}