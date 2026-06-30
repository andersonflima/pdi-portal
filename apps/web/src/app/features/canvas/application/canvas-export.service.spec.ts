import { afterEach, describe, expect, it } from 'vitest';
import { CanvasExportService } from './canvas-export.service';

const service = new CanvasExportService();
const created: HTMLElement[] = [];

const build = (plane: HTMLElement | null, zoomScale: number) => {
  const result = service.createVisualExportNode(plane, [], zoomScale);
  if (result) created.push(result.node);
  return result;
};

afterEach(() => {
  while (created.length) created.pop()?.remove();
});

describe('CanvasExportService.createVisualExportNode', () => {
  it('returns null when there is no plane element', () => {
    expect(service.createVisualExportNode(null, [], 1)).toBeNull();
  });

  it('mounts an offscreen export node and removes it on cleanup', () => {
    const plane = document.createElement('div');
    const result = build(plane, 1);

    expect(result).not.toBeNull();
    expect(document.body.contains(result!.node)).toBe(true);
    expect(result!.width).toBeGreaterThan(0);
    expect(result!.height).toBeGreaterThan(0);

    result!.cleanup();

    expect(document.body.contains(result!.node)).toBe(false);
  });

  it('clamps a non-positive zoom scale to 1', () => {
    const result = build(document.createElement('div'), -5);
    const clone = result!.node.firstElementChild as HTMLElement;

    expect(clone.style.transform).toContain('scale(1)');
  });

  it('honors a valid zoom scale', () => {
    const result = build(document.createElement('div'), 2);
    const clone = result!.node.firstElementChild as HTMLElement;

    expect(clone.style.transform).toContain('scale(2)');
  });
});
