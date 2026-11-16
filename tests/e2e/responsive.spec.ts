import { expect, test, type Page } from '@playwright/test';

// Phone, iPad portrait/landscape, laptop and desktop widths.
const viewports = [
  { name: 'phone 320', width: 320, height: 640 },
  { name: 'phone 390', width: 390, height: 844 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
];
const pages = ['/', '/requests', '/my', '/requests/1', '/requests/new', '/unassigned', '/team'];

for (const vp of viewports) {
  test(`no sideways scrolling on ${vp.name} (${vp.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await overflow(page)).toBe(0);

    await page.getByLabel('Email').fill('growin@deskflow.test');
    await page.getByLabel('Password', { exact: true }).fill('Deskflow!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await overflow(page), `${path} at ${vp.width}px`).toBe(0);
    }
  });
}

/** Pixels the page is wider than the viewport (0 = no horizontal scroll). */
function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
