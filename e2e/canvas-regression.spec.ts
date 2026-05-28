import { expect, test } from '@playwright/test';

const login = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.locator('form.login-panel')).toBeVisible();

  await page.locator('input[name="email"]').fill('techlead@pdi.local');
  await page.locator('input[name="password"]').fill('techlead123');
  await page.getByRole('button', { name: /enter platform/i }).click();

  await expect(page.locator('.canvas-shell')).toBeVisible();
};

test.describe('Canvas critical regression', () => {
  test('should login and open board canvas', async ({ page }) => {
    await login(page);
    await expect(page.locator('.canvas-stage')).toBeVisible();
    await expect(page.locator('app-canvas-node').first()).toBeVisible();
  });

  test('should open command palette and navigate to PDI portfolio', async ({ page }) => {
    await login(page);

    await page.keyboard.press('Control+K');
    await expect(page.getByRole('heading', { name: /command palette/i })).toBeVisible();

    await page.getByRole('button', { name: /open pdis/i }).click();
    await expect(page.getByRole('heading', { name: /pdi portfolio/i })).toBeVisible();
  });

  test('should create a text node and keep zoom controls working', async ({ page }) => {
    await login(page);

    const nodesBefore = await page.locator('app-canvas-node').count();
    await page.locator('app-canvas-toolbar button[title="Add Text"]').click();
    await expect.poll(async () => page.locator('app-canvas-node').count()).toBeGreaterThan(nodesBefore);

    await page.getByRole('button', { name: /zoom in/i }).click();
    await expect(page.locator('.canvas-zoom-controls span')).not.toHaveText('100%');
    await page.getByRole('button', { name: /reset zoom/i }).click();
    await expect(page.locator('.canvas-zoom-controls span')).toHaveText('100%');
  });
});
