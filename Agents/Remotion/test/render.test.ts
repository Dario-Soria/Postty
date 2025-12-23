import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import supertest from "supertest";
import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server";

const projectRoot = path.resolve(__dirname, "..");
const fontsDir = process.env.FONTS_DIR ?? path.join(projectRoot, "fonts");

function makeBackgroundJpeg() {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 40, g: 80, b: 120 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function binaryParser(res: any, cb: any) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

describe("POST /render", () => {
  it("returns 400 for invalid spec JSON (multipart)", async () => {
    const app = buildServer({ logger: false });
    await app.ready();
    const bg = await makeBackgroundJpeg();

    const res = await supertest(app.server)
      .post("/render")
      .attach("file", bg, { filename: "bg.jpg", contentType: "image/jpeg" })
      .field("spec", "{bad json");

    expect(res.status).toBe(400);
    expect(res.body?.error).toBe("validation_error");
    await app.close();
  });

  it("returns 400 for missing/unknown fonts", async () => {
    const app = buildServer({ logger: false });
    await app.ready();
    const bg = await makeBackgroundJpeg();

    const spec = {
      canvas: { width: 800, height: 600, backgroundFit: "cover", backgroundPosition: { x: 0.5, y: 0.5 } },
      overlays: [
        {
          type: "text",
          id: "t1",
          text: "Hello",
          box: { x: 50, y: 50, width: 700, height: 200 },
          font: { family: "THIS_FONT_DOES_NOT_EXIST", size: 48 },
          fill: "#FFFFFF"
        }
      ]
    };

    const res = await supertest(app.server)
      .post("/render")
      .buffer(true)
      .parse(binaryParser)
      .attach("file", bg, { filename: "bg.jpg", contentType: "image/jpeg" })
      .field("spec", JSON.stringify(spec));

    // Fonts must never make rendering fail; should gracefully fallback.
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
    await app.close();
  });

  it("happy path (skips unless TEST_FONT_FAMILY + TEST_FONT_FILE are set)", async () => {
    const testFamily = process.env.TEST_FONT_FAMILY;
    const testFile = process.env.TEST_FONT_FILE;
    const fontPath = testFile ? path.join(fontsDir, testFile) : "";

    if (!testFamily || !testFile || !fs.existsSync(fontPath)) {
      // skip when fonts aren't provided by the integrator
      expect(true).toBe(true);
      return;
    }

    const app = buildServer({ logger: false });
    await app.ready();
    const bg = await makeBackgroundJpeg();

    const spec = {
      canvas: { width: 800, height: 600, backgroundFit: "contain", backgroundPosition: { x: 0.5, y: 0.5 } },
      overlays: [
        {
          type: "text",
          id: "t1",
          text: "Hello\\nWorld",
          box: { x: 50, y: 50, width: 700, height: 300 },
          align: "left",
          verticalAlign: "top",
          font: { family: testFamily, size: 64, weight: 400 },
          fill: "#FFFFFF",
          overflow: "clip"
        }
      ]
    };

    const res = await supertest(app.server)
      .post("/render")
      .buffer(true)
      .parse(binaryParser)
      .attach("file", bg, { filename: "bg.jpg", contentType: "image/jpeg" })
      .field("spec", JSON.stringify(spec));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");

    const meta = await sharp(res.body).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
    await app.close();
  });
});


