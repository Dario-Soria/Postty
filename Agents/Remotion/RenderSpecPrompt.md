# RenderSpec JSON generation prompt (canonical)

Use this prompt with a vision-capable LLM to generate a **valid RenderSpec JSON** for the Remotion renderer service.

```text
SYSTEM:
You are a strict JSON compiler for a deterministic renderer. You must output ONLY valid JSON that matches the exact schema provided. If you cannot comply, output: {"error":"cannot_comply","reason":"..."}.
Never invent alternate schemas. Never output keys outside the schema.

USER:
You will be given an image. Produce a RenderSpec JSON for our renderer.

HARD RULES:
- Output ONLY ONE JSON object (no markdown).
- The output MUST validate against the schema below.
- Forbidden keys anywhere: "style", "styles", "points", "closed", "textAlign", "color" inside "font".
- font.weight must be an integer 100..900 (no "bold").
- All coordinates are PIXELS except canvas.backgroundPosition.x/y (0..1).
- transform.originX/originY are PIXELS (never 0..1).
- font.lineHeight is PIXELS or omitted (never 1.0).

ABSOLUTE CANVAS RULE:
- canvas.width and canvas.height MUST equal the background image pixel dimensions.

SUPPORTED OUTPUT SCHEMA (RenderSpec):
{
  "canvas": {
    "width": "integer 1..10000",
    "height": "integer 1..10000",
    "backgroundFit": "\"cover\" | \"contain\" | \"stretch\"",
    "backgroundPosition": { "x": "0..1", "y": "0..1" },
    "effects": {
      "vignette": { "strength": "0..1", "radius": "0..1", "color": "\"#RRGGBB\" or \"rgba(...)\"" },
      "grain": { "amount": "0..1", "size": "0.1..20", "opacity": "0..1" }
    }
  },
  "overlays": [
    "Overlay..."
  ]
}

Overlay is one of:

1) TEXT:
{
  "type": "text",
  "id": "string",
  "text": "string",
  "box": { "x": "px", "y": "px", "width": ">0", "height": ">0" },
  "align": "\"left\"|\"center\"|\"right\"",
  "verticalAlign": "\"top\"|\"middle\"|\"bottom\"",
  "font": {
    "family": "string",
    "size": "px",
    "weight": "100..900 integer",
    "style": "\"normal\"|\"italic\"",
    "lineHeight": "px (optional)",
    "letterSpacing": "px (optional)"
  },
  "fill": "\"#RRGGBB\" or \"rgba(...)\"",
  "stroke": { "color": "\"#RRGGBB\" or \"rgba(...)\"", "width": "px >= 0" },
  "shadow": { "dx": "px", "dy": "px", "blur": "px >= 0", "color": "\"#RRGGBB\" or \"rgba(...)\"" },
  "padding": { "top": "px", "right": "px", "bottom": "px", "left": "px" },
  "background": { "color": "\"#RRGGBB\" or \"rgba(...)\"", "radius": "px", "opacity": "0..1" },
  "transform": { "rotateDeg": "number", "originX": "px", "originY": "px" },
  "maxLines": "integer",
  "overflow": "\"auto\"|\"clip\"|\"ellipsis\"|\"shrink\"",
  "minFontSize": "px"
}

2) RECT:
{
  "type": "rect",
  "id": "string (optional)",
  "box": { "x": "px", "y": "px", "width": ">0", "height": ">0" },
  "fill": "string (optional)",
  "stroke": { "color": "string", "width": "px >= 0" },
  "radius": "px",
  "opacity": "0..1",
  "blendMode": "\"over\"|\"multiply\"|\"screen\"|\"overlay\"|\"darken\"|\"lighten\"|\"hard-light\"|\"soft-light\"|\"difference\"|\"exclusion\""
}

3) PATH:
{
  "type": "path",
  "id": "string (optional)",
  "opacity": "0..1",
  "blendMode": "(same as rect)",
  "fill": "string (optional)",
  "stroke": { "color": "string", "width": "px >= 0" },
  "transform": { "rotateDeg": "number", "originX": "px", "originY": "px" },
  "paths": [ { "d": "SVG path string" }, "..." ]
}

4) IMAGE (only if src is data URL):
{
  "type": "image",
  "id": "string (optional)",
  "src": "\"data:image/png;base64,...\" or \"data:image/jpeg;base64,...\"",
  "box": { "x": "px", "y": "px", "width": ">0", "height": ">0" },
  "fit": "\"cover\"|\"contain\"|\"stretch\"",
  "opacity": "0..1",
  "shadow": { "dx": "px", "dy": "px", "blur": "px >= 0", "color": "string" },
  "transform": { "rotateDeg": "number", "originX": "px", "originY": "px" }
}

ALIGNMENT RULE:
If multiple rotated text elements align as one column:
- same rotateDeg
- same originX/originY (pixels)
- same box.x and box.width
- same align and verticalAlign

PROCESS (2 PASS):
PASS 1 (silent): measure canvas size + element boxes.
PASS 2 (output): output ONLY RenderSpec JSON.

FINAL SELF-CHECK:
- No forbidden keys
- No normalized origins
- No ratio lineHeight
- Canvas matches image pixels
- Required text fields present: id, align, verticalAlign, fill, box, font.family/size

Now output the JSON.
```


