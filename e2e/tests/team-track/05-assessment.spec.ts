/**
 * Team Track — Step 5: Assessment
 *
 * Creates assessment from template, edits questions, assigns to
 * candidates, and verifies results tab.
 */

import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";
import { readState, writeState } from "../../helpers/state";

const state = readState();

test.describe.serial("05 · Assessment", () => {
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

  test("5a. create assessment from template", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/recruit/assessments/new");
    await dismissTourIfVisible(page);
    await expect(page.getByText("Create an assessment")).toBeVisible({ timeout: 15_000 });

    const templateCard = page.getByText("General Aptitude Test");
    await expect(templateCard).toBeVisible({ timeout: 10_000 });
    await templateCard.click();

    const titleInput = page.locator('input[placeholder="e.g. Senior Engineer Technical Screen"]');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await expect(titleInput).toHaveValue("General Aptitude Test");

    await titleInput.clear();
    await titleInput.fill("Lifecycle Aptitude Assessment");

    const createBtn = page.getByRole("button", { name: /Create from template/i });
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    await page.waitForURL(/\/recruit\/assessments\/[^/]+$/, { timeout: 30_000 });
    state.assessmentUrl = page.url();
    writeState({ assessmentUrl: state.assessmentUrl });

    await expect(page.getByText("Lifecycle Aptitude Assessment")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Questions \(\d+\)/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Aptitude").first()).toBeVisible({ timeout: 5_000 });
  });

  test("5b. edit assessment — add a custom question", async ({ page }) => {
    test.setTimeout(120_000);

    expect(state.assessmentUrl).toBeTruthy();
    await page.goto(`${state.assessmentUrl}/edit`);
    await expect(page.getByText("Edit Assessment")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Questions \(\d+\)/)).toBeVisible({ timeout: 10_000 });

    const questionInput = page.locator('textarea[placeholder*="Enter question text"]');
    await expect(questionInput).toBeVisible({ timeout: 10_000 });
    await questionInput.fill("What is the output of 2 + 2 * 3?");

    const addBtn = page.getByRole("button", { name: "Add" });
    await expect(addBtn).toBeEnabled({ timeout: 5_000 });
    await addBtn.click();

    await expect(page.getByText("What is the output of 2 + 2 * 3?")).toBeVisible({ timeout: 10_000 });

    const statusTrigger = page.locator("label").filter({ hasText: "Status" }).locator("..").getByRole("combobox");
    await statusTrigger.click();
    await page.getByRole("option", { name: "Active" }).click();

    const saveBtn = page.getByRole("button", { name: "Save" }).first();
    await saveBtn.click();
    await page.waitForURL(/\/recruit\/assessments\/[^/]+$/, { timeout: 15_000 });

    await expect(page.getByText("Active").first()).toBeVisible({ timeout: 10_000 });
  });

  test("5c. assign assessment to candidates", async ({ page }) => {
    test.setTimeout(120_000);

    expect(state.assessmentUrl).toBeTruthy();
    expect(state.candidateUrls.length).toBeGreaterThan(0);

    await page.goto(state.assessmentUrl);
    await expect(page.getByText("Lifecycle Aptitude Assessment")).toBeVisible({ timeout: 15_000 });

    const assignBtn = page.getByRole("button", { name: "Assign" });
    await expect(assignBtn).toBeVisible({ timeout: 10_000 });
    await assignBtn.click();

    await expect(page.getByText("Assign Assessment")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('input[placeholder="Search candidates..."]')).toBeVisible({ timeout: 10_000 });

    await expect(
      page.locator(".divide-y button").first()
    ).toBeVisible({ timeout: 15_000 });

    const candidateButtons = page.locator(".divide-y button:not([disabled])");
    const candidateCount = await candidateButtons.count();
    expect(candidateCount).toBeGreaterThan(0);

    const toSelect = Math.min(candidateCount, 2);
    for (let i = 0; i < toSelect; i++) {
      await candidateButtons.nth(i).click();
    }

    await expect(page.getByText(`${toSelect} selected`)).toBeVisible({ timeout: 5_000 });

    const confirmAssignBtn = page.locator("button").filter({ hasText: "Assign" }).last();
    await confirmAssignBtn.click();

    await expect(page.getByText("Assign Assessment")).not.toBeVisible({ timeout: 10_000 });
  });

  test("5d. results tab shows assigned candidates", async ({ page }) => {
    test.setTimeout(60_000);

    expect(state.assessmentUrl).toBeTruthy();
    await page.goto(state.assessmentUrl);

    const resultsTab = page.getByRole("button", { name: "Results" });
    await expect(resultsTab).toBeVisible({ timeout: 10_000 });
    await resultsTab.click();

    await expect(page.getByText("pending").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Candidate").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Status").first()).toBeVisible({ timeout: 5_000 });
  });

  test("5e. assessment appears in list with correct metadata", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/assessments");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Lifecycle Aptitude Assessment")).toBeVisible({ timeout: 10_000 });
  });
});
