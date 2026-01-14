import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit");

    const res = await fetch(
      `${BACKEND_BASE_URL}/posts${limit ? `?limit=${encodeURIComponent(limit)}` : ""}`,
      {
        method: "GET",
        headers: {
          ...(auth ? { Authorization: auth } : {}),
        },
      }
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}


