import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/templates`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Templates proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

