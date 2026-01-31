import { initializeFirebaseAdmin } from "./utils/firebase-admin";
import { clearEmulatorData } from "./utils/cleanup";
import { seedTestData } from "./utils/seed";

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
  } catch (error) {
    console.log("Could not seed test data:", error);
  }

  console.log("Global setup complete");
}

export default globalSetup;
