import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const body = await req.json().catch(() => ({}));

    const res = await fetch(`${BACKEND_BASE_URL}/posts/analytics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}




