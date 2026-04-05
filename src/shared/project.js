// Parse a Lovable project UUID out of a URL pathname.
// Returns the UUID string (lowercased), or null if the path is not a project page.
const PROJECT_RE = /\/projects\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;

export function parseProjectIdFromUrl(pathname) {
  if (typeof pathname !== 'string') return null;
  const m = pathname.match(PROJECT_RE);
  return m ? m[1].toLowerCase() : null;
}
