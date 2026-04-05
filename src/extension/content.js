// src/extension/content.js
// Extension content script. Runs on lovable.dev, installs the shared UI,
// triggers downloads via a synthetic anchor click (same pattern as the
// userscript; see src/userscript/main.js), and handles getState /
// startDownload messages from the popup.
//
// Why anchor-click instead of routing through a background service worker
// and chrome.downloads.download: Firefox MV3 refuses to accept `data:` URLs
// in downloads.download (security policy), and blob URLs created in a
// content script are not reliably accessible from a background service
// worker. Anchor-click works identically on Chrome and Firefox and needs
// no `downloads` permission at all. Tradeoff: no Save-As dialog. Files
// land in the browser's default downloads folder.

import { installUI } from '../shared/ui.js';
import api from './browser-api.js';

// Key under which the user's settings are persisted in chrome.storage.local.
// Shape: { floatingEnabled: boolean }. Defaults are applied at read time so
// existing installations start with the button visible (matching v0.1.0
// behaviour).
const SETTINGS_KEY = 'downloveSettings';
const DEFAULT_SETTINGS = { floatingEnabled: true };

function readSettings() {
  return new Promise((resolve) => {
    try {
      api.storage.local.get(SETTINGS_KEY, (result) => {
        const stored = (result && result[SETTINGS_KEY]) || {};
        resolve({ ...DEFAULT_SETTINGS, ...stored });
      });
    } catch {
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

async function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60000);
}

const ui = installUI({
  triggerDownload,
  onProgressExtra: (done, total) => {
    // Best-effort broadcast to the popup; ignore if nobody is listening.
    api.runtime.sendMessage({ type: 'progress', done, total }).catch(() => {});
  },
  onDoneExtra: () => {
    api.runtime.sendMessage({ type: 'done' }).catch(() => {});
  },
});

// Apply the persisted setting at boot, then live-sync with any changes the
// popup makes while this tab stays open.
readSettings().then((settings) => {
  ui.setEnabled(settings.floatingEnabled !== false);
});

try {
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    const next = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    ui.setEnabled(next.floatingEnabled !== false);
  });
} catch {
  // Storage API unavailable; degrade to default-visible button. No-op.
}

// Handle requests from the popup.
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'getState') {
    sendResponse(ui.getState());
    return false;
  }
  if (msg.type === 'startDownload') {
    // Fire-and-forget; progress will arrive via `progress` messages.
    ui.triggerClick();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
