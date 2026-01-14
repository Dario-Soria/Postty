import * as logger from '../utils/logger';

export type VideoJobState =
  | 'queued'
  | 'generating'
  | 'uploading'
  | 'publishing'
  | 'succeeded'
  | 'failed';

export type VideoJob = {
  id: string;
  state: VideoJobState;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  caption?: string | null;
  productImagePath?: string | null;

  // Outputs
  mp4Path?: string | null;
  uploadedVideoUrl?: string | null;
  instagramMediaId?: string | null;

  // Error
  error?: string | null;
};

const JOB_TTL_MS = parseInt(process.env.POSTTY_VIDEO_JOB_TTL_MS || '21600000', 10); // 6h
const CLEANUP_INTERVAL_MS = parseInt(
  process.env.POSTTY_VIDEO_JOB_CLEANUP_INTERVAL_MS || '600000',
  10
); // 10m

const jobs = new Map<string, VideoJob>();

function now(): number {
  return Date.now();
}

export function createVideoJob(params: {
  prompt: string;
  caption?: string | null;
  productImagePath?: string | null;
}): VideoJob {
  const id = `video_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const t = now();
  const job: VideoJob = {
    id,
    state: 'queued',
    createdAt: t,
    updatedAt: t,
    prompt: params.prompt,
    caption: params.caption ?? null,
    productImagePath: params.productImagePath ?? null,
    mp4Path: null,
    uploadedVideoUrl: null,
    instagramMediaId: null,
    error: null,
  };
  jobs.set(id, job);
  return job;
}

export function getVideoJob(jobId: string): VideoJob | null {
  return jobs.get(jobId) ?? null;
}

export function updateVideoJob(jobId: string, patch: Partial<VideoJob>): VideoJob {
  const existing = jobs.get(jobId);
  if (!existing) {
    throw new Error(`Video job not found: ${jobId}`);
  }
  const updated: VideoJob = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  jobs.set(jobId, updated);
  return updated;
}

export function failVideoJob(jobId: string, error: unknown): VideoJob {
  const msg = error instanceof Error ? error.message : String(error);
  return updateVideoJob(jobId, { state: 'failed', error: msg });
}

export function listVideoJobsCount(): number {
  return jobs.size;
}

function cleanupExpiredJobs(): void {
  const t = now();
  let removed = 0;
  for (const [id, job] of jobs.entries()) {
    if (t - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    logger.info(`[VideoJobs] Cleaned up ${removed} expired job(s). Remaining=${jobs.size}`);
  }
}

// Start cleanup loop once on module import.
setInterval(() => {
  try {
    cleanupExpiredJobs();
  } catch (e) {
    logger.warn('[VideoJobs] Cleanup failed', e);
  }
}, CLEANUP_INTERVAL_MS).unref?.();


