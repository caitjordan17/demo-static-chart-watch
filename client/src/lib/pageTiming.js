// Pick one page by visible area, retaining the previous page on an exact tie.
export function mostVisiblePage(pages, viewport, previousPage = null) {
  let selected = null;
  let largestArea = 0;
  for (const { page, rect } of pages) {
    const width = Math.max(0, Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left));
    const height = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top));
    const area = width * height;
    if (area > largestArea || (area > 0 && area === largestArea && page === previousPage)) {
      selected = page;
      largestArea = area;
    }
  }
  return selected;
}

// A single running interval prevents overlapping time across pages and saves.
export class PageTimer {
  constructor(save, now = () => performance.now()) {
    this.save = save;
    this.now = now;
    this.page = null;
    this.startedAt = null;
  }

  select(page) {
    if (page === this.page) return;
    this.flush();
    this.page = page;
    this.startedAt = page === null ? null : this.now();
  }

  flush() {
    if (this.startedAt === null) return;
    const end = this.now();
    const seconds = (end - this.startedAt) / 1000;
    this.startedAt = end;
    // Keep short rendered-page visits: discarding them would hide fast scrolling.
    if (seconds > 0) this.save(this.page, seconds);
  }
}
