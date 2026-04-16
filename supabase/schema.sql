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
