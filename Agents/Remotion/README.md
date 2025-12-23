# Remotion Renderer Service (code-only)

Deterministic HTTP service that composites **text overlays** (via SVG) on top of a **background image** (PNG/JPEG) and returns a **single PNG**.

## Endpoints

- `GET /health` → `{ "ok": true }`
- `POST /render` → `200 image/png` (binary)

## Fonts (required)

Place local font files in:
- `Agents/Remotion/fonts/*.ttf` or `Agents/Remotion/fonts/*.otf`, or use the auto-cache layout:
- `Agents/Remotion/fonts/<family>/<weight>-<style>.ttf` (example: `fonts/roboto/700-normal.ttf`)

The service **only** uses local fonts (no runtime downloads). The `font.family` you send must match the font family name embedded inside the font file.

Optional env var:
- `FONTS_DIR=/absolute/path/to/fonts`

## Automatic font resolution (Google Fonts API)

If a requested font is missing locally, the service can **download and cache** it under `Agents/Remotion/fonts/` using the Google Fonts Developer API.

Set:
- `GOOGLE_FONTS_API_KEY=...` (preferred), or `GOOGLE_FONT_KEY=...` (existing .env key)

Behavior:
- If font exists locally → used immediately
- Else → fetch list from Google Fonts API, pick exact (or most similar) family, download a suitable variant, cache it, then continue rendering
- If anything fails → logs a warning and **continues rendering with fallback** (render never fails due to fonts)

## .env auto-loading

On startup, the service will automatically try to load environment variables from:
- `Agents/Remotion/.env`
- repo root `.env` (two levels up)

This makes `GOOGLE_FONT_KEY` / `GOOGLE_FONTS_API_KEY` work without manually exporting env vars.

## Text overflow: \"auto\"

For text overlays, you can set `overflow: \"auto\"` to make the renderer:
- wrap text to the box width
- shrink font size down to `minFontSize` until it fits
- if it still can’t fit at `minFontSize`, ellipsize the last visible line

## Run (local)

```bash
cd "Agents/Remotion"
npm install
npm run build
npm start
```

## Render request (multipart/form-data) — recommended

- `file`: background image (`image/png` or `image/jpeg`)
- `spec`: JSON string for RenderSpec
- Only these two parts are accepted. Any additional multipart file fields are rejected with `400`.

Example:

```bash
curl -sS \
  -F "file=@./bg.jpg;type=image/jpeg" \
  -F 'spec={
    "canvas": { "width": 1080, "height": 1350, "backgroundFit": "cover", "backgroundPosition": { "x": 0.5, "y": 0.5 } },
    "overlays": [
      {
        "type": "text",
        "id": "title",
        "text": "Hello\\nRenderer",
        "box": { "x": 80, "y": 120, "width": 920, "height": 400 },
        "align": "left",
        "verticalAlign": "top",
        "font": { "family": "YOUR_FONT_FAMILY", "size": 96, "weight": 700 },
        "fill": "#FFFFFF",
        "shadow": { "dx": 0, "dy": 6, "blur": 8, "color": "rgba(0,0,0,0.6)" },
        "padding": { "top": 10, "right": 10, "bottom": 10, "left": 10 },
        "background": { "color": "rgba(0,0,0,0.35)", "radius": 24, "opacity": 1 },
        "overflow": "ellipsis",
        "maxLines": 2
      }
    ]
  }' \
  "http://localhost:3000/render" \
  --output out.png
```

## Render request (application/json) — supported

Body:

```json
{
  "mimeType": "image/jpeg",
  "imageBase64": "...",
  "spec": { "canvas": { "width": 1080, "height": 1350 }, "overlays": [] }
}
```

## Errors

- `400` validation error:
  - `{ "error": "validation_error", "message": "...", "issues": [{ "path": "...", "code": "...", "message": "..." }] }`
- `415` unsupported media type:
  - `{ "error": "unsupported_media_type", "allowed": [...], "got": "..." }`
- `500` unexpected:
  - `{ "error": "internal_error" }`

## RenderSpec JSON Schema

See: `src/schema/renderSpec.schema.json`

## Image overlays (type: \"image\")

If you use `type: \"image\"` overlays, `src` must be a **data URL** (e.g. `data:image/png;base64,...`).
This service accepts only a background image + a JSON spec (no extra uploaded asset files).

## Templates

- `RenderSpec.template.json`: minimal starting point
- `RenderSpec.advanced.template.json`: includes `canvas.effects`, `path`, and `overflow: \"auto\"` (no image overlay by default, so it runs without warnings)


