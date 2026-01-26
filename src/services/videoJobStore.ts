import * as logger from '../utils/logger';
import { getFirebaseAdmin, getFirestore } from './firebaseAdmin';

export type VideoJobState =
  | 'queued'
  | 'generating'
  | 'uploading'
  | 'publishing'
  | 'succeeded'
  | 'failed';

export type VideoJob = {
  id: string;
  uid: string;
  state: VideoJobState;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  caption?: string | null;
  productImagePath?: string | null;
  productPreviewUrl?: string | null;

  // Outputs
  mp4Path?: string | null;
  uploadedVideoUrl?: string | null;
  instagramMediaId?: string | null;

  // Error
  error?: string | null;

  // TTL (for Firestore TTL policies)
  expiresAt?: any;
};

const JOB_TTL_MS = parseInt(process.env.POSTTY_VIDEO_JOB_TTL_MS || '21600000', 10); // 6h
function now(): number {
  return Date.now();
}

function col(uid: string) {
  const db = getFirestore();
  return db.collection('privateUsers').doc(uid).collection('videoJobs');
}

function toExpiryTimestamp(msFromNow: number): any {
  const admin = getFirebaseAdmin();
  const at = Date.now() + msFromNow;
  return admin.firestore.Timestamp.fromMillis(at);
}

export async function createVideoJob(params: {
  uid: string;
  prompt: string;
  caption?: string | null;
  productImagePath?: string | null;
  productPreviewUrl?: string | null;
}): Promise<VideoJob> {
  const id = `video_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const t = now();
  const job: VideoJob = {
    id,
    uid: params.uid,
    state: 'queued',
    createdAt: t,
    updatedAt: t,
    prompt: params.prompt,
    caption: params.caption ?? null,
    productImagePath: params.productImagePath ?? null,
    productPreviewUrl: params.productPreviewUrl ?? null,
    mp4Path: null,
    uploadedVideoUrl: null,
    instagramMediaId: null,
    error: null,
    expiresAt: toExpiryTimestamp(JOB_TTL_MS),
  };

  await col(params.uid).doc(id).set(job as any);
  return job;
}

export async function getVideoJob(params: { uid: string; jobId: string }): Promise<VideoJob | null> {
  const snap = await col(params.uid).doc(params.jobId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  return { id: snap.id, ...data } as VideoJob;
}

export async function updateVideoJob(params: {
  uid: string;
  jobId: string;
  patch: Partial<Omit<VideoJob, 'id' | 'uid' | 'createdAt'>>;
}): Promise<void> {
  await col(params.uid).doc(params.jobId).set(
    {
      ...params.patch,
    updatedAt: now(),
      expiresAt: toExpiryTimestamp(JOB_TTL_MS),
    },
    { merge: true }
  );
}

export async function failVideoJob(params: { uid: string; jobId: string; error: unknown }): Promise<void> {
  const msg = params.error instanceof Error ? params.error.message : String(params.error);
  await updateVideoJob({ uid: params.uid, jobId: params.jobId, patch: { state: 'failed', error: msg } });
}


