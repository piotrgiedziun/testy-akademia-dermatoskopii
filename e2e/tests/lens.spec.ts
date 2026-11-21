import { test, expect, devices } from "@playwright/test";
import { LensPage } from "../page-objects/lens.page";
import { loginAsUser } from "../utils/auth-helpers";
import { testUsers } from "../fixtures/test-data/users";

/**
 * "Beneath the Lens" (/lens/): the 3D explainer framed by the app.
 * The scene renders with WebGL; in headless CI that is SwiftShader, so loading is slow (generous timeouts).
 */

test.describe.configure({ timeout: 120000 });

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (err) => console.log("[PAGE ERROR]", err.message));
});

test.describe("Beneath the Lens - access", () => {
  test("requires login and returns to the requested chapter afterwards", async ({ page }) => {
    await page.goto("/lens/#atlas");
    await page.waitForURL(/\/login/);

    await page.getByLabel(/email/i).fill(testUsers.regular.email);
    await page.getByLabel(/password|hasło/i).fill(testUsers.regular.password);
    await page.getByRole("main").getByRole("button", { name: /log\s*in|zaloguj/i }).click();

    await page.waitForURL(/\/lens\/#atlas$/);
    const lens = new LensPage(page);
    await lens.waitForLens();
    await lens.expectChapter("06");
  });

  test("the lens page cannot be opened outside the app", async ({ page }) => {
    await loginAsUser(page, testUsers.regular);
    await page.goto("/lens-app/index.html#evo");
    await page.waitForURL(/\/lens\/#evo$/);
  });

  test("the projector view is for admins only", async ({ page }) => {
    await loginAsUser(page, testUsers.regular);
    await page.goto("/lens/projector");
    await page.waitForURL(/\/levels/);
  });

  test("offers a way back when the 3D view cannot load", async ({ page }) => {
    await loginAsUser(page, testUsers.regular);
    // as on a dropped connection: the explainer's script never arrives
    await page.route(/\/lens-app\/engine\.js/, (route) => route.abort());
    await page.goto("/lens/");

    const lens = new LensPage(page);
    await expect(lens.frame.locator("#loading")).toContainText(/did not load|nie udało się/i);
    const problem = page.getByRole("alert");
    await expect(problem).toBeVisible();
    await expect(problem.getByRole("button", { name: /try again|spróbuj ponownie/i })).toBeVisible();
    await problem.getByRole("button", { name: /^(back|wstecz)$/i }).click();
    await page.waitForURL(/\/levels/);
  });
});

test.describe("Beneath the Lens - regular user", () => {
  test("shows the explainer without presenter controls, keeps the chapter in the URL, exits to the app", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await loginAsUser(page, testUsers.regular);
    await page.getByRole("link", { name: /beneath the lens|pod soczewką/i }).first().click();
    await page.waitForURL(/\/lens\//);

    const lens = new LensPage(page);
    await lens.waitForLens();
    await expect(lens.presenterControls).toHaveCount(0);
    await expect(lens.frameElement).not.toHaveAttribute("src", /role=presenter/);

    await lens.chapterButton(6).click();
    await lens.expectChapter("07");
    await expect(page).toHaveURL(/\/lens\/#evo$/);

    await lens.exitLink.click();
    await expect(page).toHaveURL(/\/levels/);
    expect(errors).toEqual([]);
  });
});

test.describe("Beneath the Lens - phone", () => {
  // the Pixel 7 profile without its defaultBrowserType, which cannot be set inside a describe
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("fits a phone screen: chapters, notes and dock visible, nothing overflows", async ({ page }) => {
    await loginAsUser(page, testUsers.regular);
    await page.goto("/lens/#atlas");
    const lens = new LensPage(page);
    await lens.waitForLens();

    await expect(lens.exitLink).toBeVisible();
    await expect(lens.frame.locator("#dockIn")).toBeVisible();
    await expect(lens.frame.locator("#panel")).toBeVisible();
    const overflow = await lens.frameElement.evaluate((el) => {
      const doc = (el as HTMLIFrameElement).contentDocument!;
      return doc.documentElement.scrollWidth - doc.documentElement.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Beneath the Lens - admin presentation", () => {
  test("starts a presentation, drives the projector window and ends it", async ({ page, context }) => {
    await loginAsUser(page, testUsers.admin);
    await page.goto("/lens/");
    const lens = new LensPage(page);
    await lens.waitForLens();
    await expect(lens.presenterStatus).toContainText(/not presenting|nieaktywna/i);

    const popupPromise = context.waitForEvent("page");
    await lens.presenterControls.getByRole("button", { name: /start presentation|rozpocznij/i }).click();
    const projector = await popupPromise;
    await expect(projector).toHaveURL(/\/lens\/projector$/);
    await expect(lens.presenterStatus).toContainText(/projector connected|projektor połączony/i, { timeout: 60000 });

    // the projector follows the presenter
    await lens.chapterButton(4).click();
    const projectorFrame = projector.frameLocator("iframe[src^='/lens-app/']");
    await expect(projectorFrame.locator("#audCap")).toContainText("05", { timeout: 15000 });

    // controls and their shortcuts (pressed while focus is on the app, outside the frame)
    const notes = lens.presenterControls.getByRole("button", { name: /notes on screen|notatki/i });
    await notes.click();
    await expect(notes).toHaveAttribute("aria-pressed", "true");
    await expect(projectorFrame.locator("body")).toHaveClass(/\bnotes\b/);
    await page.keyboard.press("b");
    await expect(projectorFrame.locator("body")).toHaveClass(/\bblank\b/);

    const closed = projector.waitForEvent("close");
    await lens.presenterControls.getByRole("button", { name: /^(end|zakończ)$/i }).click();
    await closed;
    await expect(lens.presenterStatus).toContainText(/not presenting|nieaktywna/i);
  });
});
