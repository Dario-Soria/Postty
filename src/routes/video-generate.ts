import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { createPost, updatePost } from '../services/postsStore';
import { generateVeoVideo } from '../services/geminiVeoVideoGenerator';
import { uploadLocalImage } from '../services/imageUploader';

function getTempUploadDir(): string {
  const dir = path.join(process.cwd(), 'temp-uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export default async function videoGenerateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/video/generate', async (request: FastifyRequest, reply: FastifyReply) => {
    let productImagePath: string | null = null;
    try {
      // Auth modes:
      // - Preferred: Firebase ID token in Authorization header (requireUser)
      // - Internal: X-Postty-Internal-Token + userId field (used by the Product Showcase agent)
      let uid: string | null = null;

      let prompt: string | null = null;
      let caption: string | null = null;
      let userIdField: string | null = null;

      // Primary path: multipart/form-data (supports optional productImage file)
      const parts = (request as any).parts?.();
      if (parts) {
        for await (const part of parts) {
          if (part.type === 'file' && part.fieldname === 'productImage') {
            const tempDir = getTempUploadDir();
            const ts = Date.now();
            const ext = path.extname(part.filename || '') || '.png';
            const safeExt = ext.match(/^\.[a-z0-9]{1,6}$/i) ? ext : '.png';
            productImagePath = path.join(tempDir, `${ts}_product${safeExt}`);
            const buf = await part.toBuffer();
            fs.writeFileSync(productImagePath, buf);
          } else if (part.type === 'field') {
            if (part.fieldname === 'prompt') prompt = String(part.value || '');
            if (part.fieldname === 'caption') caption = String(part.value || '');
            if (part.fieldname === 'userId') userIdField = String(part.value || '');
          }
        }
      } else {
        // Fallback path: JSON or x-www-form-urlencoded (no file support).
        // Note: the x-www-form-urlencoded parser is registered in src/server.ts.
        const body: any = (request as any).body || {};
        prompt = typeof body.prompt === 'string' ? body.prompt : null;
        caption = typeof body.caption === 'string' ? body.caption : null;
        userIdField = typeof body.userId === 'string' ? body.userId : null;
      }

      // Resolve uid (auth)
      try {
        const user = await requireUser(request);
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

      if (!prompt || prompt.trim().length === 0) {
        return reply.status(400).send({ status: 'error', message: 'Missing required field: prompt' });
      }

      // If the user uploaded a product image, upload it now and store it as a preview.
      // This is used by the Mis posts UI while the video is generating.
      let previewUrl: string | null = null;
      if (productImagePath) {
        try {
          previewUrl = await uploadLocalImage(productImagePath);
        } catch {
          // ignore preview failures; video generation can still proceed
          previewUrl = null;
        }
      }

      // Create Firestore record immediately (so UI can show “generating”)
      const post = await createPost({
        uid: uid!,
        kind: 'video',
        status: 'generating',
        prompt: prompt.trim(),
        caption: caption?.trim() ? caption.trim() : null,
        localPath: null,
        mediaUrl: null,
        previewUrl,
      });

      // Run generation asynchronously; respond immediately.
      setImmediate(async () => {
        try {
          const veo = await generateVeoVideo({
            prompt: prompt!.trim(),
            productImagePath,
            aspectRatio: '9:16',
            durationSeconds: 8,
          });

          const url = await uploadLocalImage(veo.mp4Path);
          await updatePost({
            uid: uid!,
            postId: post.id,
            patch: {
              status: 'ready_to_upload',
              mediaUrl: url,
              localPath: veo.mp4Path,
              error: null,
            },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await updatePost({
            uid: uid!,
            postId: post.id,
            patch: { status: 'failed', error: msg },
          });
        } finally {
          // Cleanup temp product image
          if (productImagePath) {
            try {
              if (fs.existsSync(productImagePath)) fs.unlinkSync(productImagePath);
            } catch {
              // ignore
            }
          }
        }
      });

      return reply.status(202).send({ status: 'accepted', postId: post.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      logger.error('POST /video/generate failed:', msg);
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      if (productImagePath && fs.existsSync(productImagePath)) {
        try {
          fs.unlinkSync(productImagePath);
        } catch {
          // ignore
        }
      }
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  logger.info('✅ Video routes registered: POST /video/generate');
}


