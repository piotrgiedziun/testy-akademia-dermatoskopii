import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error('❌ Error: FIREBASE_PROJECT_ID environment variable is required');
  console.error('   Set it with: export FIREBASE_PROJECT_ID=your-project-id');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();

async function setAdmin(email: string) {
  console.log(`Setting admin role for: ${email}`);

  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', email).get();

  if (snapshot.empty) {
    console.log('❌ User not found with that email');
    return;
  }

  for (const doc of snapshot.docs) {
    await doc.ref.update({ role: 'admin' });
    console.log(`✅ User ${doc.id} is now admin`);
  }
}

const email = process.argv[2];

if (!email) {
  console.error('❌ Error: Email address is required');
  console.error('   Usage: npx tsx scripts/set-admin.ts user@example.com');
  process.exit(1);
}

setAdmin(email).catch(console.error);
