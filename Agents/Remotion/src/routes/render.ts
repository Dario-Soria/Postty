import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorBody } from "../http/errors";
import { zodIssuesToApiIssues } from "../http/errors";
import { parseRenderRequest } from "../request/parseRenderRequest";
import { RenderSpecSchema } from "../schema/renderSpec";
import { renderImage } from "../render/renderImage";
import { resolveFontPath } from "../fontManager";

export type RenderRoutesOpts = {
  fontsDir: string;
};

export const renderRoutes: FastifyPluginAsync<RenderRoutesOpts> = async (app, opts) => {
  app.post("/render", async (req, reply) => {
    try {
      const parsed = await parseRenderRequest(req);

      if (parsed.mimeType !== "image/png" && parsed.mimeType !== "image/jpeg") {
        const body: ApiErrorBody = {
          error: "unsupported_media_type",
          allowed: ["image/png", "image/jpeg"],
          got: parsed.mimeType,
        };
        return reply.code(415).send(body);
      }

      const spec = RenderSpecSchema.parse(parsed.spec);
      // Ensure requested fonts exist locally; do NOT fail rendering if fonts can't be resolved.
      const textOverlays = spec.overlays.filter((o) => o.type === "text");
      for (const o of textOverlays) {
        const resolved = await resolveFontPath(
          {
            fontsDir: opts.fontsDir,
            fontFamily: o.font.family,
            fontWeight: o.font.weight ?? "regular",
            fontStyle: o.font.style ?? "normal",
          },
          { logger: app.log as any },
        );
        if (!resolved) {
          app.log.warn({ family: o.font.family }, "Font could not be resolved; rendering will use fallback font.");
        }
      }

      const png = await renderImage({
        background: parsed.imageBuffer,
        backgroundMimeType: parsed.mimeType,
        spec,
        fontsDir: opts.fontsDir,
        logger: app.log as any,
      });

      reply.header("Content-Type", "image/png");
      return reply.code(200).send(png);
    } catch (err) {
      if (err instanceof ZodError) {
        const body: ApiErrorBody = {
          error: "validation_error",
          message: "RenderSpec validation failed",
          issues: zodIssuesToApiIssues(err.issues),
        };
        return reply.code(400).send(body);
      }

      if (err instanceof SyntaxError) {
        const body: ApiErrorBody = {
          error: "validation_error",
          message: "Invalid JSON",
          issues: [{ path: "spec", code: "invalid_json", message: err.message }],
        };
        return reply.code(400).send(body);
      }

      if (err && typeof err === "object" && "statusCode" in err) {
        // fastify-multipart can throw httpErrors; treat as validation-ish
        const statusCode = (err as any).statusCode as number;
        if (statusCode === 415) {
          const body: ApiErrorBody = {
            error: "unsupported_media_type",
            allowed: ["multipart/form-data", "application/json"],
            got: (req.headers["content-type"] ?? "").toString(),
          };
          return reply.code(415).send(body);
        }
        if (statusCode >= 400 && statusCode < 500) {
          const body: ApiErrorBody = {
            error: "validation_error",
            message: (err as any).message ?? "Bad Request",
            issues: [{ path: "", code: "bad_request", message: (err as any).message ?? "Bad Request" }],
          };
          return reply.code(statusCode).send(body);
        }
      }

      app.log.error({ err }, "Unhandled error in /render");
      const body: ApiErrorBody = { error: "internal_error" };
      return reply.code(500).send(body);
    }
  });
};


