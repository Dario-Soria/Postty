import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward to backend Gemini chat endpoint
    const response = await fetch(`${BACKEND_URL}/gemini-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // If backend endpoint doesn't exist, use fallback
      return NextResponse.json({
        nextQuestion: "¿Podés contarme más sobre cómo querés la imagen?",
        extractedData: {},
        isReadyToGenerate: false,
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat assistant error:", error);
    return NextResponse.json({
      nextQuestion: "¿Podés repetirme eso?",
      extractedData: {},
      isReadyToGenerate: false,
    });
  }
}

