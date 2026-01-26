import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import { getVideoJob } from '../services/videoJobStore';

interface Params {
  jobId: string;
}

export default async function videoJobRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: Params }>(
    '/video/jobs/:jobId',
    async (request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
      try {
        const jobId = request.params.jobId;
        // Auth modes:
        // - Preferred: Firebase ID token in Authorization header (requireUser)
        // - Internal: X-Postty-Internal-Token + ?userId=<uid> query (used by internal agents/tools)
        let uid: string | null = null;

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
          const qUidRaw = (request.query as any)?.userId;
          const qUid = typeof qUidRaw === 'string' ? qUidRaw.trim() : '';
          if (allowed && qUid.length > 0) {
            uid = qUid;
          } else {
            throw e;
          }
        }

        const job = await getVideoJob({ uid: uid!, jobId });
        if (!job) {
          return reply.status(404).send({
            status: 'error',
            message: 'Job not found',
          });
        }

        return reply.status(200).send({
          status: 'success',
          job: {
            id: job.id,
            state: job.state,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            error: job.error ?? null,
            mp4Path: job.mp4Path ?? null,
            uploaded_video_url: job.uploadedVideoUrl ?? null,
            instagram_media_id: job.instagramMediaId ?? null,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        logger.error('Error fetching video job status:', msg);
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info('✅ Video job routes registered: GET /video/jobs/:jobId');
}


