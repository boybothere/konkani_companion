import { NextResponse } from "next/server";

// Fallback models to use when API is unavailable
const FALLBACK_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
  "gemma2-9b-it",
];

export async function GET() {
  // Check if API key is configured
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY is not set");
    return NextResponse.json({ models: FALLBACK_MODELS });
  }

  try {
    // Dynamic import to avoid build-time issues
    const Groq = (await import("groq-sdk")).default;
    
    // Initialize the official Groq client
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // Using the exact function you found in the docs!
    const modelsPage = await groq.models.list();

    // The SDK returns a complex object, so we still map over it to just grab the 'id' strings
    const activeModels = modelsPage.data.map((model: { id: string }) => model.id);

    return NextResponse.json({ models: activeModels });
  } catch (error) {
    console.error("Error fetching models from SDK:", error);
    // Return fallback models on error
    return NextResponse.json({ models: FALLBACK_MODELS });
  }
}
