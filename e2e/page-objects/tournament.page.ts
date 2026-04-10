import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class TournamentEntryPage extends BasePage {
  readonly tournamentName: Locator;
  readonly nameInput: Locator;
  readonly termsCheckbox: Locator;
  readonly startButton: Locator;
  readonly rankingLink: Locator;
  readonly answersList: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.tournamentName = page.locator("h1");
    this.nameInput = page.getByPlaceholder(/imię|name/i);
    this.termsCheckbox = page.locator('input[type="checkbox"]');
    this.startButton = page.getByRole("button", {
      name: /rozpocznij turniej|start tournament/i,
    });
    this.rankingLink = page.getByRole("button", {
      name: /zobacz ranking|view ranking/i,
    });
    this.answersList = page.locator(".max-h-40.overflow-y-auto");
    this.errorMessage = page.locator("p.text-lg.text-gray-500");
  }

  get url(): string {
    return "/tournament/";
  }

  async navigateToTournament(uuid: string): Promise<void> {
    await this.page.goto(`/tournament/${uuid}`);
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async acceptTerms(): Promise<void> {
    await this.termsCheckbox.check();
  }

  async start(): Promise<void> {
    await this.startButton.click();
  }

  async startTournament(name: string): Promise<void> {
    await this.fillName(name);
    await this.acceptTerms();
    await this.start();
  }

  async expectAnswersVisible(): Promise<void> {
    await expect(this.answersList).toBeVisible();
  }

  async expectInactive(): Promise<void> {
    await expect(this.errorMessage).toContainText(/nieaktywny|inactive/i);
  }
}

export class TournamentQuizPage extends BasePage {
  readonly caseImage: Locator;
  readonly showAnswersButton: Locator;
  readonly answerOptions: Locator;
  readonly submitButton: Locator;
  readonly timer: Locator;
  readonly progressIndicator: Locator;
  readonly exitButton: Locator;

  constructor(page: Page) {
    super(page);
    this.caseImage = page.getByTestId("case-image");
    this.showAnswersButton = page.getByRole("button", {
      name: /pokaż odpowiedzi|show answers/i,
    });
    this.answerOptions = page.getByTestId("answer-option");
    this.submitButton = page.getByRole("button", {
      name: /zatwierdź|submit|potwierdź/i,
    });
    this.timer = page.getByTestId("quiz-timer");
    this.progressIndicator = page.getByTestId("quiz-progress");
    this.exitButton = page.getByRole("button", { name: /wyjdź|exit|×/i });
  }

  get url(): string {
    return "/tournament/";
  }

  async openAnswerModal(): Promise<void> {
    await this.showAnswersButton.click();
    await expect(this.answerOptions.first()).toBeVisible({ timeout: 5000 });
  }

  async selectAnswer(index: number): Promise<void> {
    await this.answerOptions.nth(index).click();
  }

  async submitAnswer(): Promise<void> {
    await this.submitButton.click();
  }

  async answerAndSubmit(answerIndex: number): Promise<void> {
    await this.openAnswerModal();
    await this.selectAnswer(answerIndex);
    await this.submitAnswer();
  }

  async waitForNextQuestion(currentIndex: number): Promise<void> {
    // Wait for progress indicator to change
    await this.page.waitForFunction(
      (idx) => {
        const el = document.querySelector('[data-testid="quiz-progress"]');
        return el && !el.textContent?.includes(`${idx + 1}/`);
      },
      currentIndex,
      { timeout: 10000 }
    );
  }

  async expectNoFeedback(): Promise<void> {
    // Tournament mode should NOT show feedback section
    await expect(
      this.page.getByTestId("quiz-feedback")
    ).not.toBeVisible({ timeout: 2000 });
  }
}

export class TournamentResultsPage extends BasePage {
  readonly accuracy: Locator;
  readonly score: Locator;
  readonly correctCount: Locator;
  readonly incorrectCount: Locator;
  readonly timeDisplay: Locator;
  readonly viewRankingButton: Locator;
  readonly playAgainButton: Locator;

  constructor(page: Page) {
    super(page);
    this.accuracy = page.locator("p.text-5xl");
    this.score = page.locator("p.text-gray-500").filter({ hasText: /wynik|score/i });
    this.correctCount = page.locator("p.text-green-600");
    this.incorrectCount = page.locator("p.text-red-500");
    this.timeDisplay = page.locator("p.text-charcoal.text-2xl");
    this.viewRankingButton = page.getByRole("button", {
      name: /zobacz ranking|view ranking/i,
    });
    this.playAgainButton = page.getByRole("button", {
      name: /zagraj ponownie|play again/i,
    });
  }

  get url(): string {
    return "/tournament/";
  }

  async expectResultsVisible(): Promise<void> {
    await expect(this.accuracy).toBeVisible({ timeout: 10000 });
    await expect(this.correctCount).toBeVisible();
    await expect(this.incorrectCount).toBeVisible();
  }
}

export class TournamentRankingPage extends BasePage {
  readonly title: Locator;
  readonly rankingRows: Locator;
  readonly emptyMessage: Locator;
  readonly playButton: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.locator("h1");
    this.rankingRows = page.locator(".divide-y > div");
    this.emptyMessage = page.locator("p.text-gray-500");
    this.playButton = page.getByRole("button", {
      name: /zagraj ponownie|play again/i,
    });
  }

  get url(): string {
    return "/tournament/";
  }

  async expectRankingVisible(): Promise<void> {
    await expect(this.title).toBeVisible();
  }

  async getParticipantCount(): Promise<number> {
    return await this.rankingRows.count();
  }
}
