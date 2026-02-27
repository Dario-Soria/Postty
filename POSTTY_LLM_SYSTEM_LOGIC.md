# Postty System Logic for LLM Reuse

This document is an implementation-oriented map of Postty so another LLM can understand the system quickly and reuse pieces safely.

## 1) What Postty is

Postty is an AI-assisted social-content platform:

- Frontend: Next.js (`frontend/`) used by creators.
- Backend: Fastify + TypeScript (`src/`) with most business logic.
- Core value: generate ad-ready images/videos, store assets, and publish to Instagram.

The backend is the source of truth for generation, auth, access control, orchestration, and media lifecycle.

## 2) Top-level architecture

- API server entrypoint: `src/server.ts`
  - Loads env robustly from multiple `.env` resolution paths.
  - Registers multipart handling, global rate limiting, and all routes.
  - Probes Gemini key early (optional fail-fast behavior via `geminiKey.ts`).
- Frontend proxy pattern:
  - Next.js route handlers in `frontend/src/app/api/*` proxy to backend (`POSTTY_API_BASE_URL`).
  - Keeps browser CORS/simple integration clean.
- Runtime storage:
  - Local temp files: `temp-uploads/`
  - Generated images: `generated-images/`
  - Reference libraries: `reference-library/images` and legacy `reference-images/`

## 3) Main backend subsystems and purpose

### Auth + access control

- `src/services/firebaseAuth.ts`
  - `requireUser()`: verifies Firebase bearer token.
  - `requireUserOrInternal()`: allows either Firebase user OR trusted internal token (`x-postty-internal-token` + `POSTTY_INTERNAL_TOKEN` + `userId` hint).
- `src/services/accessControl.ts`
  - Invite-only gate via `POSTTY_INVITE_ONLY`.
  - Source of truth: Firestore `access_grants/{emailLower}`.
  - Mirrors grant status onto `users/{uid}` projection for UI speed.

Reuse when you need secure expensive endpoints; this pattern is already integrated across generation routes.

### Image generation provider layer (legacy/general flow)

- `src/services/imageGenerator.ts`
  - Provider resolution:
    - explicit `IMAGE_GENERATION_PROVIDER=gemini|openai`
    - else prefer Gemini if `GEMINI_API_KEY` exists
    - else OpenAI
  - Supports:
    - text-to-image (`generateImage`)
    - prompt + visual-context (`generateImageWithContext`)
    - true reference-image edits (`generateImageWithReferenceImages`) via OpenAI image edit APIs.
- `src/services/geminiImageGenerator.ts`
  - Imagen call (`@google/genai`, `generateImages`) with env-tunable model/size/aspect ratio.

### Pipeline generation (most important creative stack)

- Route contract: `src/routes/pipeline.ts`
  - `POST /pipeline` (multipart) and `POST /pipeline/json` (base64 JSON).
  - Concurrency guard: `src/services/pipelineQueue.ts`.
  - Optional reference URL download and path-based reference resolution.
  - Endpoints:
    - `GET /pipeline/status`
    - `GET /pipeline/references`
    - `POST /pipeline/reformat`
- Orchestration core: `src/services/pipelineOrchestrator.ts`
  - Step 1: Nano Banana base image (`nanoBananaGenerator.ts`)
  - Step 2: Gemini layout JSON (`textLayoutGenerator.ts`)
  - Step 3: Canvas composition (`textCompositorPro.ts`)
  - Returns both base image and final composited image with timing metadata.

### V2 product-on-background flow

- Route: `src/routes/v2-generate.ts`
  - `/v2/generate`: text-only background generation.
  - `/v2/generate-with-image`: product + generated background + local merge.
  - `/v2/generate-with-references`: product + uploaded reference backgrounds + merge.
  - Streaming response format: NDJSON candidates.
- Prompt orchestrator: `src/services/v2GeminiOrchestrator.ts`
  - Produces strict JSON:
    - `background_prompt`
    - `foreground_width_ratio`
    - `center_y_ratio`
    - optional `product_description`
  - Includes JSON normalization/parsing resilience.
- Subject segmentation + merge:
  - `src/services/geminiMultimodal.ts` -> `extractSubjectMaskWithGemini()`
  - `src/services/productMergeV2.ts` -> true-pixel compositing on top of generated background
    - prefers local `rembg` cutout if available
    - otherwise polygon/bbox alpha masking
    - adds controlled shadow + centered placement

### Post lifecycle + publishing

- `src/routes/posts-image.ts`
  - Save generated image as post draft, update caption, publish asynchronously.
  - Stores and updates post state via `postsStore.ts`.
  - Publishes via `instagramPublisher.ts`.
- Related services:
  - `imageUploader.ts` (S3 upload)
  - `instagramConnectionStore.ts` (active IG auth)
  - `postsStore.ts` (Firestore-backed post state)

### Reference intelligence

- `referenceLibrarySqlite.ts`, `search-references` route, ranking increment route.
- `geminiMultimodal.ts` extracts:
  - searchable keywords
  - deep design guidelines
  - text analysis (for structure/style extraction)

### Video subsystem (separate from image pipeline)

- Routes: `video-generate`, `video-publish`, `video-generate-and-publish`, `video-jobs`, `video-discard`.
- Services include `geminiVeoVideoGenerator.ts` + `videoJobStore.ts`.

## 4) End-to-end image generation flows

## A) Legacy simple generation (`/generate`)

1. Validate prompt.
2. Resolve provider and generate image (`imageGenerator.ts`).
3. Resize to Instagram-safe square (`imageResizer.ts`).
4. Generate caption (`captionGenerator.ts`).
5. Upload image to S3 (`imageUploader.ts`).
6. Return URLs/metadata (or NDJSON candidates in preview mode).

Good for fast generic generation and multiple candidates.

## B) Pipeline v2 (`/pipeline/json`) - flagship quality flow

1. Authenticate user/internal caller.
2. Decode product image.
3. Resolve reference source (URL/file/library/random fallback).
4. Acquire queue slot (`POSTTY_PIPELINE_MAX_CONCURRENCY`) to avoid overload.
5. `executePipeline()`:
   - Nano Banana produces base creative.
   - Gemini creates structured text layout.
   - Canvas compositor renders production-ready final image.
6. Return base image + final image + text layout + timing metadata.

This is the highest-control path for ad composition quality.

## C) V2 merge flow (`/v2/generate-with-image`)

1. Extract mask for product with Gemini vision.
2. Orchestrate scene prompt + placement ratios with Gemini JSON.
3. Generate background with Imagen.
4. Merge original product pixels onto background (`productMergeV2`).
5. Stream N candidates as NDJSON.

This path is strong when product fidelity is critical.

## 5) Why image generation is successful in Postty

Success comes from composition of independent quality controls, not from one model:

- Two-stage reasoning:
  - first scene generation (Nano Banana/Imagen),
  - then explicit layout/compositing.
  This avoids asking one model to solve everything at once.
- Explicit anti-failure prompts:
  - strong "no text" constraints when text is added later,
  - strict JSON contracts for orchestration/layout.
- Structured fallbacks:
  - invalid JSON -> deterministic defaults,
  - mask extraction failure -> bbox fallback,
  - Gemini layout failure -> style preset fallback.
- Pixel-space controls after model output:
  - no blind trust in model placement;
  - final composition and sizing are deterministic.
- Queue-based runtime stability:
  - avoids quality drops/timeouts from over-concurrency.
- Multi-reference strategy:
  - style reference + product reference (and optional second reference in edit mode).
  - improves style adherence while keeping product intent.

## 6) How to replicate this successfully in another project

Use this exact architecture pattern:

1. **Separate generation from composition**
   - Generate clean scene/base image first.
   - Add text/branding in your own compositor layer.
2. **Use strict machine contracts**
   - LLM outputs must be strict JSON with bounded numeric ranges.
   - Validate and clamp before use.
3. **Keep deterministic fallbacks**
   - Every AI step needs a local default branch.
4. **Preserve product fidelity**
   - For ecommerce creatives, prefer true-pixel merge + segmentation.
5. **Constrain text positions**
   - Enforce safe zones; do not trust raw LLM layout coordinates.
6. **Protect expensive endpoints**
   - auth + queue + rate limit.
7. **Return rich metadata**
   - expose timing and input traces so you can tune quality over time.

Minimum reusable components from Postty:

- `pipelineOrchestrator.ts` pattern (3-stage graph)
- `v2GeminiOrchestrator.ts` strict JSON orchestration
- `geminiMultimodal.ts` mask extraction contract
- `productMergeV2.ts` deterministic merge
- `textLayoutGenerator.ts` + compositor validation/fallback
- `pipelineQueue.ts` concurrency gate

## 7) Backend API surface map (grouped)

- Core health/status: `/health`, `/pipeline/status`, `/pipeline/references`
- Image generation:
  - `/generate`, `/generate-with-image`
  - `/pipeline`, `/pipeline/json`, `/pipeline/reformat`
  - `/v2/generate`, `/v2/generate-with-image`, `/v2/generate-with-references`
- Publishing:
  - `/publish-instagram`, `/publish-instagram-from-url`
  - `/posts/save-image`, `/posts/update-caption`, `/posts/publish-image`
- Intelligence helpers:
  - `/image-analyzer`, `/search-references`, `/apply-reference-json`, `/apply-design-guidelines-text`
- Video:
  - `/video/generate`, `/video/publish`, `/video/generate-and-publish`, `/video/jobs/:jobId`, `/video/discard`

## 8) Environment variables that matter most

Core:

- `PORT`
- `POSTTY_API_BASE_URL`
- `POSTTY_BODY_LIMIT_BYTES`
- `POSTTY_FILE_LIMIT_BYTES`
- `POSTTY_RATE_LIMIT_MAX`
- `POSTTY_RATE_LIMIT_WINDOW`
- `POSTTY_PIPELINE_MAX_CONCURRENCY`

Auth/access:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `POSTTY_INVITE_ONLY`
- `POSTTY_INVITE_BOOTSTRAP_ALLOWLIST`
- `POSTTY_INTERNAL_TOKEN`

AI:

- `GEMINI_API_KEY`
- `GEMINI_TEXT_MODEL`
- `GEMINI_VISION_MODEL`
- `GEMINI_IMAGE_MODEL`
- `IMAGE_GENERATION_PROVIDER`
- `OPENAI_API_KEY`

Storage/data:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- `DATABASE_URL`

Instagram:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `POSTTY_IG_OAUTH_STATE_SECRET`

## 9) Reuse guidelines for another LLM

When using this repo as a component library:

- Prefer backend-first reuse (routes + services), then adapt frontend proxies.
- Keep NDJSON contract for candidate streaming if your UI does progressive rendering.
- Do not couple business logic to one model name; preserve env-based model indirection.
- Preserve clean temp-file lifecycle and cleanup logic.
- For quality tuning, edit prompts and fallback bounds before changing architecture.

If you only reuse one part for quality image generation, reuse the `/pipeline/json` + `executePipeline()` pattern first.
