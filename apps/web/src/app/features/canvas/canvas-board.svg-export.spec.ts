import { describe, expect, it } from 'vitest';
import { buildBoardSvgMarkup } from './canvas-board.svg-export';
import type { CanvasEdgeView, CanvasNodeView } from './canvas.models';

const node = (overrides: Partial<CanvasNodeView>): CanvasNodeView => ({
  color: '#2563eb',
  height: 120,
  id: 'n1',
  kind: 'NOTE',
  label: 'Hello',
  position: { x: 100, y: 100 },
  width: 200,
  zIndex: 1000,
  ...overrides
});

const edge = (overrides: Partial<CanvasEdgeView>): CanvasEdgeView => ({
  id: 'e1',
  source: 'a',
  target: 'b',
  style: { color: '#64748b', lineStyle: 'solid', type: 'smoothstep' },
  ...overrides
});

describe('buildBoardSvgMarkup', () => {
  it('produces a sized svg document for an empty board', () => {
    const { markup, width, height } = buildBoardSvgMarkup({ renderedNodes: [], nodes: [], edges: [] });

    expect(markup).toContain('<svg');
    expect(markup).toContain('grid-pattern');
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('renders a note shape and its text', () => {
    const { markup } = buildBoardSvgMarkup({
      renderedNodes: [node({ label: 'Read a book' })],
      nodes: [node({ label: 'Read a book' })],
      edges: []
    });

    expect(markup).toContain('<polygon'); // note fold shape
    expect(markup).toContain('Read a book');
  });

  it('renders shape variants (diamond) distinctly', () => {
    const { markup } = buildBoardSvgMarkup({
      renderedNodes: [node({ kind: 'SHAPE', variant: 'DIAMOND' })],
      nodes: [],
      edges: []
    });

    expect(markup).toContain('<polygon points="100,0'); // diamond top vertex at width/2
  });

  it('escapes text content to keep the svg valid', () => {
    const { markup } = buildBoardSvgMarkup({
      renderedNodes: [node({ label: 'a & b < c' })],
      nodes: [node({ label: 'a & b < c' })],
      edges: []
    });

    expect(markup).toContain('a &amp; b &lt; c');
    expect(markup).not.toContain('a & b < c');
  });

  it('renders edges with arrow markers between nodes', () => {
    const source = node({ id: 'a', position: { x: 0, y: 0 } });
    const target = node({ id: 'b', position: { x: 400, y: 0 } });

    const { markup } = buildBoardSvgMarkup({
      renderedNodes: [source, target],
      nodes: [source, target],
      edges: [edge({ source: 'a', target: 'b', label: 'depends on' })]
    });

    expect(markup).toContain('<marker');
    expect(markup).toContain('marker-end="url(#export-edge-arrow-head');
    expect(markup).toContain('depends on');
  });
});
