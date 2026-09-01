/*
 * kanbots click-to-component inspector
 *
 * Lightweight, framework-agnostic. Listens for kb-inspect:{enable,disable}
 * from the parent window; while enabled, draws a hovering outline and on
 * click captures element context, posts kb-inspect:selected back, and
 * auto-disables. Best-effort React component name detection via the
 * devtools global hook — falls back to tag/class/id selectors otherwise.
 *
 * All styling is inline so we never collide with the host page CSS.
 */
(function () {
  'use strict';

  var SOURCE = 'kb-inspect';
  var ACCENT_LINE = 'oklch(0.745 0.155 45 / 0.85)';
  var ACCENT_FILL = 'oklch(0.745 0.155 45 / 0.12)';
  var ACCENT_LABEL_BG = 'oklch(0.745 0.155 45 / 0.95)';

  var active = false;
  var overlay = null;
  var label = null;
  var hovered = null;

  function send(type, payload) {
    try {
      var msg = { source: SOURCE, type: type };
      if (payload !== undefined) msg.payload = payload;
      window.parent.postMessage(msg, '*');
    } catch (_e) {
      /* ignore */
    }
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.setAttribute('data-kb-inspect-overlay', '');
    overlay.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483646;outline:2px solid ' +
      ACCENT_LINE +
      ';background:' +
      ACCENT_FILL +
      ';transition:top 60ms linear,left 60ms linear,width 60ms linear,height 60ms linear;display:none;box-sizing:border-box;';
    label = document.createElement('div');
    label.style.cssText =
      'position:absolute;top:-22px;left:0;padding:2px 6px;background:' +
      ACCENT_LABEL_BG +
      ';color:#fff;font:500 11px/1.2 system-ui,sans-serif;border-radius:3px;white-space:nowrap;';
    overlay.appendChild(label);
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    label = null;
  }

  function position(el) {
    if (!overlay || !el) return;
    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    if (label) label.textContent = describe(el);
  }

  function describe(el) {
    if (!el || !el.tagName) return 'unknown';
    var componentName = readReactComponentName(el);
    var tag = el.tagName.toLowerCase();
    return componentName ? componentName + ' (' + tag + ')' : tag;
  }

  // Walk the React fiber tree (if available) for the nearest user component.
  function readReactComponentName(el) {
    try {
      var hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook) return null;
      var key = Object.keys(el).find(function (k) {
        return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
      });
      if (!key) return null;
      var fiber = el[key];
      while (fiber) {
        var type = fiber.type;
        if (type && typeof type !== 'string') {
          var name = type.displayName || type.name;
          if (name && name.charAt(0) === name.charAt(0).toUpperCase() && name !== 'Anonymous') {
            return name;
          }
        }
        fiber = fiber.return;
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  // Best-effort React fiber → source file/line, when the build retains
  // __source (most dev bundles do).
  function readReactSourceLocation(el) {
    try {
      var key = Object.keys(el).find(function (k) {
        return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
      });
      if (!key) return null;
      var fiber = el[key];
      while (fiber) {
        if (fiber._debugSource && fiber._debugSource.fileName) {
          return {
            filePath: fiber._debugSource.fileName,
            lineNumber: fiber._debugSource.lineNumber || null,
            columnNumber: fiber._debugSource.columnNumber || null,
          };
        }
        fiber = fiber.return;
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + cssEscape(el.id);
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var sel = node.tagName.toLowerCase();
      if (node.classList && node.classList.length > 0) {
        for (var i = 0; i < node.classList.length && i < 2; i++) {
          sel += '.' + cssEscape(node.classList[i]);
        }
      }
      parts.unshift(sel);
      if (node.id) break;
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ');
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function summarise(el) {
    var componentName = readReactComponentName(el);
    var sourceLoc = readReactSourceLocation(el);
    var textPreview = '';
    if (el.innerText) {
      var trimmed = el.innerText.trim();
      textPreview = trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed;
    }
    var payload = {
      tagName: el.tagName ? el.tagName.toLowerCase() : 'unknown',
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className : null,
      textPreview: textPreview,
      selector: buildSelector(el),
    };
    if (componentName) payload.reactComponent = componentName;
    if (sourceLoc) {
      if (sourceLoc.filePath) payload.filePath = sourceLoc.filePath;
      if (sourceLoc.lineNumber != null) payload.lineNumber = sourceLoc.lineNumber;
      if (sourceLoc.columnNumber != null) payload.columnNumber = sourceLoc.columnNumber;
    }
    return payload;
  }

  function onMouseMove(event) {
    if (!active) return;
    var el = event.target;
    if (!el || el === overlay || (overlay && overlay.contains(el))) return;
    if (el === hovered) return;
    hovered = el;
    position(el);
  }

  function onMouseOut() {
    // No-op: we let mousemove drive the overlay, so leaving an element to
    // enter a parent simply re-positions on the next move.
  }

  function onClick(event) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    var el = event.target;
    if (!el || el === overlay || (overlay && overlay.contains(el))) return;
    var payload = summarise(el);
    send('selected', payload);
    setActive(false);
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      send('cancelled');
      setActive(false);
    }
  }

  function setActive(value) {
    if (value === active) return;
    active = value;
    if (active) {
      ensureOverlay();
      document.body.style.cursor = 'crosshair';
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('mouseout', onMouseOut, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    } else {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.cursor = '';
      removeOverlay();
      hovered = null;
    }
  }

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || data.source !== SOURCE) return;
    if (data.type === 'enable') setActive(true);
    else if (data.type === 'disable') setActive(false);
  });

  // Announce ready so the parent can enable inspect mode immediately on load.
  try {
    window.parent.postMessage({ source: SOURCE, type: 'ready' }, '*');
  } catch (_e) {
    /* ignore */
  }
})();
