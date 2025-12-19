import { NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ status: "error", message: "multipart/form-data required" }, { status: 400 });
    }

    const incoming = await req.formData();
    const form = new FormData();
    for (const [k, v] of incoming.entries()) form.append(k, v);

    const res = await fetch(`${BACKEND_BASE_URL}/style-profile`, {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}


