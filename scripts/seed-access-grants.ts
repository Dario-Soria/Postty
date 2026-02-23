import path from 'path';
import dotenv from 'dotenv';
import { getFirestore } from '../src/services/firebaseAdmin';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function main(): Promise<void> {
  const defaults = [
    'ds.dariosoria@gmail.com',
    'jbeinesfurcada@gmail.com',
    'ulisesfferreyra@gmail.com',
  ];

  const input = process.argv.slice(2);
  const targetEmails = (input.length > 0 ? input : defaults).map(normalizeEmail).filter(Boolean);

  if (targetEmails.length === 0) {
    throw new Error('No emails provided to seed access grants.');
  }

  const db = getFirestore();

  for (const emailLower of targetEmails) {
    await db
      .collection('access_grants')
      .doc(emailLower)
      .set(
        {
          enabled: true,
          groups: [],
          notes: 'Initial beta invite seed',
          grantedBy: 'seed-access-grants-script',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
    // eslint-disable-next-line no-console
    console.log(`Seeded access grant: ${emailLower}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed access grants:', err instanceof Error ? err.message : err);
  process.exit(1);
});
