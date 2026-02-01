import { test, expect } from "@playwright/test";
import { LoginPage } from "../page-objects/login.page";
import {
  CommunityPage,
  CaseDetailPage,
  EditCasePage,
} from "../page-objects/community.page";
import { testUsers } from "../fixtures/test-data/users";

/**
 * Community feature tests - case editing.
 * Uses pre-seeded community cases from global-setup.
 */
test.describe("Community - Case Editing", () => {
  // Pre-seeded case IDs from global-setup
  const seededCaseId = "community-case-1";
  const seededCaseTitle = "Przypadek dermatoskopowy #1";

  const updatedTitle = `Updated Case ${Date.now()}`;
  const updatedDescription = "This description has been updated during E2E test.";

  test("community user can view and edit their own case", async ({ page }) => {
    test.setTimeout(60000);
    const loginPage = new LoginPage(page);
    const caseDetailPage = new CaseDetailPage(page);
    const editCasePage = new EditCasePage(page);

    // Step 1: Login as community user (owner of seeded cases)
    await loginPage.navigate();
    await loginPage.login(testUsers.community.email, testUsers.community.password);
    await page.waitForURL(/\/levels/);

    // Step 2: Navigate directly to the seeded case
    await page.goto(`/community/case/${seededCaseId}`);
    await caseDetailPage.expectCaseLoaded(seededCaseTitle);

    // Step 3: Verify edit button is visible for author
    await caseDetailPage.expectEditButtonVisible();

    // Step 4: Click edit and verify form loads with existing data
    await caseDetailPage.clickEdit();
    await page.waitForURL(/\/community\/case\/[^/]+\/edit$/);

    // Step 5: Verify existing data is loaded
    await expect(editCasePage.titleInput).toHaveValue(seededCaseTitle);
    await editCasePage.expectExistingImagesLoaded();

    // Step 6: Update the case - change title and description
    await editCasePage.updateTitle(updatedTitle);
    await editCasePage.updateDescription(updatedDescription);

    // Step 7: Save changes
    await editCasePage.saveChanges();

    // Step 8: Verify redirected back to case detail with updated content
    await page.waitForURL(/\/community\/case\/[^/]+$/, { timeout: 30000 });
    await caseDetailPage.expectCaseLoaded(updatedTitle);
    await expect(caseDetailPage.caseDescription).toContainText(updatedDescription);
  });

  test("edit button not visible to non-author users", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const caseDetailPage = new CaseDetailPage(page);

    // Login as admin (not the author of community cases)
    await loginPage.navigate();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await page.waitForURL(/\/levels/);

    // Navigate to the seeded case (owned by community user)
    await page.goto(`/community/case/${seededCaseId}`);

    // Verify case loads (admin has access)
    await expect(caseDetailPage.caseTitle).toBeVisible();

    // Verify edit button is NOT visible for non-author
    await caseDetailPage.expectEditButtonNotVisible();
  });

  test("edit page redirects non-authors to case detail", async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Login as admin (not the author)
    await loginPage.navigate();
    await loginPage.login(testUsers.admin.email, testUsers.admin.password);
    await page.waitForURL(/\/levels/);

    // Try to access edit page for a case owned by another user
    await page.goto(`/community/case/${seededCaseId}/edit`);

    // Should redirect away from edit page (to case detail)
    await page.waitForURL(/\/community\/case\/[^/]+(?!.*\/edit)/, { timeout: 10000 });
  });

  test("edit page redirects to community for non-existent case", async ({ page }) => {
    const loginPage = new LoginPage(page);

    // Login as community user
    await loginPage.navigate();
    await loginPage.login(testUsers.community.email, testUsers.community.password);
    await page.waitForURL(/\/levels/);

    // Try to access edit page for a non-existent case
    await page.goto("/community/case/non-existent-case-id/edit");

    // Should redirect to community page
    await page.waitForURL(/\/community(?!\/case)/, { timeout: 10000 });
  });
});

test.describe("Community - Case Listing", () => {
  test("community user can see cases list", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const communityPage = new CommunityPage(page);

    await loginPage.navigate();
    await loginPage.login(testUsers.community.email, testUsers.community.password);
    await page.waitForURL(/\/levels/);

    await page.goto("/community");
    await communityPage.waitForPageLoad();
    await communityPage.expectCasesDisplayed();

    // Verify at least one seeded case is visible
    await expect(page.getByText("Przypadek dermatoskopowy").first()).toBeVisible();
  });

  test("regular user without access sees access request page", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.navigate();
    await loginPage.login(testUsers.regular.email, testUsers.regular.password);
    await page.waitForURL(/\/levels/);

    await page.goto("/community");

    // Should see access request page, not the cases
    await expect(page.getByText(/request access|poproś o dostęp/i)).toBeVisible();
  });
});
