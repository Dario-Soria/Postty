import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";

    // Proxy multipart and JSON bodies to the backend.
    if (ct.includes("multipart/form-data")) {
      const incoming = await req.formData();
      const form = new FormData();
      // Important: references[] can appear multiple times; use append() to preserve all entries.
      for (const [k, v] of incoming.entries()) form.append(k, v);

      const res = await fetch(`${BACKEND_BASE_URL}/postty-architect`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    const body = await req.json();
    const res = await fetch(`${BACKEND_BASE_URL}/postty-architect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}


