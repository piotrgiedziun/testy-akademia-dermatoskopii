import { initializeFirebaseAdmin } from "../utils/firebase-admin";
import { clearEmulatorData } from "../utils/cleanup";
import { seedTestData } from "../utils/seed";

async function main() {
  console.log("Seeding E2E test data...\n");

  initializeFirebaseAdmin();

  // Clear existing data
  try {
    await clearEmulatorData();
    console.log("Cleared existing emulator data");
  } catch (error) {
    console.error("Failed to clear data (emulators running?):", error);
    process.exit(1);
  }

  await seedTestData();
  console.log("Done");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
