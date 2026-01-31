import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class QuizPage extends BasePage {
  readonly caseImage: Locator;
  readonly showAnswersButton: Locator;
  readonly answerOptions: Locator;
  readonly submitButton: Locator;
  readonly nextButton: Locator;
  readonly finishButton: Locator;
  readonly timer: Locator;
  readonly progressIndicator: Locator;
  readonly feedbackSection: Locator;
  readonly correctFeedback: Locator;
  readonly incorrectFeedback: Locator;
  readonly explanationText: Locator;
  readonly featuresSection: Locator;

  constructor(page: Page) {
    super(page);
    this.caseImage = page.getByTestId("case-image");
    this.showAnswersButton = page.getByRole("button", { name: /pokaż odpowiedzi|show answers/i });
    this.answerOptions = page.getByTestId("answer-option");
    this.submitButton = page.getByRole("button", { name: /zatwierdź|submit|potwierdź/i });
    this.nextButton = page.getByRole("button", { name: /następn|next|dalej/i });
    this.finishButton = page.getByRole("button", { name: /zakończ|finish|koniec/i });
    this.timer = page.getByTestId("quiz-timer");
    this.progressIndicator = page.getByTestId("quiz-progress");
    this.feedbackSection = page.getByTestId("quiz-feedback");
    this.correctFeedback = page.locator('[data-testid="feedback-correct"]');
    this.incorrectFeedback = page.locator('[data-testid="feedback-incorrect"]');
    this.explanationText = page.getByTestId("explanation");
    this.featuresSection = page.getByTestId("features");
  }

  async openAnswerModal(): Promise<void> {
    await this.showAnswersButton.click();
    await expect(this.answerOptions.first()).toBeVisible({ timeout: 5000 });
  }

  get url(): string {
    return "/quiz/";
  }

  async selectAnswer(index: number): Promise<void> {
    await this.answerOptions.nth(index).click();
  }

  async selectAnswerByText(text: string | RegExp): Promise<void> {
    await this.answerOptions.filter({ hasText: text }).click();
  }

  async selectMultipleAnswers(indices: number[]): Promise<void> {
    for (const index of indices) {
      await this.answerOptions.nth(index).click();
    }
  }

  async submitAnswer(): Promise<void> {
    await this.submitButton.click();
  }

  async goToNextQuestion(): Promise<void> {
    await this.nextButton.click();
  }

  async finishQuiz(): Promise<void> {
    await this.finishButton.click();
  }

  async answerAndSubmit(answerIndex: number): Promise<void> {
    await this.selectAnswer(answerIndex);
    await this.submitAnswer();
  }

  async answerAndContinue(answerIndex: number): Promise<void> {
    await this.answerAndSubmit(answerIndex);
    await this.waitForFeedback();
    // Check if next button is visible (not last question)
    if (await this.nextButton.isVisible()) {
      await this.goToNextQuestion();
    }
  }

  async waitForFeedback(): Promise<void> {
    await expect(this.feedbackSection).toBeVisible({ timeout: 10000 });
  }

  async expectCorrectAnswer(): Promise<void> {
    await expect(this.correctFeedback).toBeVisible();
  }

  async expectIncorrectAnswer(): Promise<void> {
    await expect(this.incorrectFeedback).toBeVisible();
  }

  async expectTimerVisible(): Promise<void> {
    await expect(this.timer).toBeVisible();
  }

  async expectTimerNotVisible(): Promise<void> {
    await expect(this.timer).not.toBeVisible();
  }

  async getTimerValue(): Promise<string | null> {
    return await this.timer.textContent();
  }

  async getAnswerCount(): Promise<number> {
    return await this.answerOptions.count();
  }

  async expectExplanationVisible(): Promise<void> {
    await expect(this.explanationText).toBeVisible();
  }

  async completeQuizWithFirstAnswer(): Promise<void> {
    let hasNextQuestion = true;
    while (hasNextQuestion) {
      // Open answer modal, select first answer, and submit
      await this.openAnswerModal();
      await this.selectAnswer(0);
      await this.submitAnswer();
      await this.waitForFeedback();

      if (await this.finishButton.isVisible()) {
        await this.finishQuiz();
        hasNextQuestion = false;
      } else if (await this.nextButton.isVisible()) {
        await this.goToNextQuestion();
      } else {
        hasNextQuestion = false;
      }
    }
  }
}
