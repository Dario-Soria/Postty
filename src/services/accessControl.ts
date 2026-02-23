import { getFirestore } from './firebaseAdmin';

export type AccessGrant = {
  enabled: boolean;
  groups?: string[];
  notes?: string;
  grantedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const BOOTSTRAP_ALLOWLIST = new Set(
  [
    'ds.dariosoria@gmail.com',
    'jbeinesfurcada@gmail.com',
    'ulisesfferreyra@gmail.com',
  ].map((e) => e.toLowerCase().trim())
);

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

function parseAllowlistFromEnv(): Set<string> {
  const raw = process.env.POSTTY_INVITE_BOOTSTRAP_ALLOWLIST || '';
  if (!raw.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map((v) => normalizeEmail(v))
      .filter(Boolean)
  );
}

function isInviteOnlyEnabled(): boolean {
  return String(process.env.POSTTY_INVITE_ONLY || 'false').toLowerCase() === 'true';
}

export async function getAccessGrantByEmail(emailLower: string): Promise<AccessGrant | null> {
  const db = getFirestore();
  const doc = await db.collection('access_grants').doc(emailLower).get();
  if (!doc.exists) return null;
  return doc.data() as AccessGrant;
}

export async function syncUserAccessProjection(params: {
  uid: string;
  emailLower: string;
  grant: AccessGrant | null;
}): Promise<void> {
  const db = getFirestore();
  await db
    .collection('users')
    .doc(params.uid)
    .set(
      {
        accessGranted: !!params.grant?.enabled,
        groups: Array.isArray(params.grant?.groups) ? params.grant?.groups : [],
        accessEvaluatedAt: new Date().toISOString(),
        emailLower: params.emailLower,
      },
      { merge: true }
    );
}

export async function assertUserHasPosttyAccess(params: {
  uid: string;
  email?: string;
}): Promise<{ groups: string[] }> {
  if (!isInviteOnlyEnabled()) return { groups: [] };

  const emailLower = normalizeEmail(params.email);
  if (!emailLower) {
    throw new Error('Access not granted');
  }

  const envAllowlist = parseAllowlistFromEnv();
  if (BOOTSTRAP_ALLOWLIST.has(emailLower) || envAllowlist.has(emailLower)) {
    await syncUserAccessProjection({
      uid: params.uid,
      emailLower,
      grant: { enabled: true, groups: [] },
    });
    return { groups: [] };
  }

  const grant = await getAccessGrantByEmail(emailLower);
  const enabled = !!grant?.enabled;

  await syncUserAccessProjection({
    uid: params.uid,
    emailLower,
    grant: enabled ? grant : null,
  });

  if (!enabled) {
    throw new Error('Access not granted');
  }

  return { groups: Array.isArray(grant?.groups) ? grant!.groups! : [] };
}
