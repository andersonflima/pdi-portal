import { test as base, expect } from '@playwright/test';

/**
 * When E2E_API_URL is set, inject it as the runtime API base URL before the app
 * boots. This lets the suite point the web app at an API running on a non-default
 * port (e.g. when 3333 is occupied by another local service) without changing the
 * production default.
 */
const apiUrl = process.env['E2E_API_URL'];

export const test = base.extend({
  page: async ({ page }, use) => {
    if (apiUrl) {
      await page.addInitScript((url) => {
        (globalThis as unknown as { __PDI_API_URL__?: string }).__PDI_API_URL__ = url;
      }, apiUrl);
    }

    await use(page);
  }
});

export { expect };
