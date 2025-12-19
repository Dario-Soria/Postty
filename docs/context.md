# context.md — Instagram Auto-Poster Backend (Cursor Project Guide)

## 1. Project Overview

We are building a **small backend service** in **Node.js + TypeScript + Fastify** that:

1. Accepts an **image from a local file path** and a **caption**.
2. Uploads the local image to **cloud storage** (S3-compatible) to obtain a **public HTTPS URL**.
3. Uses the **Instagram Graph API** to:
   - Create a **media container** with that image URL and caption.
   - Poll until the container is ready.
   - Publish the container as a **live Instagram post**.
4. Exposes a clean API surface so that, in a future phase, an **AI layer** can generate the image and caption and call this service.

For now, we assume:

- The user will deal with **Meta / Instagram app setup and tokens** separately.
- We use **AWS S3** (or compatible) for object storage, with public-read objects.
- We deploy locally first; deployment is a later step.

This project should be **simple, explicit, and AI-layer-ready**.

---

## 2. Tech Stack & Constraints

- **Language:** TypeScript
- **Runtime:** Node.js (>= 18 preferred)
- **Web framework:** Fastify
- **HTTP client:** `axios`
- **Storage:** AWS S3 (can be swapped for other S3-compatible providers later)
- **Environment management:** `.env` via `dotenv`
- **Execution modes:**
  - Primary: HTTP API (Fastify)
  - Optional: Later we can add a CLI wrapper that calls the same service logic.

### Dependencies (npm)

Runtime:
- `fastify`
- `@fastify/multipart`
- `axios`
- `form-data`
- `dotenv`
- `aws-sdk` (v2; simple S3 usage is fine for v1)

Dev:
- `typescript`
- `ts-node`
- `@types/node`
- `@types/axios`
- `@types/form-data`
- `@types/aws-sdk`
- `@types/fastify`

---

## 3. Project Structure

Create this structure:

```bash
instagram-poster/
  ├── src/
  │   ├── server.ts
  │   ├── routes/
  │   │   └── publish-instagram.ts
  │   ├── services/
  │   │   ├── imageUploader.ts
  │   │   └── instagramPublisher.ts
  │   └── utils/
  │       └── logger.ts
  ├── .env
  ├── package.json
  ├── tsconfig.json
  └── README.md
```

**Important for Cursor:**

- Treat `src/services` as the home for business logic.
- Treat `src/routes` as thin HTTP adapters.
- `server.ts` should only wire Fastify, plugins, and routes.
- `logger.ts` can be a very small utility using `console` for now.

---

## 4. Environment Variables

We will configure the project using a `.env` file at the repo root with at least:

```env
INSTAGRAM_USER_ID=your_ig_user_id
INSTAGRAM_ACCESS_TOKEN=your_long_lived_token

AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name
```

Notes:

- `INSTAGRAM_USER_ID` is the Instagram Business/Creator account ID (not username).
- `INSTAGRAM_ACCESS_TOKEN` should be a **long-lived** token with permission to publish.
- S3 bucket must allow `public-read` objects (for now).

Later we might add:

- `PORT` (for server port)
- `GRAPH_API_VERSION` (e.g. `v19.0`)

---

## 5. Core Behaviors (What Cursor Should Enforce)

### 5.1 ImageUploader Service

File: `src/services/imageUploader.ts`

Responsibilities:

- Accept a **local file path**.
- Validate that the file exists and is readable.
- Upload the file to the configured S3 bucket under a prefix, e.g. `instagram/`.
- Set `ACL: "public-read"` so the image is publicly accessible.
- Return the **public HTTPS URL** of the uploaded file.

Signature:

```ts
export async function uploadLocalImage(filePath: string): Promise<string>;
```

Behavior:

1. Throw a clear error if the file does not exist.
2. Throw a clear error if the upload fails.
3. Return the uploaded file URL from S3 (`uploadResult.Location`).

### 5.2 InstagramPublisher Service

File: `src/services/instagramPublisher.ts`

Responsibilities:

- Take `imageUrl` and `caption`.
- Call Instagram Graph API to:

  1. Create a media container:
     - `POST https://graph.facebook.com/v19.0/{IG_USER_ID}/media`
     - Params: `image_url`, `caption`, `access_token`
  2. Poll the container:
     - `GET https://graph.facebook.com/v19.0/{creation_id}?fields=status_code&access_token=...`
     - Loop until `status_code === "FINISHED"` or `status_code === "ERROR"`.
  3. Publish the container:
     - `POST https://graph.facebook.com/v19.0/{IG_USER_ID}/media_publish`
     - Params: `creation_id`, `access_token`

Signature:

```ts
export async function publishInstagramPost(
  imageUrl: string,
  caption: string
): Promise<{ id: string }>;
```

Behavior:

- Throw an error if the container status becomes `"ERROR"`.
- Use a simple polling interval (e.g. 1–2 seconds).
- Return the published media object (at least `id`).

### 5.3 HTTP Route: /publish-instagram

File: `src/routes/publish-instagram.ts`

Route: `POST /publish-instagram`

Request body (JSON):

```ts
{
  image_path: string; // local file path on the server
  caption: string;
}
```

Behavior:

1. Validate `image_path` and `caption` are present and non-empty.
2. Check that `image_path` exists.
3. Call `uploadLocalImage(image_path)` → `imageUrl`.
4. Call `publishInstagramPost(imageUrl, caption)` → `publishResult`.
5. Return JSON like:

```json
{
  "status": "success",
  "uploaded_image_url": "https://...",
  "instagram_response": {
    "id": "1789..."
  }
}
```

On errors, respond with:

- `400` for invalid input / missing file.
- `500` for upload or Instagram errors, with a safe error message.

### 5.4 Fastify Server

File: `src/server.ts`

Responsibilities:

- Initialize `dotenv`.
- Create Fastify instance.
- Register plugins (e.g. `@fastify/multipart`).
- Register the `/publish-instagram` route module.
- Start the server on `PORT` from env or default (e.g. 8080).

---

## 6. TypeScript & tsconfig

`tsconfig.json` should roughly be:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

---

## 7. Scripts in package.json

In `package.json`, we want at least:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "ts-node src/server.ts"
  }
}
```

Cursor should ensure these scripts exist.

---

## 8. Example Usage

Once everything is wired:

### Start Dev Server

```bash
npm run dev
# or
npx ts-node src/server.ts
```

### Publish a Post via curl

```bash
curl -X POST http://localhost:8080/publish-instagram   -H "Content-Type: application/json"   -d '{
    "image_path": "/absolute/path/to/myphoto.jpg",
    "caption": "Testing automatic IG posting from Node.js backend"
  }'
```

Expected response (simplified):

```json
{
  "status": "success",
  "uploaded_image_url": "https://your-bucket.s3.amazonaws.com/instagram/...",
  "instagram_response": {
    "id": "1789..."
  }
}
```

---

## 9. AI Layer Readiness

We want the core `publishInstagramPost` flow to be **decoupled from HTTP** so the AI layer can call it in multiple ways:

- Directly from another Node service, e.g.:

  ```ts
  await publishInstagramPost(imageUrl, aiCaption);
  ```

- Via HTTP by calling `/publish-instagram`.

When adding the AI layer later, **do not embed Instagram API logic inside the AI service**. Always delegate posting to `instagramPublisher.ts` and reuse the same contract.

---

## 10. How to Ask Cursor for Help

Examples of prompts inside Cursor:

- “Generate `package.json` with the scripts and dependencies described in `context.md`.”
- “Create `src/services/imageUploader.ts` implementing `uploadLocalImage` as described in `context.md`.”
- “Create `src/services/instagramPublisher.ts` and wire the Instagram Graph API calls according to `context.md`.”
- “Create `src/routes/publish-instagram.ts` as the HTTP route adapter using `uploadLocalImage` and `publishInstagramPost`.”
- “Create `src/server.ts` that configures Fastify, registers the route, and starts the server.”

When modifying behavior:

- “Refactor `instagramPublisher.ts` to accept a configurable API version from an env variable, defaulting to v19.0, while preserving current behavior.”
- “Add better error handling and logging to `publishInstagramPost` following the patterns defined in `logger.ts`.”

---

## 11. Style & Code Quality Guidelines

- Use **async/await** consistently.
- Prefer small, pure functions in `services/`.
- Throw `Error` with clear messages; let HTTP layer translate them to responses.
- Avoid global state except for loaded env variables and shared clients (e.g. S3, axios base instance).
- Add minimal but clear comments where behavior is non-obvious (e.g. polling loop).

---

## 12. Future Extensions (For Cursor Awareness)

Not required now, but keep code modular so we can easily add:

- **Reels support** (video upload).
- **Scheduling posts** (e.g., queue with delayed execution).
- **Analytics retrieval** (likes, comments, reach).
- **AI content generation**:
  - A service that generates `caption` text based on a product description, mood, language, etc.
  - A service that generates or selects an image and then passes the path/url into this backend.

---

This `context.md` defines how the project should behave and how files should be structured so that Cursor can reliably generate and refactor code for the Instagram Auto-Poster backend.
