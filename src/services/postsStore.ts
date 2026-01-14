import { getFirestore } from './firebaseAdmin';

export type PostKind = 'image' | 'video';
export type PostStatus = 'ready_to_upload' | 'published' | 'discarded' | 'failed' | 'generating';

export type UserPost = {
  id: string;
  uid: string;
  kind: PostKind;
  status: PostStatus;
  createdAt: number;
  updatedAt: number;

  prompt: string;
  caption?: string | null;

  mediaUrl?: string | null; // S3 https url
  previewUrl?: string | null; // S3 https url (used while generating, e.g. product image)
  localPath?: string | null; // server-local path (debug)

  instagramMediaId?: string | null;
  instagramPermalink?: string | null;

  error?: string | null;
};

function colForUser(uid: string) {
  const db = getFirestore();
  return db.collection('users').doc(uid).collection('posts');
}

export async function createPost(params: {
  uid: string;
  kind: PostKind;
  status: PostStatus;
  prompt: string;
  caption?: string | null;
  mediaUrl?: string | null;
  previewUrl?: string | null;
  localPath?: string | null;
  instagramMediaId?: string | null;
  instagramPermalink?: string | null;
  error?: string | null;
}): Promise<UserPost> {
  const now = Date.now();
  const ref = colForUser(params.uid).doc();
  const doc: Omit<UserPost, 'id'> = {
    uid: params.uid,
    kind: params.kind,
    status: params.status,
    createdAt: now,
    updatedAt: now,
    prompt: params.prompt,
    caption: params.caption ?? null,
    mediaUrl: params.mediaUrl ?? null,
    previewUrl: params.previewUrl ?? null,
    localPath: params.localPath ?? null,
    instagramMediaId: params.instagramMediaId ?? null,
    instagramPermalink: params.instagramPermalink ?? null,
    error: params.error ?? null,
  };
  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function updatePost(params: {
  uid: string;
  postId: string;
  patch: Partial<Omit<UserPost, 'id' | 'uid' | 'createdAt'>>;
}): Promise<void> {
  const ref = colForUser(params.uid).doc(params.postId);
  await ref.set(
    {
      ...params.patch,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function getPost(params: { uid: string; postId: string }): Promise<UserPost | null> {
  const snap = await colForUser(params.uid).doc(params.postId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  return { id: snap.id, ...data } as UserPost;
}

export async function listPosts(params: { uid: string; limit?: number }): Promise<UserPost[]> {
  const q = colForUser(params.uid)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(Math.max(params.limit ?? 60, 1), 200));
  const snap = await q.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })) as UserPost[];
}

export async function deletePost(params: { uid: string; postId: string }): Promise<void> {
  await colForUser(params.uid).doc(params.postId).delete();
}


