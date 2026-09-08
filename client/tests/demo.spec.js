import { test, expect } from '@playwright/test';

const signIn = (page, role) => page.getByRole('button', { name: `Sign in as demo ${role}`, exact: true }).click();

test('review totals persist, appear in analytics, and reset to the sample data', async ({ page }) => {
  const apiRequests = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.addInitScript(() => {
    window.reviewTimeMs = 0;
    Object.defineProperty(performance, 'now', { value: () => window.reviewTimeMs });
  });
  await page.goto('./');
  await signIn(page, 'Coder');
  await page.getByRole('button', { name: /Demo Wellness Chart/ }).click();
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await page.evaluate(() => { window.reviewTimeMs = 30000; });
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('spinbutton')).toHaveValue('2');
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await page.evaluate(() => { window.reviewTimeMs = 60000; });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'Admin');
  await page.reload();
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.locator('.coder-row').filter({ hasText: 'jsmith' }).click();
  await expect(page.locator('.detail-chart-meta').first()).toHaveText('2 pgs · 1 min');
  await expect(page.locator('.detail-chart-card').first().locator('.ppm-badge')).toContainText('2.00 ppm');
  await page.locator('.detail-chart-header').first().click();
  await expect(page.locator('.trend-bar-label')).toHaveText('1-10');
  await page.getByRole('button', { name: 'Flagged', exact: true }).click();
  await expect(page.locator('.coder-row')).not.toHaveCount(0);
  await expect(page.locator('.coder-row').filter({ hasText: 'jsmith' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await signIn(page, 'Admin');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.locator('.coder-row').filter({ hasText: 'jsmith' }).click();
  await expect(page.locator('.detail-chart-meta').first()).toHaveText('0 pgs · 0 min');
  expect(apiRequests).toEqual([]);
});

test('a local PDF can be imported, assigned, and reviewed without uploading it', async ({ page }) => {
  await page.goto('./');
  await signIn(page, 'Admin');
  await page.getByLabel('Import PDF', { exact: true }).setInputFiles('public/charts/demo_wellness_81pg.pdf');
  await expect(page.locator('.chart-card')).toHaveCount(4);
  await page.getByLabel('Chart', { exact: true }).selectOption({ label: 'demo_wellness_81pg.pdf' });
  await page.getByLabel('Coder', { exact: true }).selectOption({ label: 'jsmith' });
  await page.getByRole('button', { name: 'Assign chart', exact: true }).click();
  await expect(page.getByText('Chart assigned. The coder can now open it from their Charts tab.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn(page, 'Coder');
  await page.getByRole('button', { name: /demo_wellness_81pg.pdf/ }).click();
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await page.reload();
  await expect(page.locator('.chart-card')).toHaveCount(3);
});

test('invalid imports report an error without adding a chart', async ({ page }) => {
  await page.goto('./');
  await signIn(page, 'Admin');
  await page.getByLabel('Import PDF', { exact: true }).setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await expect(page.getByRole('status')).toContainText('Import failed');
  await expect(page.locator('.chart-card')).toHaveCount(3);
});

test('reset during an active review discards the final timer interval', async ({ page }) => {
  await page.goto('./');
  await signIn(page, 'Coder');
  await page.getByRole('button', { name: /Demo Wellness Chart/ }).click();
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await signIn(page, 'Admin');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.locator('.coder-row').filter({ hasText: 'jsmith' }).click();
  await expect(page.locator('.detail-chart-meta').first()).toHaveText('0 pgs · 0 min');
});
