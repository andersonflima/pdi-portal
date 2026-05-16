import type { CanvasNodeKind, CanvasShapeVariant } from '@pdi/contracts';
import type { CanvasNodeMeta } from './canvas.models';

export const canvasSize = {
  height: 2400,
  width: 4000
};

export const canvasSurfaceColor = { blue: 239, green: 244, red: 246 };
export const whiteColor = { blue: 255, green: 255, red: 255 };
export const temporaryPasswordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export const nodeKindOrder: CanvasNodeKind[] = ['NOTE', 'STICKER', 'CARD', 'TEXT', 'TASK', 'TASK_LIST', 'GOAL', 'FRAME'];

export const shapeVariantOrder: CanvasShapeVariant[] = [
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'CIRCLE',
  'DIAMOND',
  'TRIANGLE',
  'PARALLELOGRAM',
  'HEXAGON',
  'CYLINDER',
  'DOCUMENT'
];

export const shapeVariantMeta: Record<CanvasShapeVariant, { iconName: string; label: string }> = {
  CIRCLE: { iconName: 'circle', label: 'Circle' },
  CLOUD: { iconName: 'cloud', label: 'Cloud' },
  CYLINDER: { iconName: 'database', label: 'Cylinder' },
  DIAMOND: { iconName: 'diamond', label: 'Diamond' },
  DOCUMENT: { iconName: 'file-text', label: 'Document' },
  HEXAGON: { iconName: 'hexagon', label: 'Hexagon' },
  PARALLELOGRAM: { iconName: 'square', label: 'Parallelogram' },
  RECTANGLE: { iconName: 'square', label: 'Rectangle' },
  ROUNDED_RECTANGLE: { iconName: 'square', label: 'Rounded' },
  TRIANGLE: { iconName: 'triangle', label: 'Triangle' }
};

export const nodeKindMeta: Record<CanvasNodeKind, CanvasNodeMeta> = {
  CARD: {
    action: 'Decision',
    color: '#0f766e',
    defaultDescription: 'Use cards for structured notes, decisions or references.',
    height: 150,
    iconName: 'trello',
    label: 'Card',
    width: 280
  },
  FRAME: {
    action: 'Group',
    color: '#475569',
    defaultDescription: 'Group related work inside this frame.',
    height: 260,
    iconName: 'frame',
    label: 'Frame',
    width: 420
  },
  GOAL: {
    action: 'Outcome',
    color: '#2563eb',
    defaultDescription: 'Describe the expected development outcome.',
    height: 168,
    iconName: 'goal',
    label: 'Goal',
    width: 168
  },
  NOTE: {
    action: 'Idea',
    color: '#facc15',
    defaultDescription: undefined,
    height: 170,
    iconName: 'sticky-note',
    label: 'Post-it',
    width: 190
  },
  SHAPE: {
    action: 'Diagram',
    color: '#7c3aed',
    defaultDescription: 'Use shapes to create areas, emphasis or diagrams.',
    height: 150,
    iconName: 'circle',
    label: 'Shape',
    width: 220
  },
  STICKER: {
    action: 'Mark',
    color: '#ec4899',
    defaultDescription: undefined,
    height: 128,
    iconName: 'sparkles',
    label: 'Sticker',
    width: 128
  },
  TASK: {
    action: 'Action',
    color: '#16a34a',
    defaultDescription: 'Action item with a clear owner and next step.',
    height: 128,
    iconName: 'check',
    label: 'Task',
    width: 260
  },
  TASK_LIST: {
    action: 'Steps',
    color: '#0891b2',
    defaultDescription: 'Checklist with multiple task steps.',
    height: 190,
    iconName: 'list-checks',
    label: 'Checklist',
    width: 300
  },
  TEXT: {
    action: 'Annotate',
    color: '#c2410c',
    defaultDescription: 'Free text for titles, labels and annotations.',
    height: 96,
    iconName: 'square-pen',
    label: 'Text',
    width: 300
  }
};
