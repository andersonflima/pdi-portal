import { describe, expect, it } from 'vitest';
import { injectSvgInteractivity, sanitizeExportedSvgMarkup, svgDataUrlToMarkup } from './canvas-board.svg-runtime';

describe('svgDataUrlToMarkup', () => {
  it('decodes base64 payloads', () => {
    const markup = '<svg></svg>';
    const dataUrl = `data:image/svg+xml;base64,${btoa(markup)}`;

    expect(svgDataUrlToMarkup(dataUrl)).toBe(markup);
  });

  it('decodes percent-encoded payloads', () => {
    const markup = '<svg><rect/></svg>';
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(markup)}`;

    expect(svgDataUrlToMarkup(dataUrl)).toBe(markup);
  });

  it('returns null when there is no data separator', () => {
    expect(svgDataUrlToMarkup('not-a-data-url')).toBeNull();
  });

  it('returns null when the base64 payload is malformed', () => {
    expect(svgDataUrlToMarkup('data:image/svg+xml;base64,@@@not-base64@@@')).toBeNull();
  });
});

describe('sanitizeExportedSvgMarkup', () => {
  it('returns the input unchanged when it is not an svg document', () => {
    const markup = '<div>not svg</div>';

    expect(sanitizeExportedSvgMarkup(markup)).toBe(markup);
  });

  it('strips filter declarations from edge paths', () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="edge-line" style="filter:url(#x);stroke:red" filter="url(#x)"/></svg>';

    const sanitized = sanitizeExportedSvgMarkup(markup);

    expect(sanitized).not.toContain('filter:url');
    expect(sanitized).not.toContain('filter="url(#x)"');
    expect(sanitized).toContain('stroke:red');
    expect(sanitized).toContain('fill="none"');
  });

  it('removes the style attribute entirely when only a filter was present', () => {
    const markup =
      '<svg xmlns="http://www.w3.org/2000/svg"><path class="edge-hit-area" style="filter:url(#x)"/></svg>';

    const sanitized = sanitizeExportedSvgMarkup(markup);

    expect(sanitized).not.toContain('style=');
  });
});

describe('injectSvgInteractivity', () => {
  it('leaves markup without an svg tag untouched', () => {
    expect(injectSvgInteractivity('<div></div>')).toBe('<div></div>');
  });

  it('injects the runtime style and script before the closing svg tag', () => {
    const result = injectSvgInteractivity('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    expect(result).toContain('id="pdi-svg-interactive-runtime"');
    expect(result).toContain('id="pdi-svg-interactive-style"');
    expect(result.trim().endsWith('</svg>')).toBe(true);
  });

  it('is idempotent — does not inject twice', () => {
    const once = injectSvgInteractivity('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const twice = injectSvgInteractivity(once);

    expect(twice).toBe(once);
  });
});
