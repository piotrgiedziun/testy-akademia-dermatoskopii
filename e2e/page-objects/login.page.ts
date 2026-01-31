import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class LoginPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly googleLoginButton: Locator;
  readonly registerLink: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password|hasło/i);
    // Use the submit button specifically (inside main form)
    this.loginButton = page.getByRole("main").getByRole("button", { name: /log\s*in|zaloguj/i });
    this.googleLoginButton = page.getByRole("button", { name: /google/i });
    // Use the register link inside main form (not header)
    this.registerLink = page.getByRole("main").getByRole("link", { name: /register|zarejestruj/i });
    this.errorAlert = page.locator(".bg-red-50");
  }

  get url(): string {
    return "/login";
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectLoginError(): Promise<void> {
    await expect(this.errorAlert).toBeVisible();
  }

  async expectLoginErrorMessage(message: string | RegExp): Promise<void> {
    await expect(this.errorAlert).toContainText(message);
  }

  async clickRegisterLink(): Promise<void> {
    await this.registerLink.click();
  }

  async clickGoogleLogin(): Promise<void> {
    await this.googleLoginButton.click();
  }
}
