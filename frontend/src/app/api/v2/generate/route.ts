/**
 * V2 Generate API - Uses the new Nano Banana pipeline
 * Compatible with V2Chat expectations
 */

const BACKEND_BASE_URL = process.env.POSTTY_API_BASE_URL || "http://localhost:8080";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    
    let productImageBase64: string | null = null;
    let prompt: string = "";
    let style: string = "Elegante";
    let useCase: string = "Promoción";
    let textContent: { headline?: string; subheadline?: string; cta?: string } | null = null;
    let aspectRatio: string = "1:1";
    let skipText: boolean = false;

    // Handle both FormData and JSON
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const image = formData.get("image") as File | null;
      prompt = (formData.get("prompt") as string) || "";
      style = (formData.get("style") as string) || "Elegante";
      useCase = (formData.get("use_case") as string) || "Promoción";
      aspectRatio = (formData.get("aspect_ratio") as string) || "1:1";
      skipText = formData.get("skip_text") === "true";
      
      const headline = formData.get("headline") as string | null;
      const subheadline = formData.get("subheadline") as string | null;
      const cta = formData.get("cta") as string | null;
      
      if (headline || subheadline || cta) {
        textContent = { headline: headline || undefined, subheadline: subheadline || undefined, cta: cta || undefined };
      }

      if (image) {
        const buffer = await image.arrayBuffer();
        productImageBase64 = `data:${image.type};base64,${Buffer.from(buffer).toString("base64")}`;
      }
    } else {
      const body = await req.json();
      productImageBase64 = body.productImageBase64;
      prompt = body.prompt || "";
      style = body.style || "Elegante";
      useCase = body.useCase || body.use_case || "Promoción";
      textContent = body.textContent;
      aspectRatio = body.aspectRatio || body.aspect_ratio || "1:1";
      skipText = body.skipText || body.skip_text || false;
    }

    if (!productImageBase64) {
      return Response.json({ 
        status: "error", 
        message: "Missing product image" 
      }, { status: 400 });
    }

    console.log("[V2 Generate] Calling pipeline with:", {
      hasImage: !!productImageBase64,
      prompt: prompt.slice(0, 50),
      style,
      useCase,
      hasTextContent: !!textContent,
      aspectRatio,
      skipText,
    });

    // Call the new pipeline endpoint
    const pipelineResponse = await fetch(`${BACKEND_BASE_URL}/pipeline/json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productImageBase64,
        textPrompt: prompt,
        style,
        useCase,
        textContent,
        aspectRatio,
        skipText: skipText || !textContent,
        language: "es",
      }),
    });

    const pipelineData = await pipelineResponse.json();

    if (!pipelineData.success) {
      return Response.json({
        status: "error",
        message: pipelineData.error || "Pipeline generation failed",
      }, { status: 500 });
    }

    // Format response to be compatible with V2Chat expectations
    const candidateId = `candidate_${Date.now()}`;
    
    return Response.json({
      status: "ok",
      uploaded_image_url: pipelineData.finalImage,
      base_image_url: pipelineData.baseImage,
      caption: "", // Will be generated separately if needed
      prompt: prompt,
      candidates: [{
        candidate_id: candidateId,
        preview_data_url: pipelineData.finalImage,
        generated_image_path: pipelineData.finalImagePath || "",
        refined_prompt: prompt,
      }],
      metadata: pipelineData.metadata,
    });

  } catch (e) {
    console.error("[V2 Generate] Error:", e);
    const message = e instanceof Error ? e.message : "Unknown error occurred";
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

