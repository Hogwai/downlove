// src/shared/ui.js
// Installs the "Download ZIP" button on Lovable project pages and wires
// its click handler to the orchestrator. This module is shared between
// the extension content script and the userscript entry point; the only
// thing that varies between targets is how the final Blob is handed off
// to the browser for download (triggerDownload callback).

import { parseProjectIdFromUrl } from './project.js';
import { readLovableToken } from './token.js';
import { downloadProject } from './orchestrate.js';

const BUTTON_ID = 'downlove-button';
const IDLE_LABEL = 'Download project';

// Lovable's DOM is Tailwind-utility soup with no stable hooks (no <header>,
// no data-testid, no role="banner", Radix-generated IDs that rotate per
// render). We intentionally don't try to integrate into Lovable's top bar -
// we just ship the button as a fixed-position floating affordance in the
// bottom-right corner. Simpler, discoverable, and immune to Lovable UI
// refactors. The fallback selectors below are kept as optimistic hooks in
// case Lovable ever adds semantic markup we can latch onto.
const FALLBACK_SELECTORS = [
  'header [data-testid="project-header"]',
  'header [data-testid="project-top-bar"]',
  'header nav',
];

function findMount() {
  for (const sel of FALLBACK_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function styleButton(btn, floating) {
  Object.assign(btn.style, {
    padding: '6px 12px',
    marginLeft: floating ? '0' : '8px',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });
  if (floating) {
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '999999',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    });
  }
}

/**
 * Install the Downlove UI on the current page. Returns an object with a
 * couple of hooks the caller can use (e.g. the extension popup can call
 * `triggerClick` to start a download without actually clicking the button).
 *
 * @param {Object}   opts
 * @param {Function} opts.triggerDownload   Async function (blob, filename) → void.
 *                                          Target-specific: extension posts the
 *                                          blob to the background via a data URL;
 *                                          userscript uses GM_download or anchor.
 * @param {Function} [opts.onProgressExtra] Optional extra progress callback
 *                                          (done, total, path). The extension
 *                                          uses this to broadcast progress to
 *                                          its popup.
 * @param {Function} [opts.onDoneExtra]     Optional extra callback fired after a
 *                                          successful download completes.
 */
export function installUI({
  triggerDownload,
  onProgressExtra = () => {},
  onDoneExtra = () => {},
}) {
  let busy = false;
  // Whether the floating button should be rendered. Controlled by the host
  // platform via `setEnabled()`: the extension wires this to a user setting
  // stored in chrome.storage.local; the userscript leaves it at the default
  // (true). Setting it to false removes the button from the DOM but does NOT
  // disable triggerClick(), so the popup can still start a download even if
  // the in-page button is hidden.
  let enabled = true;

  function ensureButton() {
    if (!enabled) {
      removeButton();
      return null;
    }
    let btn = document.getElementById(BUTTON_ID);
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.setAttribute('data-downlove', 'button');
    btn.textContent = IDLE_LABEL;

    const mount = findMount();
    const floating = !mount;
    styleButton(btn, floating);
    btn.addEventListener('click', onClick);

    if (mount) {
      mount.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
    return btn;
  }

  function removeButton() {
    const btn = document.getElementById(BUTTON_ID);
    if (btn) btn.remove();
  }

  function setLabel(text, disabled = false) {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    btn.textContent = text;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.6' : '1';
  }

  async function onClick() {
    if (busy) return;
    const projectId = parseProjectIdFromUrl(location.pathname);
    if (!projectId) {
      setLabel('Not a project page');
      return;
    }

    busy = true;
    setLabel('Reading session…', true);
    let token;
    try {
      token = await readLovableToken();
    } catch {
      token = null;
    }
    if (!token) {
      setLabel('Log in to Lovable first', true);
      busy = false;
      return;
    }

    setLabel('Starting…', true);
    try {
      const blob = await downloadProject({
        token,
        projectId,
        onProgress: (done, total, path) => {
          setLabel(`Downloading ${done}/${total}…`, true);
          try { onProgressExtra(done, total, path); } catch { /* swallow */ }
        },
      });
      await triggerDownload(blob, `${projectId}.zip`);
      setLabel(IDLE_LABEL);
      try { onDoneExtra(); } catch { /* swallow */ }
    } catch (err) {
      console.error('[downlove]', err);
      let msg = 'Error, try again';
      if (err && typeof err.status === 'number') {
        if (err.status === 401) msg = 'Session expired, refresh';
        else if (err.status === 404) msg = 'Project not found';
        else if (err.status >= 500) msg = 'Lovable API error';
      }
      setLabel(msg);
    } finally {
      busy = false;
    }
  }

  function refresh() {
    const pid = parseProjectIdFromUrl(location.pathname);
    if (pid) {
      ensureButton();
    } else {
      removeButton();
    }
  }

  // SPA navigation: monkey-patch pushState/replaceState and listen to popstate
  // so the button is re-injected when Lovable navigates between projects
  // without a full page load.
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args);
    setTimeout(refresh, 50);
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args);
    setTimeout(refresh, 50);
    return r;
  };
  window.addEventListener('popstate', () => setTimeout(refresh, 50));

  // Initial boot.
  refresh();

  return {
    triggerClick: onClick,
    /**
     * Report current state for the extension popup. Note: this reads the
     * project id synchronously from the URL but does NOT read the token,
     * because the token read is async. The popup can call this to decide
     * whether to offer its Download button, and the token check happens
     * later when the actual download is initiated.
     */
    getState: () => ({
      projectId: parseProjectIdFromUrl(location.pathname),
    }),
    /**
     * Show or hide the in-page floating button. Safe to call at any time;
     * toggling does not affect `triggerClick`, so the popup can still start
     * a download while the button is hidden. Idempotent.
     */
    setEnabled: (value) => {
      const next = !!value;
      if (next === enabled) return;
      enabled = next;
      refresh();
    },
  };
}
