import { initializeFirebaseAdmin } from "./utils/firebase-admin";
import { clearEmulatorData } from "./utils/cleanup";
import { seedTestData, seedCommunityData } from "./utils/seed";
import { testUsers } from "./fixtures/test-data/users";

async function globalSetup() {
  console.log("Starting global setup...");

  // Initialize Firebase Admin SDK
  initializeFirebaseAdmin();
  console.log("Firebase Admin initialized");

  // Clear existing data in emulators
  try {
    await clearEmulatorData();
    console.log("Emulator data cleared");
  } catch (error) {
    console.log("Could not clear emulator data (emulators might not be running yet):", error);
  }

  // Seed test data
  try {
    const seededData = await seedTestData();
    console.log("Test data seeded:", seededData);

    // Seed community data for the community user
    const communityUserId = seededData.userIds[testUsers.community.email];
    if (communityUserId) {
      const communityCaseIds = await seedCommunityData(
        communityUserId,
        testUsers.community.displayName
      );
      console.log("Community cases seeded:", communityCaseIds);
    }
  } catch (error) {
    console.log("Could not seed test data:", error);
  }

  console.log("Global setup complete");
}

export default globalSetup;
