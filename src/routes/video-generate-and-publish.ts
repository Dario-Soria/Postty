import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { getActiveInstagramAuth } from '../services/instagramConnectionStore';
import { createVideoJob, updateVideoJob, failVideoJob } from '../services/videoJobStore';
import { generateVeoVideo } from '../services/geminiVeoVideoGenerator';
import { uploadLocalImage } from '../services/imageUploader';
import { publishInstagramVideo } from '../services/instagramPublisher';

function getTempUploadDir(): string {
  const dir = path.join(process.cwd(), 'temp-uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function runJob(params: {
  uid: string;
  jobId: string;
  prompt: string;
  caption?: string | null;
  productImagePath?: string | null;
}): Promise<void> {
  const { uid, jobId, prompt, caption, productImagePath } = params;

  try {
    await updateVideoJob({ uid, jobId, patch: { state: 'generating' } });

    const veoResult = await generateVeoVideo({
      prompt,
      productImagePath: productImagePath ?? null,
      aspectRatio: '9:16',
      durationSeconds: 15,
    });

    await updateVideoJob({ uid, jobId, patch: { mp4Path: veoResult.mp4Path, state: 'uploading' } });

    const uploadedVideoUrl = await uploadLocalImage(veoResult.mp4Path);
    await updateVideoJob({ uid, jobId, patch: { uploadedVideoUrl, state: 'publishing' } });

    const igAuth = await getActiveInstagramAuth(uid);
    if (!igAuth) {
      throw new Error('Instagram user is not connected (no active Instagram auth for this user)');
    }

    const ig = await publishInstagramVideo({
      videoUrl: uploadedVideoUrl,
      caption: typeof caption === 'string' ? caption : undefined,
      kind: 'REELS',
      shareToFeed: true,
      maxPollAttempts: 180,
      auth: igAuth,
    });

    await updateVideoJob({ uid, jobId, patch: { instagramMediaId: ig.id, state: 'succeeded' } });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}${e.stack ? `\n${e.stack}` : ''}` : String(e);
    logger.error(`[VideoJob ${jobId}] Failed: ${msg}`);
    await failVideoJob({ uid, jobId, error: e });
  } finally {
    // Best-effort cleanup of temp uploaded product image (keep generated mp4 for debugging).
    if (productImagePath) {
      try {
        if (fs.existsSync(productImagePath)) fs.unlinkSync(productImagePath);
      } catch {
        // ignore
      }
    }
  }
}

export default async function videoGenerateAndPublishRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.post(
    '/video/generate-and-publish',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const parts = (request as any).parts?.();
        if (!parts) {
          return reply.status(400).send({
            status: 'error',
            message: 'multipart/form-data request expected',
          });
        }

        // Auth modes:
        // - Preferred: Firebase ID token in Authorization header (requireUser)
        // - Internal: X-Postty-Internal-Token + userId form field (used by internal agents/tools)
        let uid: string | null = null;

        let prompt: string | null = null;
        let caption: string | null = null;
        let productImagePath: string | null = null;
        let userIdField: string | null = null;

        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'productImage') {
            const tempDir = getTempUploadDir();
            const ts = Date.now();
            const ext = path.extname(part.filename || '') || '.png';
            const safeExt = ext.match(/^\.[a-z0-9]{1,6}$/i) ? ext : '.png';
            productImagePath = path.join(tempDir, `${ts}_product${safeExt}`);

            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(productImagePath, buffer);
            logger.info(`📦 Video endpoint: saved product image: ${productImagePath} (${buffer.length} bytes)`);
          } else if (part.type === 'field') {
            if (part.fieldname === 'prompt') prompt = String(part.value || '');
            if (part.fieldname === 'caption') caption = String(part.value || '');
            if (part.fieldname === 'userId') userIdField = String(part.value || '');
          }
        }

        // Resolve uid (auth)
        try {
          const user = await requireUser(request as any);
          uid = user.uid;
        } catch (e) {
          const tokenHeader = request.headers['x-postty-internal-token'];
          const raw =
            typeof tokenHeader === 'string'
              ? tokenHeader
              : Array.isArray(tokenHeader)
                ? tokenHeader[0]
                : '';
          const expected = process.env.POSTTY_INTERNAL_TOKEN || '';
          const allowed = expected && raw && raw === expected;
          if (allowed && userIdField && userIdField.trim().length > 0) {
            uid = userIdField.trim();
          } else {
            throw e;
          }
        }

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
          // Cleanup temp file if we created it
          if (productImagePath && fs.existsSync(productImagePath)) {
            try {
              fs.unlinkSync(productImagePath);
            } catch {
              // ignore
            }
          }
          return reply.status(400).send({
            status: 'error',
            message: 'Missing required field: prompt',
          });
        }

        const job = await createVideoJob({
          uid: uid!,
          prompt: prompt.trim(),
          caption: caption?.trim() ? caption.trim() : null,
          productImagePath,
          productPreviewUrl: null,
        });

        // Fire and forget; job status is polled via GET /video/jobs/:jobId
        setImmediate(() => {
          runJob({
            uid: uid!,
            jobId: job.id,
            prompt: job.prompt,
            caption: job.caption ?? null,
            productImagePath: job.productImagePath ?? null,
          }).catch((e) => {
            // If anything escapes, mark failed.
            try {
              void failVideoJob({ uid: uid!, jobId: job.id, error: e });
            } catch {
              // ignore
            }
          });
        });

        return reply.status(202).send({
          status: 'accepted',
          jobId: job.id,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Video generate-and-publish request failed:', errorMsg);
        const status = errorMsg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: errorMsg });
      }
    }
  );

  logger.info('✅ Video routes registered: POST /video/generate-and-publish');
}


