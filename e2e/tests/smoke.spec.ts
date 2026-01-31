import { test, expect } from "@playwright/test";
import { LoginPage } from "../page-objects/login.page";
import { LevelsPage, TestsPage } from "../page-objects/levels.page";
import { QuizPage } from "../page-objects/quiz.page";
import { testUsers } from "../fixtures/test-data/users";

/**
 * Smoke tests covering the most critical user journeys.
 * These tests should pass for every deployment.
 */
test.describe("Smoke Tests - Critical Paths", () => {
  test("user can login and see levels", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const levelsPage = new LevelsPage(page);

    // Login
    await loginPage.navigate();
    await loginPage.login(testUsers.regular.email, testUsers.regular.password);
    await page.waitForURL(/\/levels/);

    // Verify levels page loads
    await expect(levelsPage.pageTitle).toBeVisible();
    await levelsPage.expectLevelsDisplayed();
  });

  test("user can browse tests in a level", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const levelsPage = new LevelsPage(page);
    const testsPage = new TestsPage(page);

    // Login and navigate to levels
    await loginPage.navigate();
    await loginPage.login(testUsers.regular.email, testUsers.regular.password);
    await page.waitForURL(/\/levels/);

    // Click first level
    await levelsPage.expectLevelsDisplayed();
    await levelsPage.clickLevel(0);

    // Verify tests page loads
    await expect(testsPage.pageTitle).toBeVisible();
    await testsPage.expectTestsDisplayed();
  });

  test("user can start and answer a quiz question", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const levelsPage = new LevelsPage(page);
    const testsPage = new TestsPage(page);
    const quizPage = new QuizPage(page);

    // Login and navigate to quiz
    await loginPage.navigate();
    await loginPage.login(testUsers.regular.email, testUsers.regular.password);
    await page.waitForURL(/\/levels/);

    await levelsPage.expectLevelsDisplayed();
    await levelsPage.clickLevel(0);
    await testsPage.expectTestsDisplayed();
    await testsPage.clickTest(0);

    // Verify quiz loads - check for case image
    await expect(quizPage.caseImage).toBeVisible({ timeout: 10000 });

    // Open answers modal, select and submit
    await quizPage.openAnswerModal();
    await quizPage.selectAnswer(0);
    await quizPage.submitAnswer();

    // Verify feedback is shown
    await quizPage.waitForFeedback();
  });

  test("invalid login shows error", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.navigate();
    await loginPage.login("invalid@email.com", "wrongpassword");

    await loginPage.expectLoginError();
  });

  test("protected routes redirect to login", async ({ page }) => {
    // Try to access levels without logging in
    await page.goto("/levels");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
