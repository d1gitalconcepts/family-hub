-- Family Hub — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables and RLS policies.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists calendar_events (
  google_id    text primary key,
  calendar_id  text not null,
  cal_name     text not null,
  cal_color    text,
  summary      text,
  description  text,
  is_all_day   boolean default false,
  start_at     timestamptz,
  end_at       timestamptz,
  start_date   date,
  end_date     date,
  updated_at   timestamptz default now()
);

create table if not exists notes (
  key        text primary key,
  data       jsonb not null,
  scraped_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists task_lists (
  list_id    text primary key,
  list_name  text not null,
  items      jsonb not null default '[]',
  updated_at timestamptz default now()
);

create table if not exists pending_updates (
  id         uuid primary key default gen_random_uuid(),
  list_id    text not null,
  task_id    text not null,
  checked    boolean not null,
  created_at timestamptz default now(),
  applied_at timestamptz
);

create table if not exists config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table calendar_events  enable row level security;
alter table notes             enable row level security;
alter table task_lists        enable row level security;
alter table pending_updates   enable row level security;
alter table config            enable row level security;

-- Authenticated users (both family and admin) can read everything
create policy "authenticated read calendar_events"
  on calendar_events for select to authenticated using (true);

create policy "authenticated read notes"
  on notes for select to authenticated using (true);

create policy "authenticated read task_lists"
  on task_lists for select to authenticated using (true);

create policy "authenticated read config"
  on config for select to authenticated using (true);

-- Authenticated users can insert pending updates (check/uncheck items)
create policy "authenticated insert pending_updates"
  on pending_updates for insert to authenticated with check (true);

-- Only admin can write config
create policy "admin write config"
  on config for all to authenticated
  using (auth.email() = 'admin@hub.local')
  with check (auth.email() = 'admin@hub.local');

-- ============================================================
-- AUTH USERS
-- After running this schema, go to:
-- Authentication → Users → Add user
-- Create two users:
--   Email: family@hub.local  Password: (choose your family password)
--   Email: admin@hub.local   Password: (choose your admin password)
-- ============================================================

-- ============================================================
-- SPORTS ENRICHMENT
-- ============================================================

create table if not exists sports_enrichment (
  google_event_id  text primary key,
  sport            text not null,
  data             jsonb not null,
  fetched_at       timestamptz default now()
);

alter table sports_enrichment enable row level security;

create policy "authenticated read sports_enrichment"
  on sports_enrichment for select to authenticated using (true);

create policy "admin write sports_enrichment"
  on sports_enrichment for all to authenticated
  using (auth.email() = 'admin@hub.local')
  with check (auth.email() = 'admin@hub.local');

-- PLACE PHOTOS
-- ============================================================
-- Shared cache for location photos (Google Places) and title
-- photos (Unsplash / Pexels). Keyed by search query string.

create table if not exists place_photos (
  query       text primary key,
  photo_url   text,
  source      text not null,
  fetched_at  timestamptz default now()
);

alter table place_photos enable row level security;

create policy "authenticated read place_photos"
  on place_photos for select to authenticated using (true);

create policy "admin write place_photos"
  on place_photos for all to authenticated
  using (auth.email() = 'admin@hub.local')
  with check (auth.email() = 'admin@hub.local');

-- ============================================================
-- PROFILES — per-person roles, permissions, and view scoping
-- ============================================================
-- One row per Supabase Auth user (parent, kid, guest, etc). Replaces the
-- old hardcoded-email admin check with a real per-person permission model.
--
-- visible_calendar_ids / visible_checklist_keys: null = inherit everything
-- that's globally visible (today's behavior); a JSON array = explicit
-- allow-list scoping this person down to specific calendars/checklists.

create table if not exists profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   text not null unique,
  display_name            text not null,
  is_admin                boolean not null default false,
  can_access_settings     boolean not null default false,
  can_sync                boolean not null default true,
  can_print               boolean not null default true,
  visible_calendar_ids    jsonb,
  visible_checklist_keys  jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table profiles enable row level security;

-- Helper used by every admin-gated policy below (including on other
-- tables) instead of a hardcoded email. security definer so it can read
-- profiles without recursing through the policies that call it.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;
grant execute on function public.is_admin(uuid) to authenticated, anon;

-- The login screen must read id+email BEFORE auth exists, to know which
-- accounts to try the entered password against. Column-level grant keeps
-- permission flags / visibility lists hidden from anon.
revoke select on profiles from anon;
grant select (id, email) on profiles to anon;
create policy "anon read login columns"
  on profiles for select to anon using (true);

create policy "own profile read"
  on profiles for select to authenticated using (id = auth.uid());

create policy "admin read all profiles"
  on profiles for select to authenticated using (is_admin());

create policy "admin update profiles"
  on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

-- Deliberately no insert/delete policy for anon/authenticated. RLS
-- default-denies any command with no matching policy, so profile
-- creation/deletion is only possible via the Cloudflare Worker's
-- service-role admin endpoints (worker/src/admin.js), never directly
-- from the browser's anon-key client.

-- Replace the old hardcoded-email admin checks with is_admin().
drop policy if exists "admin write config" on config;
create policy "admin write config"
  on config for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "admin write sports_enrichment" on sports_enrichment;
create policy "admin write sports_enrichment"
  on sports_enrichment for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "admin write place_photos" on place_photos;
create policy "admin write place_photos"
  on place_photos for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================
-- ONE-TIME MANUAL MIGRATION (run by hand in the Supabase SQL editor,
-- BEFORE deploying any frontend/worker code that depends on `profiles`)
-- ============================================================
-- 1. Run everything above this block as one script.
-- 2. In Authentication → Users, copy the UUIDs for admin@hub.local and
--    family@hub.local.
-- 3. Backfill profiles for the two existing accounts (preserves current
--    behavior exactly — null visible_* columns mean "inherit everything"):
--
--    insert into profiles (id, email, display_name, is_admin, can_access_settings, can_sync, can_print) values
--      ('<admin-uuid>',  'admin@hub.local',  'Admin',  true,  true,  true, true),
--      ('<family-uuid>', 'family@hub.local', 'Family', false, false, true, true)
--    on conflict (id) do nothing;
--
-- 4. Verify with `select * from profiles;`, then trigger a manual /sync
--    from the hub to confirm the worker's config writes still succeed
--    under is_admin() (the worker authenticates as admin@hub.local via
--    SUPABASE_EMAIL/SUPABASE_PASSWORD, which now has is_admin = true).
-- ============================================================
