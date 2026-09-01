/*
 * kanbots eruda bootstrap
 *
 * Loaded by the preview proxy after eruda.js. Initialises the panel hidden,
 * suppresses the floating launcher (the parent toolbar drives toggling), and
 * listens for kb-eruda:{toggle,show,hide} postMessage commands from the
 * embedding PreviewPanel.
 */
(function () {
  'use strict';

  var SOURCE = 'kb-eruda';

  function init() {
    if (typeof window.eruda === 'undefined') return;

    try {
      window.eruda.init({ defaults: { theme: 'Dark' } });
    } catch (_e) {
      // already initialised by a re-injection — fine
    }
    try {
      window.eruda.hide();
    } catch (_e) {
      /* ignore */
    }

    // Hide the floating entry button — the parent toolbar drives toggling.
    try {
      var entry = window.eruda._entryBtn;
      if (entry && entry._$el && entry._$el[0]) {
        entry._$el[0].style.display = 'none';
      }
    } catch (_e) {
      /* ignore */
    }

    try {
      window.parent.postMessage({ source: SOURCE, type: 'ready' }, '*');
    } catch (_e) {
      /* ignore */
    }
  }

  window.addEventListener('message', function (event) {
    var data = event && event.data;
    if (!data || data.source !== SOURCE) return;
    if (typeof window.eruda === 'undefined') return;
    switch (data.type) {
      case 'toggle':
        try {
          if (window.eruda._isShow) window.eruda.hide();
          else window.eruda.show();
        } catch (_e) {
          /* ignore */
        }
        break;
      case 'show':
        try {
          window.eruda.show();
        } catch (_e) {
          /* ignore */
        }
        break;
      case 'hide':
        try {
          window.eruda.hide();
        } catch (_e) {
          /* ignore */
        }
        break;
      default:
        break;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
