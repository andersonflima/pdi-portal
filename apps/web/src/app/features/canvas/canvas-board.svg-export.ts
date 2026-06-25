import type { CanvasEdgeView, CanvasHandlePosition, CanvasNodeView } from './canvas.models';
import { canvasSize } from './canvas.constants';
import { getConnectorLabelPoint, getConnectorPath, getNodeCenter } from './canvas.geometry';
import {
  arrowNeckOffset,
  escapeXml,
  getVerticalOffset,
  toExportBounds,
  toFiniteNumber,
  toNodeFillColor,
  toNodeTextLines,
  toSvgSafeId,
  toTextAnchor,
  toTextX,
  wrapSvgLineToWidth
} from './canvas-board.export-helpers';

/**
 * Pure SVG generation for the board export. Extracted from the canvas board
 * component: the only external state is the node/edge collections, threaded in
 * as parameters, so every function here is side-effect free and unit testable.
 */

const renderNodeTextSvg = (node: CanvasNodeView) => {
  const fontSize = node.textStyle?.fontSize ?? (node.kind === 'TEXT' ? 22 : 14);
  const horizontalPadding = node.kind === 'TASK' ? 36 : node.kind === 'GOAL' ? 36 : 12;
  const maxTextWidth = Math.max(24, node.width - horizontalPadding - 12);
  const lines = toNodeTextLines(node).flatMap((line) => wrapSvgLineToWidth(line, maxTextWidth, fontSize));

  if (lines.length === 0) return '';

  const lineHeight = Math.max(14, Math.round(fontSize * 1.22));
  const anchor = toTextAnchor(node.textStyle?.align);
  const x = toTextX(anchor, node.width, horizontalPadding);
  const yOffset = getVerticalOffset(node.textStyle?.verticalAlign, node.height, lines.length * lineHeight, 12);
  const firstLineY = yOffset + fontSize;
  const fill = escapeXml(node.color);
  const fontWeight = node.textStyle?.bold ? 800 : node.kind === 'TEXT' ? 700 : 650;
  const fontStyle = node.textStyle?.italic ? 'italic' : 'normal';
  const textDecoration = node.textStyle?.underline ? ' underline' : '';
  const escapedLines = lines.map((line) => escapeXml(line));
  const tspans = escapedLines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${x}" dy="${dy}">${line || ' '}</tspan>`;
    })
    .join('');

  return `<text x="${x}" y="${firstLineY}" fill="${fill}" font-size="${fontSize}" font-style="${fontStyle}" font-weight="${fontWeight}" text-anchor="${anchor}" text-decoration="${textDecoration.trim()}" dominant-baseline="text-before-edge">${tspans}</text>`;
};

const renderGoalIconSvg = (node: CanvasNodeView, stroke: string) => {
  const iconInset = 14;
  const maxRadius = Math.max(7, Math.min(12, Math.min(node.width, node.height) * 0.1));
  const midRadius = Math.max(4.5, maxRadius * 0.66);
  const innerRadius = Math.max(2.4, maxRadius * 0.26);
  const centerX = iconInset + maxRadius;
  const centerY = iconInset + maxRadius;

  return `
<circle cx="${centerX}" cy="${centerY}" r="${maxRadius}" fill="none" stroke="${stroke}" stroke-width="2.2" />
<circle cx="${centerX}" cy="${centerY}" r="${midRadius}" fill="none" stroke="${stroke}" stroke-width="2.2" />
<circle cx="${centerX}" cy="${centerY}" r="${innerRadius}" fill="${stroke}" />`.trim();
};

const renderNodeShapeSvg = (node: CanvasNodeView, fill: string, stroke: string, strokeWidth: number) => {
  if (node.kind === 'TEXT') {
    return '';
  }

  if (node.kind === 'NOTE') {
    const foldStartX = Math.max(0, node.width - 26);
    const foldStartY = Math.max(0, node.height - 26);

    return `
<polygon points="0,0 ${node.width},0 ${node.width},${foldStartY} ${foldStartX},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
<polygon points="${foldStartX},${node.height} ${node.width},${foldStartY} ${node.width},${node.height}" fill="${stroke}" fill-opacity="0.15" />`.trim();
  }

  if (node.kind === 'SHAPE') {
    const variant = node.variant ?? 'DIAMOND';

    if (variant === 'DIAMOND') {
      return `<polygon points="${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (variant === 'TRIANGLE') {
      return `<polygon points="${node.width / 2},0 ${node.width},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (variant === 'PARALLELOGRAM') {
      return `<polygon points="${node.width * 0.18},0 ${node.width},0 ${node.width * 0.82},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (variant === 'HEXAGON') {
      return `<polygon points="${node.width * 0.24},0 ${node.width * 0.76},0 ${node.width},${node.height / 2} ${node.width * 0.76},${node.height} ${node.width * 0.24},${node.height} 0,${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (variant === 'CYLINDER') {
      const capRadiusY = Math.max(8, Math.min(20, node.height * 0.16));

      return `
<rect x="0" y="${capRadiusY / 2}" width="${node.width}" height="${Math.max(0, node.height - capRadiusY)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
<ellipse cx="${node.width / 2}" cy="${capRadiusY / 2}" rx="${node.width / 2}" ry="${capRadiusY / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
<ellipse cx="${node.width / 2}" cy="${Math.max(capRadiusY / 2, node.height - capRadiusY / 2)}" rx="${node.width / 2}" ry="${capRadiusY / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`.trim();
    }

    if (variant === 'DOCUMENT') {
      const cut = Math.max(18, Math.min(node.width * 0.2, 34));

      return `<polygon points="0,0 ${node.width - cut},0 ${node.width},${cut} ${node.width},${node.height} 0,${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (variant === 'CIRCLE') {
      const radius = Math.min(node.width, node.height) / 2;
      return `<circle cx="${node.width / 2}" cy="${node.height / 2}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    if (variant === 'ROUNDED_RECTANGLE') {
      return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="20" ry="20" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }

    return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  if (node.kind === 'STICKER') {
    return `
<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="${Math.min(node.width, node.height) / 2}" ry="${Math.min(node.width, node.height) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-dasharray="5 5" />
<circle cx="${Math.max(14, node.width - 20)}" cy="18" r="5" fill="${stroke}" />`.trim();
  }

  if (node.kind === 'CARD') {
    return `
<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="6" ry="6" fill="${fill}" stroke="#d9e1ec" stroke-width="${strokeWidth}" />
<rect x="0" y="0" width="6" height="${node.height}" rx="3" ry="3" fill="${stroke}" />
<rect x="0" y="0" width="${node.width}" height="34" rx="6" ry="6" fill="${stroke}" fill-opacity="0.12" />
<rect x="18" y="${Math.max(18, node.height - 18)}" width="42" height="5" rx="2.5" ry="2.5" fill="${stroke}" fill-opacity="0.54" />`.trim();
  }

  if (node.kind === 'GOAL') {
    return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="10" ry="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  if (node.kind === 'FRAME') {
    return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="8" ry="8" fill="${fill}" fill-opacity="0.4" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="8 5" />`;
  }

  return `<rect x="0" y="0" width="${node.width}" height="${node.height}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
};

const renderNodeToSvg = (node: CanvasNodeView) => {
  const fillColor = escapeXml(toNodeFillColor(node));
  const borderColor = escapeXml(node.color);
  const borderWidth = node.kind === 'TEXT' ? 0 : node.kind === 'FRAME' ? 2 : 1.6;
  const shapeMarkup = renderNodeShapeSvg(node, fillColor, borderColor, borderWidth);
  const iconMarkup = node.kind === 'GOAL' ? renderGoalIconSvg(node, borderColor) : '';
  const textClipId = toSvgSafeId('export-node-text-clip', node.id);
  const textClipX = node.kind === 'TASK' ? 16 : node.kind === 'GOAL' ? 24 : 8;
  const textClipY = node.kind === 'GOAL' ? 12 : 8;
  const textClipWidth = Math.max(1, node.width - textClipX - 8);
  const textClipHeight = Math.max(1, node.height - textClipY - 8);
  const textMarkup = renderNodeTextSvg(node);

  return `
<g transform="translate(${node.position.x} ${node.position.y})">
  ${shapeMarkup}
  ${iconMarkup}
  <defs>
    <clipPath id="${textClipId}">
      <rect x="${textClipX}" y="${textClipY}" width="${textClipWidth}" height="${textClipHeight}" />
    </clipPath>
  </defs>
  <g clip-path="url(#${textClipId})">
    ${textMarkup}
  </g>
</g>`.trim();
};

const renderNodesToSvg = (renderedNodes: CanvasNodeView[]) =>
  renderedNodes.map((node) => renderNodeToSvg(node)).join('\n');

const renderEdgesToSvg = (nodes: CanvasNodeView[], edges: CanvasEdgeView[]) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const markerIdForColorAndAngle = (color: string, angle: number) =>
    `export-edge-arrow-head-${encodeURIComponent(color).replaceAll('%', '_')}-${angle}`;
  const toHandleSide = (handle?: string): CanvasHandlePosition | undefined => {
    if (!handle) return undefined;
    if (handle.includes('top')) return 'top';
    if (handle.includes('right')) return 'right';
    if (handle.includes('bottom')) return 'bottom';
    if (handle.includes('left')) return 'left';
    return undefined;
  };
  const toInboundAngle = (handle: CanvasHandlePosition) => {
    if (handle === 'left') return 0;
    if (handle === 'right') return 180;
    if (handle === 'top') return 90;
    return -90;
  };
  const inferTargetHandle = (source: CanvasNodeView, target: CanvasNodeView): CanvasHandlePosition => {
    const sourceCenter = getNodeCenter(source);
    const targetCenter = getNodeCenter(target);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 'left' : 'right';
    }

    return dy >= 0 ? 'top' : 'bottom';
  };
  const inferSourceHandle = (source: CanvasNodeView, target: CanvasNodeView): CanvasHandlePosition => {
    const sourceCenter = getNodeCenter(source);
    const targetCenter = getNodeCenter(target);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 'right' : 'left';
    }

    return dy >= 0 ? 'bottom' : 'top';
  };
  const shouldRenderEdge = (edge: CanvasEdgeView) => {
    const reverseEdge = edges.find((candidate) => candidate.source === edge.target && candidate.target === edge.source);
    if (!reverseEdge) return true;
    return edge.id < reverseEdge.id;
  };
  const isBidirectional = (edge: CanvasEdgeView) =>
    edges.some((candidate) => candidate.source === edge.target && candidate.target === edge.source);

  const edgeGroups = edges
    .filter(shouldRenderEdge)
    .map((edge) => {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);

      if (!source || !target) return '';

      const path = getConnectorPath(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle, {
        end: arrowNeckOffset,
        start: isBidirectional(edge) ? arrowNeckOffset : 0
      });
      const color = escapeXml(edge.style.color);
      const label = edge.label?.trim() ?? '';
      const labelPoint = getConnectorLabelPoint(source, target, edge.style.type, edge.sourceHandle, edge.targetHandle, {
        end: arrowNeckOffset,
        start: isBidirectional(edge) ? arrowNeckOffset : 0
      });
      const labelX = labelPoint.x;
      const labelY = labelPoint.y - 10;
      const targetHandle = toHandleSide(edge.targetHandle) ?? inferTargetHandle(source, target);
      const sourceHandle = toHandleSide(edge.sourceHandle) ?? inferSourceHandle(source, target);
      const endMarkerId = markerIdForColorAndAngle(edge.style.color, toInboundAngle(targetHandle));
      const startMarkerId = markerIdForColorAndAngle(edge.style.color, toInboundAngle(sourceHandle));
      const bidirectional = isBidirectional(edge);
      const markerStart = bidirectional ? ` marker-start="url(#${startMarkerId})"` : '';
      const liveLineStyleClass = edge.style.lineStyle === 'dashed' ? 'edge-line-live-dashed' : 'edge-line-live-solid';

      return `
<g>
  <path d="${path}" fill="none" stroke="${color}" class="edge-line-live-export edge-line-live-export-forward ${liveLineStyleClass}"${markerStart} marker-end="url(#${endMarkerId})" />
  ${
    label
      ? `<text x="${labelX}" y="${labelY}" fill="${color}" font-size="13" font-weight="700" paint-order="stroke" stroke="#ffffff" stroke-opacity="0.92" stroke-linejoin="round" stroke-width="8" text-anchor="middle">${escapeXml(label)}</text>`
      : ''
  }
</g>`.trim();
    })
    .filter(Boolean)
    .join('\n');

  const markerDefsByColor = Array.from(new Set(edges.map((edge) => edge.style.color)))
    .map((color) => {
      const escapedColor = escapeXml(color);
      const angles = [0, 90, 180, -90];
      return angles
        .map((angle) => {
          const markerId = markerIdForColorAndAngle(color, angle);
          return `<marker id="${markerId}" viewBox="0 0 20 14" markerWidth="20" markerHeight="14" refX="0" refY="7" orient="${angle}" markerUnits="userSpaceOnUse"><path d="M 18 7 L 0 1 L 0 13 Z" fill="${escapedColor}" /></marker>`;
        })
        .join('');
    })
    .join('');

  const edgeAnimationStyles = `
<style>
  .edge-line-live-export {
    animation: edge-dash-flow 0.45s linear infinite;
    opacity: 0.95;
    pointer-events: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.6;
  }
  .edge-line-live-solid {
    stroke-dasharray: 30 10;
  }
  .edge-line-live-dashed {
    stroke-dasharray: 10 24;
  }
  .edge-line-live-export-reverse {
    animation-name: edge-dash-flow-reverse;
  }
  @keyframes edge-dash-flow {
    to {
      stroke-dashoffset: -72;
    }
  }
  @keyframes edge-dash-flow-reverse {
    to {
      stroke-dashoffset: 72;
    }
  }
</style>`.trim();

  const markerDefs = `
<defs>
  ${markerDefsByColor}
</defs>`.trim();

  return `${edgeAnimationStyles}\n${markerDefs}\n${edgeGroups}`;
};

export const buildBoardSvgMarkup = (input: {
  renderedNodes: CanvasNodeView[];
  nodes: CanvasNodeView[];
  edges: CanvasEdgeView[];
}) => {
  const bounds = toExportBounds(input.renderedNodes);
  const width = Math.max(1, toFiniteNumber(bounds.width, canvasSize.width));
  const height = Math.max(1, toFiniteNumber(bounds.height, canvasSize.height));
  const minX = toFiniteNumber(bounds.minX, 0);
  const minY = toFiniteNumber(bounds.minY, 0);
  const boardEdges = renderEdgesToSvg(input.nodes, input.edges);
  const boardNodes = renderNodesToSvg(input.renderedNodes);
  const translateX = -minX;
  const translateY = -minY;

  const markup = `
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#d8dee8" />
    </pattern>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#f6f4ef" />
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#grid-pattern)" />
  <g transform="translate(${translateX} ${translateY})">
    ${boardEdges}
    ${boardNodes}
  </g>
</svg>`.trim();

  return {
    height,
    markup,
    width
  };
};
