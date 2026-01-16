import crypto from 'crypto';
import { getFirebaseAdmin, getFirestore } from './firebaseAdmin';

export type InstagramAuth = {
  igUserId: string;
  pageAccessToken: string;
};

export type InstagramSavedAccount = {
  accountId: string; // stable id within Postty
  label: string; // page name or @username
  igUserId: string;
  pageId: string;
  createdAt: number;
  updatedAt: number;
};

type InstagramSavedAccountStored = InstagramSavedAccount & {
  pageAccessToken: string;
};

type InstagramSessionStored = {
  sessionId: string;
  label: string;
  igUserId: string;
  pageId: string;
  pageAccessToken: string;
  createdAt: number;
  expiresAt: number;
};

type InstagramIntegrationDoc = {
  activeAccountId?: string | null; // "acc:<accountId>" | "sess:<sessionId>" | null
  accounts?: Record<string, InstagramSavedAccountStored>;
  sessions?: Record<string, InstagramSessionStored>;
};

function docRef(uid: string) {
  const db = getFirestore();
  return db.collection('privateUsers').doc(uid).collection('integrations').doc('instagram');
}

function publicUserRef(uid: string) {
  const db = getFirestore();
  return db.collection('users').doc(uid);
}

export function makeSessionId(): string {
  return crypto.randomBytes(18).toString('base64url');
}

export function makeAccountIdFromIgUserId(igUserId: string): string {
  return `ig_${igUserId}`;
}

export async function getInstagramIntegration(uid: string): Promise<InstagramIntegrationDoc> {
  const snap = await docRef(uid).get();
  if (!snap.exists) return {};
  return (snap.data() as InstagramIntegrationDoc) || {};
}

export async function listInstagramAccounts(uid: string): Promise<{
  activeAccountId: string | null;
  accounts: InstagramSavedAccount[];
}> {
  const doc = await getInstagramIntegration(uid);
  const accountsMap = doc.accounts || {};
  const accounts = Object.values(accountsMap).map((a) => ({
    accountId: a.accountId,
    label: a.label,
    igUserId: a.igUserId,
    pageId: a.pageId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
  return {
    activeAccountId: typeof doc.activeAccountId === 'string' ? doc.activeAccountId : null,
    accounts: accounts.sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export async function setActiveInstagramAccountId(uid: string, activeAccountId: string | null): Promise<void> {
  await docRef(uid).set({ activeAccountId: activeAccountId ?? null }, { merge: true });
  await publicUserRef(uid).set(
    {
      instagram: {
        activeAccountId: activeAccountId ?? null,
        hasAnySavedAccounts: true,
        updatedAt: Date.now(),
      },
    },
    { merge: true }
  );
}

export async function disconnectInstagram(uid: string): Promise<void> {
  await setActiveInstagramAccountId(uid, null);
}

export async function upsertInstagramAccount(params: {
  uid: string;
  account: InstagramSavedAccountStored;
  setActive?: boolean;
}): Promise<void> {
  const now = Date.now();
  const ref = docRef(params.uid);
  const snap = await ref.get();
  const existing = (snap.exists ? (snap.data() as InstagramIntegrationDoc) : {}) || {};
  const prev = existing.accounts?.[params.account.accountId];
  const createdAt = prev?.createdAt ?? now;

  await ref.set(
    {
      accounts: {
        [params.account.accountId]: {
          ...params.account,
          createdAt,
          updatedAt: now,
        },
      },
      ...(params.setActive ? { activeAccountId: `acc:${params.account.accountId}` } : {}),
    } as any,
    { merge: true }
  );

  const accountsCount = Object.keys({ ...(existing.accounts || {}), [params.account.accountId]: true }).length;
  await publicUserRef(params.uid).set(
    {
      instagram: {
        activeAccountId: params.setActive ? `acc:${params.account.accountId}` : existing.activeAccountId ?? null,
        hasAnySavedAccounts: accountsCount > 0,
        updatedAt: now,
      },
    },
    { merge: true }
  );
}

export async function createInstagramSession(params: {
  uid: string;
  session: InstagramSessionStored;
  setActive?: boolean;
}): Promise<void> {
  const ref = docRef(params.uid);
  await ref.set(
    {
      sessions: { [params.session.sessionId]: params.session },
      ...(params.setActive ? { activeAccountId: `sess:${params.session.sessionId}` } : {}),
    } as any,
    { merge: true }
  );
  await publicUserRef(params.uid).set(
    {
      instagram: {
        activeAccountId: params.setActive ? `sess:${params.session.sessionId}` : null,
        hasAnySavedAccounts: true,
        updatedAt: Date.now(),
      },
    },
    { merge: true }
  );
}

export async function forgetInstagramAccount(params: { uid: string; accountId: string }): Promise<void> {
  const ref = docRef(params.uid);
  const snap = await ref.get();
  const doc = (snap.exists ? (snap.data() as InstagramIntegrationDoc) : {}) || {};
  const active = typeof doc.activeAccountId === 'string' ? doc.activeAccountId : null;

  const admin = getFirebaseAdmin();
  const patch: any = {
    accounts: { [params.accountId]: admin.firestore.FieldValue.delete() },
  };
  if (active === `acc:${params.accountId}`) {
    patch.activeAccountId = null;
  }
  await ref.set(patch, { merge: true });

  const remaining = Object.keys(doc.accounts || {}).filter((k) => k !== params.accountId).length;
  await publicUserRef(params.uid).set(
    {
      instagram: {
        activeAccountId: active === `acc:${params.accountId}` ? null : active,
        hasAnySavedAccounts: remaining > 0,
        updatedAt: Date.now(),
      },
    },
    { merge: true }
  );
}

async function cleanupExpiredActiveSessionIfNeeded(uid: string, doc: InstagramIntegrationDoc): Promise<InstagramIntegrationDoc> {
  const active = typeof doc.activeAccountId === 'string' ? doc.activeAccountId : null;
  if (!active || !active.startsWith('sess:')) return doc;
  const sessionId = active.slice('sess:'.length);
  const s = doc.sessions?.[sessionId];
  if (!s) {
    await setActiveInstagramAccountId(uid, null);
    return { ...doc, activeAccountId: null };
  }
  if (typeof s.expiresAt === 'number' && Date.now() > s.expiresAt) {
    await setActiveInstagramAccountId(uid, null);
    return { ...doc, activeAccountId: null };
  }
  return doc;
}

export async function getActiveInstagramAuth(uid: string): Promise<InstagramAuth | null> {
  let doc = await getInstagramIntegration(uid);
  doc = await cleanupExpiredActiveSessionIfNeeded(uid, doc);
  const active = typeof doc.activeAccountId === 'string' ? doc.activeAccountId : null;
  if (!active) return null;

  if (active.startsWith('acc:')) {
    const accountId = active.slice('acc:'.length);
    const a = doc.accounts?.[accountId];
    if (!a) return null;
    return { igUserId: a.igUserId, pageAccessToken: a.pageAccessToken };
  }

  if (active.startsWith('sess:')) {
    const sessionId = active.slice('sess:'.length);
    const s = doc.sessions?.[sessionId];
    if (!s) return null;
    if (Date.now() > s.expiresAt) return null;
    return { igUserId: s.igUserId, pageAccessToken: s.pageAccessToken };
  }

  return null;
}


