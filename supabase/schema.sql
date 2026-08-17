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

-- ============================================================
-- SCHOOL SCHEDULE — block/rotation schedules per kid, editable
-- entirely from the app (Manage mode inside the School Schedule
-- panel). No schedule content is seeded here — these tables start
-- empty and are meant to be filled in and re-filled every school
-- year through the UI, not by hand-editing this file.
--
-- schedule_type:
--   'rotation' — cyclical day-letters (A/B/C/D/…) that advance only
--                on real school days. A snow day or holiday in
--                school_calendar_exceptions is simply never counted,
--                so every day-letter after it shifts by one
--                automatically — the "push" the whole schedule
--                mechanic — with no manual re-numbering.
--   'weekly'   — a fixed Mon–Fri schedule that doesn't rotate; a
--                cancelled day just has no school that day.
--
-- school_calendar_exceptions is one shared calendar (snow days,
-- holidays, etc.) that every kid's schedule reads from — matches
-- one district calendar applying to every kid in the household.
-- ============================================================

create table if not exists school_schedules (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null unique references profiles(id) on delete cascade,
  school_name             text,
  schedule_type           text not null default 'rotation' check (schedule_type in ('rotation', 'weekly')),
  day_letters             text[] not null default array['A','B','C','D'],
  school_days_of_week     int[] not null default array[1,2,3,4,5], -- 0=Sun..6=Sat
  rotation_anchor_date    date,
  rotation_anchor_letter  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- The block/time template — entered once per schedule, independent of
-- which day-letter it is. block_number groups slots into a "Block" (e.g.
-- "Block 3"); slot_index orders slots within a split block (e.g. a block
-- divided around lunch has slot_index 0/1/2). A plain, unsplit block just
-- has one row with slot_index 0.
create table if not exists school_schedule_periods (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references school_schedules(id) on delete cascade,
  block_number  int not null,
  slot_index    int not null default 0,
  label         text, -- optional override for this slot (e.g. "Lunch"); blank = "Block N" / "Block N part M"
  start_time    time not null,
  end_time      time not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (schedule_id, block_number, slot_index)
);

create index if not exists school_schedule_periods_schedule_idx on school_schedule_periods(schedule_id);

-- The class catalog — a class (course + teacher + room) is defined once
-- per schedule and reused across every block/day it's dragged onto,
-- instead of retyping "Social Studies 7 / Mr. Wright / Room 172" every
-- place it appears.
create table if not exists school_classes (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references school_schedules(id) on delete cascade,
  name          text not null,
  teacher       text,
  room          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists school_classes_schedule_idx on school_classes(schedule_id);

-- The actual day-by-day content: which class happens in a given period on
-- a given day-letter. valid_from/valid_until let a period's class change
-- partway through the year (e.g. an elective that swaps at the semester)
-- without touching the period template itself.
create table if not exists school_schedule_assignments (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references school_schedules(id) on delete cascade,
  period_id     uuid not null references school_schedule_periods(id) on delete cascade,
  day_key       text not null, -- one of the schedule's day_letters, or 'MON'..'FRI' for schedule_type='weekly'
  class_id      uuid not null references school_classes(id) on delete cascade,
  valid_from    date, -- null = applies from the start of the year
  valid_until   date, -- null = applies through the end of the year
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists school_schedule_assignments_schedule_idx on school_schedule_assignments(schedule_id);
create index if not exists school_schedule_assignments_period_idx   on school_schedule_assignments(period_id);
create index if not exists school_schedule_assignments_class_idx    on school_schedule_assignments(class_id);

create table if not exists school_calendar_exceptions (
  date           date primary key,
  type           text not null default 'snow_day'
                   check (type in ('snow_day', 'holiday', 'break', 'teacher_workday', 'early_dismissal', 'other')),
  school_closed  boolean not null default true, -- false = school happens but is flagged (e.g. early dismissal)
  note           text,
  created_at     timestamptz not null default now()
);

alter table school_schedules              enable row level security;
alter table school_schedule_periods       enable row level security;
alter table school_classes                enable row level security;
alter table school_schedule_assignments   enable row level security;
alter table school_calendar_exceptions    enable row level security;

create policy "authenticated read school_schedules"
  on school_schedules for select to authenticated using (true);
create policy "admin write school_schedules"
  on school_schedules for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "authenticated read school_schedule_periods"
  on school_schedule_periods for select to authenticated using (true);
create policy "admin write school_schedule_periods"
  on school_schedule_periods for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "authenticated read school_classes"
  on school_classes for select to authenticated using (true);
create policy "admin write school_classes"
  on school_classes for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "authenticated read school_schedule_assignments"
  on school_schedule_assignments for select to authenticated using (true);
create policy "admin write school_schedule_assignments"
  on school_schedule_assignments for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "authenticated read school_calendar_exceptions"
  on school_calendar_exceptions for select to authenticated using (true);
create policy "admin write school_calendar_exceptions"
  on school_calendar_exceptions for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================
-- ONE-TIME MANUAL MIGRATION for the tables above — run this block
-- by hand in the Supabase SQL editor before using the School
-- Schedule panel in the app. Nothing to backfill; the tables start
-- empty and are populated entirely from the Manage UI.
--
-- NOTE: an earlier version of this feature used a single
-- school_schedule_blocks table (times re-entered per day-letter).
-- It's been replaced by school_schedule_periods (the time template,
-- entered once) + school_schedule_assignments (day-letter content).
-- If school_schedule_blocks exists from that earlier run and has no
-- real data in it yet, drop it first:
--
--   drop table if exists school_schedule_blocks;
-- ============================================================
