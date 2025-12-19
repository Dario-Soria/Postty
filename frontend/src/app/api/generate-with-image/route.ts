const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const incoming = await req.formData();
    const image = incoming.get("image");
    const prompt = incoming.get("prompt");
    const usePixabay = incoming.get("use_pixabay");
    const numCandidates = incoming.get("num_candidates");
    const previewOnly = incoming.get("preview_only");
    const baseImagePath = incoming.get("base_image_path");

    const form = new FormData();
    if (image) form.set("image", image);
    if (prompt != null) form.set("prompt", String(prompt));
    if (usePixabay != null) form.set("use_pixabay", String(usePixabay));
    if (numCandidates != null) form.set("num_candidates", String(numCandidates));
    if (previewOnly != null) form.set("preview_only", String(previewOnly));
    if (baseImagePath != null) form.set("base_image_path", String(baseImagePath));

    const res = await fetch(`${BACKEND_BASE_URL}/generate-with-image`, {
      method: "POST",
      body: form,
    });

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/x-ndjson")) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": ct,
          "Cache-Control": "no-cache",
        },
      });
    }

    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return Response.json({ status: "error", message }, { status: 500 });
  }
}


