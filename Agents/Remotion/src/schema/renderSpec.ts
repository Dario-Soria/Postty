import { z } from "zod";

const ColorSchema = z
  .string()
  .refine(
    (v) =>
      /^#[0-9A-Fa-f]{6}$/.test(v) ||
      /^rgba\(\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(0|0?\.\d+|1(\.0+)?)\s*\)$/.test(
        v,
      ),
    { message: "Invalid color. Use #RRGGBB or rgba(r,g,b,a)." },
  );

const Px = z.number().finite();

const BoxSchema = z
  .object({
    x: Px,
    y: Px,
    width: Px,
    height: Px,
  })
  .strict()
  .superRefine((b, ctx) => {
    if (b.width <= 0) ctx.addIssue({ code: "custom", message: "width must be > 0", path: ["width"] });
    if (b.height <= 0) ctx.addIssue({ code: "custom", message: "height must be > 0", path: ["height"] });
  });

const PaddingSchema = z
  .object({
    top: Px.default(0),
    right: Px.default(0),
    bottom: Px.default(0),
    left: Px.default(0),
  })
  .strict()
  .default({ top: 0, right: 0, bottom: 0, left: 0 });

const StrokeSchema = z
  .object({
    color: ColorSchema,
    width: Px.superRefine((v, ctx) => {
      if (v < 0) ctx.addIssue({ code: "custom", message: "stroke.width must be >= 0" });
    }),
  })
  .strict();

const ShadowSchema = z
  .object({
    dx: Px,
    dy: Px,
    blur: Px.superRefine((v, ctx) => {
      if (v < 0) ctx.addIssue({ code: "custom", message: "shadow.blur must be >= 0" });
    }),
    color: ColorSchema,
  })
  .strict();

const TransformSchema = z
  .object({
    rotateDeg: z.number().finite(),
    originX: Px.optional(),
    originY: Px.optional(),
  })
  .strict();

const FontSchema = z
  .object({
    family: z.string().min(1),
    size: Px,
    weight: z.number().int().min(100).max(900).optional(),
    style: z.enum(["normal", "italic"]).optional(),
    lineHeight: Px.optional(),
    letterSpacing: Px.optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.size <= 0) ctx.addIssue({ code: "custom", message: "font.size must be > 0", path: ["size"] });
    if (f.lineHeight !== undefined && f.lineHeight <= 0) {
      ctx.addIssue({ code: "custom", message: "font.lineHeight must be > 0", path: ["lineHeight"] });
    }
  })
  .transform((f) => ({
    ...f,
    lineHeight: f.lineHeight ?? f.size * 1.2,
  }));

const TextBackgroundSchema = z
  .object({
    color: ColorSchema,
    radius: Px.optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();

const CanvasSchema = z
  .object({
    width: z.number().int().min(1).max(10000),
    height: z.number().int().min(1).max(10000),
    backgroundFit: z.enum(["cover", "contain", "stretch"]).default("cover"),
    backgroundPosition: z
      .object({
        x: z.number().min(0).max(1).default(0.5),
        y: z.number().min(0).max(1).default(0.5),
      })
      .strict()
      .default({ x: 0.5, y: 0.5 }),
    effects: z
      .object({
        vignette: z
          .object({
            strength: z.number().min(0).max(1).default(0.35),
            radius: z.number().min(0).max(1).default(0.85),
            color: ColorSchema.default("rgba(0,0,0,0.85)"),
          })
          .strict()
          .optional(),
        grain: z
          .object({
            amount: z.number().min(0).max(1).default(0.12),
            size: z.number().min(0.1).max(20).default(1.2),
            opacity: z.number().min(0).max(1).default(0.18),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const BlendModeSchema = z
  .enum(["over", "multiply", "screen", "overlay", "darken", "lighten", "hard-light", "soft-light", "difference", "exclusion"])
  .default("over");

const CommonOverlaySchema = z
  .object({
    id: z.string().min(1).optional(),
    opacity: z.number().min(0).max(1).default(1),
    blendMode: BlendModeSchema.optional(),
  })
  .strict();

const TextOverlaySchema = z
  .object({
    type: z.literal("text"),
    id: z.string().min(1),
    text: z.string(),
    box: BoxSchema,
    align: z.enum(["left", "center", "right"]).default("left"),
    verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
    font: FontSchema,
    fill: ColorSchema,
    stroke: StrokeSchema.optional(),
    shadow: ShadowSchema.optional(),
    padding: PaddingSchema.optional(),
    background: TextBackgroundSchema.optional(),
    transform: TransformSchema.optional(),
    maxLines: z.number().int().min(1).max(500).optional(),
    overflow: z.enum(["clip", "ellipsis", "shrink", "auto"]).default("clip"),
    minFontSize: z.number().min(1).max(500).default(10),
    opacity: z.number().min(0).max(1).default(1),
    blendMode: BlendModeSchema.optional(),
  })
  .strict();

const RectOverlaySchema = z
  .object({
    type: z.literal("rect"),
    box: BoxSchema,
    fill: ColorSchema.optional(),
    stroke: StrokeSchema.optional(),
    radius: Px.optional(),
    id: z.string().min(1).optional(),
    opacity: z.number().min(0).max(1).default(1),
    blendMode: BlendModeSchema.optional(),
  })
  .strict();

const PathOverlaySchema = z
  .object({
    type: z.literal("path"),
    id: z.string().min(1).optional(),
    opacity: z.number().min(0).max(1).default(1),
    blendMode: BlendModeSchema.optional(),
    fill: ColorSchema.optional(),
    stroke: StrokeSchema.optional(),
    transform: TransformSchema.optional(),
    paths: z
      .array(
        z
          .object({
            d: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const ImageOverlaySchema = z
  .object({
    type: z.literal("image"),
    id: z.string().min(1).optional(),
    opacity: z.number().min(0).max(1).default(1),
    blendMode: BlendModeSchema.optional(),
    src: z.string().min(1),
    box: BoxSchema,
    fit: z.enum(["cover", "contain", "stretch"]).default("contain"),
    shadow: ShadowSchema.optional(),
    transform: TransformSchema.optional(),
  })
  .strict();

const OverlaySchema = z.discriminatedUnion("type", [TextOverlaySchema, RectOverlaySchema, PathOverlaySchema, ImageOverlaySchema]);

export const RenderSpecSchema = z
  .object({
    canvas: CanvasSchema,
    overlays: z.array(OverlaySchema).default([]),
  })
  .strict();

export type RenderSpec = z.infer<typeof RenderSpecSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type TextOverlay = z.infer<typeof TextOverlaySchema>;
export type RectOverlay = z.infer<typeof RectOverlaySchema>;
export type PathOverlay = z.infer<typeof PathOverlaySchema>;
export type ImageOverlay = z.infer<typeof ImageOverlaySchema>;
export type BlendMode = z.infer<typeof BlendModeSchema>;


