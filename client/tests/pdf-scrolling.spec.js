import { test, expect } from '@playwright/test';

async function openChart(page, { role = 'coder', failPdf = false, failTiming = false } = {}) {
  const events = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || error.message));
  // Observe real browser saves. No API mocks or backend are involved.
  await page.exposeFunction('timingSaved', event => events.push(event));
  await page.addInitScript(({ role, failTiming }) => {
    sessionStorage.setItem('chartwatch-demo-user', role === 'admin' ? '1' : '2');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'chartwatch-demo-v1') {
        if (failTiming) throw new Error('Test save failure');
        const before = JSON.parse(this.getItem(key) || '{"times":{}}').times;
        const after = JSON.parse(value).times;
        for (const [id, pages] of Object.entries(after)) {
          for (const [number, seconds] of Object.entries(pages)) {
            const delta = seconds - (before[id]?.[number] || 0);
            if (delta > 0) window.timingSaved({ chart_id: Number(id.split(':')[1]), page_number: Number(number), time_spent_seconds: delta });
          }
        }
      }
      return original.call(this, key, value);
    };
  }, { role, failTiming });
  if (failPdf) await page.route('**/charts/*.pdf', route => route.fulfill({ contentType: 'application/pdf', body: 'invalid pdf' }));
  await page.goto('./');
  await page.getByRole('button', { name: /Demo Wellness Chart/ }).click();
  if (!failPdf) {
    await expect(page.locator('.pdfViewer .page').first().locator('canvas')).toBeVisible();
    if (role === 'coder') await expect(page.getByText('Recording visible-page time')).toBeVisible();
  }
  return { events, errors };
}

async function scrollTo(page, number) {
  // Move the actual PDF scroll container, not the app's page-number controls.
  await page.locator('.pdf-scroll-container').evaluate((container, number) => {
    container.scrollTop = container.querySelector(`[data-page-number="${number}"]`).offsetTop;
  }, number);
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue(String(number));
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
}

test('PDF wheel scrolling updates the page indicator and records the page left behind', async ({ page }) => {
  const { events, errors } = await openChart(page);
  await page.screenshot({ path: test.info().outputPath('pdf-scrolling.png') });
  await page.locator('.pdf-scroll-container').hover();
  const height = await page.locator('.pdfViewer .page').first().evaluate(el => el.offsetHeight);
  await page.mouse.wheel(0, height);
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('2');
  await expect.poll(() => events.some(e => e.page_number === 1 && e.time_spent_seconds > 0)).toBe(true);
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await scrollTo(page, 1);
  await expect.poll(() => events.some(e => e.page_number === 2)).toBe(true);
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await expect.poll(() => events.filter(e => e.page_number === 1).length).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('page-number jumps and long charts use the same visibility tracking', async ({ page }) => {
  const { events, errors } = await openChart(page);
  await page.getByRole('spinbutton', { name: 'Current page' }).fill('70');
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('70');
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).toHaveValue('71');
  await expect.poll(() => events.some(e => e.page_number === 70)).toBe(true);
  expect(events.every(e => [1, 70, 71].includes(e.page_number))).toBe(true);
  expect(await page.locator('.pdfViewer canvas').count()).toBeLessThan(20);
  expect(errors).toEqual([]);
});

test('visibility pause excludes hidden time and periodic saves do not overlap', async ({ page }) => {
  const { events } = await openChart(page);
  await page.clock.install();
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Timing paused')).toBeVisible();
  await expect.poll(() => events.length).toBeGreaterThan(0);
  const pausedCount = events.length;
  await page.clock.runFor(60000);
  expect(events.length).toBe(pausedCount);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(31000);
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  await expect.poll(() => events.length).toBeGreaterThan(pausedCount);
  expect(events.reduce((total, e) => total + e.time_spent_seconds, 0)).toBeLessThan(35);
});

test('admin scrolling records no timing', async ({ page }) => {
  const { events, errors } = await openChart(page, { role: 'admin' });
  await page.locator('.pdf-scroll-container').evaluate(el => { el.scrollTop = 1700; });
  await expect(page.getByRole('spinbutton', { name: 'Current page' })).not.toHaveValue('1');
  await page.getByRole('button', { name: 'Charts', exact: true }).click();
  expect(events).toEqual([]);
  expect(errors).toEqual([]);
});

test('bad PDFs show an error without timing', async ({ page }) => {
  const { events } = await openChart(page, { failPdf: true });
  await expect(page.getByRole('alert')).toContainText('Unable to load chart');
  expect(events).toEqual([]);
});

test('failed timing saves are visible to the coder', async ({ page }) => {
  await openChart(page, { failTiming: true });
  await scrollTo(page, 2);
  await expect(page.getByRole('alert')).toContainText('Some timing data was not saved');
});

test('narrow screens keep the PDF scrollable and page timing follows it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { events, errors } = await openChart(page);
  await scrollTo(page, 3);
  await expect.poll(() => events.some(e => e.page_number === 1)).toBe(true);
  const sizes = await page.locator('.pdf-scroll-container').evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight }));
  expect(sizes.height).toBeGreaterThan(200);
  expect(sizes.scrollHeight).toBeGreaterThan(sizes.height);
  expect(errors).toEqual([]);
});

test('retrying a failed document starts a fresh viewer and timing session', async ({ page }) => {
  const { events, errors } = await openChart(page, { failPdf: true });
  await expect(page.getByRole('alert')).toContainText('Unable to load chart');
  await page.unroute('**/charts/*.pdf');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Recording visible-page time')).toBeVisible();
  await scrollTo(page, 2);
  await expect.poll(() => events.some(e => e.page_number === 1)).toBe(true);
  expect(errors).toEqual([]);
});

test('scroll timing attributes exact durations and revisits produce 2.4 PPM', async ({ page }) => {
  // Control only the elapsed-time clock. PDF rendering, scroll events, and browser
  // saves still run in Chromium, without waiting 75 real seconds.
  await page.addInitScript(() => {
    window.reviewTimeMs = 0;
    Object.defineProperty(performance, 'now', { value: () => window.reviewTimeMs });
  });
  const { events, errors } = await openChart(page);
  const setTime = milliseconds => page.evaluate(value => { window.reviewTimeMs = value; }, milliseconds);

  await setTime(20000);
  await scrollTo(page, 2); // Page 1: 20 seconds.
  await setTime(50000);
  await scrollTo(page, 3); // Page 2: 30 seconds.
  await setTime(65000);
  await scrollTo(page, 1); // Page 3: 15 seconds.
  await setTime(75000);
  await page.getByRole('button', { name: 'Charts', exact: true }).click(); // Revisit: 10 seconds.

  await expect.poll(() => events.length).toBe(4);
  // Compare totals per page: save notification order is not guaranteed.
  const secondsByPage = {};
  for (const event of events) {
    expect(event.chart_id).toBe(1);
    secondsByPage[event.page_number] = (secondsByPage[event.page_number] || 0) + event.time_spent_seconds;
  }
  expect(secondsByPage).toEqual({ 1: 30, 2: 30, 3: 15 });
  const recordedSeconds = Object.values(secondsByPage).reduce((total, seconds) => total + seconds, 0);
  const distinctPages = Object.keys(secondsByPage).length;
  expect(recordedSeconds).toBe(75);
  expect(distinctPages * 60 / recordedSeconds).toBe(2.4);
  expect(errors).toEqual([]);
});
