import { Page, Locator, expect } from "@playwright/test";

export abstract class BasePage {
  readonly page: Page;
  readonly loadingSpinner: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loadingSpinner = page.getByTestId("loading-spinner");
    this.errorMessage = page.getByRole("alert");
  }

  abstract get url(): string;

  async navigate(): Promise<void> {
    await this.page.goto(this.url);
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded");
    // Wait for loading spinner to disappear if present
    if (await this.loadingSpinner.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.loadingSpinner.waitFor({ state: "hidden", timeout: 30000 });
    }
  }

  async expectToBeOnPage(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.url));
  }

  async expectNoErrors(): Promise<void> {
    await expect(this.errorMessage).not.toBeVisible();
  }

  async getErrorText(): Promise<string | null> {
    if (await this.errorMessage.isVisible()) {
      return await this.errorMessage.textContent();
    }
    return null;
  }

  async waitForNavigation(urlPattern: string | RegExp): Promise<void> {
    await this.page.waitForURL(urlPattern);
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `screenshots/${name}.png` });
  }
}
