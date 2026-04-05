// src/shared/api.js
// Thin client for the two endpoints we need on api.lovable.dev. Both endpoints
// require a Firebase ID token in the Authorization header (see README for how
// that token is obtained) and both reflect CORS only for Origin: lovable.dev,
// which is why this code only runs from a content script / userscript.
//
//   GET /projects/{id}/git/files?ref=main
//     → { files: [{ path, size, binary }, ...] }
//
//   GET /projects/{id}/git/file?path=<path>&ref=main
//     → raw file bytes (text and binary alike), real Content-Type header,
//       no JSON wrapping, no base64.

const API_BASE = 'https://api.lovable.dev';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function authHeaders(token) {
  return { 'Authorization': `Bearer ${token}` };
}

/**
 * List the files in a Lovable project at the given git ref.
 *
 * @param {string} token     Firebase access token
 * @param {string} projectId Project UUID
 * @param {string} ref       Git ref (defaults to "main")
 * @returns {Promise<Array<{path: string, size: number, binary: boolean}>>}
 * @throws {ApiError} on non-2xx responses or unexpected response shape
 */
export async function listFiles(token, projectId, ref = 'main') {
  const url = `${API_BASE}/projects/${encodeURIComponent(projectId)}/git/files?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new ApiError(res.status, `listFiles ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data?.files)) {
    throw new ApiError(0, 'listFiles: unexpected response shape (no files array)');
  }
  return data.files;
}

/**
 * Fetch the content of a single file as a base64-encoded string.
 *
 * Why base64 strings: in Firefox content-script contexts, all binary data
 * returned by `response.arrayBuffer()` / `response.blob()` lives in a different
 * realm (compartment) than the content script itself, and JSZip's type checks
 * (`e instanceof Uint8Array`, `e instanceof ArrayBuffer`, and even
 * `e instanceof Blob` after FileReader roundtrip) all fail because the objects
 * are owned by the page compartment, not the content script's compartment.
 * Strings, being primitives, are compartment-free, so they pass JSZip's type
 * check trivially and work identically on Chrome and Firefox.
 *
 * Callers should pass the result to JSZip with `{ base64: true }`.
 *
 * @param {string} token     Firebase access token
 * @param {string} projectId Project UUID
 * @param {string} path      Repo-relative file path (will be URL-encoded)
 * @param {string} ref       Git ref (defaults to "main")
 * @returns {Promise<string>}  Base64-encoded file content.
 * @throws {ApiError} on non-2xx responses
 */
export async function fetchFile(token, projectId, path, ref = 'main') {
  const url = `${API_BASE}/projects/${encodeURIComponent(projectId)}/git/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new ApiError(res.status, `fetchFile ${path} ${res.status}`);
  }
  // Read as blob, then convert to base64 via FileReader's readAsDataURL.
  // Using FileReader here (rather than btoa + arrayBuffer → Uint8Array → String
  // → btoa) sidesteps character-encoding pitfalls and also avoids having to
  // touch ArrayBuffer/Uint8Array at all; the only JS values that escape this
  // function are strings.
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
  // dataUrl looks like "data:<mime>;base64,<payload>"; strip the prefix.
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
}
