// Admin endpoints for managing family member accounts (profiles).
//
// Creating/resetting/deleting a Supabase Auth user requires the service-role
// key, which must never reach the browser. These routes hold that key
// server-side and verify the caller is an admin (using the caller's own
// session JWT against RLS) before performing any privileged action.

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Resolves the caller's own Supabase session (from the Authorization header
// the browser sends) and confirms they're an admin. Uses the caller's own
// JWT for the profiles lookup so it's subject to the same RLS as everyone
// else — no separate trust path to maintain.
async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;

  const profRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=is_admin`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
  );
  if (!profRes.ok) return null;
  const [profile] = await profRes.json();
  return profile?.is_admin ? user : null;
}

function serviceHdrs(env, extra = {}) {
  return {
    apikey:          env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization:   `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

async function createProfile(request, env) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

  const body = await request.json().catch(() => null);
  const { email, password, display_name } = body || {};
  if (!email || !password || !display_name) {
    return json({ error: 'email, password, and display_name are required' }, 400);
  }

  const createRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method:  'POST',
    headers: serviceHdrs(env),
    body:    JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    return json({ error: created?.msg || created?.error_description || 'Failed to create account' }, createRes.status);
  }

  const profileRow = {
    id:                     created.id,
    email,
    display_name,
    is_admin:               !!body.is_admin,
    can_access_settings:    body.can_access_settings ?? !!body.is_admin,
    can_sync:               body.can_sync ?? true,
    can_print:              body.can_print ?? true,
  };

  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles`, {
    method:  'POST',
    headers: serviceHdrs(env, { Prefer: 'return=representation' }),
    body:    JSON.stringify(profileRow),
  });
  const inserted = await insertRes.json();
  if (!insertRes.ok) {
    // Roll back the auth user so we don't leave an orphaned account with no profile.
    await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${created.id}`, {
      method: 'DELETE', headers: serviceHdrs(env),
    }).catch(() => {});
    return json({ error: inserted?.message || 'Failed to save profile' }, insertRes.status);
  }

  return json({ profile: inserted[0] || profileRow });
}

async function setPassword(request, env, profileId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

  const body = await request.json().catch(() => null);
  const { password } = body || {};
  if (!password) return json({ error: 'password is required' }, 400);

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${profileId}`, {
    method:  'PUT',
    headers: serviceHdrs(env),
    body:    JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) return json({ error: data?.msg || 'Failed to reset password' }, res.status);
  return json({ ok: true });
}

async function deleteProfile(request, env, profileId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);
  if (profileId === admin.id) return json({ error: "Can't delete your own account" }, 400);

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${profileId}`, {
    method:  'DELETE',
    headers: serviceHdrs(env),
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    return json({ error: data?.msg || 'Failed to delete account' }, res.status);
  }
  // `profiles.id` references auth.users(id) on delete cascade — the
  // profiles row is removed automatically, no separate REST call needed.
  return json({ ok: true });
}

// Routes admin requests. Returns null if the path isn't an admin route,
// so the caller can fall through to its own 404 handling.
export async function handleAdminRequest(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'POST' && pathname === '/admin/profiles') {
    return createProfile(request, env);
  }

  const passwordMatch = pathname.match(/^\/admin\/profiles\/([^/]+)\/password$/);
  if (request.method === 'PUT' && passwordMatch) {
    return setPassword(request, env, passwordMatch[1]);
  }

  const deleteMatch = pathname.match(/^\/admin\/profiles\/([^/]+)$/);
  if (request.method === 'DELETE' && deleteMatch) {
    return deleteProfile(request, env, deleteMatch[1]);
  }

  return null;
}
