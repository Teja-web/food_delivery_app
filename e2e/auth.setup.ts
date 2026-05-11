import { test as setup, expect } from "@playwright/test";

const ADMIN_FILE = "e2e/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.locator("#email").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#email").fill("rdraju+admin@gmail.com");
  await page.locator("#password").fill("demo123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/sign-in"), {
    timeout: 15_000,
  });

  await page.context().storageState({ path: ADMIN_FILE });
});
