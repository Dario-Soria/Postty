import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import crypto from 'crypto';
import * as logger from '../utils/logger';
import { requireUser } from '../services/firebaseAuth';
import {
  createInstagramSession,
  disconnectInstagram,
  forgetInstagramAccount,
  getActiveInstagramAuth,
  listInstagramAccounts,
  makeAccountIdFromIgUserId,
  makeSessionId,
  setActiveInstagramAccountId,
  upsertInstagramAccount,
} from '../services/instagramConnectionStore';

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v19.0';
const META_APP_ID = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI;
const OAUTH_STATE_SECRET = process.env.POSTTY_IG_OAUTH_STATE_SECRET || '';
const FRONTEND_BASE_URL = process.env.POSTTY_FRONTEND_BASE_URL || '';

const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function safeReturnTo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('/')) return s;
  if (FRONTEND_BASE_URL && s.startsWith(FRONTEND_BASE_URL)) return s;
  return null;
}

function joinUrl(base: string, path: string): string {
  // base can be origin or origin+basePath; path is absolute-path (starts with '/')
  const u = new URL(base);
  const basePath = u.pathname.replace(/\/+$/, ''); // '' or '/v2'
  const target = path;

  // If target already includes the basePath, don't double-prefix it.
  if (
    basePath &&
    (target === basePath ||
      target.startsWith(basePath + '/') ||
      target.startsWith(basePath + '?'))
  ) {
    return `${u.origin}${target}`;
  }

  return `${u.origin}${basePath}${target}`;
}

function toFrontendUrl(target: string): string {
  // If already absolute, keep it.
  if (/^https?:\/\//i.test(target)) return target;
  // If relative-path, prefer redirecting to frontend host if configured.
  if (target.startsWith('/') && FRONTEND_BASE_URL) {
    try {
      return joinUrl(FRONTEND_BASE_URL, target);
    } catch {
      // fall through
    }
  }
  return target;
}

type StatePayload = {
  v: 1;
  uid: string;
  remember: boolean;
  returnTo: string | null;
  nonce: string;
  iat: number;
};

function signState(payload: StatePayload): string {
  if (!OAUTH_STATE_SECRET) {
    throw new Error('POSTTY_IG_OAUTH_STATE_SECRET is not set');
  }
  const json = Buffer.from(JSON.stringify(payload));
  const body = base64urlEncode(json);
  const sig = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state: string): StatePayload {
  if (!OAUTH_STATE_SECRET) {
    throw new Error('POSTTY_IG_OAUTH_STATE_SECRET is not set');
  }
  const parts = state.split('.');
  if (parts.length !== 2) throw new Error('Invalid state');
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('Invalid state signature');
  }
  const decoded = Buffer.from(body, 'base64url').toString('utf8');
  const payload = JSON.parse(decoded) as StatePayload;
  if (!payload || payload.v !== 1 || typeof payload.uid !== 'string') {
    throw new Error('Invalid state payload');
  }
  return payload;
}

async function exchangeCodeForShortLivedToken(code: string): Promise<{ access_token: string; expires_in?: number }> {
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
    throw new Error('Missing META_APP_ID/META_APP_SECRET/META_REDIRECT_URI env vars');
  }
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`;
  const res = await axios.get(url, {
    params: {
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: META_REDIRECT_URI,
      code,
    },
    timeout: 15_000,
  });
  return res.data;
}

async function exchangeForLongLivedUserToken(shortLivedUserToken: string): Promise<{ access_token: string; expires_in?: number }> {
  if (!META_APP_ID || !META_APP_SECRET) {
    throw new Error('Missing META_APP_ID/META_APP_SECRET env vars');
  }
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`;
  const res = await axios.get(url, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: shortLivedUserToken,
    },
    timeout: 15_000,
  });
  return res.data;
}

async function fetchPagesWithIg(longLivedUserToken: string): Promise<
  Array<{ pageId: string; pageName: string; pageAccessToken: string; igUserId: string }>
> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts`;
  const res = await axios.get(url, {
    params: {
      fields: 'id,name,access_token,instagram_business_account',
      access_token: longLivedUserToken,
    },
    timeout: 15_000,
  });
  const data = res.data?.data;
  if (!Array.isArray(data)) return [];
  const out: Array<{ pageId: string; pageName: string; pageAccessToken: string; igUserId: string }> = [];
  for (const row of data) {
    const pageId = typeof row?.id === 'string' ? row.id : null;
    const pageName = typeof row?.name === 'string' ? row.name : 'Facebook Page';
    const pageAccessToken = typeof row?.access_token === 'string' ? row.access_token : null;
    const igUserId = typeof row?.instagram_business_account?.id === 'string' ? row.instagram_business_account.id : null;
    if (pageId && pageAccessToken && igUserId) {
      out.push({ pageId, pageName, pageAccessToken, igUserId });
    }
  }
  return out;
}

async function tryFetchIgUsername(params: { igUserId: string; pageAccessToken: string }): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.igUserId}`;
    const res = await axios.get(url, {
      params: { fields: 'username', access_token: params.pageAccessToken },
      timeout: 15_000,
    });
    const username = res.data?.username;
    return typeof username === 'string' && username.trim().length > 0 ? username.trim() : null;
  } catch {
    return null;
  }
}

export default async function instagramAuthRoutes(fastify: FastifyInstance): Promise<void> {
  function missingOAuthEnv(): string[] {
    const missing: string[] = [];
    if (!META_APP_ID) missing.push('META_APP_ID (or FACEBOOK_APP_ID)');
    if (!META_APP_SECRET) missing.push('META_APP_SECRET (or FACEBOOK_APP_SECRET)');
    if (!META_REDIRECT_URI) missing.push('META_REDIRECT_URI');
    if (!OAUTH_STATE_SECRET) missing.push('POSTTY_IG_OAUTH_STATE_SECRET');
    return missing;
  }

  fastify.post(
    '/auth/instagram/connect-url',
    async (
      request: FastifyRequest<{ Body: { remember?: unknown; returnTo?: unknown } }>,
      reply: FastifyReply
    ) => {
      try {
        const user = await requireUser(request as any);
        const remember = request.body?.remember === false ? false : true;
        const returnTo = safeReturnTo(request.body?.returnTo);

        const missing = missingOAuthEnv();
        if (missing.length > 0) {
          return reply.status(500).send({
            status: 'error',
            message: `Meta OAuth is not configured (missing: ${missing.join(', ')})`,
          });
        }

        const state = signState({
          v: 1,
          uid: user.uid,
          remember,
          returnTo,
          nonce: crypto.randomBytes(10).toString('hex'),
          iat: Date.now(),
        });

        const oauthUrl =
          `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?` +
          new URLSearchParams({
            client_id: META_APP_ID!,
            redirect_uri: META_REDIRECT_URI!,
            state,
            response_type: 'code',
            scope: SCOPES,
            auth_type: 'rerequest',
          }).toString();

        return reply.status(200).send({ status: 'success', connectUrl: oauthUrl });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
        return reply.status(status).send({ status: 'error', message: msg });
      }
    }
  );

  fastify.get('/auth/instagram/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as any;
    const code = typeof q?.code === 'string' ? q.code : null;
    const stateRaw = typeof q?.state === 'string' ? q.state : null;
    const error = typeof q?.error === 'string' ? q.error : null;
    const errorDesc = typeof q?.error_description === 'string' ? q.error_description : null;

    const redirectWith = (returnTo: string | null, params: Record<string, string>) => {
      const target = safeReturnTo(returnTo) || '/v2';
      const qs = new URLSearchParams(params).toString();
      const withQs = target.includes('?') ? `${target}&${qs}` : `${target}?${qs}`;
      reply.redirect(toFrontendUrl(withQs));
    };

    try {
      if (error) {
        const msg = errorDesc || error;
        return redirectWith(null, { ig: 'error', message: msg.slice(0, 200) });
      }
      if (!code || !stateRaw) {
        return reply.status(400).send({ status: 'error', message: 'Missing code/state' });
      }

      const state = verifyState(stateRaw);

      const shortToken = await exchangeCodeForShortLivedToken(code);
      const shortUserToken = shortToken?.access_token;
      if (!shortUserToken) throw new Error('Failed to exchange code for access token');

      const longToken = await exchangeForLongLivedUserToken(shortUserToken);
      const longUserToken = longToken?.access_token;
      if (!longUserToken) throw new Error('Failed to exchange for long-lived token');

      const pages = await fetchPagesWithIg(longUserToken);
      if (pages.length === 0) {
        throw new Error('No Facebook Page with a connected Instagram Professional account was found');
      }
      const chosen = pages[0]!;

      const igUsername = await tryFetchIgUsername({ igUserId: chosen.igUserId, pageAccessToken: chosen.pageAccessToken });
      const label = igUsername ? `@${igUsername}` : chosen.pageName;

      if (state.remember) {
        const accountId = makeAccountIdFromIgUserId(chosen.igUserId);
        await upsertInstagramAccount({
          uid: state.uid,
          account: {
            accountId,
            label,
            igUserId: chosen.igUserId,
            pageId: chosen.pageId,
            pageAccessToken: chosen.pageAccessToken,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          setActive: true,
        });
      } else {
        const sessionId = makeSessionId();
        const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
        await createInstagramSession({
          uid: state.uid,
          session: {
            sessionId,
            label,
            igUserId: chosen.igUserId,
            pageId: chosen.pageId,
            pageAccessToken: chosen.pageAccessToken,
            createdAt: Date.now(),
            expiresAt,
          },
          setActive: true,
        });
      }

      return redirectWith(state.returnTo, { ig: 'connected' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      logger.error('IG OAuth callback failed:', msg);
      return redirectWith(null, { ig: 'error', message: msg.slice(0, 200) });
    }
  });

  fastify.get('/auth/instagram/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await requireUser(request as any);
      const data = await listInstagramAccounts(user.uid);
      const activeAuth = await getActiveInstagramAuth(user.uid);
      return reply.status(200).send({
        status: 'success',
        activeAccountId: data.activeAccountId,
        connected: !!activeAuth,
        accounts: data.accounts,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  fastify.post('/auth/instagram/select', async (request: FastifyRequest<{ Body: { accountId?: unknown } }>, reply: FastifyReply) => {
    try {
      const user = await requireUser(request as any);
      const accountId = typeof request.body?.accountId === 'string' ? request.body.accountId : null;
      if (!accountId) return reply.status(400).send({ status: 'error', message: 'Missing accountId' });

      const list = await listInstagramAccounts(user.uid);
      const exists = list.accounts.some((a) => a.accountId === accountId);
      if (!exists) return reply.status(404).send({ status: 'error', message: 'Account not found' });

      await setActiveInstagramAccountId(user.uid, `acc:${accountId}`);
      return reply.status(200).send({ status: 'success' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  fastify.post('/auth/instagram/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await requireUser(request as any);
      await disconnectInstagram(user.uid);
      return reply.status(200).send({ status: 'success' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  fastify.post('/auth/instagram/forget', async (request: FastifyRequest<{ Body: { accountId?: unknown } }>, reply: FastifyReply) => {
    try {
      const user = await requireUser(request as any);
      const accountId = typeof request.body?.accountId === 'string' ? request.body.accountId : null;
      if (!accountId) return reply.status(400).send({ status: 'error', message: 'Missing accountId' });
      await forgetInstagramAccount({ uid: user.uid, accountId });
      return reply.status(200).send({ status: 'success' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      const status = msg.toLowerCase().includes('authorization') ? 401 : 500;
      return reply.status(status).send({ status: 'error', message: msg });
    }
  });

  logger.info('✅ Instagram auth routes registered: /auth/instagram/*');
}


