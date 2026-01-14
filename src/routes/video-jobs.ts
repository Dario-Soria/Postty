import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
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
        const job = getVideoJob(jobId);
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
        return reply.status(500).send({ status: 'error', message: msg });
      }
    }
  );

  logger.info('✅ Video job routes registered: GET /video/jobs/:jobId');
}


