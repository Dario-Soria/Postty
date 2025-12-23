import type { FastifyRequest } from "fastify";
import type { MultipartFile, MultipartValue } from "@fastify/multipart";

export type ParsedRenderRequest = {
  imageBuffer: Buffer;
  mimeType: string;
  spec: unknown;
};

function isMultipartFile(part: MultipartFile | MultipartValue): part is MultipartFile {
  return (part as MultipartFile).type === "file";
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function parseRenderRequest(req: FastifyRequest): Promise<ParsedRenderRequest> {
  const ct = (req.headers["content-type"] ?? "").toString();

  if (ct.startsWith("multipart/form-data")) {
    let imageBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let specStr: string | undefined;

    const parts = req.parts();
    for await (const part of parts) {
      if (isMultipartFile(part)) {
        if (part.fieldname === "file") {
          // IMPORTANT: must consume the stream inside the loop, otherwise iteration can stall.
          imageBuffer = await streamToBuffer(part.file);
          mimeType = part.mimetype;
          continue;
        }
        if (part.fieldname === "spec") {
          const buf = await streamToBuffer(part.file);
          specStr = buf.toString("utf8");
          continue;
        }

        // Reject unexpected file parts: API accepts only background image + spec JSON
        await streamToBuffer(part.file);
        const err = new Error(`Unexpected multipart file field: ${part.fieldname}. Only 'file' and 'spec' are allowed.`);
        (err as any).statusCode = 400;
        throw err;
      } else {
        if (part.fieldname === "spec") {
          specStr = String(part.value);
        }
      }
    }

    if (!imageBuffer || !mimeType) {
      const err = new Error("Missing multipart field: file");
      (err as any).statusCode = 400;
      throw err;
    }
    if (!specStr) {
      const err = new Error("Missing multipart field: spec");
      (err as any).statusCode = 400;
      throw err;
    }

    const spec = JSON.parse(specStr) as unknown;

    return { imageBuffer, mimeType, spec };
  }

  if (ct.startsWith("application/json")) {
    const body = req.body as any;
    const imageBase64 = body?.imageBase64;
    const mimeType = body?.mimeType;
    const spec = body?.spec;

    if (typeof imageBase64 !== "string") {
      const err = new Error("Missing JSON field: imageBase64");
      (err as any).statusCode = 400;
      throw err;
    }
    if (typeof mimeType !== "string") {
      const err = new Error("Missing JSON field: mimeType");
      (err as any).statusCode = 400;
      throw err;
    }
    if (spec === undefined) {
      const err = new Error("Missing JSON field: spec");
      (err as any).statusCode = 400;
      throw err;
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    if (imageBuffer.length === 0) {
      const err = new Error("Invalid base64 image");
      (err as any).statusCode = 400;
      throw err;
    }

    return { imageBuffer, mimeType, spec };
  }

  const err = new Error("Unsupported Content-Type. Use multipart/form-data or application/json.");
  (err as any).statusCode = 415;
  throw err;
}


