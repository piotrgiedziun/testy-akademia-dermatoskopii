import { Page, Locator, FrameLocator, expect } from "@playwright/test";
import { BasePage } from "./base.page";

/** "Beneath the Lens" at /lens/: the app page and the 3D explainer in its iframe. */
export class LensPage extends BasePage {
  readonly frameElement: Locator;
  readonly frame: FrameLocator;
  readonly presenterControls: Locator;
  readonly presenterStatus: Locator;
  readonly exitLink: Locator;
  readonly currentChapter: Locator;

  constructor(page: Page) {
    super(page);
    this.frameElement = page.locator("iframe[src^='/lens-app/']");
    this.frame = page.frameLocator("iframe[src^='/lens-app/']");
    this.presenterControls = page.getByRole("region", { name: /presenter|prezenter/i });
    this.presenterStatus = this.presenterControls.getByRole("status");
    this.exitLink = this.frame.locator("#exitBtn");
    this.currentChapter = this.frame.locator('#chapters button[aria-current="true"]');
  }

  get url(): string {
    return "/lens/";
  }

  /** Waits until the 3D scene is built (the lens's own loading screen has gone). */
  async waitForLens(): Promise<void> {
    await this.frame.locator("#loading.gone").waitFor({ state: "attached", timeout: 90000 });
  }

  chapterButton(index: number): Locator {
    return this.frame.locator(`#chapters button[data-ch="${index}"]`);
  }

  async expectChapter(number: string): Promise<void> {
    await expect(this.currentChapter).toContainText(number);
  }
}
