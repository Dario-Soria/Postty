import * as logger from '../utils/logger';

let _admin: any | null = null;

function normalizePrivateKey(raw: string): string {
  // Common env var pattern stores newlines as literal \n
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

export function getFirebaseAdmin(): any {
  if (_admin) return _admin;
  // Lazy require so the server can still boot in dev if deps aren’t installed yet.
  // (In production we will have firebase-admin installed.)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const admin = require('firebase-admin');

  if (!admin.apps || admin.apps.length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKeyRaw) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: normalizePrivateKey(privateKeyRaw),
        }),
      });
      logger.info('[FirebaseAdmin] Initialized with FIREBASE_* env vars');
    } else {
      // Fallback: Application Default Credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS)
      admin.initializeApp();
      logger.info('[FirebaseAdmin] Initialized with application default credentials');
    }
  }

  _admin = admin;
  return admin;
}

export function getFirestore(): any {
  const admin = getFirebaseAdmin();
  return admin.firestore();
}


