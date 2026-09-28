import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end journeys (Section 13). They need a running app pointed at a Supabase project and a
 * test account; set E2E_EMAIL and E2E_PASSWORD (and E2E_BASE_URL for a deployed preview).
 * Without them the journeys are skipped so CI stays hermetic.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are not set');

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test('create a DSW profile, answer the interview, see an estimate and generate a PDF', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Add profile' }).click();
  const name = `E2E DSW ${Date.now()}`;
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Search occupations').fill('NDIS');
  await page.getByRole('checkbox', { name: /Disability or community support worker/ }).check();
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByLabel('Financial year').selectOption('2025-26');
  await page.getByLabel('Purpose').selectOption('pre_lodgment');
  await page.getByRole('button', { name: 'Start year' }).click();
  await expect(page).toHaveURL(/\/interview\/core/);

  // Residency
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /Australian resident all year/ }).check();
  await page.getByRole('radio', { name: 'No', exact: true }).first().check();
  await page.getByRole('button', { name: 'Next' }).click();

  // Family, Medicare, PHI: answer via Not sure where unsure, never left blank silently
  await page.getByRole('radio', { name: 'No', exact: true }).first().check();
  await page.getByRole('button', { name: 'Next' }).click();

  // Employment: add an employer
  await page.getByRole('button', { name: /Add another employer|Add an employer/ }).click();
  await page.getByRole('textbox', { name: /payer|employer/i }).first().fill('Care Co');
  const gross = page.locator('[data-question-id="emp.employer.gross"] input');
  await gross.fill('62,000');
  await gross.blur();
  const withheld = page.locator('[data-question-id="emp.employer.withheld"] input');
  await withheld.fill('11000');
  await withheld.blur();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({ timeout: 10_000 });

  // The DSW deep module must be reachable, and no construction/chef questions may exist
  await page.goto(page.url().replace(/\/interview\/.*/, '/interview/deep_dsw'));
  await expect(page.getByRole('heading', { name: 'Support worker expenses' })).toBeVisible();
  await expect(page.locator('[data-question-id^="con."]')).toHaveCount(0);
  await expect(page.locator('[data-question-id^="chef."]')).toHaveCount(0);

  // Estimate and report
  await page.goto(page.url().replace(/\/interview\/.*/, '/estimate'));
  await expect(page.getByText(/Indicative (refund|debt)/)).toBeVisible();
  await page.getByRole('button', { name: /Generate draft report/ }).click();
  await page.goto(page.url().replace(/\/estimate.*/, '/reports'));
  const download = page.getByRole('link', { name: /Download PDF/ }).first();
  await expect(download).toBeVisible({ timeout: 30_000 });
});

test('a chef profile never sees support-worker questions', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Add profile' }).click();
  await page.getByLabel('Display name').fill(`E2E Chef ${Date.now()}`);
  await page.getByLabel('Search occupations').fill('chef');
  await page.getByRole('checkbox', { name: /^Chef/ }).check();
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.getByLabel('Financial year').selectOption('2025-26');
  await page.getByLabel('Purpose').selectOption('pre_lodgment');
  await page.getByRole('button', { name: 'Start year' }).click();
  await page.goto(page.url().replace(/\/interview\/.*/, '/interview/deep_chef'));
  await expect(page.locator('[data-question-id^="dsw."]')).toHaveCount(0);
  await expect(page.locator('[data-question-id^="chef."]').first()).toBeVisible();
});

test('login page is accessible and rejects bad credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
