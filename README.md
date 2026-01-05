## Postty (v3.2)

Postty is a **Fastify (Node.js + TypeScript) backend** plus a **Next.js frontend** for:
- generating Instagram-ready images (Gemini Imagen or OpenAI),
- generating captions (OpenAI),
- optionally publishing to Instagram (Instagram Graph API),
- and supporting a UI approval flow (generate → approve/edit → publish).

### Quick links (docs we actually use)

- **[QUICKSTART.md](QUICKSTART.md)**: fastest setup/run checklist
- **[SETUP_GUIDE.md](SETUP_GUIDE.md)**: Instagram + AWS + keys setup (detailed)
- **[API_ENDPOINTS.md](API_ENDPOINTS.md)**: API reference (more verbose than this README)
- **[REFERENCE_LIBRARY_INDEXING.md](REFERENCE_LIBRARY_INDEXING.md)**: batch index reference images
- **[CUSTOMER_SETUP.md](CUSTOMER_SETUP.md)**: customer onboarding checklist
- **[AI_FEATURE_GUIDE.md](AI_FEATURE_GUIDE.md)**: AI feature notes + behavior
- **[DOCUMENTATION_SUMMARY.md](DOCUMENTATION_SUMMARY.md)**: map of all docs

### Important files / folders (where to look)

- **Backend entrypoint**: `src/server.ts` (registers all routes + file-size limits)
- **Backend routes (HTTP endpoints)**: `src/routes/`
- **Backend core services**:
  - `src/services/imageGenerator.ts` (Gemini Imagen or OpenAI image generation + reference-image edits)
  - `src/services/captionGenerator.ts` (OpenAI caption generation)
  - `src/services/imageUploader.ts` (S3 uploads)
  - `src/services/instagramPublisher.ts` (Instagram Graph API publish flow)
  - `src/services/geminiStyleProfile.ts` (style-profile extraction from references)
  - `src/services/geminiImageAnalyzer.ts` (`/image-analyzer` use-case classifier)
  - `src/services/referenceLibrarySqlite.ts` + `reference-library/index.sqlite` (async reference indexing)
- **Prompts**:
  - `src/prompts/posttyMegaPromptV10.ts` (Content Architect system prompt)
- **Frontend**:
  - `frontend/src/app/v2/` (current UI flow)
  - `frontend/src/app/api/*/route.ts` (**browser-safe proxy** to the backend; also streams NDJSON without buffering)
- **Local output / temp**:
  - `generated-images/` (generated PNGs)
  - `temp-uploads/` (uploads + intermediate files)
- **Scripts / Tools**:
  - `scripts/index-reference-images.ts` (batch index images in `reference-library/images/` - see `scripts/README.md`)
  - `scripts/rembg_cutout.py` (background removal)

## Run locally

### Backend (Fastify)

```bash
npm install
npm run dev
```

- **Default port**: `8080` (override with `PORT`)

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

- **Backend URL for the frontend proxy**: set `POSTTY_API_BASE_URL` (defaults to `http://localhost:8080`)

## Environment variables (what’s required)

Create a `.env` in repo root (backend reads it via `dotenv/config`).

- **Required for the UI flow**
  - `OPENAI_API_KEY` (captions, chat, transcription, and some vision/image-edit flows)
- **Required for Gemini features**
  - `GEMINI_API_KEY` (Gemini Imagen image generation + style-profile + image-analyzer)
- **Required for publishing**
  - `INSTAGRAM_USER_ID`
  - `INSTAGRAM_ACCESS_TOKEN` (must be a Facebook Page token; see `SETUP_GUIDE.md`)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`
- **Common optional**
  - `IMAGE_GENERATION_PROVIDER` = `gemini` | `openai` (default: gemini if `GEMINI_API_KEY` is set, else openai)
  - `POSTTY_BODY_LIMIT_BYTES`, `POSTTY_FILE_LIMIT_BYTES` (upload limits; defaults in `src/server.ts`)
  - `CAPTION_MODEL`, `CHAT_MODEL`, `POSTTY_ARCHITECT_MODEL`
  - `OPENAI_TRANSCRIBE_MODEL` (default `whisper-1`), `TRANSCRIBE_MAX_BYTES` (default 10MB)
  - `ENABLE_PIXABAY`, `PIXABAY_API_KEY` (optional enrichment used by generation routes)

## Current API (what the app uses)

### Browser-safe endpoints (via Next.js proxy)

The UI calls **Next.js Route Handlers** under `frontend/src/app/api/*`, which proxy to the backend:

- `POST /api/chat` → `POST /chat`
- `POST /api/generate` → `POST /generate` (**supports NDJSON streaming**)
- `POST /api/generate-with-image` → `POST /generate-with-image` (**supports NDJSON streaming**)
- `POST /api/caption` → `POST /caption`
- `POST /api/transcribe` → `POST /transcribe`
- `POST /api/image-analyzer` → `POST /image-analyzer`
- `POST /api/style-profile` → `POST /style-profile`
- `POST /api/publish` → `POST /publish-instagram-from-url` (or `/publish-instagram` if you pass a server-local `image_path`)

### Backend endpoints (authoritative list)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/chat` | JSON | Slot-filling + guardrails; may return an action to call generation |
| POST | `/generate` | JSON | Generate image + caption + S3 upload (no publish). Optional `preview_only` streams NDJSON candidates |
| POST | `/generate-with-image` | multipart | Upload `image` + `prompt`. Optional `preview_only` streams NDJSON candidates |
| POST | `/caption` | JSON | Caption-only regeneration |
| POST | `/transcribe` | multipart | Upload `audio` file → text |
| POST | `/image-analyzer` | multipart | Upload `image` → use-case classification (Gemini vision) |
| POST | `/style-profile` | multipart | Upload `references` (1..N) → strict `style_profile` JSON |
| POST | `/publish-instagram-from-url` | JSON | Publish a **public HTTPS** image URL + caption |
| POST | `/publish-instagram` | JSON | Publish using server-local `image_path` (must be under `generated-images/` or `temp-uploads/`) |

### Legacy “direct publish” endpoints (kept for scripts / server-to-server)

These publish immediately (no UI approval step). They are registered in the backend but **not used by the current frontend flow**:
- `POST /generate-and-publish` (JSON)
- `POST /generate-with-image-and-publish` (multipart)

## How-to guides (current workflows)

### Generate → approve → publish (recommended)

- **Generate** with `/api/generate` or `/api/generate-with-image`
- **Show** the returned `uploaded_image_url` in the UI and let the user edit the caption
- **Publish** with `/api/publish` (uses backend `/publish-instagram-from-url`)

Example (generate text-only):

```bash
curl -sS -X POST "http://localhost:3000/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Minimalist product promo for a stainless steel water bottle, summer vibe"}' | jq .
```

Example (publish from URL):

```bash
curl -sS -X POST "http://localhost:3000/api/publish" \
  -H "Content-Type: application/json" \
  -d '{"image_url":"https://...","caption":"Your final caption #tags"}' | jq .
```

### Stream candidate previews (NDJSON)

`/generate` and `/generate-with-image` support `preview_only=true` and stream results as **NDJSON** (`application/x-ndjson`), emitting events like `start`, `candidate`, `done` (and sometimes `error`).

```bash
curl -N -sS -X POST "http://localhost:3000/api/generate" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"3 variations of a bold gym supplement promo poster","preview_only":true,"num_candidates":3}'
```

### Extract a style profile from references

Upload multiple reference images as `references` and receive a strict `style_profile` JSON.

```bash
curl -sS -X POST "http://localhost:3000/api/style-profile" \
  -F "references=@reference-library/images/1.png" \
  -F "references=@reference-library/images/2.png" | jq .
```

### Transcribe audio (voice-to-text)

```bash
curl -sS -X POST "http://localhost:3000/api/transcribe" \
  -F "audio=@./path/to/audio.webm" | jq .
```


