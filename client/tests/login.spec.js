import { test, expect } from '@playwright/test';

for (const role of ['Admin', 'Coder']) {
  test(`demo ${role} signs in and survives refresh without API requests`, async ({ page }) => {
    const apiRequests = [];
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
    await page.goto('./');
    await page.getByRole('button', { name: `Sign in as demo ${role}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Patient Charts' })).toBeVisible();
    await expect(page.locator('.chart-card')).toHaveCount(3);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Patient Charts' })).toBeVisible();
    expect(apiRequests).toEqual([]);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });
}

test('invalid demo credentials allow another attempt', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use one of the demo accounts');
  await page.getByRole('button', { name: 'Sign in as demo Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Patient Charts' })).toBeVisible();
});
