import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

type Role = "driver" | "company" | "admin";

const QA = {
  driverEmail: process.env.QA_DRIVER_EMAIL ?? "",
  driverPassword: process.env.QA_DRIVER_PASSWORD ?? "",
  companyEmail: process.env.QA_COMPANY_EMAIL ?? "",
  companyPassword: process.env.QA_COMPANY_PASSWORD ?? "",
  adminEmail: process.env.QA_ADMIN_EMAIL ?? "",
  adminPassword: process.env.QA_ADMIN_PASSWORD ?? "",
  supabaseUrl:
    process.env.QA_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  supabaseAnon:
    process.env.QA_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRole: process.env.QA_SUPABASE_SERVICE_ROLE_KEY ?? "",
};

const requiredCredsPresent = Boolean(
  QA.driverEmail &&
    QA.driverPassword &&
    QA.companyEmail &&
    QA.companyPassword &&
    QA.adminEmail &&
    QA.adminPassword,
);

const serviceClientReady = Boolean(
  QA.supabaseUrl && QA.supabaseServiceRole,
);

const runId = `SMOKE-${Date.now()}`;
const smokePrefix = `[${runId}]`;
const smokePassword = "SmokePass!12345";
const smokeJobTitle = `${smokePrefix} OTR Driver`;
const smokeJobDescription = `${smokePrefix} Automated full smoke coverage job`;

const createdEmails: string[] = [];
let smokeJobId: string | null = null;

const serviceClient: SupabaseClient | null = serviceClientReady
  ? createClient(QA.supabaseUrl, QA.supabaseServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function uniqueEmail(prefix: string) {
  return `qa+${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

async function clearSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function loginAs(page: Page, role: Role) {
  const credsByRole = {
    driver: { email: QA.driverEmail, password: QA.driverPassword },
    company: { email: QA.companyEmail, password: QA.companyPassword },
    admin: { email: QA.adminEmail, password: QA.adminPassword },
  };
  const creds = credsByRole[role];

  await page.goto("/signin");
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /^Sign In$/ }).click();

  await page.waitForLoadState("domcontentloaded");
  await completeOnboardingIfNeeded(page, role);
  await expect(page).not.toHaveURL(/\/signin/, { timeout: 20_000 });
}

async function completeOnboardingIfNeeded(page: Page, role: Role) {
  if (!page.url().includes("/onboarding")) return;

  if (role === "company") {
    await page.getByRole("button", { name: /I'?m a Company/i }).click();
    await page.locator("#ob-company-name").fill(`QA ${smokePrefix} Logistics`);
    await page.locator("#ob-contact-name").fill("QA Recruiter");
    await page.locator("#ob-company-phone").fill("(555) 111-2222");
  } else {
    await page.getByRole("button", { name: /I'?m a Driver/i }).click();
    await page.locator("#ob-first-name").fill("Smoke");
    await page.locator("#ob-last-name").fill("Driver");
    await page.locator("#ob-phone").fill("(555) 333-4444");
  }

  await page.getByRole("button", { name: /Complete Setup/i }).click();
  await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 30_000 });
}

async function signupViaSignIn(page: Page, role: "driver" | "company", email: string) {
  await page.goto("/signin");
  await page.getByRole("button", { name: "Create Account" }).last().click();
  await expect(page.getByText("Create Your Account")).toBeVisible();

  await page.getByRole("button", { name: role === "driver" ? "Driver" : "Company" }).first().click();

  if (role === "driver") {
    await page.locator("#first-name").fill("Smoke");
    await page.locator("#last-name").fill("Driver");
    await page.locator("#driver-phone").fill("(555) 000-1001");
  } else {
    await page.locator("#company-name").fill(`QA ${smokePrefix} Carrier`);
    await page.locator("#contact-name").fill("Smoke Recruiter");
    await page.locator("#company-phone").fill("(555) 000-1002");
  }

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(smokePassword);
  await page.locator("form").getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByText("Check Your Email").first()).toBeVisible({ timeout: 20_000 });
  createdEmails.push(email);
}

async function signupViaHeroModal(page: Page, role: "driver" | "company", email: string) {
  await page.goto("/");
  await page
    .locator("main")
    .getByRole("button", { name: /Apply Now|Quick Apply - It's Free/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByText("Create Your Account")).toBeVisible();
  await dialog.getByRole("button", { name: role === "driver" ? "Driver" : "Company" }).first().click();

  if (role === "driver") {
    await dialog.locator("#modal-first-name").fill("Hero");
    await dialog.locator("#modal-last-name").fill("Driver");
    await dialog.locator("#modal-driver-phone").fill("(555) 000-2001");
  } else {
    await dialog.locator("#modal-company-name").fill(`Hero ${smokePrefix} Freight`);
    await dialog.locator("#modal-contact-name").fill("Hero Recruiter");
    await dialog.locator("#modal-company-phone").fill("(555) 000-2002");
    await dialog.getByRole("button", { name: /Additional Details/i }).click();
    await dialog.locator("#modal-address").fill("123 Smoke St, Chicago, IL");
    await dialog.locator("#modal-website").fill("https://example.com");
  }

  await dialog.locator("#modal-email").fill(email);
  await dialog.locator("#modal-password").fill(smokePassword);
  await dialog.getByRole("button", { name: "Create Account" }).click();

  await expect(dialog.getByText("Check Your Email").first()).toBeVisible({ timeout: 20_000 });
  createdEmails.push(email);
}

async function requestPasswordReset(page: Page) {
  await page.goto("/signin");
  await page.locator("#email").fill(QA.driverEmail);
  await page.getByRole("button", { name: /Forgot password\?/i }).click();
  await expect(page.getByText("Password reset email sent!", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
}

async function createSmokeJobFromCompanyDashboard(page: Page) {
  await page.goto("/dashboard?tab=jobs");
  await expect(page.getByRole("button", { name: /Post New Job/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /Post New Job/i }).click();

  await page.locator("#job-title").fill(smokeJobTitle);
  await page.locator("#job-location").fill("Illinois");
  await page.locator("#job-pay").fill("$0.70 / mile");
  await page.locator("#job-description").fill(smokeJobDescription);
  await page.getByRole("button", { name: /Save Job/i }).click();

  await expect(page.getByText(smokeJobTitle)).toBeVisible({ timeout: 20_000 });

  if (!serviceClient) return;
  const { data, error } = await serviceClient
    .from("jobs")
    .select("id")
    .eq("title", smokeJobTitle)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  smokeJobId = data?.id ?? null;
}

async function submitApplicationForSmokeJob(page: Page) {
  if (!smokeJobId) {
    throw new Error("Smoke job ID not available for apply test.");
  }

  await page.goto(`/jobs/${smokeJobId}`);
  await page.getByRole("button", { name: /Submit an Application/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.locator("#modal-firstName").fill("Smoke");
  await page.locator("#modal-lastName").fill("Applicant");
  await page.locator("#modal-email").fill(QA.driverEmail);
  await page.locator("#modal-phone").fill("(555) 888-9000");
  await page.locator("#modal-cdlNumber").fill("CDL-SMOKE-001");
  await page.locator("#modal-zipCode").fill("60601");

  await page.locator("#modal-driverType").click();
  await page.getByRole("option", { name: "Company Driver" }).click();

  await page.locator("#modal-licenseClass").click();
  await page.getByRole("option", { name: "Class A" }).click();

  await page.locator("#modal-yearsExp").click();
  await page.getByRole("option", { name: /1/i }).first().click();

  await page.locator("#modal-licenseState").click();
  await page.getByRole("option", { name: "Illinois" }).click();

  await page.locator("#modal-notes").fill(`${smokePrefix} application`);
  await page.getByRole("button", { name: /Send Application/i }).click();

  await expect(page.getByText("Application submitted", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
}

async function verifyApplicationPersisted() {
  if (!serviceClient || !smokeJobId) return;

  const { data, error } = await serviceClient
    .from("applications")
    .select("id")
    .eq("job_id", smokeJobId)
    .ilike("notes", `%${smokePrefix}%`)
    .limit(1);

  if (error) throw error;
  expect((data ?? []).length).toBeGreaterThan(0);
}

async function cleanupSmokeArtifacts() {
  if (!serviceClient) return;

  await serviceClient.from("applications").delete().ilike("notes", `%${smokePrefix}%`);
  await serviceClient.from("jobs").delete().eq("title", smokeJobTitle);

  if (createdEmails.length > 0) {
    const userIdsToDelete = new Set<string>();
    let page = 1;
    let keepFetching = true;

    while (keepFetching) {
      const { data, error } = await serviceClient.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) break;

      const users = data.users ?? [];
      for (const user of users) {
        const email = user.email?.toLowerCase() ?? "";
        if (createdEmails.some((candidate) => candidate.toLowerCase() === email)) {
          userIdsToDelete.add(user.id);
        }
      }

      keepFetching = users.length === 200;
      page += 1;
    }

    for (const userId of userIdsToDelete) {
      await serviceClient.auth.admin.deleteUser(userId);
    }
  }
}

test.describe("Full authenticated smoke", () => {
  test.skip(!requiredCredsPresent, "Missing QA_* driver/company/admin credentials.");

  test.afterAll(async () => {
    await cleanupSmokeArtifacts();
  });

  test("account lifecycle smoke (sign-up paths + reset request)", async ({ page }) => {
    const signInDriverEmail = uniqueEmail("signin-driver");
    const signInCompanyEmail = uniqueEmail("signin-company");
    const heroDriverEmail = uniqueEmail("hero-driver");
    const heroCompanyEmail = uniqueEmail("hero-company");

    await signupViaSignIn(page, "driver", signInDriverEmail);
    await signupViaSignIn(page, "company", signInCompanyEmail);
    await signupViaHeroModal(page, "driver", heroDriverEmail);
    await signupViaHeroModal(page, "company", heroCompanyEmail);
    await requestPasswordReset(page);
  });

  test("driver functionality smoke", async ({ page }) => {
    await loginAs(page, "driver");
    await page.goto("/driver-dashboard");
    await expect(page.getByText("Driver Dashboard").first()).toBeVisible();

    for (const tabName of ["My Applications", "AI Matches", "Saved Jobs", "Messages", "My Profile"]) {
      await page.getByRole("tab", { name: new RegExp(tabName, "i") }).click();
    }

    await page.getByRole("tab", { name: /My Profile/i }).click();
    const about = page.locator("#driver-about");
    await about.fill(`${smokePrefix} driver profile update`);
    await page.getByRole("button", { name: /Save Profile/i }).click();
    await expect(page.getByText("Profile saved", { exact: false })).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await page.getByRole("tab", { name: /My Profile/i }).click();
    await expect(page.locator("#driver-about")).toHaveValue(`${smokePrefix} driver profile update`);
  });

  test("company functionality + billing smoke", async ({ page }) => {
    await loginAs(page, "company");
    await page.goto("/dashboard");
    await expect(page.getByText("Company Dashboard").first()).toBeVisible();

    for (const tabName of ["Jobs", "Applications", "Pipeline", "Messages", "Leads", "Company Profile", "Subscription"]) {
      await page.getByRole("tab", { name: new RegExp(tabName, "i") }).click();
    }

    await createSmokeJobFromCompanyDashboard(page);

    await page.goto("/drivers");
    await expect(page.getByRole("navigation").filter({ hasText: "Home" }).first()).toBeVisible();

    // Billing portal smoke (UI path)
    await page.goto("/dashboard?tab=subscription");
    const openPortal = page.getByRole("button", { name: /Open Billing Portal/i });
    if (await openPortal.isVisible()) {
      await openPortal.click();
      await expect(page).toHaveURL(/stripe|billing|checkout|portal/i, { timeout: 25_000 });
    } else {
      // If no billing portal button (e.g. free/no Stripe linkage), validate checkout entry from pricing.
      await page.goto("/pricing");
      const paidCta = page
        .getByRole("button", { name: /Upgrade to|Switch to|Subscribe|Get Starter|Get Growth|Get Unlimited/i })
        .first();
      if (await paidCta.isVisible()) {
        await paidCta.click();
        await expect(page).toHaveURL(/stripe|checkout/i, { timeout: 20_000 });
      }
    }
  });

  test("driver apply flow end-to-end + access control smoke", async ({ page }) => {
    if (!smokeJobId) {
      await clearSession(page);
      await loginAs(page, "company");
      await createSmokeJobFromCompanyDashboard(page);
    }

    await clearSession(page);
    await loginAs(page, "driver");
    await submitApplicationForSmokeJob(page);
    await verifyApplicationPersisted();

    // Driver should not access company dashboard.
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/dashboard$/, { timeout: 10_000 });
  });

  test("admin functionality smoke", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");
    await expect(page.getByText("Admin Dashboard").first()).toBeVisible();

    for (const tabName of ["Users", "Subscriptions", "Jobs", "Leads", "Applications", "Verification"]) {
      await page.getByRole("button", { name: new RegExp(tabName, "i") }).first().click();
    }

    // Admin can access admin route, but company/driver routes are still protected by role.
    await page.goto("/driver-dashboard");
    await expect(page).not.toHaveURL(/\/driver-dashboard$/, { timeout: 10_000 });
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/dashboard$/, { timeout: 10_000 });
  });
});
