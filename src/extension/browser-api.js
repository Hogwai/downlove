// Unified browser/chrome namespace. Firefox exposes `browser`, Chrome only
// exposes `chrome`. Every call site that would otherwise write `chrome.X`
// should import `api` from this module instead.
const api = (typeof browser !== 'undefined') ? browser : chrome;
export default api;
