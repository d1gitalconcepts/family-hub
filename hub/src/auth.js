// Family Hub - Auth helpers
// Each family member has their own Supabase Auth account, backed by a row
// in the `profiles` table (name, permissions, calendar/checklist scoping).
// The hub still shows a password-only screen — the entered password is
// tried against every known account's email until one matches.

import { supabase } from './supabaseClient';

const WORKER_URL = import.meta.env.VITE_WORKER_URL;

// Tries the given password against every profile's email. Returns
// { profile, session } on success, or null if no account matched.
export async function loginWithPassword(password) {
  const { data: candidates } = await supabase.from('profiles').select('id, email');
  if (!candidates?.length) return null;

  for (const { email } of candidates) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle();
      return { profile, session: data.session };
    }
  }
  return null;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function adminFetch(path, session, options = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Admin-only: create a new family member account (kid, guest, etc).
export async function createProfile(session, payload) {
  return adminFetch('/admin/profiles', session, { method: 'POST', body: JSON.stringify(payload) });
}

// Admin-only: reset a family member's password.
export async function resetPassword(session, profileId, password) {
  return adminFetch(`/admin/profiles/${profileId}/password`, session, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  });
}

// Admin-only: remove a family member's account.
export async function deleteProfile(session, profileId) {
  return adminFetch(`/admin/profiles/${profileId}`, session, { method: 'DELETE' });
}
