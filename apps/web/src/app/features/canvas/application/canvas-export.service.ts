import { Injectable } from '@angular/core';
import { toBlob as toDomBlob, toSvg as toDomSvg } from 'html-to-image';
import { canvasSize } from '../canvas.constants';
import { toExportBounds, toFileName, toFiniteNumber } from '../canvas-board.export-helpers';
import { buildBoardSvgMarkup } from '../canvas-board.svg-export';
import { injectSvgInteractivity, sanitizeExportedSvgMarkup, svgDataUrlToMarkup } from '../canvas-board.svg-runtime';
import type { CanvasEdgeView, CanvasNodeView } from '../canvas.models';

const exportImagePixelRatio = 2;
const exportZoomScale = 1;

export type BoardExportInput = {
  title: string;
  plane: HTMLElement | null;
  renderedNodes: CanvasNodeView[];
  nodes: CanvasNodeView[];
  edges: CanvasEdgeView[];
};

export type VisualExportNode = { cleanup: () => void; height: number; node: HTMLElement; width: number };

/** Encapsulates the board SVG/PNG export pipeline (DOM cloning, rasterization and download). */
@Injectable()
export class CanvasExportService {
  readonly exportSvg = async (input: BoardExportInput): Promise<void> => {
    const visualExportNode = this.createVisualExportNode(input.plane, input.renderedNodes, exportZoomScale);

    if (visualExportNode) {
      try {
        await this.waitForFonts();

        const dataUrl = await toDomSvg(visualExportNode.node, {
          cacheBust: true,
          height: visualExportNode.height,
          width: visualExportNode.width
        });
        const svgMarkup = svgDataUrlToMarkup(dataUrl);
        const svgBlob = svgMarkup
          ? new Blob([injectSvgInteractivity(sanitizeExportedSvgMarkup(svgMarkup))], {
              type: 'image/svg+xml;charset=utf-8'
            })
          : await this.dataUrlToBlob(dataUrl);
        this.downloadBlob(svgBlob, toFileName(input.title, 'svg'));
        return;
      } finally {
        visualExportNode.cleanup();
      }
    }

    const { markup: fallbackMarkup } = buildBoardSvgMarkup({
      renderedNodes: input.renderedNodes,
      nodes: input.nodes,
      edges: input.edges
    });
    const finalMarkup = injectSvgInteractivity(sanitizeExportedSvgMarkup(fallbackMarkup));
    const fallbackBlob = new Blob([finalMarkup], { type: 'image/svg+xml;charset=utf-8' });
    this.downloadBlob(fallbackBlob, toFileName(input.title, 'svg'));
  };

  readonly exportPng = async (input: BoardExportInput): Promise<void> => {
    const visualExportNode = this.createVisualExportNode(input.plane, input.renderedNodes, exportZoomScale);

    if (visualExportNode) {
      try {
        await this.waitForFonts();

        const pngBlob = await toDomBlob(visualExportNode.node, {
          cacheBust: true,
          canvasHeight: visualExportNode.height,
          canvasWidth: visualExportNode.width,
          height: visualExportNode.height,
          pixelRatio: exportImagePixelRatio,
          width: visualExportNode.width
        });

        if (pngBlob) {
          this.downloadBlob(pngBlob, toFileName(input.title, 'png'));
          return;
        }
      } finally {
        visualExportNode.cleanup();
      }
    }

    const { height, markup: fallbackMarkup, width } = buildBoardSvgMarkup({
      renderedNodes: input.renderedNodes,
      nodes: input.nodes,
      edges: input.edges
    });
    const fallbackSvg = new Blob([sanitizeExportedSvgMarkup(fallbackMarkup)], { type: 'image/svg+xml;charset=utf-8' });
    const pngBlob = await this.svgBlobToPngBlob(fallbackSvg, width, height, exportImagePixelRatio);
    this.downloadBlob(pngBlob, toFileName(input.title, 'png'));
  };

  readonly createVisualExportNode = (
    plane: HTMLElement | null,
    renderedNodes: CanvasNodeView[],
    zoomScale: number
  ): VisualExportNode | null => {
    if (!plane) return null;

    const bounds = toExportBounds(renderedNodes);
    const width = Math.max(1, toFiniteNumber(bounds.width, canvasSize.width));
    const height = Math.max(1, toFiniteNumber(bounds.height, canvasSize.height));
    const minX = toFiniteNumber(bounds.minX, 0);
    const minY = toFiniteNumber(bounds.minY, 0);
    const exportNode = document.createElement('div');

    exportNode.style.background = 'radial-gradient(circle at 1px 1px, #d8dee8 1px, transparent 0), #f6f4ef';
    exportNode.style.backgroundSize = '24px 24px';
    exportNode.style.height = `${height}px`;
    exportNode.style.left = '0';
    exportNode.style.overflow = 'hidden';
    exportNode.style.pointerEvents = 'none';
    exportNode.style.position = 'fixed';
    exportNode.style.top = '0';
    exportNode.style.width = `${width}px`;
    exportNode.style.zIndex = '-1';

    const planeClone = plane.cloneNode(true);

    if (!(planeClone instanceof HTMLDivElement)) return null;

    const safeZoomScale = Number.isFinite(zoomScale) && zoomScale > 0 ? zoomScale : 1;

    planeClone.style.height = `${canvasSize.height}px`;
    planeClone.style.left = '0';
    planeClone.style.position = 'relative';
    planeClone.style.top = '0';
    planeClone.style.transform = `translate(${-minX}px, ${-minY}px) scale(${safeZoomScale})`;
    planeClone.style.transformOrigin = 'left top';
    planeClone.style.width = `${canvasSize.width}px`;

    planeClone
      .querySelectorAll<SVGPathElement>('path.edge-line, path.edge-line-live, path.edge-line-preview, path.edge-line-live-export')
      .forEach((edgeLine) => {
        edgeLine.style.filter = 'none';
        edgeLine.style.setProperty('-webkit-filter', 'none');
        edgeLine.style.fill = 'none';
        edgeLine.style.strokeLinecap = 'round';
        edgeLine.style.strokeLinejoin = 'round';

        if (edgeLine.classList.contains('edge-line-dashed')) {
          edgeLine.style.strokeDasharray = '6 12';
          return;
        }

        if (edgeLine.classList.contains('edge-line-live-dashed')) {
          edgeLine.style.strokeDasharray = '10 24';
          return;
        }

        if (edgeLine.classList.contains('edge-line-live') || edgeLine.classList.contains('edge-line-live-export')) {
          edgeLine.style.strokeDasharray = '30 10';
        }
      });

    exportNode.appendChild(planeClone);
    document.body.appendChild(exportNode);

    return {
      cleanup: () => {
        if (exportNode.parentNode) {
          exportNode.parentNode.removeChild(exportNode);
        }
      },
      height,
      node: exportNode,
      width
    };
  };

  private readonly waitForFonts = async () => {
    if ('fonts' in document) {
      await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    }
  };

  private readonly downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  private readonly dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    return response.blob();
  };

  private readonly svgBlobToPngBlob = async (svgBlob: Blob, width: number, height: number, pixelRatio: number) => {
    const objectUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await this.loadImageFromUrl(objectUrl);
      const canvas = document.createElement('canvas');

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);

      const context = canvas.getContext('2d');

      if (!context) throw new Error('Failed to create canvas 2D context');

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.drawImage(image, 0, 0, width, height);

      const pngBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      });

      if (!pngBlob) throw new Error('Failed to encode board PNG');

      return pngBlob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  private readonly loadImageFromUrl = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load board SVG image'));
      image.src = url;
    });
}
