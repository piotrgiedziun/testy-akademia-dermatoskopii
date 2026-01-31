import { getAdminAuth, getAdminFirestore } from "./firebase-admin";

export async function clearEmulatorData(): Promise<void> {
  const db = getAdminFirestore();
  const auth = getAdminAuth();

  // Clear all Firestore collections
  const collections = [
    "users",
    "levels",
    "tests",
    "cases",
    "userProgress",
    "communityCases",
    "userCommunityStats",
    "contentFlags",
    "leaderboards",
    "accessRequests",
  ];

  for (const collectionName of collections) {
    await clearCollection(db, collectionName);
  }

  // Clear all auth users
  const listUsersResult = await auth.listUsers(1000);
  const deletePromises = listUsersResult.users.map((user) =>
    auth.deleteUser(user.uid)
  );
  await Promise.all(deletePromises);

  console.log("Emulator data cleared successfully");
}

async function clearCollection(
  db: FirebaseFirestore.Firestore,
  collectionPath: string
): Promise<void> {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.limit(500).get();

  if (snapshot.empty) {
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recursively delete if there are more documents
  if (snapshot.size === 500) {
    await clearCollection(db, collectionPath);
  }
}

export async function clearUserData(userId: string): Promise<void> {
  const db = getAdminFirestore();
  const auth = getAdminAuth();

  // Delete user document
  await db.collection("users").doc(userId).delete();

  // Delete user progress
  const progressRef = db.collection("userProgress").doc(userId);
  const attemptsSnapshot = await progressRef.collection("attempts").get();
  const batch = db.batch();
  attemptsSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  await progressRef.delete();

  // Delete user community stats
  await db.collection("userCommunityStats").doc(userId).delete();

  // Delete auth user
  try {
    await auth.deleteUser(userId);
  } catch {
    // User might not exist in auth
  }
}

export async function clearTestAttempts(userId: string): Promise<void> {
  const db = getAdminFirestore();
  const progressRef = db.collection("userProgress").doc(userId);
  const attemptsSnapshot = await progressRef.collection("attempts").get();

  const batch = db.batch();
  attemptsSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
