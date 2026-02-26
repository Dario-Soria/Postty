## Postty - Architecture & Operations

Postty is an AI-assisted social content platform with a **Next.js frontend** and a **Fastify backend**.  
It is deployed as a cloud-native stack with invite-only access control.

## Current cloud architecture

- **Frontend**: Vercel (Next.js App Router)
  - Public URL: `https://frontend-two-kappa-97.vercel.app/`
  - Canonical user entrypoint is `/` (V3 app rendered at root).
  - `/v2` and `/v3` are redirected to `/`.
- **Backend**: Google Cloud Run (Fastify/Node.js)
  - Service URL: `https://postty-backend-beta-418679285048.us-central1.run.app`
  - Handles generation, auth verification, publishing, and agent orchestration.
- **Authentication**: Firebase Auth (Google sign-in)
- **Authorization**: Firestore invite-only grants
  - `access_grants/{emailLower}` is source of truth
  - `users/{uid}` mirrors `accessGranted` for UI speed
- **Primary app data**: Firestore (`users`, posts metadata, profile projections)
- **Reference metadata / search**: Neon Postgres (`reference_images`, rankings, filters)
- **Media storage**: AWS S3 (generated assets + reference library objects)
- **AI providers**:
  - Google Gemini / Imagen (`GEMINI_API_KEY`)
  - OpenAI (`OPENAI_API_KEY`)
- **Social publishing**: Instagram Graph API (Meta app + tokens)

## High-level request flow

1. User opens frontend on Vercel (`/`).
2. User signs in with Google (Firebase Auth).
3. Frontend sends bearer token to backend via Next.js API proxy routes.
4. Backend verifies Firebase token and enforces invite-only access.
5. Backend runs generation pipeline (Gemini/OpenAI + processing + storage).
6. Results are returned to frontend and optionally published to Instagram.

## Invite-only security model

Invite-only is enabled via backend env flag:

- `POSTTY_INVITE_ONLY=true`

Authorization decision:

- **Allow** if `access_grants/{emailLower}.enabled == true`
- **Deny (403)** otherwise

Bootstrap allowlist can also be configured using:

- `POSTTY_INVITE_BOOTSTRAP_ALLOWLIST=email1,email2,...`

Seeding helper script:

```bash
npm run seed-access-grants -- ds.dariosoria@gmail.com jbeinesfurcada@gmail.com ulisesfferreyra@gmail.com
```

## Monorepo layout (key paths)

- `src/server.ts`: backend entrypoint and route registration
- `src/routes/`: Fastify HTTP routes
- `src/services/`: backend services (auth, pipeline, storage, publishing, AI orchestration)
- `frontend/src/app/`: Next.js app pages
- `frontend/src/app/api/`: Next.js route handlers that proxy to backend
- `Agents/Product Showcase/`: Python agent used by product showcase flow
- `scripts/`: operational scripts (reference import, access-grant seeding)

## Environment variables by subsystem

### Core backend/runtime

- `PORT`
- `POSTTY_API_BASE_URL` (frontend proxy target)
- `POSTTY_BODY_LIMIT_BYTES`
- `POSTTY_FILE_LIMIT_BYTES`
- `POSTTY_RATE_LIMIT_MAX`
- `POSTTY_RATE_LIMIT_WINDOW`
- `POSTTY_PIPELINE_MAX_CONCURRENCY`
- `POSTTY_INTERNAL_TOKEN` (trusted internal service-to-service calls)

### Auth / invite-only

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `POSTTY_INVITE_ONLY`
- `POSTTY_INVITE_BOOTSTRAP_ALLOWLIST` (optional)

### AI

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- Optional model tuning vars (`CHAT_MODEL`, `CAPTION_MODEL`, etc.)

### Storage + database

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`
- `DATABASE_URL` (Neon Postgres)

### Instagram / Meta

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `POSTTY_IG_OAUTH_STATE_SECRET`
- runtime publish tokens/ids as required by your flow

## Local development

### Backend

```bash
npm install
npm run dev
```

Backend runs on `http://localhost:8080` by default.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

## Deployment model

### Frontend (Vercel)

- Build/deploy from `frontend/`
- Root route serves V3 app
- Redirects are defined in `frontend/next.config.ts`

### Backend (Cloud Run)

- Build container from repository root Dockerfile
- Deploy service `postty-backend-beta` in `us-central1`
- Ensure env vars are configured in Cloud Run service settings

## Reliability and abuse controls

- Global API rate limiting in Fastify (`@fastify/rate-limit`)
- Pipeline queue/concurrency control (`POSTTY_PIPELINE_MAX_CONCURRENCY`)
- Auth-required for expensive generation endpoints
- Internal-token flow for trusted agent/backchannel calls

## Quick operations checklist

- Verify backend health: `GET /health`
- Verify pipeline readiness/queue stats: `GET /pipeline/status`
- Verify invite-only is on in Cloud Run:
  - `POSTTY_INVITE_ONLY=true`
- Verify access grants in Firestore:
  - `access_grants/{emailLower}.enabled = true`

## Related docs

- `QUICKSTART.md`
- `SETUP_GUIDE.md`
- `API_ENDPOINTS.md`
- `REFERENCE_LIBRARY_INDEXING.md`
- `AI_FEATURE_GUIDE.md`

