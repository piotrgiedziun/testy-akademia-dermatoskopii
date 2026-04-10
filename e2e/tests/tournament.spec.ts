import { test, expect } from "@playwright/test";
import {
  TournamentEntryPage,
  TournamentQuizPage,
  TournamentResultsPage,
  TournamentRankingPage,
} from "../page-objects/tournament.page";

/**
 * Tournament mode E2E tests.
 *
 * Fixtures:
 * - "tournament-active"    → test-no-timer (no countdown, 2 questions)
 * - "tournament-inactive"  → test-no-timer (inactive)
 * - "tournament-countdown" → test-short-timer (3s countdown, 2 questions)
 */

// Capture console errors for debugging
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => console.log("[PAGE ERROR]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[CONSOLE ERROR]", msg.text());
  });
});

// ─────────────────────────────────────────────
// Entry Page
// ─────────────────────────────────────────────
test.describe("Tournament - Entry Page", () => {
  test("shows tournament entry form for active tournament", async ({
    page,
  }) => {
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-active");

    await expect(entry.tournamentName).toBeVisible();
    await expect(entry.nameInput).toBeVisible();
    await expect(entry.termsCheckbox).toBeVisible();
    await expect(entry.startButton).toBeVisible();
  });

  test("shows possible answers list", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-active");

    await entry.expectAnswersVisible();
  });

  test("start button disabled without name and terms", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-active");

    await expect(entry.startButton).toBeDisabled();

    await entry.fillName("Jan Kowalski");
    await expect(entry.startButton).toBeDisabled();

    await entry.nameInput.clear();
    await entry.acceptTerms();
    await expect(entry.startButton).toBeDisabled();

    await entry.fillName("Jan Kowalski");
    await expect(entry.startButton).toBeEnabled();
  });

  test("whitespace-only name keeps button disabled", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-active");

    await entry.fillName("   ");
    await entry.acceptTerms();
    await expect(entry.startButton).toBeDisabled();
  });

  test("inactive tournament is not accessible (shows not found)", async ({
    page,
  }) => {
    // Firestore rule denies read for inactive tournaments to non-admins,
    // so it appears as "not found" — correct security behavior
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-inactive");

    await expect(entry.errorMessage).toContainText(
      /nie znaleziono|not found/i
    );
  });

  test("shows not found for non-existent tournament", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("non-existent-uuid");

    await expect(entry.errorMessage).toContainText(
      /nie znaleziono|not found/i
    );
  });

  test("terms link points to tournament-specific terms page", async ({
    page,
  }) => {
    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-active");

    const termsLink = page.locator('a[href="/tournament-terms"]');
    await expect(termsLink).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// Quiz Flow (no timer — tournament-active)
// ─────────────────────────────────────────────
test.describe("Tournament - Quiz Flow", () => {
  test("can start and answer a question (no feedback shown)", async ({
    page,
  }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Test Player");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    // No feedback — should auto-advance to question 2
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
  });

  test("completes tournament and shows results", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);
    const results = new TournamentResultsPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Results Player");

    // Answer both questions
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    // Should navigate to results
    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
    await results.expectResultsVisible();
  });

  test("exit button clears state and returns to entry", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Exit Player");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });

    // Click exit (X button in header)
    await page
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .first()
      .click();
    await page.getByRole("button", { name: /tak|yes/i }).click();

    await page.waitForURL(/\/tournament\/tournament-active$/);
    await expect(entry.nameInput).toBeVisible();
  });

  test("direct navigation to quiz URL without attempt redirects to entry", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/tournament/tournament-active/quiz");
    await page.waitForURL(/\/tournament\/tournament-active$/);
  });
});

// ─────────────────────────────────────────────
// Timeout Handling (3s timer — tournament-countdown)
// ─────────────────────────────────────────────
test.describe("Tournament - Timeout Handling", () => {
  test.describe.configure({ timeout: 60000 });

  test("consecutive timeouts advance correctly (regression)", async ({
    page,
  }) => {
    // Regression: Timer's hasTimedOut ref wasn't reset between questions
    // because QuizQuestion stayed mounted. Fix: key={currentCaseIndex}.
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-countdown");
    await entry.startTournament("Timeout Player");

    // Wait for Q1 to load
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await expect(quiz.timer).toBeVisible();

    // Wait for timeout (3s + buffer)
    await page.waitForTimeout(5000);

    // Should auto-advance to Q2
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });

    // Wait for Q2 timeout
    await page.waitForTimeout(5000);

    // Should navigate to results
    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
  });

  test("single timeout then normal answer works", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-countdown");
    await entry.startTournament("Mixed Player");

    // Q1: let it timeout
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(5000);

    // Q2: answer normally
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
  });

  test("timer is visible for countdown tournament", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-countdown");
    await entry.startTournament("Timer Player");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await expect(quiz.timer).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// Page Refresh / Resume
// ─────────────────────────────────────────────
test.describe("Tournament - Page Refresh", () => {
  test("resumes quiz after page refresh mid-quiz", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Refresh Player");

    // Answer Q1
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    // On Q2 — refresh
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await page.reload();

    // Should resume on Q2
    await expect(quiz.caseImage).toBeVisible({ timeout: 15000 });

    // Answer Q2 and finish
    await quiz.answerAndSubmit(0);
    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
  });

  test("navigating to entry with in-progress attempt redirects to quiz", async ({
    page,
  }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Redirect Player");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });

    // Navigate to entry page
    await page.goto("/tournament/tournament-active");

    // Should redirect back to quiz
    await page.waitForURL(/\/tournament\/tournament-active\/quiz/);
  });
});

// ─────────────────────────────────────────────
// Results & Ranking
// ─────────────────────────────────────────────
test.describe("Tournament - Results & Ranking", () => {
  test("results show participant name and stats", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);
    const results = new TournamentResultsPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Stats Player");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
    await results.expectResultsVisible();
    await expect(page.getByText("Stats Player")).toBeVisible();
  });

  test("play again clears state for next participant", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);
    const results = new TournamentResultsPage(page);

    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Replay Player");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
    await results.playAgainButton.click();

    await page.waitForURL(/\/tournament\/tournament-active$/);
    await expect(entry.nameInput).toHaveValue("");
  });

  test("ranking page accessible via link", async ({ page }) => {
    const ranking = new TournamentRankingPage(page);

    await page.goto("/tournament/tournament-active/ranking");
    await ranking.expectRankingVisible();
  });

  test("ranking is sorted by score (desc) then time (asc)", async ({
    page,
  }) => {
    test.setTimeout(60000);

    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);
    const results = new TournamentResultsPage(page);
    const ranking = new TournamentRankingPage(page);

    // Uses tournament-countdown (3s timer, test-short-timer)
    // test-short-timer: case-7 correct=a1 (index 0), case-8 correct=a2 (index 1)
    const tournamentId = "tournament-countdown";

    // Helper: play tournament with given answer indices and optional delay
    const playTournament = async (
      name: string,
      q1Answer: number,
      q2Answer: number,
      delayBeforeAnswerMs?: number
    ) => {
      await entry.navigateToTournament(tournamentId);
      await page.evaluate(() => localStorage.removeItem("tournament-storage"));
      await page.reload();
      await expect(entry.nameInput).toBeVisible({ timeout: 10000 });

      await entry.startTournament(name);
      await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
      if (delayBeforeAnswerMs) await page.waitForTimeout(delayBeforeAnswerMs);
      await quiz.answerAndSubmit(q1Answer);
      await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
      if (delayBeforeAnswerMs) await page.waitForTimeout(delayBeforeAnswerMs);
      await quiz.answerAndSubmit(q2Answer);
      await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
      await results.playAgainButton.click();
      await page.waitForURL(new RegExp(`/tournament/${tournamentId}$`));
    };

    // Player 1: 2 correct = 20 pts, SLOW (wait 1.5s per question)
    await playTournament("Top Slow", 0, 1, 1500);

    // Player 2: 2 correct = 20 pts, FAST (answer immediately)
    await playTournament("Top Fast", 0, 1);

    // Player 3: 1 correct = 10 pts
    await playTournament("Mid Player", 0, 0);

    // Player 4: 0 correct = 0 pts
    await playTournament("Zero Points", 1, 0);

    // Check ranking
    await page.goto(`/tournament/${tournamentId}/ranking`);
    await ranking.expectRankingVisible();

    const rows = ranking.rankingRows;
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Extract names from ranking rows in order
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = await rows
        .nth(i)
        .locator(".font-medium.text-charcoal")
        .textContent();
      if (name) names.push(name.trim());
    }

    // Find positions of our players
    const topFastIdx = names.indexOf("Top Fast");
    const topSlowIdx = names.indexOf("Top Slow");
    const midIdx = names.indexOf("Mid Player");
    const zeroIdx = names.indexOf("Zero Points");

    expect(topFastIdx).toBeGreaterThanOrEqual(0);
    expect(topSlowIdx).toBeGreaterThanOrEqual(0);
    expect(midIdx).toBeGreaterThanOrEqual(0);
    expect(zeroIdx).toBeGreaterThanOrEqual(0);

    // Primary sort: score descending (20 > 10 > 0)
    expect(topFastIdx).toBeLessThan(midIdx);
    expect(topSlowIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(zeroIdx);

    // Secondary sort: time ascending (faster player ranked higher)
    expect(topFastIdx).toBeLessThan(topSlowIdx);
  });
});

// ─────────────────────────────────────────────
// Shared Computer — Sequential Players
// ─────────────────────────────────────────────
test.describe("Tournament - Shared Computer", () => {
  test("two players complete tournament sequentially", async ({ page }) => {
    const entry = new TournamentEntryPage(page);
    const quiz = new TournamentQuizPage(page);
    const results = new TournamentResultsPage(page);

    // Player 1
    await entry.navigateToTournament("tournament-active");
    await entry.startTournament("Player One");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(0);

    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
    await results.playAgainButton.click();

    // Player 2
    await page.waitForURL(/\/tournament\/tournament-active$/);
    await expect(entry.nameInput).toHaveValue("");

    await entry.startTournament("Player Two");

    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(1);
    await expect(quiz.caseImage).toBeVisible({ timeout: 10000 });
    await quiz.answerAndSubmit(1);

    await page.waitForURL(/\/tournament\/.*\/results\//, { timeout: 15000 });
    await expect(page.getByText("Player Two")).toBeVisible();
  });
});

// ─────────────────────────────────────────────
// Public Access
// ─────────────────────────────────────────────
test.describe("Tournament - Public Access", () => {
  test("tournament works without authentication", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    const entry = new TournamentEntryPage(page);
    await entry.navigateToTournament("tournament-active");

    await expect(entry.tournamentName).toBeVisible();
    await expect(entry.startButton).toBeVisible();
  });
});
