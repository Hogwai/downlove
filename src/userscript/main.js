// src/userscript/main.js
// Tampermonkey/Violentmonkey/Greasemonkey userscript entry point.
// Installs the same shared UI as the extension content script;
// differs only in how the final ZIP is handed off to the browser.

import { installUI } from '../shared/ui.js';

/**
 * Trigger a file download for the given Blob. Prefers GM_download when
 * available (Tampermonkey / Violentmonkey), falls back to a synthetic
 * anchor click otherwise. Either way the file lands in the user's
 * default downloads folder.
 */
async function triggerDownload(blob, filename) {
  // eslint-disable-next-line no-undef
  if (typeof GM_download === 'function') {
    const url = URL.createObjectURL(blob);
    // eslint-disable-next-line no-undef
    GM_download({ url, name: filename });
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60000);
    return;
  }
  // Fallback: synthetic anchor click.
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

installUI({ triggerDownload });
