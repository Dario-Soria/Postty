import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { uploadLocalImage } from '../services/imageUploader';
import { createPost, getPost, updatePost } from '../services/postsStore';
import { getActiveInstagramAuth } from '../services/instagramConnectionStore';
import { getInstagramPermalink, publishInstagramPost } from '../services/instagramPublisher';

type SaveImageBody = {
  imageUrl: string;
  prompt?: string;
  caption?: string;
};

type PublishImageBody = {
  postId?: string;
  imageUrl?: string;
  caption: string;
  prompt?: string;
};

type UpdateCaptionBody = {
  postId: string;
  caption: string;
};

function isHttpsUrl(s: string): boolean {
  return /^https:\/\//i.test(s);
}

function safeGeneratedFilenameFromUrl(imageUrl: string): string | null {
  try {
    const u = new URL(imageUrl);
    const p = u.pathname || '';
    const m = p.match(/^\/generated-images\/([\w\-\.]+\.png)$/i);
    return m ? m[1] : null;
  } catch {
    // allow relative path fallback
    const m = imageUrl.match(/^\/generated-images\/([\w\-\.]+\.png)$/i);
    return m ? m[1] : null;
  }
}

async function resolveToPublicImageUrl(params: { imageUrl?: string; localPath?: string | null }): Promise<{
  publicUrl: string;
  localPathUsed: string | null;
}> {
  const raw = (params.imageUrl || '').trim();
  if (raw && isHttpsUrl(raw)) return { publicUrl: raw, localPathUsed: null };

  // Support URLs served by this backend: http://localhost:8080/generated-images/<file>.png
  const filename = raw ? safeGeneratedFilenameFromUrl(raw) : null;
  if (filename) {
    const localPath = path.join(process.cwd(), 'generated-images', filename);
    const resolved = path.resolve(localPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Generated image not found on server disk: ${resolved}`);
    }
    const publicUrl = await uploadLocalImage(resolved);
    return { publicUrl, localPathUsed: resolved };
  }

  // If caller already has a local path (e.g. internal), upload it.
  if (params.localPath) {
    const resolved = path.resolve(params.localPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File does not exist: ${resolved}`);
    }
    const publicUrl = await uploadLocalImage(resolved);
    return { publicUrl, localPathUsed: resolved };
  }

  throw new Error('imageUrl must be an https URL or a backend /generated-images/*.png URL');
}

export default async function postsImageRoutes(fastify: FastifyInstance): Promise<void> {
  // Save a generated image so it appears in My Posts and can be published later.
  fastify.post(
    '/posts/save-image',
    async (request: FastifyRequest<{ Body: SaveImageBody }>, reply: FastifyReply) => {
      try {
        const user = await requireUser(request as any);
        const { imageUrl, prompt, caption } = request.body || ({} as any);
        if (!imageUrl || typeof imageUrl !== 'string') {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "imageUrl"' });
        }

        const resolved = await resolveToPublicImageUrl({ imageUrl });
        const post = await createPost({
          uid: user.uid,
          kind: 'image',
          status: 'ready_to_upload',
          prompt: (prompt || caption || 'Saved image').slice(0, 240),
          caption: caption ?? null,
          mediaUrl: resolved.publicUrl,
          previewUrl: null,
          localPath: null,
          instagramMediaId: null,
          instagramPermalink: null,
          error: null,
        });

        return reply.status(200).send({ status: 'success', postId: post.id, post });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /posts/save-image failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  // Update a post caption draft (so saved posts can show the caption before publishing).
  fastify.post(
    '/posts/update-caption',
    async (request: FastifyRequest<{ Body: UpdateCaptionBody }>, reply: FastifyReply) => {
      try {
        const user = await requireUser(request as any);
        const { postId, caption } = request.body || ({} as any);
        if (!postId || typeof postId !== 'string') {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "postId"' });
        }
        if (typeof caption !== 'string') {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "caption"' });
        }

        const existing = await getPost({ uid: user.uid, postId });
        if (!existing) {
          return reply.status(404).send({ status: 'error', message: 'Post not found' });
        }

        await updatePost({
          uid: user.uid,
          postId,
          patch: { caption: caption.trim() },
        });

        return reply.status(200).send({ status: 'success' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /posts/update-caption failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  // Publish an image post to Instagram in the background (Firestore-backed state).
  fastify.post(
    '/posts/publish-image',
    async (request: FastifyRequest<{ Body: PublishImageBody }>, reply: FastifyReply) => {
      try {
        const user = await requireUser(request as any);
        const { postId, imageUrl, caption, prompt } = request.body || ({} as any);

        if (!caption || typeof caption !== 'string' || !caption.trim()) {
          return reply.status(400).send({ status: 'error', message: 'Missing or invalid "caption"' });
        }

        const igAuth = await getActiveInstagramAuth(user.uid);
        if (!igAuth) {
          return reply.status(400).send({ status: 'error', message: 'Instagram user is not connected' });
        }

        let effectivePostId: string;
        if (postId && typeof postId === 'string') {
          const existing = await getPost({ uid: user.uid, postId });
          if (!existing) {
            return reply.status(404).send({ status: 'error', message: 'Post not found' });
          }
          effectivePostId = postId;
          await updatePost({
            uid: user.uid,
            postId: effectivePostId,
            patch: { status: 'publishing', caption: caption.trim(), error: null },
          });
        } else {
          if (!imageUrl || typeof imageUrl !== 'string') {
            return reply.status(400).send({ status: 'error', message: 'Missing "imageUrl" (or provide "postId")' });
          }
          const created = await createPost({
            uid: user.uid,
            kind: 'image',
            status: 'publishing',
            prompt: (prompt || caption || 'Instagram post').slice(0, 240),
            caption: caption.trim(),
            mediaUrl: null,
            previewUrl: null,
            localPath: null,
            instagramMediaId: null,
            instagramPermalink: null,
            error: null,
          });
          effectivePostId = created.id;
        }

        // Background publish: ensure public URL, publish, then update the post.
        setImmediate(async () => {
          try {
            const current = await getPost({ uid: user.uid, postId: effectivePostId });
            const currentCaption = (current?.caption || caption).toString();

            const resolved = await resolveToPublicImageUrl({
              imageUrl: imageUrl || current?.mediaUrl || undefined,
              localPath: current?.localPath || null,
            });
            const publicUrl = resolved.publicUrl;

            if (!current?.mediaUrl || current.mediaUrl !== publicUrl) {
              await updatePost({ uid: user.uid, postId: effectivePostId, patch: { mediaUrl: publicUrl } });
            }

            const instagramResponse = await publishInstagramPost(publicUrl, currentCaption, igAuth);
            let permalink: string | null = null;
            try {
              permalink = await getInstagramPermalink(instagramResponse.id, igAuth);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Unknown error';
              logger.warn(`Failed to fetch Instagram permalink (${msg})`);
            }

            await updatePost({
              uid: user.uid,
              postId: effectivePostId,
              patch: {
                status: 'published',
                instagramMediaId: instagramResponse.id,
                instagramPermalink: permalink,
                error: null,
              },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            logger.error('Background publish-image failed:', msg);
            try {
              await updatePost({ uid: user.uid, postId: effectivePostId, patch: { status: 'failed', error: msg } });
            } catch {
              // ignore
            }
          }
        });

        return reply.status(202).send({ status: 'accepted', postId: effectivePostId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('POST /posts/publish-image failed:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info(
    '✅ Posts image routes registered: POST /posts/save-image, POST /posts/update-caption, POST /posts/publish-image'
  );
}

