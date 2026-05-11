/**
 * Team Track — Step 1: Recruiter creates role
 *
 * Creates roles via the wizard, verifies intake DAG completes,
 * and confirms role data chain integrity.
 */

import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";
import { createRoleViaWizard } from "../../helpers/wizard";
import { extractId, verifyRoleData } from "../../helpers/verify";
import { readState, writeState } from "../../helpers/state";

const state = readState();

test.describe.serial("01 · Create Role", () => {
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

  test("1a. create role with title and description", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/recruit/roles/new");
    await dismissTourIfVisible(page);

    state.roleUrl = await createRoleViaWizard(page, {
      title: "Senior Backend Engineer",
      description:
        "We are looking for a Senior Backend Engineer with 5+ years of experience in Node.js and Python. " +
        "The role involves designing scalable APIs, mentoring junior engineers, and driving architectural decisions.",
      competencies: ["System Design", "Node.js", "Technical Leadership"],
    });

    await expect(page.getByText("Senior Backend Engineer").first()).toBeVisible({ timeout: 10_000 });
    writeState({ roleUrl: state.roleUrl });
  });

  test("1b. verify role detail page updates after intake DAG", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(state.roleUrl);
    await expect(
      page.getByText(/On track|At risk|Stalled/i).first()
    ).toBeVisible({ timeout: 120_000 });
  });

  test("1b-verify. role data chain is complete after intake DAG", async ({ request }) => {
    test.setTimeout(30_000);

    const roleId = extractId(state.roleUrl);
    const role = await verifyRoleData(request, roleId, {
      hasCriteria: true,
      status: "open",
    });

    if (role.compensation) {
      expect(role.compensation.currency ?? role.compensation.min, "Compensation should have data").toBeTruthy();
    }
  });

  test("1c. edit role description — mutation persists", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto(`${state.roleUrl}/edit`);
    await page.waitForURL(/\/recruit\/roles\/[^/]+\/edit$/);

    const locationField = page.getByPlaceholder("e.g. Nairobi / Remote");
    await expect(locationField).toBeVisible({ timeout: 10_000 });
    await locationField.fill("Updated Remote");

    const reviewBtn = page.getByRole("button", { name: "Review" });
    await reviewBtn.click();
    await page.getByRole("button", { name: /Save changes/i }).click();
    await expect(page).toHaveURL(/\/recruit\/roles\/[^/]+$/, { timeout: 15_000 });

    await expect(page.getByText("Updated Remote")).toBeVisible({ timeout: 10_000 });
  });

  test("1d. create second role for cross-entity tests", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/recruit/roles/new");
    await dismissTourIfVisible(page);

    state.roleUrl2 = await createRoleViaWizard(page, {
      title: "Python Data Engineer",
      description:
        "Seeking a Data Engineer with strong Python skills, experience with ETL pipelines, " +
        "and familiarity with cloud data platforms like Snowflake or BigQuery.",
      competencies: ["Python", "ETL Pipelines", "Cloud Data Platforms"],
    });

    writeState({ roleUrl2: state.roleUrl2 });
  });

  test("1e. roles list shows both roles", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/roles");
    await expect(page.getByText("Senior Backend Engineer")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Python Data Engineer")).toBeVisible({ timeout: 15_000 });
  });
});
