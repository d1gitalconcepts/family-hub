// Family Hub - Auth helpers
// Two pre-created Supabase users: family@hub.local and admin@hub.local
// The hub shows a password-only screen; the email is mapped internally.

import { supabase } from './supabaseClient';

const USERS = {
  family: 'family@hub.local',
  admin:  'admin@hub.local',
};

// Try each user account with the given password. Returns { role, session } or null.
export async function loginWithPassword(password) {
  for (const [role, email] of Object.entries(USERS)) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      return { role, session: data.session };
    }
  }
  return null;
}

export async function logout() {
  await supabase.auth.signOut();
  localStorage.removeItem('fh_role');
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function getRole() {
  return localStorage.getItem('fh_role');
}

export function saveRole(role) {
  localStorage.setItem('fh_role', role);
}
