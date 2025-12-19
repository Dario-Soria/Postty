const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const incoming = await req.formData();
    const image = incoming.get("image");

    const form = new FormData();
    if (image) form.set("image", image);

    const res = await fetch(`${BACKEND_BASE_URL}/image-analyzer`, {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return Response.json({ status: "error", message }, { status: 500 });
  }
}


