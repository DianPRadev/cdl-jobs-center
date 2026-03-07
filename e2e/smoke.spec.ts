import { test, expect } from "@playwright/test";

// ─── Public Pages ────────────────────────────────────────────────────────────

test.describe("Public pages load without errors", () => {
  test("Homepage loads with hero and nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.locator("text=CDL").first()).toBeVisible();
    // Hero section visible — text varies by role
    await expect(page.locator("text=Find the Trucking Job").or(page.locator("text=Find the CDL Drivers")).first()).toBeVisible();
  });

  test("Jobs page loads and shows listings or empty state", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.locator("nav")).toBeVisible();
    // Wait for spinner to disappear (loading done)
    await expect(page.locator('[aria-label="Loading"]')).toBeHidden({ timeout: 15_000 });
    // Should show job cards OR "No jobs found" message
    const hasJobs = await page.locator('[class*="border-border"]').count();
    const hasEmpty = await page.locator("text=No jobs found").count();
    expect(hasJobs > 0 || hasEmpty > 0).toBeTruthy();
  });

  test("Jobs page filters render", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.locator('[aria-label="Loading"]')).toBeHidden({ timeout: 15_000 });
    // Search input exists
    await expect(page.locator('input[placeholder*="Company"]').first()).toBeVisible();
  });

  test("Companies page loads", async ({ page }) => {
    await page.goto("/companies");
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.locator('[aria-label="Loading"]')).toBeHidden({ timeout: 15_000 });
  });

  test("Apply Now page loads", async ({ page }) => {
    await page.goto("/apply");
    await expect(page.locator("nav")).toBeVisible();
    // Should show the multi-step application form
    await expect(page.locator("text=Apply").first()).toBeVisible();
  });

  test("Pricing page loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.locator("text=Pricing").first()).toBeVisible();
  });

  test("Privacy policy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("text=Privacy").first()).toBeVisible();
  });

  test("Terms of service page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("text=Terms").first()).toBeVisible();
  });

  test("Sign in page loads", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.locator("text=Sign In").first()).toBeVisible();
  });

  test("404 page for unknown route", async ({ page }) => {
    await page.goto("/this-does-not-exist");
    await expect(page.locator("text=404").or(page.locator("text=not found")).first()).toBeVisible();
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe("Navigation works", () => {
  test("Navbar links navigate correctly", async ({ page }) => {
    await page.goto("/");

    // Click Apply Now link in nav (Jobs is a dropdown, so test Apply Now directly)
    await page.locator("nav").getByRole("link", { name: /Apply Now/i }).first().click();
    await expect(page).toHaveURL(/\/apply/);

    // Click Companies link
    await page.locator("nav").getByRole("link", { name: /Companies/i }).first().click();
    await expect(page).toHaveURL(/\/companies/);
  });

  test("Jobs page → Job detail → back works", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.locator('[aria-label="Loading"]')).toBeHidden({ timeout: 15_000 });

    // Click first job card link if any jobs exist
    const jobLink = page.locator('a[href^="/jobs/"]').first();
    if (await jobLink.isVisible()) {
      await jobLink.click();
      await expect(page).toHaveURL(/\/jobs\/.+/);
      // Back button should exist
      const backBtn = page.locator('button[aria-label="Go back"]');
      if (await backBtn.isVisible()) {
        await backBtn.click();
        await expect(page).toHaveURL(/\/jobs/);
      }
    }
  });

  test("Logo links to homepage", async ({ page }) => {
    await page.goto("/jobs");
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
  });
});

// ─── Protected Routes (unauthenticated) ──────────────────────────────────────

test.describe("Protected routes redirect when not signed in", () => {
  test("Driver dashboard redirects to signin", async ({ page }) => {
    await page.goto("/driver-dashboard");
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });

  test("Company dashboard redirects to signin", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });

  test("Admin dashboard redirects to signin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });

  test("Drivers directory requires auth", async ({ page }) => {
    await page.goto("/drivers");
    // Should show access restriction or redirect
    const restricted = page.locator("text=Company Access Only").or(page.locator("text=Sign In"));
    await expect(restricted.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Console Errors ──────────────────────────────────────────────────────────

test.describe("No critical console errors", () => {
  const criticalPages = ["/", "/jobs", "/companies", "/apply", "/pricing", "/signin"];

  for (const path of criticalPages) {
    test(`${path} has no uncaught errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(path);
      await page.waitForTimeout(3_000);

      // Filter out known non-critical errors
      const critical = errors.filter(
        (e) =>
          !e.includes("ResizeObserver") &&
          !e.includes("Script error") &&
          !e.includes("ChunkLoadError"),
      );
      expect(critical).toEqual([]);
    });
  }
});

// ─── Responsiveness ──────────────────────────────────────────────────────────

test.describe("Mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Homepage renders on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible();
    // Mobile menu button should exist
    await expect(page.locator('button[aria-label*="menu" i], button[aria-label*="Menu" i]').first()).toBeVisible();
  });

  test("Jobs page renders on mobile", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.locator('[aria-label="Loading"]')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("nav")).toBeVisible();
  });
});

// ─── Network Health ──────────────────────────────────────────────────────────

test.describe("API health", () => {
  test("Supabase API is reachable from jobs page", async ({ page }) => {
    let supabaseResponded = false;
    page.on("response", (res) => {
      if (res.url().includes("supabase.co") && res.status() < 500) {
        supabaseResponded = true;
      }
    });

    await page.goto("/jobs");
    await page.waitForTimeout(5_000);
    expect(supabaseResponded).toBeTruthy();
  });

  test("No 500 errors on public pages", async ({ page }) => {
    const serverErrors: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    for (const path of ["/", "/jobs", "/companies", "/apply", "/pricing"]) {
      await page.goto(path);
      await page.waitForTimeout(2_000);
    }
    expect(serverErrors).toEqual([]);
  });
});
