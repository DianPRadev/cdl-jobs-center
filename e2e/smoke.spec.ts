import { expect, test, type Page } from "@playwright/test";

const publicPaths = ["/", "/jobs", "/companies", "/apply", "/pricing", "/signin"];

const headerLogo = (page: Page) =>
  page.getByRole("link", { name: /CDL Jobs Center/i }).first();

const topNav = (page: Page) => page.locator("nav").first();

const mainContent = (page: Page) => page.locator("main");

async function waitForLoaderToSettle(page: Page) {
  const loader = page.locator('[aria-label="Loading"]');
  if ((await loader.count()) > 0) {
    await expect(loader.first()).toBeHidden({ timeout: 15_000 });
  }
}

async function openMobileMenuIfNeeded(page: Page) {
  const openMenu = page.getByRole("button", { name: /Open menu/i });
  if (await openMenu.isVisible()) {
    await openMenu.click();
  }
}

test.describe("Public pages load without errors", () => {
  test("homepage loads with hero and nav", async ({ page }) => {
    await page.goto("/");
    await expect(headerLogo(page)).toBeVisible();
    await expect(
      mainContent(page)
        .getByText("Find the Trucking Job")
        .or(mainContent(page).getByText("Find the CDL Drivers"))
        .first(),
    ).toBeVisible();
  });

  test("jobs page loads and shows listings or empty state", async ({ page }) => {
    await page.goto("/jobs");
    await expect(headerLogo(page)).toBeVisible();
    await waitForLoaderToSettle(page);
    await page.waitForLoadState("networkidle");

    const jobLinks = await page.locator('a[href^="/jobs/"]').count();
    const emptyStateA = await mainContent(page)
      .getByText("No jobs found", { exact: false })
      .count();
    const emptyStateB = await mainContent(page)
      .getByText("No jobs match your filters", { exact: false })
      .count();
    const zeroJobsBadge = await mainContent(page)
      .getByText("(0 jobs)", { exact: false })
      .count();

    expect(jobLinks > 0 || emptyStateA > 0 || emptyStateB > 0 || zeroJobsBadge > 0).toBeTruthy();
  });

  test("jobs filters render", async ({ page }) => {
    await page.goto("/jobs");
    await waitForLoaderToSettle(page);
    await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible();
  });

  test("companies page loads", async ({ page }) => {
    await page.goto("/companies");
    await expect(headerLogo(page)).toBeVisible();
    await waitForLoaderToSettle(page);
  });

  test("apply page loads", async ({ page }) => {
    await page.goto("/apply");
    await expect(headerLogo(page)).toBeVisible();
    await expect(
      mainContent(page)
        .getByText("AI Job Matching", { exact: false })
        .or(mainContent(page).getByText("Sign in to find your matches", { exact: false }))
        .or(mainContent(page).getByText("Quick Apply", { exact: false }))
        .first(),
    ).toBeVisible();
  });

  test("pricing loads", async ({ page }) => {
    await page.goto("/pricing");
    await expect(headerLogo(page)).toBeVisible();
    await expect(
      mainContent(page)
        .getByText("Get Access to Driver Leads", { exact: false })
        .or(mainContent(page).getByText("Still not sure?", { exact: false }))
        .first(),
    ).toBeVisible();
  });

  test("privacy loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("Privacy").first()).toBeVisible();
  });

  test("terms loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText("Terms").first()).toBeVisible();
  });

  test("signin loads", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByText("Sign In").first()).toBeVisible();
  });

  test("unknown route returns 404 screen", async ({ page }) => {
    await page.goto("/this-does-not-exist");
    await expect(
      page.getByText("404").or(page.getByText("not found", { exact: false })).first(),
    ).toBeVisible();
  });
});

test.describe("Navigation works", () => {
  test("navbar links navigate correctly", async ({ page }) => {
    await page.goto("/");
    const nav = topNav(page);

    await openMobileMenuIfNeeded(page);
    await nav.getByRole("link", { name: /Apply Now|Find My Matches/i }).first().click();
    await expect(page).toHaveURL(/\/apply/);

    await openMobileMenuIfNeeded(page);
    await topNav(page).getByRole("link", { name: /Companies/i }).first().click();
    await expect(page).toHaveURL(/\/companies/);
  });

  test("job detail and back works", async ({ page }) => {
    await page.goto("/jobs");
    await waitForLoaderToSettle(page);

    const link = page.locator('a[href^="/jobs/"]').first();
    if (await link.isVisible()) {
      await link.click();
      await expect(page).toHaveURL(/\/jobs\/.+/);

      const backBtn = page.getByRole("button", { name: "Go back" });
      if (await backBtn.isVisible()) {
        await backBtn.click();
        await expect(page).toHaveURL(/\/jobs/);
      }
    }
  });

  test("logo links to homepage", async ({ page }) => {
    await page.goto("/jobs");
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Protected routes redirect when not signed in", () => {
  test("driver dashboard redirects to signin", async ({ page }) => {
    await page.goto("/driver-dashboard");
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });

  test("company dashboard redirects to signin", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });

  test("admin dashboard redirects to signin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/signin/, { timeout: 10_000 });
  });

  test("drivers directory requires auth", async ({ page }) => {
    await page.goto("/drivers");
    await expect(
      mainContent(page)
        .getByText("Company Access Only", { exact: false })
        .or(mainContent(page).getByText("Sign In as Company", { exact: false }))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("No critical console or network errors", () => {
  for (const path of publicPaths) {
    test(`${path} has no uncaught errors`, async ({ page }) => {
      const pageErrors: string[] = [];
      const responses500: string[] = [];

      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("response", (res) => {
        if (res.status() >= 500) responses500.push(`${res.status()} ${res.url()}`);
      });

      await page.goto(path);
      await page.waitForTimeout(3_000);

      const criticalErrors = pageErrors.filter(
        (e) =>
          !e.includes("ResizeObserver") &&
          !e.includes("Script error") &&
          !e.includes("ChunkLoadError"),
      );

      expect(criticalErrors).toEqual([]);
      expect(responses500).toEqual([]);
    });
  }
});

test.describe("Performance and security sanity", () => {
  test("key pages render without hard stalls", async ({ page }) => {
    for (const path of ["/", "/jobs", "/companies", "/pricing"]) {
      await page.goto(path);
      await expect(headerLogo(page)).toBeVisible({ timeout: 15_000 });
      await waitForLoaderToSettle(page);
    }
  });

  test("root response includes core security headers", async ({ request, baseURL }) => {
    const response = await request.fetch(`${baseURL ?? ""}/`, { method: "GET" });
    expect(response.status()).toBeLessThan(500);

    const headers = response.headers();
    expect(headers["content-security-policy"]).toBeTruthy();
    expect(headers["permissions-policy"]).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
