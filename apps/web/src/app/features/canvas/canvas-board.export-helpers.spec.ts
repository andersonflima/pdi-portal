import { describe, expect, it } from 'vitest';
import {
  escapeXml,
  toExportBounds,
  toFileName,
  toFiniteNumber,
  toNodeFillColor,
  toNodeTextLines,
  toTextAnchor,
  toTextX,
  wrapSvgLineToWidth
} from './canvas-board.export-helpers';
import type { CanvasNodeView } from './canvas.models';

const node = (overrides: Partial<CanvasNodeView>): CanvasNodeView => ({
  color: '#2563eb',
  height: 100,
  id: 'n',
  kind: 'NOTE',
  label: 'n',
  position: { x: 0, y: 0 },
  width: 100,
  zIndex: 1000,
  ...overrides
});

describe('escapeXml', () => {
  it('escapes the five XML-significant characters', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &#39; f');
  });
});

describe('toFileName', () => {
  it('slugifies and strips accents, keeping the extension', () => {
    expect(toFileName('Plano de Ação 2026!', 'svg')).toBe('plano-de-acao-2026.svg');
  });

  it('falls back to a default name when empty', () => {
    expect(toFileName('   ', 'png')).toBe('pdi-board.png');
  });
});

describe('toTextAnchor / toTextX', () => {
  it('maps alignment to an SVG anchor', () => {
    expect(toTextAnchor('center')).toBe('middle');
    expect(toTextAnchor('right')).toBe('end');
    expect(toTextAnchor(undefined)).toBe('start');
  });

  it('computes the anchor x position', () => {
    expect(toTextX('middle', 200, 12)).toBe(100);
    expect(toTextX('end', 200, 12)).toBe(188);
    expect(toTextX('start', 200, 12)).toBe(12);
  });
});

describe('toNodeTextLines', () => {
  it('renders checklist items with checkbox glyphs', () => {
    const lines = toNodeTextLines(
      node({ kind: 'TASK_LIST', taskItems: [{ id: 'a', label: 'Step', checked: true }] })
    );
    expect(lines).toEqual(['✓ Step']);
  });

  it('renders a single task with its checkbox state', () => {
    expect(toNodeTextLines(node({ kind: 'TASK', label: 'Do it', checked: false }))).toEqual(['□ Do it']);
  });

  it('splits multi-line labels for other kinds', () => {
    expect(toNodeTextLines(node({ label: 'a\nb' }))).toEqual(['a', 'b']);
  });
});

describe('toFiniteNumber', () => {
  it('falls back for non-finite values', () => {
    expect(toFiniteNumber(42, 0)).toBe(42);
    expect(toFiniteNumber(Number.NaN, 7)).toBe(7);
    expect(toFiniteNumber(Number.POSITIVE_INFINITY, 7)).toBe(7);
  });
});

describe('wrapSvgLineToWidth', () => {
  it('wraps long text into multiple lines', () => {
    const wrapped = wrapSvgLineToWidth('one two three four five', 60, 14);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join(' ')).toBe('one two three four five');
  });

  it('returns a single empty entry for blank input', () => {
    expect(wrapSvgLineToWidth('   ', 100, 14)).toEqual(['']);
  });
});

describe('toExportBounds', () => {
  it('returns the full canvas when there are no sized nodes', () => {
    const bounds = toExportBounds([]);
    expect(bounds.minX).toBe(0);
    expect(bounds.minY).toBe(0);
    expect(bounds.width).toBeGreaterThan(0);
  });

  it('pads the bounding box around real nodes and clamps to the canvas', () => {
    const bounds = toExportBounds([node({ position: { x: 500, y: 400 }, width: 100, height: 80 })]);
    expect(bounds.minX).toBe(436); // 500 - 64 padding
    expect(bounds.minY).toBe(336); // 400 - 64 padding
    expect(bounds.width).toBeGreaterThan(100);
  });
});

describe('toNodeFillColor', () => {
  it('uses kind-specific defaults and honors explicit backgrounds', () => {
    expect(toNodeFillColor(node({ kind: 'TEXT' }))).toBe('transparent');
    expect(toNodeFillColor(node({ kind: 'NOTE' }))).toBe('#ffe08a');
    expect(toNodeFillColor(node({ kind: 'FRAME', backgroundColor: '#123456' }))).toBe('#123456');
    expect(toNodeFillColor(node({ kind: 'CARD' }))).toBe('#ffffff');
  });
});
