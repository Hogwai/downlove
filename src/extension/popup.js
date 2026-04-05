// src/extension/popup.js
// Popup UI: queries the active tab, asks its content script for state,
// offers a Download button, relays progress broadcasts, and exposes the
// "Show floating button on Lovable pages" setting.
//
// Note: the popup only knows whether a project is loaded, not whether
// the user is logged in. Logged-out state is surfaced later by the
// content script's injected button after the user clicks Download.

import api from './browser-api.js';

const SETTINGS_KEY = 'downloveSettings';
const DEFAULT_SETTINGS = { floatingEnabled: true };

const statusEl = document.getElementById('status');
const btn = document.getElementById('download-btn');
const progressEl = document.getElementById('progress');
const toggleEl = document.getElementById('floating-toggle');

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

function writeSettings(settings) {
  return new Promise((resolve) => {
    try {
      api.storage.local.set({ [SETTINGS_KEY]: settings }, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function initSettingToggle() {
  const settings = await readSettings();
  toggleEl.checked = settings.floatingEnabled !== false;
  toggleEl.addEventListener('change', async () => {
    const current = await readSettings();
    await writeSettings({ ...current, floatingEnabled: toggleEl.checked });
  });
}

async function initDownloadButton() {
  let tab;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch {
    statusEl.textContent = 'Cannot read active tab.';
    return;
  }
  if (!tab?.url || !tab.url.startsWith('https://lovable.dev/')) {
    statusEl.textContent = 'Open a Lovable project tab first.';
    return;
  }

  let state;
  try {
    state = await api.tabs.sendMessage(tab.id, { type: 'getState' });
  } catch {
    statusEl.textContent = 'Content script not loaded. Refresh the page.';
    return;
  }

  if (!state?.projectId) {
    statusEl.textContent = 'No project detected on this page.';
    return;
  }

  statusEl.textContent = `Project: ${state.projectId.slice(0, 8)}…`;
  btn.disabled = false;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    progressEl.textContent = 'Starting…';
    try {
      await api.tabs.sendMessage(tab.id, { type: 'startDownload' });
    } catch {
      progressEl.textContent = 'Failed to start.';
      btn.disabled = false;
    }
  });
}

api.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'progress') {
    progressEl.textContent = `${msg.done} / ${msg.total}`;
  } else if (msg.type === 'done') {
    progressEl.textContent = 'Done.';
    btn.disabled = false;
  }
});

initSettingToggle();
initDownloadButton();
