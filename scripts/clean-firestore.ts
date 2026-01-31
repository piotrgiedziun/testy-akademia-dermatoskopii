import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

if (!projectId) {
  console.error('❌ Error: FIREBASE_PROJECT_ID environment variable is required');
  console.error('   Set it with: export FIREBASE_PROJECT_ID=your-project-id');
  process.exit(1);
}

// Use application default credentials (from gcloud auth application-default login)
initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();

async function deleteCollection(collectionPath: string) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`  Collection '${collectionPath}' is empty`);
    return 0;
  }

  const batch = db.batch();
  let count = 0;

  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    count++;
  });

  await batch.commit();
  console.log(`  ✓ Deleted ${count} documents from '${collectionPath}'`);
  return count;
}

async function clean() {
  console.log('Cleaning Firestore (keeping users)...\n');

  // Collections to clean (NOT including users or userProgress)
  const collectionsToClean = [
    'levels',
    'tests',
    'cases',
    'diagnoses', // Clean old diagnoses collection if it exists
  ];

  let totalDeleted = 0;

  for (const collection of collectionsToClean) {
    try {
      totalDeleted += await deleteCollection(collection);
    } catch (error) {
      console.error(`  Error cleaning '${collection}':`, error);
    }
  }

  console.log(`\n✅ Clean completed! Deleted ${totalDeleted} documents total.`);
}

clean().catch(console.error);
