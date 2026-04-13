import { getAccessToken } from './google-auth.js';

async function googleFetch(env, url, options = {}) {
  const token = await getAccessToken(env);
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 204) return null;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API ${options.method || 'GET'} ${url}: ${res.status} ${text}`);
  }

  return res.json();
}

export const googleGet    = (env, url)       => googleFetch(env, url);
export const googlePost   = (env, url, body) => googleFetch(env, url, { method: 'POST',   body: JSON.stringify(body) });
export const googlePatch  = (env, url, body) => googleFetch(env, url, { method: 'PATCH',  body: JSON.stringify(body) });
export const googleDelete = (env, url)       => googleFetch(env, url, { method: 'DELETE' });
