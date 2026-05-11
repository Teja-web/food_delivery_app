/**
 * Team Track — Step 2: Source candidates
 *
 * Uploads resumes, verifies AI extraction (phone, location, skills),
 * confirms cross-entity matching, and creates a talent pool.
 */

import { dirname, join } from "path";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";
import {
  extractId,
  verifyCandidateExtraction,
  verifyCandidateIntelligence,
  verifyMatchesForRole,
  verifyPoolMembers,
} from "../../helpers/verify";
import { readState, writeState } from "../../helpers/state";

const __dirname = dirname(fileURLToPath(import.meta.url));
const state = readState();

test.describe.serial("02 · Source Candidates", () => {
  test.beforeEach(async ({ page }) => {
    await page.addLocatorHandler(
      page.locator("[data-name='nextstep-overlay']"),
      async (overlay) => {
        try {
          await overlay.locator("button").first().click({ timeout: 2_000 });
          await overlay.waitFor({ state: "hidden", timeout: 3_000 });
        } catch {
          await page.evaluate(() => {
            document.querySelectorAll("[data-name='nextstep-overlay']").forEach((el) => el.remove());
          });
        }
      },
    );
  });

  test("2a. upload resumes and verify candidate intake DAG", async ({ page }) => {
    test.setTimeout(300_000);

    const fixturesDir = join(__dirname, "..", "..", "fixtures", "resumes");
    const resumeFiles = readdirSync(fixturesDir).filter((f) =>
      /\.(pdf|docx?|txt|rtf|md|html)$/i.test(f)
    );
    expect(resumeFiles.length).toBeGreaterThan(0);

    await page.goto("/recruit/candidates/new");
    await dismissTourIfVisible(page);
    await page
      .getByText("Upload resumes", { exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(resumeFiles.map((f) => join(fixturesDir, f)));

    const submitBtn = page.getByRole("button", { name: /Save \d+ candidates?|Add \d+ candidates?|Add candidate/i });
    await expect(submitBtn).toBeEnabled({ timeout: 120_000 });
    await submitBtn.click();

    await page.waitForURL(/\/recruit\/candidates\/?$/, { timeout: 30_000 });

    const candidateLinks = page.locator('a[href*="/recruit/candidates/"]').filter({ hasNotText: /Add candidate/ });
    await expect(candidateLinks.first()).toBeVisible({ timeout: 15_000 });
    await candidateLinks.first().click();
    await page.waitForURL(/\/recruit\/candidates\/[^/]+$/);
    state.candidateUrls = [page.url()];

    await expect(
      page.getByText(/[A-D]{1,3}\s|AAA|AA\+?|BBB|CCC|Score|Talent/i).first()
    ).toBeVisible({ timeout: 180_000 });

    await page.goto("/recruit/candidates");
    const allLinks = page.locator('a[href*="/recruit/candidates/"]').filter({ hasNotText: /Add candidate/ });
    if ((await allLinks.count()) >= 2) {
      await allLinks.nth(1).click();
      await page.waitForURL(/\/recruit\/candidates\/[^/]+$/);
      state.candidateUrls.push(page.url());

      await expect(
        page.getByText(/[A-D]{1,3}\s|AAA|AA\+?|BBB|CCC|Score|Talent/i).first()
      ).toBeVisible({ timeout: 180_000 });
    }

    writeState({ candidateUrls: state.candidateUrls });
  });

  test("2a-verify. AI extraction quality — phone, location, skills", async ({ request }) => {
    test.setTimeout(120_000);

    expect(state.candidateUrls.length).toBeGreaterThan(0);

    for (const url of state.candidateUrls) {
      const candidateId = extractId(url);

      await verifyCandidateExtraction(request, candidateId, {
        phone: null,
        location: null,
        skills: { min: 1 },
      });

      let intel: any = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          intel = await verifyCandidateIntelligence(request, candidateId, {
            hasProfile: true,
            hasTalentScore: true,
          });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 5_000));
        }
      }
      expect(intel, `Intelligence for candidate ${candidateId}`).not.toBeNull();
    }
  });

  test("2a-matches. cross-entity matching triggered for both roles", async ({ request }) => {
    test.setTimeout(120_000);

    const roleId1 = extractId(state.roleUrl);
    const roleId2 = extractId(state.roleUrl2);

    await verifyMatchesForRole(request, roleId1, {
      minCount: 1,
      minFitScore: 1,
      hasRecommendation: true,
    });

    await verifyMatchesForRole(request, roleId2, {
      minCount: 1,
      minFitScore: 1,
      hasRecommendation: true,
    });
  });

  test("2b. edit candidate details — mutation persists", async ({ page }) => {
    test.setTimeout(60_000);

    expect(state.candidateUrls.length).toBeGreaterThan(0);
    await page.goto(`${state.candidateUrls[0]}/edit`);
    await page.waitForURL(/\/recruit\/candidates\/[^/]+\/edit$/);

    const phoneField = page.locator('input[type="tel"]');
    await expect(phoneField).toBeVisible({ timeout: 10_000 });
    await phoneField.fill("+1 (555) 999-0000");

    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.waitForURL(/\/recruit\/candidates\/[^/]+$/, { timeout: 15_000 });

    await page.goto(`${state.candidateUrls[0]}/edit`);
    const savedPhone = page.locator('input[type="tel"]');
    await expect(savedPhone).toHaveValue("+1 (555) 999-0000", { timeout: 10_000 });
  });

  test("2c. create pool and verify auto-population", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto("/recruit/pools/new");
    await dismissTourIfVisible(page);
    const nameInput = page.getByPlaceholder("Senior Backend Engineers");
    await nameInput.waitFor({ state: "visible" });

    await nameInput.fill("Backend Engineers");
    const descField = page.locator("textarea").first();
    if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await descField.fill("Senior backend engineers with Python or Node.js experience.");
    }

    const createBtn = page.getByRole("button", { name: /Create/i }).first();
    await expect(createBtn).toBeEnabled({ timeout: 10_000 });
    await createBtn.click();

    await page.waitForURL(
      (url) =>
        /\/recruit\/pools\/[a-zA-Z0-9_-]+$/.test(url.pathname) &&
        !url.pathname.endsWith("/new"),
      { timeout: 30_000 },
    );
    state.poolUrl = page.url();
    writeState({ poolUrl: state.poolUrl });

    await expect(
      page.locator('a[href*="/recruit/candidates/"]').first()
    ).toBeVisible({ timeout: 90_000 });

    const poolId = extractId(state.poolUrl);
    await verifyPoolMembers(request, poolId, { minCount: 1 });
  });

  test("2d. pool appears in pools list with member count", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/pools");
    await expect(page.getByText("Backend Engineers").first()).toBeVisible({ timeout: 15_000 });
  });
});
