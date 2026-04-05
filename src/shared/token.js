// Read the Lovable (Firebase) ID token from the browser's IndexedDB.
//
// Lovable uses Firebase Auth. The Firebase Web SDK stores auth state in:
//   database:     firebaseLocalStorageDb
//   object store: firebaseLocalStorage
// Rows are keyed by a string matching /^firebase:authUser:<apiKey>:\[DEFAULT\]$/.
// The row's stored value has one of two shapes, and we tolerate both:
//   { fbase_key, value: { stsTokenManager: { accessToken, ... }, ... } }  // newer SDKs
//   { stsTokenManager: { accessToken, ... }, ... }                         // older SDKs
// The README "How it reads your auth token" section has the full schema and
// rationale for not hardcoding the apiKey.

const DB_NAME = 'firebaseLocalStorageDb';
const STORE_NAME = 'firebaseLocalStorage';
const KEY_RE = /^firebase:authUser:.+:\[DEFAULT\]$/;

/**
 * Pure synchronous extractor. Given a row value from the Firebase IndexedDB
 * object store (or its inner `value` object), return the access token string,
 * or null if the row does not contain one.
 *
 * Handles both the wrapped format { fbase_key, value: {...} } and the direct
 * format { stsTokenManager: {...}, ... }.
 */
export function extractAccessTokenFromFirebaseRow(row) {
  if (!row || typeof row !== 'object') return null;
  const user = ('value' in row && row.value && typeof row.value === 'object') ? row.value : row;
  const token = user?.stsTokenManager?.accessToken;
  if (typeof token === 'string' && token.length > 0) return token;
  return null;
}

/**
 * Async IndexedDB reader. Opens the Firebase auth database, scans the object
 * store for a row whose key matches the Firebase authUser pattern, and returns
 * the access token string from the first matching row. All failures
 * (missing database, cursor error, malformed row) resolve to null so the
 * caller can treat null as "not logged in".
 *
 * Only usable in browser contexts (content script, userscript, popup).
 * Not testable in Node; the pure extractAccessTokenFromFirebaseRow covers
 * the decoding logic for sanity checks.
 */
export function readLovableToken() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let openReq;
    try {
      openReq = indexedDB.open(DB_NAME);
    } catch {
      resolve(null);
      return;
    }
    openReq.onerror = () => resolve(null);
    // Note: no `onblocked` handler. We open without a version argument, so
    // IndexedDB never triggers an upgrade transaction and `onblocked` cannot
    // fire in our flow. Adding a handler here would just be dead defensive code.
    openReq.onsuccess = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        try { db.close(); } catch {}
        resolve(null);
        return;
      }
      let tx;
      try {
        tx = db.transaction(STORE_NAME, 'readonly');
      } catch {
        try { db.close(); } catch {}
        resolve(null);
        return;
      }
      const store = tx.objectStore(STORE_NAME);
      const cursorReq = store.openCursor();
      let resolved = false;
      const finish = (value) => {
        if (resolved) return;
        resolved = true;
        try { db.close(); } catch {}
        resolve(value);
      };
      cursorReq.onerror = () => finish(null);
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          finish(null);
          return;
        }
        const key = cursor.key;
        if (typeof key === 'string' && KEY_RE.test(key)) {
          const token = extractAccessTokenFromFirebaseRow(cursor.value);
          if (token) {
            finish(token);
            return;
          }
        }
        cursor.continue();
      };
      tx.onabort = () => finish(null);
    };
  });
}
