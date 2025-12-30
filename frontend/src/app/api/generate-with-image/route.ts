/**
 * Generate with Image API - Now uses Nano Banana Pipeline
 * Proxies to the new /pipeline/json endpoint
 */

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const incoming = await req.formData();
    const image = incoming.get("image") as File | null;
    const prompt = incoming.get("prompt") as string || "";
    const numCandidates = incoming.get("num_candidates") as string || "1";

    if (!image) {
      return Response.json({ 
        status: "error", 
        message: "Missing image" 
      }, { status: 400 });
    }

    // Convert image to base64
    const buffer = await image.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const productImageBase64 = `data:${image.type};base64,${base64}`;

    // Extract style from prompt if mentioned
    let style = "Elegante";
    const promptLower = prompt.toLowerCase();
    if (promptLower.includes("old money")) style = "Old Money";
    else if (promptLower.includes("minimalista") || promptLower.includes("minimalist")) style = "Minimalista";
    else if (promptLower.includes("vibrante") || promptLower.includes("vibrant")) style = "Vibrante";
    else if (promptLower.includes("urbano") || promptLower.includes("urban")) style = "Urbano";
    else if (promptLower.includes("moderno") || promptLower.includes("modern")) style = "Moderno";

    // Determine use case from prompt
    let useCase = "Promoción";
    if (promptLower.includes("new product") || promptLower.includes("nuevo producto")) useCase = "Nuevo producto";
    else if (promptLower.includes("announcement") || promptLower.includes("anuncio")) useCase = "Anuncio";
    else if (promptLower.includes("inspiration") || promptLower.includes("inspiracion")) useCase = "Inspiracional";

    console.log("[Generate with Image] Using Nano Banana pipeline:", {
      hasImage: true,
      promptPreview: prompt.slice(0, 100),
      style,
      useCase,
      numCandidates,
    });

    // Call the new pipeline
    const pipelineResponse = await fetch(`${BACKEND_BASE_URL}/pipeline/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productImageBase64,
        textPrompt: prompt,
        style,
        useCase,
        aspectRatio: "1:1",
        skipText: true, // No text overlay for now, let V2Chat handle captions
        language: "es",
      }),
    });

    const pipelineData = await pipelineResponse.json();

    console.log("[Generate with Image] Pipeline response:", {
      success: pipelineData.success,
      error: pipelineData.error,
      hasImage: !!pipelineData.finalImage,
    });

    if (!pipelineData.success) {
      return Response.json({
        status: "error",
        message: pipelineData.error || "Pipeline generation failed",
      }, { status: 500 });
    }

    // Format response for V2Chat compatibility
    // V2Chat expects NDJSON streaming or a specific format
    const candidates = [];
    const count = parseInt(numCandidates) || 1;
    
    for (let i = 0; i < count; i++) {
      candidates.push({
        candidate_id: `candidate_${Date.now()}_${i}`,
        preview_data_url: pipelineData.finalImage,
        generated_image_path: pipelineData.finalImagePath || "",
        refined_prompt: prompt,
      });
    }

    // Return as NDJSON stream for V2Chat compatibility
    const events = [
      { event: "start", candidates_requested: count },
      ...candidates.map((c, idx) => ({
        event: "candidate",
        candidate_id: c.candidate_id,
        preview_data_url: c.preview_data_url,
        generated_image_path: c.generated_image_path,
        refined_prompt: c.refined_prompt,
        candidate_index: idx,
      })),
      { event: "done", total_candidates: candidates.length },
    ];

    const ndjson = events.map(e => JSON.stringify(e)).join("\n");

    return new Response(ndjson, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });

  } catch (e) {
    console.error("[Generate with Image] Error:", e);
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
