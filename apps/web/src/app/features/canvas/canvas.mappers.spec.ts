import type { Board } from '@pdi/contracts';
import { describe, expect, it } from 'vitest';
import {
  createCanvasNode,
  defaultTaskItems,
  generateTemporaryPassword,
  toCanvasEdges,
  toCanvasNodes,
  toSaveBoard,
  toTaskItemsFromText
} from './canvas.mappers';
import { temporaryPasswordAlphabet } from './canvas.constants';
import type { CanvasNodeView } from './canvas.models';

const board = (nodes: Board['nodes'], edges: Board['edges'] = []): Board => ({
  id: 'b1',
  pdiPlanId: 'p1',
  title: 'Board',
  nodes,
  edges,
  updatedAt: '2026-01-01T00:00:00.000Z'
});

const boardNode = (overrides: Partial<Board['nodes'][number]>): Board['nodes'][number] => ({
  id: 'n1',
  kind: 'NOTE',
  label: 'Note',
  position: { x: 0, y: 0 },
  style: { color: '#2563eb' },
  ...overrides
});

describe('generateTemporaryPassword', () => {
  it('produces a 12-char password from the allowed alphabet', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(12);
    expect([...password].every((char) => temporaryPasswordAlphabet.includes(char))).toBe(true);
  });
});

describe('task items', () => {
  it('creates three default steps with unique ids', () => {
    const items = defaultTaskItems();
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it('maps text lines to task items, preserving prior checked state by index', () => {
    const current = [
      { id: 'a', label: 'old', checked: true },
      { id: 'b', label: 'old2', checked: false }
    ];
    const items = toTaskItemsFromText('First\n\n  Second  \nThird', current);

    expect(items.map((item) => item.label)).toEqual(['First', 'Second', 'Third']);
    expect(items[0]?.checked).toBe(true);
    expect(items[0]?.id).toBe('a');
    expect(items[2]?.id).toBeTruthy();
  });
});

describe('toCanvasNodes', () => {
  it('orders frames below objects and resolves absolute positions', () => {
    const nodes = toCanvasNodes(
      board([
        boardNode({ id: 'frame', kind: 'FRAME', position: { x: 10, y: 10 }, style: { color: '#475569' } }),
        boardNode({ id: 'child', parentId: 'frame', position: { x: 5, y: 5 } })
      ])
    );

    const frame = nodes.find((node) => node.id === 'frame');
    const child = nodes.find((node) => node.id === 'child');

    expect(nodes[0]?.id).toBe('frame');
    expect(frame?.zIndex).toBeLessThan(child?.zIndex ?? 0);
    expect(child?.position).toEqual({ x: 15, y: 15 });
  });

  it('squares circle shapes to the largest dimension', () => {
    const [node] = toCanvasNodes(
      board([
        boardNode({
          id: 'circle',
          kind: 'SHAPE',
          variant: 'CIRCLE',
          style: { color: '#7c3aed', width: 200, height: 120 }
        })
      ])
    );

    expect(node?.width).toBe(node?.height);
    expect(node?.width).toBe(200);
  });
});

describe('toCanvasEdges', () => {
  it('applies default edge styling', () => {
    const [edge] = toCanvasEdges(board([], [{ id: 'e1', source: 'a', target: 'b' }]));

    expect(edge?.style).toEqual({ color: '#64748b', lineStyle: 'solid', type: 'smoothstep' });
  });
});

describe('toSaveBoard', () => {
  it('round-trips relative positions for parented nodes', () => {
    const parent: CanvasNodeView = {
      color: '#475569',
      height: 200,
      id: 'frame',
      kind: 'FRAME',
      label: 'Frame',
      position: { x: 100, y: 100 },
      width: 200,
      zIndex: 1
    };
    const child: CanvasNodeView = {
      color: '#2563eb',
      height: 50,
      id: 'child',
      kind: 'NOTE',
      label: 'Child',
      parentId: 'frame',
      position: { x: 150, y: 150 },
      width: 50,
      zIndex: 1000
    };

    const saved = toSaveBoard('Board', [parent, child], []);
    const savedChild = saved.nodes.find((node) => node.id === 'child');

    expect(saved.title).toBe('Board');
    expect(savedChild?.position).toEqual({ x: 50, y: 50 });
  });
});

describe('createCanvasNode', () => {
  it('creates a frame with a low z-index and frame background', () => {
    const frame = createCanvasNode('FRAME', [], 0);
    expect(frame.kind).toBe('FRAME');
    expect(frame.backgroundColor).toBe('#f8fafc');
    expect(frame.zIndex).toBeLessThan(1000);
  });

  it('creates objects above the frame layer and increments z-index', () => {
    const first = createCanvasNode('CARD', [], 0);
    const second = createCanvasNode('CARD', [first], 1);

    expect(first.zIndex).toBeGreaterThanOrEqual(1000);
    expect(second.zIndex).toBeGreaterThan(first.zIndex);
  });

  it('uses variant labels for shapes and seeds task lists', () => {
    expect(createCanvasNode('SHAPE', [], 0, 'CIRCLE').label).toBe('Circle');
    expect(createCanvasNode('TASK_LIST', [], 0).taskItems).toHaveLength(3);
    expect(createCanvasNode('TEXT', [], 0).label).toBe('Write your text');
    expect(createCanvasNode('NOTE', [], 0).label).toBe('Write your note');
    expect(createCanvasNode('STICKER', [], 0).label).toBe('Priority');
  });
});
