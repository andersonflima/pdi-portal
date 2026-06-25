import type { CanvasTextStyle, CanvasNodeView } from './canvas.models';
import { canvasSize } from './canvas.constants';

/**
 * Pure helpers for the board's SVG/PNG export pipeline. Extracted from the
 * canvas board component so the file stays focused on interaction/state; these
 * functions are side-effect free and unit tested.
 */

export type SvgTextAnchor = 'middle' | 'start' | 'end';

const exportBoundsPadding = 64;

export const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const toFileName = (title: string, extension: 'png' | 'svg') => {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${normalized || 'pdi-board'}.${extension}`;
};

export const toTextAnchor = (align?: CanvasTextStyle['align']): SvgTextAnchor => {
  if (align === 'center') return 'middle';
  if (align === 'right') return 'end';
  return 'start';
};

export const toTextX = (anchor: SvgTextAnchor, width: number, padding: number) => {
  if (anchor === 'middle') return width / 2;
  if (anchor === 'end') return Math.max(padding, width - padding);
  return padding;
};

export const getVerticalOffset = (
  verticalAlign: CanvasTextStyle['verticalAlign'],
  height: number,
  blockHeight: number,
  padding: number
) => {
  if (verticalAlign === 'center') return Math.max(padding, (height - blockHeight) / 2);
  if (verticalAlign === 'bottom') return Math.max(padding, height - blockHeight - padding);
  return padding;
};

export const toNodeTextLines = (node: CanvasNodeView): string[] => {
  if (node.kind === 'TASK_LIST') {
    return (node.taskItems ?? []).map((item) => `${item.checked ? '✓' : '□'} ${item.label}`);
  }

  if (node.kind === 'TASK') {
    return [`${node.checked ? '✓' : '□'} ${node.label}`];
  }

  return (node.label || '').split('\n');
};

export const toFiniteNumber = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

export const toSvgSafeId = (prefix: string, rawValue: string) => {
  const normalized = rawValue
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  return `${prefix}-${normalized || 'id'}`;
};

export const estimateTextWidth = (text: string, fontSize: number) => text.length * fontSize * 0.56;

export const wrapSvgLineToWidth = (line: string, maxWidth: number, fontSize: number) => {
  const normalizedLine = line.trim();

  if (!normalizedLine) return [''];

  const maxCharsPerLine = Math.max(1, Math.floor(maxWidth / Math.max(fontSize * 0.56, 1)));
  const chunks = normalizedLine
    .split(/\s+/)
    .flatMap((token) => {
      if (token.length <= maxCharsPerLine) return [token];

      const tokenChunks: string[] = [];

      for (let index = 0; index < token.length; index += maxCharsPerLine) {
        tokenChunks.push(token.slice(index, index + maxCharsPerLine));
      }

      return tokenChunks;
    });

  const wrapped: string[] = [];
  let current = '';

  for (const chunk of chunks) {
    const candidate = current ? `${current} ${chunk}` : chunk;

    if (current && estimateTextWidth(candidate, fontSize) > maxWidth) {
      wrapped.push(current);
      current = chunk;
      continue;
    }

    current = candidate;
  }

  if (current) wrapped.push(current);

  return wrapped.length > 0 ? wrapped : [''];
};

export const toExportBounds = (nodes: CanvasNodeView[]) => {
  const normalizedNodes = nodes
    .map((node) => ({
      height: toFiniteNumber(node.height, 0),
      width: toFiniteNumber(node.width, 0),
      x: toFiniteNumber(node.position.x, 0),
      y: toFiniteNumber(node.position.y, 0)
    }))
    .filter((node) => node.width > 0 && node.height > 0);

  if (normalizedNodes.length === 0) {
    return {
      height: canvasSize.height,
      minX: 0,
      minY: 0,
      width: canvasSize.width
    };
  }

  const left = Math.min(...normalizedNodes.map((node) => node.x));
  const top = Math.min(...normalizedNodes.map((node) => node.y));
  const right = Math.max(...normalizedNodes.map((node) => node.x + node.width));
  const bottom = Math.max(...normalizedNodes.map((node) => node.y + node.height));
  const minX = Math.max(0, left - exportBoundsPadding);
  const minY = Math.max(0, top - exportBoundsPadding);
  const maxX = Math.min(canvasSize.width, right + exportBoundsPadding);
  const maxY = Math.min(canvasSize.height, bottom + exportBoundsPadding);

  return {
    height: Math.max(1, maxY - minY),
    minX,
    minY,
    width: Math.max(1, maxX - minX)
  };
};

export const toNodeFillColor = (node: CanvasNodeView) => {
  if (node.kind === 'TEXT') return 'transparent';
  if (node.kind === 'FRAME') return node.backgroundColor ?? '#d8e6f4';
  if (node.kind === 'NOTE') return node.backgroundColor ?? '#ffe08a';
  if (node.kind === 'STICKER') return node.backgroundColor ?? `${node.color}22`;
  if (node.kind === 'SHAPE') return node.backgroundColor ?? `${node.color}22`;
  return node.backgroundColor ?? '#ffffff';
};
