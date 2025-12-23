from __future__ import annotations

import base64
import binascii
import os
from pathlib import Path
from typing import Any, Final, Optional, cast

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

try:
    from dotenv import load_dotenv

    # Load `.env` colocated with this service (regardless of current working directory).
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"))
except Exception:
    # If python-dotenv isn't installed or .env isn't present, we still allow env vars
    # to be provided by the runtime (Cloud Run, Docker, etc.).
    pass


app = FastAPI(title="Remotion Agent", version="1.0.0")

DEFAULT_MODEL_ID: Final[str] = "imagen-3.0-generate-001"


class GeneratePromoRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Marketing prompt for the scene")
    product_image_base64: str = Field(
        ...,
        min_length=1,
        description="Base64 image bytes for the product/subject (no data URL prefix)",
    )
    reference_image_base64: str = Field(
        ...,
        min_length=1,
        description="Base64 image bytes for the style reference (no data URL prefix)",
    )


class GeneratePromoResponse(BaseModel):
    generated_image_base64: str = Field(
        ..., description="Base64 image bytes for the generated output image"
    )


def _strip_data_url_prefix(value: str) -> str:
    # Support optional "data:image/png;base64,..." payloads (clients often send these)
    if "," in value and value.lstrip().lower().startswith("data:"):
        return value.split(",", 1)[1]
    return value


def _b64decode_image(value: str) -> bytes:
    try:
        cleaned = _strip_data_url_prefix(value).strip()
        return base64.b64decode(cleaned, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload") from e


def _b64encode_image(value: bytes) -> str:
    return base64.b64encode(value).decode("utf-8")


def _vertex_image_from_bytes(image_bytes: bytes) -> Any:
    # vertexai.preview.vision_models.Image API differs slightly across versions.
    from vertexai.preview.vision_models import Image  # type: ignore

    # Most common constructor is Image(image_bytes=...)
    try:
        return Image(image_bytes=image_bytes)
    except TypeError:
        # Fallback for versions that use from_bytes / load_from_file patterns
        if hasattr(Image, "from_bytes"):
            return Image.from_bytes(image_bytes)  # type: ignore[attr-defined]
        return Image(image_bytes=image_bytes)


def _vertex_image_to_bytes(vertex_image: Any) -> bytes:
    # Attempt multiple known attribute/method names to extract bytes robustly.
    for attr in ("image_bytes", "_image_bytes", "bytes"):
        if hasattr(vertex_image, attr):
            maybe = getattr(vertex_image, attr)
            if isinstance(maybe, (bytes, bytearray)):
                return bytes(maybe)

    for method in ("to_bytes", "save"):
        if hasattr(vertex_image, method):
            m = getattr(vertex_image, method)
            if callable(m) and method == "to_bytes":
                out = m()
                if isinstance(out, (bytes, bytearray)):
                    return bytes(out)

    raise RuntimeError("Could not extract generated image bytes from model response")


def _looks_like_safety_block(exc: BaseException) -> bool:
    msg = str(exc).lower()
    keywords = (
        "safety",
        "blocked",
        "content is blocked",
        "policy",
        "filtered",
        "harm",
        "prohibited",
    )
    return any(k in msg for k in keywords)


def _init_vertex_ai(project_id: str, region: str) -> None:
    import vertexai  # type: ignore

    api_key = os.getenv("GEMINI_API_KEY", "").strip() or None

    # Prefer using GEMINI_API_KEY when provided (user requirement). If the installed
    # vertexai version doesn't support api_key, gracefully fall back to ADC.
    if api_key:
        try:
            vertexai.init(project=project_id, location=region, api_key=api_key)
            return
        except TypeError:
            # Older versions may not accept api_key in vertexai.init(...)
            pass

    vertexai.init(project=project_id, location=region)


def _generate_with_imagen3(
    *,
    prompt: str,
    product_image_bytes: bytes,
    reference_image_bytes: bytes,
    model_id: str,
) -> bytes:
    from vertexai.preview.vision_models import (  # type: ignore
        ImageGenerationModel,
        SubjectReferenceImage,
        StyleReferenceImage,
    )

    product_img = _vertex_image_from_bytes(product_image_bytes)
    style_img = _vertex_image_from_bytes(reference_image_bytes)

    subject_ref = SubjectReferenceImage(image=product_img, subject_type="product")
    style_ref = StyleReferenceImage(image=style_img)

    model = ImageGenerationModel.from_pretrained(model_id)

    response = model.generate_images(
        prompt=prompt,
        reference_images=[subject_ref, style_ref],
        number_of_images=1,
        aspect_ratio="1:1",
    )

    images: Optional[list[Any]] = None
    if hasattr(response, "images"):
        images = cast(Optional[list[Any]], getattr(response, "images"))
    elif isinstance(response, (list, tuple)):
        images = list(response)

    if not images:
        raise RuntimeError("Model returned no images")

    return _vertex_image_to_bytes(images[0])


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate-promo", response_model=GeneratePromoResponse)
async def generate_promo(payload: GeneratePromoRequest) -> GeneratePromoResponse:
    project_id = os.getenv("GCP_PROJECT_ID", "").strip()
    region = os.getenv("GCP_REGION", "").strip()
    model_id = os.getenv("IMAGEN_MODEL_ID", DEFAULT_MODEL_ID).strip() or DEFAULT_MODEL_ID

    if not project_id or not region:
        raise HTTPException(
            status_code=500,
            detail="Server is missing GCP_PROJECT_ID and/or GCP_REGION configuration",
        )

    product_bytes = _b64decode_image(payload.product_image_base64)
    reference_bytes = _b64decode_image(payload.reference_image_base64)

    try:
        _init_vertex_ai(project_id, region)
        generated_bytes = await run_in_threadpool(
            _generate_with_imagen3,
            prompt=payload.prompt,
            product_image_bytes=product_bytes,
            reference_image_bytes=reference_bytes,
            model_id=model_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        if _looks_like_safety_block(e):
            raise HTTPException(
                status_code=400,
                detail="Generation blocked by safety filters for the given prompt/images",
            ) from e
        raise HTTPException(
            status_code=500,
            detail=f"Image generation failed: {type(e).__name__}",
        ) from e

    return GeneratePromoResponse(generated_image_base64=_b64encode_image(generated_bytes))


