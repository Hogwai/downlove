// scripts/sanity.js
// Lightweight assertions against the pure shared modules.
// Run with `node scripts/sanity.js`. No framework, no deps.
//
// Only pure, synchronous functions are tested here. The async IndexedDB
// reader in src/shared/token.js is verified manually in-browser during
// the extension test tasks, because Node has no IndexedDB.

import { parseProjectIdFromUrl } from '../src/shared/project.js';
import { extractAccessTokenFromFirebaseRow } from '../src/shared/token.js';

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.error(`  FAIL ${label}`);
    failures++;
  }
}

console.log('parseProjectIdFromUrl');
assert(
  parseProjectIdFromUrl('/projects/12345678-1234-1234-1234-123456789012/edit')
    === '12345678-1234-1234-1234-123456789012',
  'matches inside a longer path'
);
assert(
  parseProjectIdFromUrl('/projects/ABCDEF12-3456-7890-ABCD-EF1234567890')
    === 'abcdef12-3456-7890-abcd-ef1234567890',
  'lowercases the output'
);
assert(parseProjectIdFromUrl('/dashboard') === null, 'null on non-project path');
assert(parseProjectIdFromUrl('') === null, 'null on empty string');
assert(parseProjectIdFromUrl(null) === null, 'null on null input');
assert(parseProjectIdFromUrl(undefined) === null, 'null on undefined input');

console.log('extractAccessTokenFromFirebaseRow');

// Case 1: wrapped row shape as seen in live IndexedDB inspection
const wrapped = {
  fbase_key: 'firebase:authUser:AIzaSyXYZ:[DEFAULT]',
  value: {
    uid: 'u-1',
    email: 'x@example.com',
    stsTokenManager: {
      accessToken: 'tok-wrapped',
      refreshToken: 'r-1',
      expirationTime: 1775351645654,
    },
  },
};
assert(
  extractAccessTokenFromFirebaseRow(wrapped) === 'tok-wrapped',
  'extracts from wrapped { fbase_key, value } row'
);

// Case 2: direct shape (no outer wrapper, older Firebase SDKs or localStorage mirror)
const direct = {
  uid: 'u-2',
  stsTokenManager: {
    accessToken: 'tok-direct',
  },
};
assert(
  extractAccessTokenFromFirebaseRow(direct) === 'tok-direct',
  'extracts from direct row (no fbase_key wrapper)'
);

// Case 3: row present but no stsTokenManager
assert(
  extractAccessTokenFromFirebaseRow({ value: { uid: 'u', email: 'x' } }) === null,
  'null when stsTokenManager is missing'
);

// Case 4: row has stsTokenManager but no accessToken field
assert(
  extractAccessTokenFromFirebaseRow({ value: { stsTokenManager: { refreshToken: 'r' } } }) === null,
  'null when accessToken is missing'
);

// Case 5: accessToken is an empty string
assert(
  extractAccessTokenFromFirebaseRow({ value: { stsTokenManager: { accessToken: '' } } }) === null,
  'null when accessToken is empty string'
);

// Case 6: null / undefined / non-object inputs
assert(extractAccessTokenFromFirebaseRow(null) === null, 'null on null input');
assert(extractAccessTokenFromFirebaseRow(undefined) === null, 'null on undefined input');
assert(extractAccessTokenFromFirebaseRow('string') === null, 'null on string input');
assert(extractAccessTokenFromFirebaseRow(42) === null, 'null on number input');

// Case 7: accessToken is not a string
assert(
  extractAccessTokenFromFirebaseRow({ value: { stsTokenManager: { accessToken: 12345 } } }) === null,
  'null when accessToken is not a string'
);

console.log(failures === 0 ? '\nsanity OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
