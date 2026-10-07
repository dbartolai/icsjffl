-- Public, derived history is intentionally readable by the current no-login MVP.
-- A normalized ESPN season snapshot is kept separately for recalculation and
-- is never exposed to clients.

create table public.league_seasons (
  league_id text not null,
  season smallint not null check (season between 2000 and 2100),
  league_name text not null,
  team_count smallint not null check (team_count >= 0),
  regular_season_weeks smallint,
  playoff_team_count smallint,
  is_complete boolean not null default false,
  imported_at timestamptz not null default now(),
  primary key (league_id, season)
);

create table public.league_teams (
  league_id text not null,
  season smallint not null,
  team_id text not null,
  team_name text not null,
  abbreviation text,
  manager_name text,
  final_rank smallint,
  playoff_seed smallint,
  wins smallint not null default 0,
  losses smallint not null default 0,
  ties smallint not null default 0,
  points_for numeric(10, 2) not null default 0,
  points_against numeric(10, 2) not null default 0,
  primary key (league_id, season, team_id),
  foreign key (league_id, season)
    references public.league_seasons (league_id, season)
    on delete cascade
);

create table public.league_games (
  league_id text not null,
  season smallint not null,
  game_id text not null,
  week smallint not null check (week > 0),
  matchup_period smallint not null check (matchup_period > 0),
  is_playoff boolean not null default false,
  playoff_tier_type text,
  home_team_id text not null,
  home_team_name text not null,
  home_manager_name text,
  home_score numeric(10, 2) not null,
  away_team_id text not null,
  away_team_name text not null,
  away_manager_name text,
  away_score numeric(10, 2) not null,
  primary key (league_id, season, game_id, week),
  foreign key (league_id, season)
    references public.league_seasons (league_id, season)
    on delete cascade,
  check (home_team_id <> away_team_id)
);

create index league_games_score_lookup
  on public.league_games (league_id, home_score desc, away_score desc);

create index league_games_season_week_lookup
  on public.league_games (league_id, season desc, week desc);

create table public.espn_season_snapshots (
  league_id text not null,
  season smallint not null check (season between 2000 and 2100),
  fetched_at timestamptz not null,
  source_payload jsonb not null,
  primary key (league_id, season)
);

alter table public.league_seasons enable row level security;
alter table public.league_teams enable row level security;
alter table public.league_games enable row level security;
alter table public.espn_season_snapshots enable row level security;

revoke all on table public.league_seasons from public, anon, authenticated;
revoke all on table public.league_teams from public, anon, authenticated;
revoke all on table public.league_games from public, anon, authenticated;
revoke all on table public.espn_season_snapshots from public, anon, authenticated;

grant select on table public.league_seasons to anon, authenticated;
grant select on table public.league_teams to anon, authenticated;
grant select on table public.league_games to anon, authenticated;

grant all on table public.league_seasons to service_role;
grant all on table public.league_teams to service_role;
grant all on table public.league_games to service_role;
grant all on table public.espn_season_snapshots to service_role;

create policy "Public league history is readable"
  on public.league_seasons
  for select
  to anon, authenticated
  using (true);

create policy "Public historical teams are readable"
  on public.league_teams
  for select
  to anon, authenticated
  using (true);

create policy "Public historical games are readable"
  on public.league_games
  for select
  to anon, authenticated
  using (true);

comment on table public.espn_season_snapshots is
  'Server-only normalized ESPN season snapshots retained for recalculation; no anon or authenticated grants.';
