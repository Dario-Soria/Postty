import type { FastifyRequest } from 'fastify';
import { getFirebaseAdmin } from './firebaseAdmin';

export type AuthedUser = {
  uid: string;
  email?: string;
  name?: string;
};

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
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
  };
}


