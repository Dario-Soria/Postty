import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import dotenv from "dotenv";
import { healthRoutes } from "./routes/health";
import { renderRoutes } from "./routes/render";

export type ServerOptions = {
  logger?: boolean;
};

export function buildServer(opts: ServerOptions = {}) {
  // Auto-load .env for transparent local usage.
  // We try both Agents/Remotion/.env and repo-root/.env (two levels up).
  loadDotEnvOnce();

  const app = Fastify({
    logger: opts.logger ?? false,
  });

  app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1,
      fields: 10,
    },
  });

  app.register(healthRoutes);
  app.register(renderRoutes, {
    // Always default to Agents/Remotion/fonts regardless of where the process is started from.
    // (Using process.cwd() would make downloads land in the wrong folder.)
    fontsDir: process.env.FONTS_DIR ?? path.resolve(__dirname, "..", "fonts"),
  });

  return app;
}

let didLoadEnv = false;
function loadDotEnvOnce() {
  if (didLoadEnv) return;
  didLoadEnv = true;

  const candidates = [
    // Agents/Remotion/.env (runtime __dirname is dist/)
    path.resolve(__dirname, "..", ".env"),
    // repo-root/.env (dist -> Remotion -> Agents -> repo root)
    path.resolve(__dirname, "..", "..", "..", ".env"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
    }
  }
}

async function main() {
  const app = buildServer({ logger: true });
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}


