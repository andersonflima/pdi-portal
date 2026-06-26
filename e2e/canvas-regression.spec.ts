import { expect, test } from './fixtures';

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

  test('should filter the command palette and run the active result with Enter', async ({ page }) => {
    await login(page);

    await page.keyboard.press('Control+K');
    const search = page.getByRole('textbox', { name: /search commands/i });
    await search.fill('report');

    await expect(page.getByRole('button', { name: /open report/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /open board/i })).toHaveCount(0);

    await search.press('Enter');
    await expect(page.getByRole('heading', { name: /command palette/i })).toBeHidden();
  });

  test('should create a text node and keep zoom controls working', async ({ page }) => {
    await login(page);

    const nodesBefore = await page.locator('app-canvas-node').count();
    await page.getByRole('button', { exact: true, name: 'Text 4 Annotate' }).click();
    await expect.poll(async () => page.locator('app-canvas-node').count()).toBeGreaterThan(nodesBefore);

    await page.getByRole('button', { name: /zoom in/i }).click();
    await expect(page.locator('.canvas-zoom-controls span')).not.toHaveText('100%');
    await page.getByRole('button', { name: /reset zoom/i }).click();
    await expect(page.locator('.canvas-zoom-controls span')).toHaveText('100%');
  });

  test('should create toolbar nodes with shortcuts without stacking them at the same position', async ({ page }) => {
    await login(page);

    const nodesBefore = await page.locator('app-canvas-node').count();

    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('3');

    await expect.poll(async () => page.locator('app-canvas-node').count()).toBe(nodesBefore + 3);

    const nodeRects = await page.locator('app-canvas-node').evaluateAll((nodes) =>
      nodes.map((node) => {
        const element = node as HTMLElement;

        return {
          bottom: Number.parseFloat(element.style.top) + Number.parseFloat(element.style.height),
          left: Number.parseFloat(element.style.left),
          right: Number.parseFloat(element.style.left) + Number.parseFloat(element.style.width),
          top: Number.parseFloat(element.style.top)
        };
      })
    );
    const createdRects = nodeRects.slice(-3);
    const existingRects = nodeRects.slice(0, -3);
    const hasOverlap = (leftRect: (typeof nodeRects)[number], rightRect: (typeof nodeRects)[number]) =>
      !(leftRect.right <= rightRect.left || leftRect.left >= rightRect.right || leftRect.bottom <= rightRect.top || leftRect.top >= rightRect.bottom);

    expect(new Set(createdRects.map((rect) => `${rect.left}:${rect.top}`)).size).toBe(3);
    expect(createdRects.some((createdRect) => existingRects.some((existingRect) => hasOverlap(createdRect, existingRect)))).toBe(false);
  });

  test('should drag a node even when an edge crosses over its center point', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);

    const node = page.locator('app-canvas-node').nth(4);
    const hitTargetTag = await node.evaluate((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target?.tagName ?? null;
    });
    const before = await node.evaluate((element) => ({
      left: Number.parseFloat((element as HTMLElement).style.left),
      top: Number.parseFloat((element as HTMLElement).style.top)
    }));
    const box = await node.boundingBox();

    expect(box).not.toBeNull();
    expect(hitTargetTag).not.toBe('path');

    if (!box) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () =>
        node.evaluate((element) => ({
          left: Number.parseFloat((element as HTMLElement).style.left),
          top: Number.parseFloat((element as HTMLElement).style.top)
        }))
      )
      .toEqual({
        left: before.left + 120,
        top: before.top + 60
      });
  });

  test('should export the board as downloadable SVG and PNG files', async ({ page }) => {
    await login(page);

    const svgDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export SVG' }).click();
    expect((await svgDownload).suggestedFilename()).toMatch(/\.svg$/);

    const pngDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PNG' }).click();
    expect((await pngDownload).suggestedFilename()).toMatch(/\.png$/);
  });
});
