import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class LevelsPage extends BasePage {
  readonly levelCards: Locator;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.levelCards = page.getByTestId("level-card");
    this.pageTitle = page.getByRole("heading", { level: 1 });
  }

  get url(): string {
    return "/levels";
  }

  async getLevelCount(): Promise<number> {
    return await this.levelCards.count();
  }

  async clickLevel(index: number): Promise<void> {
    await this.levelCards.nth(index).click();
  }

  async clickLevelByTitle(title: string | RegExp): Promise<void> {
    await this.levelCards.filter({ hasText: title }).click();
  }

  async expectLevelsDisplayed(): Promise<void> {
    await expect(this.levelCards.first()).toBeVisible();
  }

  async expectLevelCount(count: number): Promise<void> {
    await expect(this.levelCards).toHaveCount(count);
  }

  async getLevelTitles(): Promise<string[]> {
    return await this.levelCards.allTextContents();
  }
}

export class TestsPage extends BasePage {
  readonly testCards: Locator;
  readonly pageTitle: Locator;
  readonly backButton: Locator;
  readonly startTestButtons: Locator;

  constructor(page: Page) {
    super(page);
    this.testCards = page.getByTestId("test-card");
    this.pageTitle = page.getByRole("heading", { level: 1 });
    this.backButton = page.getByRole("link", { name: /wróć|back/i });
    this.startTestButtons = page.getByRole("button", { name: /start|rozpocznij/i });
  }

  get url(): string {
    return "/levels/";
  }

  async getTestCount(): Promise<number> {
    return await this.testCards.count();
  }

  async clickTest(index: number): Promise<void> {
    // Click the Start button inside the test card
    await this.testCards.nth(index).getByRole("button").click();
  }

  async clickTestByTitle(title: string | RegExp): Promise<void> {
    await this.testCards.filter({ hasText: title }).click();
  }

  async expectTestsDisplayed(): Promise<void> {
    await expect(this.testCards.first()).toBeVisible();
  }

  async expectTestCount(count: number): Promise<void> {
    await expect(this.testCards).toHaveCount(count);
  }

  async goBack(): Promise<void> {
    await this.backButton.click();
  }
}
