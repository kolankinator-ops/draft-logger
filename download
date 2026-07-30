-- ============================================================
-- Draft Logger — Supabase Schema
-- Run this in the Supabase SQL Editor (dashboard → SQL Editor → New query)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Entries (logged games) ────────────────────────────────────
create table if not exists entries (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  date          text,
  league        text,
  event_context text,
  game_number   int,
  blue_team     text,
  red_team      text,
  champions     jsonb default '{"blue":[],"red":[]}',
  players       jsonb default '{"blue":[],"red":[]}',
  draft_pref    int,
  skill_adv     text,
  exec_demand   jsonb,
  pred_winner   text,
  pred_conf     numeric,
  notes         text,
  game_note     text,
  game_closeness int,
  actual_winner text,
  winner_confidence text,
  watched       boolean default false,
  is_vod        boolean default false,
  is_bulk_import boolean default false,
  is_standalone_bet boolean default false,
  source        text,
  bet           jsonb,
  additional_bets jsonb default '[]',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table entries enable row level security;
create policy "own entries" on entries for all using (auth.uid() = user_id);
create index entries_user_date on entries(user_id, date desc);
create index entries_user_league on entries(user_id, league);

-- ── Settings (one row per user) ───────────────────────────────
create table if not exists settings (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  bankroll        jsonb default '{}',
  factor_weights  jsonb default '{}',
  platt_params    jsonb,
  custom_streams  jsonb default '{}',
  team_aliases    jsonb default '{}',
  player_reviews  jsonb default '{}',
  tier_config     jsonb default '{}',
  manual_standings jsonb default '[]',
  manual_schedule jsonb default '[]',
  today_plan      jsonb default '{"games":[]}',
  rosters         jsonb default '[]',
  updated_at      timestamptz default now()
);

alter table settings enable row level security;
create policy "own settings" on settings for all using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger entries_updated_at before update on entries
  for each row execute function update_updated_at();
create trigger settings_updated_at before update on settings
  for each row execute function update_updated_at();

-- ── Helper: upsert settings row on new user ───────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
