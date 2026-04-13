// Family Hub - Google API fetch helper
// Adds Authorization header, handles 401 by clearing tokens,
// and provides convenience wrappers for GET/POST/PATCH/DELETE.

async function googleFetch(url, options = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('[GoogleAPI] Not authenticated — connect via the extension popup.');

  const method  = options.method || 'GET';
  const hasBody = options.body !== undefined;

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    await chrome.storage.local.remove('google_tokens');
    throw new Error('[GoogleAPI] Auth expired — reconnect in the extension popup.');
  }

  if (res.status === 204) return null; // No Content (DELETE responses)

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[GoogleAPI] ${method} ${url} → ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const googleGet    = (url)       => googleFetch(url);
const googlePost   = (url, body) => googleFetch(url, { method: 'POST',   body });
const googlePatch  = (url, body) => googleFetch(url, { method: 'PATCH',  body });
const googleDelete = (url)       => googleFetch(url, { method: 'DELETE' });
