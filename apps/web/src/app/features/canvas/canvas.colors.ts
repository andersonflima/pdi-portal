import type { CanvasNodeView, RgbColor } from './canvas.models';
import { canvasSurfaceColor, whiteColor } from './canvas.constants';

export const parseCssColor = (color: string): RgbColor | null => {
  const normalizedColor = color.trim();
  const hexColor = normalizedColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);

  if (hexColor?.[1] && hexColor[2] && hexColor[3]) {
    return {
      blue: Number.parseInt(hexColor[3], 16),
      green: Number.parseInt(hexColor[2], 16),
      red: Number.parseInt(hexColor[1], 16)
    };
  }

  const rgbColor = normalizedColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  return rgbColor
    ? {
        blue: Number(rgbColor[3]),
        green: Number(rgbColor[2]),
        red: Number(rgbColor[1])
      }
    : null;
};

export const mixRgbColors = (foreground: RgbColor, background: RgbColor, foregroundWeight: number): RgbColor => ({
  blue: Math.round(foreground.blue * foregroundWeight + background.blue * (1 - foregroundWeight)),
  green: Math.round(foreground.green * foregroundWeight + background.green * (1 - foregroundWeight)),
  red: Math.round(foreground.red * foregroundWeight + background.red * (1 - foregroundWeight))
});

export const getRelativeLuminance = (color: RgbColor) => {
  const toLinearChannel = (channel: number) => {
    const normalizedChannel = channel / 255;

    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * toLinearChannel(color.red) + 0.7152 * toLinearChannel(color.green) + 0.0722 * toLinearChannel(color.blue);
};

export const getReadableTextColor = (background: RgbColor) =>
  getRelativeLuminance(background) > 0.48 ? '#172033' : '#ffffff';

export const getNodeTextColor = (node: CanvasNodeView) => {
  const nodeColor = parseCssColor(node.color) ?? canvasSurfaceColor;

  if (node.kind === 'TEXT') return node.color;
  if (node.kind === 'CARD' || node.kind === 'TASK' || node.kind === 'TASK_LIST') return '#172033';
  if (node.kind === 'FRAME') {
    return getReadableTextColor(parseCssColor(node.backgroundColor ?? '#f8fafc') ?? canvasSurfaceColor);
  }
  if (node.kind === 'NOTE') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.54));
  if (node.kind === 'STICKER') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.12));
  if (node.kind === 'SHAPE') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.1));
  if (node.kind === 'GOAL') return getReadableTextColor(mixRgbColors(nodeColor, whiteColor, 0.08));

  return '#172033';
};
