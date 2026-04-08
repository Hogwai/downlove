# Downlove

Download a [Lovable.dev](https://lovable.dev) project as a ZIP file. Three delivery formats from one codebase:

- **Browser extension** (Chrome/Chromium, Firefox): floats a "Download ZIP" button in the bottom-right corner while you're on a Lovable project page. Reads your auth token automatically from the logged-in session, fetches every file in the project, and hands you a zip.
- **Userscript** (Tampermonkey, Violentmonkey, Greasemonkey): same behaviour, no extension install. Single file at `dist/downlove.user.js`.
- **CLI:** original bash script at `cli/lovable_download.sh`. Requires you to paste a bearer token manually.

The extension and userscript share the same core logic (`src/shared/`); only the download-trigger path differs between targets.

## Installation

Choose your preferred installation method.

### Google Chrome and Chromium-based browsers

Available on the Chrome Web Store for Chrome and all Chromium-based browsers:

<a href="https://chromewebstore.google.com/detail/downlove/ggnglfchhahcfhhggdmhhngabnjgjgdg" target="_blank"><img src="https://user-images.githubusercontent.com/585534/107280622-91a8ea80-6a26-11eb-8d07-77c548b28665.png" alt="Get Downlove for Chrome" height="60"></a>

[![Microsoft Edge](https://custom-icon-badges.demolab.com/badge/Microsoft%20Edge-2771D8?logo=edge-white&logoColor=white)](https://chromewebstore.google.com/detail/downlove/ggnglfchhahcfhhggdmhhngabnjgjgdg)
[![Brave](https://img.shields.io/badge/Brave-FB542B?logo=Brave&logoColor=white)](https://chromewebstore.google.com/detail/downlove/ggnglfchhahcfhhggdmhhngabnjgjgdg)
[![Vivaldi](https://img.shields.io/badge/Vivaldi-EF3939?logo=Vivaldi&logoColor=white)](https://chromewebstore.google.com/detail/downlove/ggnglfchhahcfhhggdmhhngabnjgjgdg)
[![Opera](https://img.shields.io/badge/Opera-FF1B2D?logo=Opera&logoColor=white)](https://chromewebstore.google.com/detail/downlove/ggnglfchhahcfhhggdmhhngabnjgjgdg)
[![Arc](https://img.shields.io/badge/Arc-FCBFBD?logo=arc&logoColor=000)](https://chromewebstore.google.com/detail/downlove/ggnglfchhahcfhhggdmhhngabnjgjgdg)

### Firefox

<a href="https://addons.mozilla.org/fr/firefox/addon/downlove/" target="_blank"><img src="https://user-images.githubusercontent.com/585534/107280546-7b9b2a00-6a26-11eb-8f9f-f95932f4bfec.png" alt="Get Downlove for Firefox" height="60"></a>

### Userscript (Tampermonkey, Violentmonkey, Greasemonkey)

<a href="https://greasyfork.org/fr/scripts/572594-downlove" target="_blank"><img src="https://img.shields.io/badge/Install%20from-Greasyfork-990000?style=for-the-badge&logo=tampermonkey&logoColor=white" alt="Install from Greasyfork"></a>

<a href="https://github.com/Hogwai/downlove/releases/download/userscript-v1.0.1/downlove.user.js" target="_blank"><img src="https://img.shields.io/badge/Install%20from-GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Install from GitHub"></a>

### Development install (unpacked)

- **Chrome / Chromium / Brave / Edge:** `chrome://extensions` → enable Developer mode → Load unpacked → select `dist/chrome/`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `dist/firefox/manifest.json`. (Temporary add-ons are unloaded when you close Firefox; reload each session.)
- **Userscript:** install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/), then open `dist/downlove.user.js` from a local build.

After installing, visit any `https://lovable.dev/projects/<uuid>/…` page while logged in. A blue "Download ZIP" button appears in the bottom-right corner. Click it. The zip lands in your default downloads folder, named `<project-uuid>.zip`.

## Build from source

```bash
npm install
npm run build         # interactive - prompts for target(s) and version(s)
npm run build:all     # non-interactive, all targets, reuses versions.json
npm run build:chrome  # just Chrome
npm run build:firefox # just Firefox
npm run build:userscript
npm run clean         # rm -rf dist/
```

Build output lands in `dist/chrome/`, `dist/firefox/`, and `dist/downlove.user.js`. Pack for store submission with `./pkg_ext.sh`.

## How it reads your auth token

Lovable runs on Firebase Auth. The Firebase Web SDK stores the logged-in user's session in **IndexedDB**, at:

- **Database:** `firebaseLocalStorageDb`
- **Object store:** `firebaseLocalStorage`
- **Key:** a string matching `firebase:authUser:<apiKey>:[DEFAULT]`. Lovable's Firebase Web API key appears in its client bundle and is public, but Downlove iterates the object store rather than hardcoding the key so the extension keeps working if Lovable ever rotates its Firebase project.
- **Row shape** (some SDK versions wrap this in `{ fbase_key, value: {...} }`, others store the inner `value` directly; the code handles both):

  ```js
  {
    "uid": "...",
    "email": "...",
    "stsTokenManager": {
      "accessToken": "<JWT id token>",  // ← what is sent to api.lovable.dev
      "refreshToken": "...",
      "expirationTime": 1775351645654
    },
    "apiKey": "AIzaSy...",
    ...
  }
  ```

Downlove's content script iterates that object store, extracts `stsTokenManager.accessToken`, and passes it as `Authorization: Bearer <token>` when calling `api.lovable.dev`. **The token is read fresh from IndexedDB on every click**, never cached. Firebase ID tokens expire every hour and are auto-refreshed by the Firebase SDK in the background; reading fresh means we always get whatever the SDK has most recently written. If the stored token happens to be briefly expired (e.g. after the tab has been backgrounded), `api.lovable.dev` returns `401` and Downlove surfaces "Session expired, refresh". We do not implement a refresh-token exchange ourselves.

### API endpoints used

Two endpoints on `https://api.lovable.dev`, both authenticated with the bearer token above and both requiring `Origin: https://lovable.dev` (the API's CORS policy reflects that origin and no other, which is why Downlove runs from a content script in the `lovable.dev` origin):

- `GET /projects/{id}/git/files?ref=main` returns `{ files: [{ path, size, binary }, ...] }`.
- `GET /projects/{id}/git/file?path=<url-encoded>&ref=main` returns the file's raw bytes with a real `Content-Type` header. Both text and binary files come through this same endpoint as raw bytes, no JSON wrapping, no base64.

## Privacy

- All network requests go to `lovable.dev` and `api.lovable.dev`. Nothing else.
- The extension persists **one thing** to `chrome.storage.local`: the boolean "show floating button" setting from the popup. No token is ever cached; the Firebase ID token is read fresh from Lovable's own IndexedDB on every click. No telemetry, no analytics.
- Permissions requested: `activeTab` (so the popup can detect whether the current tab is a Lovable project page) and `storage` (for the one boolean setting). No `downloads`, no `<all_urls>`, no `webRequest`.
- Everything is client-side. There is no backend and no proxy: the extension's content script runs in the `lovable.dev` origin, which is the only origin `api.lovable.dev` grants CORS access to.

## Project layout

```
downlove/
├── cli/                    # original bash script
├── src/
│   ├── shared/             # platform-agnostic logic reused by all targets
│   │   ├── project.js      #   parseProjectIdFromUrl - URL → UUID
│   │   ├── token.js        #   readLovableToken - IndexedDB → Firebase access token
│   │   ├── api.js          #   listFiles, fetchFile - api.lovable.dev client
│   │   ├── orchestrate.js  #   downloadProject - concurrent fetch + JSZip assembly
│   │   └── ui.js           #   installUI - button injection, click handler, SPA nav
│   ├── extension/          # Chrome + Firefox entry points
│   │   ├── browser-api.js  #   chrome/browser shim
│   │   ├── content.js      #   content script: uses ui.js + triggers downloads via anchor-click
│   │   └── popup.js        #   popup: asks content script for state, surfaces progress
│   └── userscript/
│       └── main.js         # userscript: uses ui.js + GM_download / anchor fallback
├── static/
│   ├── shared/             # popup.html, popup.css, icons/
│   ├── chrome/manifest.json
│   └── firefox/manifest.json
└── dist/                   # build output (gitignored)
```

## Disclaimer

Downlove is an independent project, not affiliated with, endorsed by, or sponsored by Lovable.dev. It reads projects through your own logged-in Lovable session; it does not bypass any access control, it automates what you could already do manually through the Lovable UI.

Use at your own risk. The author accepts no liability for how you use the tool or for any consequences of that use, including but not limited to account-standing issues with Lovable, Terms-of-Service violations, or data loss. Making sure your usage is allowed by your Lovable plan and by Lovable's Terms of Service is your responsibility. This complements the `AS IS` and no-liability clauses already in the MIT license below.

## License

MIT: see [LICENSE](LICENSE).
