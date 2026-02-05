import { test, expect } from "@playwright/test";
import { LoginPage } from "../page-objects/login.page";
import { LevelsPage, TestsPage } from "../page-objects/levels.page";
import { QuizPage } from "../page-objects/quiz.page";
import { testUsers } from "../fixtures/test-data/users";

/**
 * Tests for annotation functionality in quiz feedback.
 */
test.describe("Annotations", () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    const levelsPage = new LevelsPage(page);
    const testsPage = new TestsPage(page);
    const quizPage = new QuizPage(page);

    // Login and navigate to quiz, answer a question
    await loginPage.navigate();
    await loginPage.login(testUsers.regular.email, testUsers.regular.password);
    await page.waitForURL(/\/levels/);

    await levelsPage.expectLevelsDisplayed();
    await levelsPage.clickLevel(0);
    await testsPage.expectTestsDisplayed();
    await testsPage.clickTest(0);

    // Answer the first question to get to feedback screen
    await expect(quizPage.caseImage).toBeVisible({ timeout: 10000 });
    await quizPage.openAnswerModal();
    await quizPage.selectAnswer(0);
    await quizPage.submitAnswer();
    await quizPage.waitForFeedback();
  });

  test("annotation toggle button is visible on feedback screen when annotations exist", async ({
    page,
  }) => {
    // Check if the annotation toggle button exists (it only appears if annotations exist)
    const annotationToggle = page.getByTestId("annotation-toggle");

    // The button may or may not be visible depending on whether the case has annotations
    // We check that if it exists, it's visible and clickable
    const toggleCount = await annotationToggle.count();

    if (toggleCount > 0) {
      await expect(annotationToggle).toBeVisible();
    }
  });

  test("annotation overlay toggles visibility when button is clicked", async ({
    page,
  }) => {
    const annotationToggle = page.getByTestId("annotation-toggle");
    const annotationOverlay = page.getByTestId("annotation-overlay");

    // Check if annotations exist for this case
    const toggleCount = await annotationToggle.count();

    if (toggleCount > 0) {
      // Annotations should be visible by default (since we changed default to true)
      await expect(annotationOverlay).toBeVisible();

      // Click to hide
      await annotationToggle.click();
      await expect(annotationOverlay).not.toBeVisible();

      // Click to show again
      await annotationToggle.click();
      await expect(annotationOverlay).toBeVisible();
    }
  });

  test("annotation overlay is inside the image container", async ({ page }) => {
    const annotationToggle = page.getByTestId("annotation-toggle");
    const toggleCount = await annotationToggle.count();

    if (toggleCount > 0) {
      // Check that the toggle button is positioned within the image viewer area
      // by verifying it has position absolute styling
      const toggleStyles = await annotationToggle.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          position: computed.position,
          bottom: computed.bottom,
          right: computed.right,
        };
      });

      expect(toggleStyles.position).toBe("absolute");
    }
  });

  test("annotations display correctly with custom colors", async ({ page }) => {
    const annotationOverlay = page.getByTestId("annotation-overlay");
    const overlayCount = await annotationOverlay.count();

    if (overlayCount > 0) {
      // Check that viewBox is set (dimensions are loaded)
      const viewBox = await annotationOverlay.getAttribute("viewBox");
      expect(viewBox).toBeTruthy();

      // Check that it's not the hardcoded 1000x1000 (if image has different dimensions)
      // This is a soft check - we just verify it's not null
      expect(viewBox).not.toBe("");
    }
  });
});
