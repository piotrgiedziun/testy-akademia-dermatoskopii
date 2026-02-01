import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

export class CommunityPage extends BasePage {
  readonly pageTitle: Locator;
  readonly createCaseButton: Locator;
  readonly caseCards: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole("heading", { name: /community|społeczność/i });
    this.createCaseButton = page.getByRole("link", { name: /share case|udostępnij/i }).first();
    this.caseCards = page.locator('[data-testid="community-case-card"]');
  }

  get url(): string {
    return "/community";
  }

  async clickCreateCase(): Promise<void> {
    await this.createCaseButton.click();
  }

  async clickCaseByTitle(title: string): Promise<void> {
    await this.page.getByText(title).first().click();
  }

  async expectCasesDisplayed(): Promise<void> {
    // Wait for loading to finish first
    await this.waitForPageLoad();
    // Then wait for either cases or the "no cases" text
    await this.page.waitForSelector('[data-testid="community-case-card"], h3:has-text("No cases"), h3:has-text("Brak przypadków")', {
      timeout: 15000,
    });
  }
}

export class CreateCasePage extends BasePage {
  readonly pageTitle: Locator;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly imageUpload: Locator;
  readonly includeDiagnosisCheckbox: Locator;
  readonly diagnosisInput: Locator;
  readonly histopathologyInput: Locator;
  readonly publishButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole("heading", { name: /share case|udostępnij/i });
    this.titleInput = page.getByLabel(/case title|tytuł/i);
    this.descriptionInput = page.getByPlaceholder(/describe|opisz/i);
    this.imageUpload = page.locator('input[type="file"]');
    this.includeDiagnosisCheckbox = page.getByLabel(/include diagnosis|dołącz diagnozę/i);
    this.diagnosisInput = page.getByLabel(/^diagnosis$|^diagnoza$/i);
    this.histopathologyInput = page.getByLabel(/histopathology|histopatolog/i);
    this.publishButton = page.getByRole("button", { name: /publish|opublikuj/i });
    this.cancelButton = page.getByRole("button", { name: /cancel|anuluj/i });
  }

  get url(): string {
    return "/community/create";
  }

  async fillCaseDetails(title: string, description: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.descriptionInput.fill(description);
  }

  async uploadImage(imagePath: string): Promise<void> {
    await this.imageUpload.setInputFiles(imagePath);
  }

  async addDiagnosis(diagnosis: string, histopathology?: string): Promise<void> {
    await this.includeDiagnosisCheckbox.check();
    await this.diagnosisInput.fill(diagnosis);
    if (histopathology) {
      await this.histopathologyInput.fill(histopathology);
    }
  }

  async publish(): Promise<void> {
    await this.publishButton.click();
  }
}

export class CaseDetailPage extends BasePage {
  readonly caseTitle: Locator;
  readonly caseDescription: Locator;
  readonly caseAuthor: Locator;
  readonly editButton: Locator;
  readonly flagButton: Locator;
  readonly diagnosisSection: Locator;
  readonly commentsSection: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    super(page);
    this.caseTitle = page.getByTestId("case-title");
    this.caseDescription = page.getByTestId("case-description");
    this.caseAuthor = page.getByTestId("case-author");
    this.editButton = page.getByRole("link", { name: /^edit$|^edytuj$/i });
    this.flagButton = page.getByRole("button", { name: /report|zgłoś/i });
    this.diagnosisSection = page.locator('[data-testid="diagnosis-section"]');
    this.commentsSection = page.getByTestId("comments-section");
    this.backButton = page.getByRole("link", { name: /back|wstecz/i });
  }

  get url(): string {
    return "/community/case";
  }

  async expectCaseLoaded(title: string): Promise<void> {
    await expect(this.caseTitle).toContainText(title);
  }

  async clickEdit(): Promise<void> {
    await this.editButton.click();
  }

  async expectEditButtonVisible(): Promise<void> {
    await expect(this.editButton).toBeVisible();
  }

  async expectEditButtonNotVisible(): Promise<void> {
    await expect(this.editButton).not.toBeVisible();
  }
}

export class EditCasePage extends BasePage {
  readonly pageTitle: Locator;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly imageUpload: Locator;
  readonly existingImages: Locator;
  readonly removeImageButtons: Locator;
  readonly includeDiagnosisCheckbox: Locator;
  readonly diagnosisInput: Locator;
  readonly histopathologyInput: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.getByRole("heading", { name: /edit case|edytuj/i });
    this.titleInput = page.getByLabel(/case title|tytuł/i);
    this.descriptionInput = page.getByPlaceholder(/describe|opisz/i);
    this.imageUpload = page.locator('input[type="file"]');
    this.existingImages = page.locator('img[alt^="Preview"]');
    this.removeImageButtons = page.locator('button:has(svg path[d*="4.293"])');
    this.includeDiagnosisCheckbox = page.getByLabel(/include diagnosis|dołącz diagnozę/i);
    this.diagnosisInput = page.getByLabel(/^diagnosis$|^diagnoza$/i);
    this.histopathologyInput = page.getByLabel(/histopathology|histopatolog/i);
    this.saveButton = page.getByRole("button", { name: /save changes|zapisz zmiany/i });
    this.cancelButton = page.getByRole("button", { name: /cancel|anuluj/i });
  }

  get url(): string {
    return "/community/case/.*/edit";
  }

  async updateTitle(title: string): Promise<void> {
    await this.titleInput.clear();
    await this.titleInput.fill(title);
  }

  async updateDescription(description: string): Promise<void> {
    await this.descriptionInput.clear();
    await this.descriptionInput.fill(description);
  }

  async addDiagnosis(diagnosis: string, histopathology?: string): Promise<void> {
    const isChecked = await this.includeDiagnosisCheckbox.isChecked();
    if (!isChecked) {
      await this.includeDiagnosisCheckbox.check();
    }
    await this.diagnosisInput.clear();
    await this.diagnosisInput.fill(diagnosis);
    if (histopathology) {
      await this.histopathologyInput.clear();
      await this.histopathologyInput.fill(histopathology);
    }
  }

  async saveChanges(): Promise<void> {
    await this.saveButton.click();
  }

  async expectExistingImagesLoaded(): Promise<void> {
    await expect(this.existingImages.first()).toBeVisible({ timeout: 10000 });
  }
}
