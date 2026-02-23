import type { FastifyRequest } from 'fastify';
import { getFirebaseAdmin } from './firebaseAdmin';
import { assertUserHasPosttyAccess } from './accessControl';

export type AuthedUser = {
  uid: string;
  email?: string;
  name?: string;
  groups?: string[];
};

function isInviteOnlyEnabled(): boolean {
  return String(process.env.POSTTY_INVITE_ONLY || 'false').toLowerCase() === 'true';
}

export async function requireUser(request: FastifyRequest): Promise<AuthedUser> {
  const authHeader = request.headers['authorization'];
  const raw =
    typeof authHeader === 'string'
      ? authHeader
      : Array.isArray(authHeader)
        ? authHeader[0]
        : '';

  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    throw new Error('Missing Authorization Bearer token');
  }
  const token = m[1]!.trim();
  if (!token) throw new Error('Missing Authorization Bearer token');

  const admin = getFirebaseAdmin();
  const decoded = await admin.auth().verifyIdToken(token);
  const user: AuthedUser = {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
  };

  // Transitional compatibility: when invite-only is enabled, all existing callers
  // of requireUser() are automatically protected without touching every route file.
  if (isInviteOnlyEnabled()) {
    const result = await assertUserHasPosttyAccess({ uid: user.uid, email: user.email });
    user.groups = result.groups;
  }

  return user;
}

export async function requireAuthorizedUser(request: FastifyRequest): Promise<AuthedUser> {
  const user = await requireUser(request);
  if (Array.isArray(user.groups)) return user;
  const result = await assertUserHasPosttyAccess({ uid: user.uid, email: user.email });
  user.groups = result.groups;
  return user;
}

export async function requireUserOrInternal(
  request: FastifyRequest,
  userIdHint?: string | null
): Promise<AuthedUser> {
  try {
    return await requireAuthorizedUser(request);
  } catch {
    const tokenHeader = request.headers['x-postty-internal-token'];
    const raw =
      typeof tokenHeader === 'string'
        ? tokenHeader
        : Array.isArray(tokenHeader)
          ? tokenHeader[0]
          : '';
    const expected = (process.env.POSTTY_INTERNAL_TOKEN || '').trim();
    const uid = typeof userIdHint === 'string' ? userIdHint.trim() : '';

    if (expected && raw && raw === expected && uid) {
      return { uid };
    }

    throw new Error('Missing or invalid authentication');
  }
}


