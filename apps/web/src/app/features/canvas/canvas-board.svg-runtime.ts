export const svgDataUrlToMarkup = (dataUrl: string): string | null => {
  const separatorIndex = dataUrl.indexOf(',');

  if (separatorIndex < 0) return null;

  const metadata = dataUrl.slice(0, separatorIndex);
  const payload = dataUrl.slice(separatorIndex + 1);

  try {
    if (metadata.includes(';base64')) {
      return atob(payload);
    }

    return decodeURIComponent(payload);
  } catch {
    return null;
  }
};

export const sanitizeExportedSvgMarkup = (svgMarkup: string) => {
  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const root = parsedDocument.documentElement;

  if (!root || root.nodeName.toLowerCase() !== 'svg') return svgMarkup;

  parsedDocument
    .querySelectorAll<SVGPathElement>(
      'path.edge-line, path.edge-line-live, path.edge-line-preview, path.edge-line-live-export, path.edge-hit-area'
    )
    .forEach((path) => {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.removeAttribute('filter');

      const style = path.getAttribute('style');

      if (!style) return;

      const sanitizedStyle = style
        .replace(/(^|;)\s*filter\s*:[^;]*/gi, '$1')
        .replace(/(^|;)\s*-webkit-filter\s*:[^;]*/gi, '$1')
        .replace(/;;+/g, ';')
        .trim()
        .replace(/^;|;$/g, '');

      if (!sanitizedStyle) {
        path.removeAttribute('style');
        return;
      }

      path.setAttribute('style', sanitizedStyle);
    });

  return new XMLSerializer().serializeToString(parsedDocument);
};

const interactiveRuntimeStyle = `<style id="pdi-svg-interactive-style"><![CDATA[
svg[data-pdi-interactive="true"] {
  cursor: grab;
  display: block;
  height: 100vh;
  width: 100vw;
}
svg[data-pdi-panning="true"] { cursor: grabbing; }
.edge-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.edge-line-dashed {
  stroke-dasharray: 6 12;
}
.edge-line-live {
  animation: edge-dash-flow 0.45s linear infinite !important;
  fill: none;
  opacity: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.6;
  stroke-dasharray: 30 10;
}
.edge-line-live-solid {
  stroke-dasharray: 30 10;
}
.edge-line-live-dashed {
  stroke-dasharray: 10 24;
}
.edge-line-live-export {
  animation: edge-dash-flow 0.45s linear infinite !important;
  fill: none;
  opacity: 0.95;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.6;
}
.edge-line-live-bidirectional {
  animation: none !important;
}
.edge-line-live-bidirectional-forward {
  animation: edge-dash-flow 0.45s linear infinite !important;
}
.edge-line-live-bidirectional-reverse {
  animation: edge-dash-flow-reverse 0.45s linear infinite !important;
}
.edge-line-live-export-reverse {
  animation: edge-dash-flow-reverse 0.45s linear infinite !important;
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
@media (prefers-reduced-motion: reduce) {
  .edge-line-live {
    animation: edge-dash-flow 0.45s linear infinite !important;
  }
}
]]></style>`;

const interactiveRuntimeScript = `<script id="pdi-svg-interactive-runtime" type="application/ecmascript"><![CDATA[
(function () {
  var svg = document.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return;
  if (svg.getAttribute('data-pdi-interactive') === 'true') return;
  svg.setAttribute('width', '100vw');
  svg.setAttribute('height', '100vh');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.width = '100vw';
  svg.style.height = '100vh';
  svg.style.display = 'block';
  svg.style.margin = '0';
  var ns = 'http://www.w3.org/2000/svg';
  var contentGroup = svg.querySelector('#pdi-svg-panzoom-content');

  if (!contentGroup) {
    contentGroup = document.createElementNS(ns, 'g');
    contentGroup.setAttribute('id', 'pdi-svg-panzoom-content');

    var toMove = [];
    Array.from(svg.childNodes).forEach(function (node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      var tag = node.nodeName.toLowerCase();
      if (tag === 'defs' || tag === 'style' || tag === 'script' || tag === 'title' || tag === 'desc') return;
      toMove.push(node);
    });

    toMove.forEach(function (node) {
      contentGroup.appendChild(node);
    });

    svg.appendChild(contentGroup);
  }

  var viewBoxValues = (svg.getAttribute('viewBox') || '')
    .trim()
    .split(/[\\s,]+/)
    .map(function (value) {
      return Number(value);
    });
  var viewBoxWidth = viewBoxValues.length >= 4 && Number.isFinite(viewBoxValues[2]) ? viewBoxValues[2] : 0;
  var viewBoxHeight = viewBoxValues.length >= 4 && Number.isFinite(viewBoxValues[3]) ? viewBoxValues[3] : 0;
  var initialScale = 0.8;
  var state = {
    scale: initialScale,
    tx: viewBoxWidth > 0 ? ((1 - initialScale) * viewBoxWidth) / 2 : 0,
    ty: viewBoxHeight > 0 ? ((1 - initialScale) * viewBoxHeight) / 2 : 0
  };
  var minScale = 0.8;
  var maxScale = 1.6;
  var panState = null;

  var applyTransform = function () {
    contentGroup.setAttribute('transform', 'translate(' + state.tx + ' ' + state.ty + ') scale(' + state.scale + ')');
  };

  var toSvgPoint = function (event) {
    if (!svg.createSVGPoint || !svg.getScreenCTM) return null;
    var ctm = svg.getScreenCTM();
    if (!ctm || !ctm.inverse) return null;
    var point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(ctm.inverse());
  };

  var startPan = function (event) {
    if (event.button !== 0) return;
    var point = toSvgPoint(event);
    if (!point) return;

    panState = { pointerId: event.pointerId, x: point.x, y: point.y };
    svg.setAttribute('data-pdi-panning', 'true');
    if (svg.setPointerCapture) {
      try {
        svg.setPointerCapture(event.pointerId);
      } catch (_) {}
    }
  };

  var movePan = function (event) {
    if (!panState || event.pointerId !== panState.pointerId) return;
    var point = toSvgPoint(event);
    if (!point) return;

    state.tx += point.x - panState.x;
    state.ty += point.y - panState.y;
    panState.x = point.x;
    panState.y = point.y;
    applyTransform();
  };

  var endPan = function (event) {
    if (!panState || event.pointerId !== panState.pointerId) return;
    panState = null;
    svg.removeAttribute('data-pdi-panning');
    if (svg.releasePointerCapture) {
      try {
        svg.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }
  };

  var zoomAtPoint = function (event) {
    if (event.cancelable) event.preventDefault();
    var point = toSvgPoint(event);
    if (!point) return;

    var factor = Math.exp(-event.deltaY * 0.0018);
    var nextScale = Math.min(maxScale, Math.max(minScale, state.scale * factor));
    if (nextScale === state.scale) return;

    var appliedFactor = nextScale / state.scale;
    state.tx = point.x - appliedFactor * (point.x - state.tx);
    state.ty = point.y - appliedFactor * (point.y - state.ty);
    state.scale = nextScale;
    applyTransform();
  };

  var resetView = function () {
    state = {
      scale: initialScale,
      tx: viewBoxWidth > 0 ? ((1 - initialScale) * viewBoxWidth) / 2 : 0,
      ty: viewBoxHeight > 0 ? ((1 - initialScale) * viewBoxHeight) / 2 : 0
    };
    applyTransform();
  };

  svg.setAttribute('data-pdi-interactive', 'true');
  applyTransform();
  svg.addEventListener('pointerdown', startPan);
  svg.addEventListener('pointermove', movePan);
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);
  svg.addEventListener('wheel', zoomAtPoint, { passive: false });
  svg.addEventListener('dblclick', function (event) {
    if (event.cancelable) event.preventDefault();
    resetView();
  });
})();
]]></script>`;

export const injectSvgInteractivity = (svgMarkup: string) => {
  if (!svgMarkup.includes('<svg') || svgMarkup.includes('id="pdi-svg-interactive-runtime"')) {
    return svgMarkup;
  }

  return svgMarkup.replace(/<\/svg>\s*$/i, `${interactiveRuntimeStyle}${interactiveRuntimeScript}</svg>`);
};
