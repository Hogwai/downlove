// src/userscript/main.js
// Tampermonkey/Violentmonkey/Greasemonkey userscript entry point.
// Installs the same shared UI as the extension content script;
// differs only in how the final ZIP is handed off to the browser.

import { installUI } from '../shared/ui.js';

/**
 * Trigger a file download for the given Blob via a synthetic anchor click.
 * Same technique as the extension content script. GM_download is NOT used
 * because it cannot resolve blob URLs created in userscript context (the
 * download is delegated to Tampermonkey's background process which operates
 * in a separate context where the blob URL is unreachable).
 */
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

installUI({ triggerDownload });
