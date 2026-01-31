import { Page } from "@playwright/test";
import { getAdminAuth, getAdminFirestore } from "./firebase-admin";
import type { TestUser } from "../fixtures/test-data/users";

export interface CreateUserOptions {
  email: string;
  password: string;
  displayName: string;
  role?: "user" | "admin";
  permissions?: {
    casesAccess?: boolean;
    moderator?: boolean;
  };
  termsAcceptedAt?: Date | null;
}

export async function createTestUser(options: CreateUserOptions): Promise<string> {
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Create user in Firebase Auth
  const userRecord = await auth.createUser({
    email: options.email,
    password: options.password,
    displayName: options.displayName,
  });

  // Create user document in Firestore
  await db.collection("users").doc(userRecord.uid).set({
    email: options.email,
    displayName: options.displayName,
    role: options.role || "user",
    permissions: options.permissions || {},
    termsAcceptedAt: options.termsAcceptedAt || null,
    createdAt: new Date(),
  });

  return userRecord.uid;
}

export async function createTestUserFromFixture(user: TestUser): Promise<string> {
  return createTestUser({
    email: user.email,
    password: user.password,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions,
    termsAcceptedAt: user.termsAcceptedAt ? new Date() : null,
  });
}

export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|hasło/i).fill(password);
  await page.getByRole("main").getByRole("button", { name: /log\s*in|zaloguj/i }).click();

  // Wait for navigation to complete
  await page.waitForURL(/\/(levels|admin)/, { timeout: 10000 });
}

export async function loginAsUser(
  page: Page,
  user: TestUser
): Promise<void> {
  await loginViaUI(page, user.email, user.password);
}

export async function logout(page: Page): Promise<void> {
  // Click on user menu or profile
  await page.getByRole("button", { name: /menu|profil/i }).click();
  await page.getByRole("button", { name: /wyloguj|log\s*out/i }).click();

  // Wait for redirect to login
  await page.waitForURL(/\/login/);
}

export async function acceptTermsIfShown(page: Page): Promise<void> {
  const termsModal = page.getByTestId("terms-modal");
  if (await termsModal.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.getByRole("button", { name: /akceptuj|accept/i }).click();
    await termsModal.waitFor({ state: "hidden" });
  }
}

export async function updateUserPermissions(
  userId: string,
  permissions: { casesAccess?: boolean; moderator?: boolean }
): Promise<void> {
  const db = getAdminFirestore();
  await db.collection("users").doc(userId).update({
    permissions,
  });
}

export async function updateUserRole(
  userId: string,
  role: "user" | "admin"
): Promise<void> {
  const db = getAdminFirestore();
  await db.collection("users").doc(userId).update({
    role,
  });
}

export async function getUserByEmail(email: string): Promise<string | null> {
  const auth = getAdminAuth();
  try {
    const user = await auth.getUserByEmail(email);
    return user.uid;
  } catch {
    return null;
  }
}
