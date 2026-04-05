// rollup.config.js
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';

const target = process.env.BUILD_TARGET;
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

// Stamp `version` into a manifest JSON at writeBundle time.
function manifestWithVersion(src, dest, version) {
  return {
    name: `manifest-version(${dest})`,
    writeBundle() {
      const manifest = JSON.parse(readFileSync(src, 'utf8'));
      manifest.version = version;
      mkdirSync(dest, { recursive: true });
      writeFileSync(`${dest}/manifest.json`, JSON.stringify(manifest, null, 2));
    },
  };
}

function copyShared(dest) {
  return copy({
    targets: [
      { src: 'static/shared/popup.html', dest },
      { src: 'static/shared/popup.css', dest },
      { src: 'static/shared/icons/*', dest },
    ],
    hook: 'writeBundle',
  });
}

const resolvePlugins = [nodeResolve({ browser: true }), commonjs()];

function extensionBundles(outDir, manifestSrc, version) {
  return [
    {
      input: 'src/extension/content.js',
      output: { file: `${outDir}/content.js`, format: 'iife' },
      plugins: resolvePlugins,
    },
    {
      input: 'src/extension/popup.js',
      output: { file: `${outDir}/popup.js`, format: 'iife' },
      plugins: [
        ...resolvePlugins,
        copyShared(outDir),
        manifestWithVersion(manifestSrc, outDir, version),
      ],
    },
  ];
}

const chromeBundles = extensionBundles('dist/chrome', 'static/chrome/manifest.json', versions.chrome);
const firefoxBundles = extensionBundles('dist/firefox', 'static/firefox/manifest.json', versions.firefox);

const userscriptBanner = `// ==UserScript==
// @name         Downlove
// @namespace    https://github.com/example/downlove
// @version      ${versions.userscript}
// @description  Download a Lovable.dev project as a ZIP
// @match        https://lovable.dev/*
// @grant        GM_download
// @run-at       document-idle
// @noframes
// @license      MIT
// ==/UserScript==
`;

const userscriptBundles = [
  {
    input: 'src/userscript/main.js',
    output: {
      file: 'dist/downlove.user.js',
      format: 'iife',
      banner: userscriptBanner,
    },
    plugins: resolvePlugins,
  },
];

const targets = {
  chrome: chromeBundles,
  firefox: firefoxBundles,
  userscript: userscriptBundles,
  all: [...chromeBundles, ...firefoxBundles, ...userscriptBundles],
};

if (target && !targets[target]) {
  console.error(`Unknown BUILD_TARGET="${target}". Expected: chrome, firefox, userscript, all`);
  process.exit(1);
}

export default target ? targets[target] : targets.all;
