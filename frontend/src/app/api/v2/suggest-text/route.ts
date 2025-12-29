/**
 * V2 Suggest Text API
 * Generates creative headline suggestions based on user intent
 */

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userIntent, style, useCase } = body;

    if (!userIntent) {
      return Response.json({
        success: false,
        error: "Missing userIntent",
      }, { status: 400 });
    }

    console.log("[V2 Suggest Text] Request:", { userIntent, style, useCase });

    const response = await fetch(`${BACKEND_BASE_URL}/suggest-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIntent, style, useCase }),
    });

    const data = await response.json();

    console.log("[V2 Suggest Text] Response:", data);

    return Response.json(data);
  } catch (e) {
    console.error("[V2 Suggest Text] Error:", e);
    return Response.json(
      { success: false, error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}

