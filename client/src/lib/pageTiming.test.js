import test from 'node:test';
import assert from 'node:assert/strict';
import { mostVisiblePage, PageTimer } from './pageTiming.js';

const viewport = { top: 0, bottom: 100, left: 0, right: 100 };
const page = (number, top, bottom, right = 100) => ({ page: number, rect: { top, bottom, left: 0, right } });

test('choose by visible area, including mixed page sizes and ties', () => {
  assert.equal(mostVisiblePage([page(1, -90, 30), page(2, 40, 160)], viewport), 2);
  assert.equal(mostVisiblePage([page(1, 0, 60, 20), page(2, 60, 120)], viewport), 2);
  assert.equal(mostVisiblePage([page(1, -50, 50), page(2, 50, 150)], viewport, 2), 2);
  assert.equal(mostVisiblePage([page(1, 101, 200)], viewport), null);
});

test('scrolling, revisits and periodic saves preserve total time without double-counting', () => {
  let now = 0;
  const events = [];
  const timer = new PageTimer((page, seconds) => events.push({ page, seconds }), () => now);
  timer.select(1);
  now = 20000; timer.select(2);
  now = 50000; timer.flush();
  timer.select(2); // Repeated scroll/layout notifications must not reset timing.
  now = 65000; timer.select(1);
  now = 75000; timer.select(null);
  assert.deepEqual(events, [{ page: 1, seconds: 20 }, { page: 2, seconds: 30 }, { page: 2, seconds: 15 }, { page: 1, seconds: 10 }]);
  assert.equal(events.reduce((total, e) => total + e.seconds, 0), 75);
});

test('hidden or unrendered intervals are excluded; brief visible visits are retained', () => {
  let now = 0;
  const events = [];
  const timer = new PageTimer((page, seconds) => events.push({ page, seconds }), () => now);
  now = 5000; timer.select(1); // Loading time before this is excluded.
  now = 5100; timer.select(2);
  now = 5300; timer.select(null); // Pause while hidden or rendering.
  now = 65000; timer.flush();
  timer.select(9); // Jump must not invent visits to intervening pages.
  now = 66000; timer.select(null);
  timer.select(null); timer.flush(); // Repeated cleanup must not save twice.
  assert.deepEqual(events, [{ page: 1, seconds: 0.1 }, { page: 2, seconds: 0.2 }, { page: 9, seconds: 1 }]);
});
