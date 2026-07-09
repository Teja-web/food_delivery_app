import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { dismissTourIfVisible } from "./tours";

/**
 * Navigate the role wizard: fill basics, add competencies, submit.
 * Waits for AI generation between steps (no arbitrary timeouts).
 */
export async function createRoleViaWizard(
  page: Page,
  opts: {
    title: string;
    description?: string;
    competencies: string[];
  },
) {
  const continueBtn = page.getByRole("button", { name: /Continue/i });
  const submitBtn = page.getByRole("button", { name: /Open role & start matching/i });

  // Step 1: Basics
  const titleInput = page.getByPlaceholder("e.g. Founding Sales Manager");
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  await titleInput.fill(opts.title);

  if (opts.description) {
    const descField = page.locator("textarea").first();
    if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await descField.fill(opts.description);
    }
  }

  // Step 1 → Step 2: Click Continue, wait for AI generation to finish
  await dismissTourIfVisible(page);
  await expect(continueBtn).toBeVisible({ timeout: 5_000 });
  await continueBtn.click();
  await waitForWizardGeneration(page);

  // Step 2: Criteria — add competencies
  const addCompBtn = page.getByText("Add competency");
  await expect(addCompBtn).toBeVisible({ timeout: 10_000 });
  for (const name of opts.competencies) {
    await addCompBtn.click();
    await page.locator("input[type='text']").last().fill(name);
  }

  // Step 2 → Step 3: Click Continue, wait for generation
  await expect(continueBtn).toBeVisible({ timeout: 5_000 });
  await continueBtn.click();
  await waitForWizardGeneration(page);

  // Step 3 → Step 4: Click Continue to reach Review (no generation)
  if (await continueBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await continueBtn.click();
  }

  // Submit on Review step
  await expect(submitBtn).toBeVisible({ timeout: 10_000 });
  await submitBtn.click();

  // Wait for navigation to role detail
  await page.waitForURL(
    (url) =>
      /\/recruit\/roles\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith("/new"),
    { timeout: 30_000 },
  );

  return page.url();
}

/**
 * Wait for the wizard's AI generation to complete.
 * Detects "Generating..." state and waits for it to finish.
 */
async function waitForWizardGeneration(page: Page) {
  const generatingIndicator = page.getByText("Generating...");
  // If generation started, wait for it to disappear
  const isGenerating = await generatingIndicator
    .isVisible({ timeout: 2_000 })
    .catch(() => false);

  if (isGenerating) {
    await generatingIndicator.waitFor({ state: "hidden", timeout: 60_000 });
  }
}
