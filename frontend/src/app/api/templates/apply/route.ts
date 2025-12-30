import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${BACKEND_URL}/templates/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Templates apply proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to apply template" },
      { status: 500 }
    );
  }
}

