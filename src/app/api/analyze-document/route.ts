import { NextRequest } from "next/server";

const COLAB_URL = process.env.NEXT_PUBLIC_COLAB_URL || "";

export async function POST(req: NextRequest) {
    const formData = await req.formData();

    const res = await fetch(`${COLAB_URL}/analyze-document`, {
        method: "POST",
        body: formData,
    });

    const data = await res.json();
    return Response.json(data);
}