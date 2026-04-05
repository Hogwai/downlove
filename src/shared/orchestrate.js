// src/shared/orchestrate.js
// The main download workflow: list files, fetch them concurrently,
// assemble a ZIP, return a Blob. Used by both the extension content
// script and the userscript entry point.

import JSZip from 'jszip';
import { listFiles, fetchFile } from './api.js';

const DEFAULT_CONCURRENCY = 6;

/**
 * Download a Lovable project as an in-memory ZIP.
 *
 * Lists all files in the project, fetches them through a concurrent worker
 * pool, and packs them into a JSZip archive. Individual file-fetch failures
 * do NOT abort the run; failed paths are collected and written to a
 * `_downlove_errors.txt` entry inside the resulting zip, so the user still
 * gets a (partial) download. Errors from the initial `listFiles` call ARE
 * fatal and re-thrown to the caller.
 *
 * @param {Object}   opts
 * @param {string}   opts.token                Firebase access token.
 * @param {string}   opts.projectId            Lovable project UUID.
 * @param {string}   [opts.ref='main']         Git ref.
 * @param {Function} [opts.onProgress]         Called as (done, total, currentPath)
 *                                             after each file finishes, success or
 *                                             failure. Errors thrown by onProgress
 *                                             are swallowed.
 * @param {number}   [opts.concurrency=6]      Number of parallel fetch workers.
 * @returns {Promise<Blob>}                    A zip file as a Blob.
 */
export async function downloadProject({
  token,
  projectId,
  ref = 'main',
  onProgress = () => {},
  concurrency = DEFAULT_CONCURRENCY,
}) {
  const files = await listFiles(token, projectId, ref);
  const total = files.length;
  const zip = new JSZip();
  const errors = [];
  let done = 0;

  const queue = files.slice();
  async function worker() {
    while (true) {
      const file = queue.shift();
      if (!file) return;
      try {
        const content = await fetchFile(token, projectId, file.path, ref);
        // `content` is a base64-encoded string (see the long comment in
        // fetchFile about why we don't use ArrayBuffer/Blob).
        zip.file(file.path, content, { base64: true });
      } catch (err) {
        errors.push({ path: file.path, reason: err?.message || String(err) });
      }
      done++;
      try { onProgress(done, total, file.path); } catch { /* swallow callback errors */ }
    }
  }

  const workers = [];
  const workerCount = Math.min(concurrency, total);
  for (let i = 0; i < workerCount; i++) workers.push(worker());
  await Promise.all(workers);

  if (errors.length > 0) {
    const report = errors.map((e) => `${e.path}: ${e.reason}`).join('\n');
    zip.file('_downlove_errors.txt', report);
  }

  return await zip.generateAsync({ type: 'blob' });
}
