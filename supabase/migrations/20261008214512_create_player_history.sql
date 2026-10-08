-- This schema stores only facts observed in ESPN responses. It intentionally
-- cannot turn a roster delta into a historical transaction.

create table public.players (
  espn_player_id bigint primary key,
  display_name text not null check (btrim(display_name) <> ''),
  default_position_id smallint,
  first_seen_season smallint not null check (first_seen_season between 2000 and 2100),
  last_seen_season smallint not null check (last_seen_season between 2000 and 2100),
  source text not null check (btrim(source) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  evidence_status text not null check (evidence_status in ('confirmed', 'unverified')),
  check (last_seen_season >= first_seen_season)
);

create table public.league_draft_picks (
  league_id text not null,
  season smallint not null,
  team_id text not null,
  espn_player_id bigint not null references public.players (espn_player_id),
  round smallint not null check (round > 0),
  round_pick smallint not null check (round_pick > 0),
  overall_pick smallint not null check (overall_pick > 0),
  source text not null check (btrim(source) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  evidence_status text not null check (evidence_status in ('confirmed', 'unverified')),
  primary key (league_id, season, overall_pick),
  unique (league_id, season, round, round_pick),
  unique (league_id, season, espn_player_id),
  foreign key (league_id, season, team_id)
    references public.league_teams (league_id, season, team_id)
    on delete cascade
);

create index league_draft_picks_player_lookup
  on public.league_draft_picks (espn_player_id);
create index league_draft_picks_team_lookup
  on public.league_draft_picks (league_id, season, team_id);

create table public.player_data_coverage (
  league_id text not null,
  season smallint not null check (season between 2000 and 2100),
  scoring_period_id smallint not null check (scoring_period_id >= 0),
  roster_evidence_status text not null check (roster_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  lineup_evidence_status text not null check (lineup_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  actual_score_evidence_status text not null check (actual_score_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  projection_evidence_status text not null check (projection_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  injury_evidence_status text not null check (injury_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  transaction_evidence_status text not null check (transaction_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  reason text not null check (btrim(reason) <> ''),
  source text not null check (btrim(source) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  primary key (league_id, season, scoring_period_id),
  foreign key (league_id, season)
    references public.league_seasons (league_id, season)
    on delete cascade,
  -- ESPN returned no direct player-week evidence in 2017. Keep explicit
  -- unavailable rows so consumers can suppress that season without guessing.
  check (
    season >= 2018 or (
      roster_evidence_status = 'unavailable'
      and lineup_evidence_status = 'unavailable'
      and actual_score_evidence_status = 'unavailable'
      and projection_evidence_status = 'unavailable'
      and injury_evidence_status = 'unavailable'
      and transaction_evidence_status = 'unavailable'
    )
  )
);

create table public.player_week_entries (
  league_id text not null,
  season smallint not null check (season >= 2018 and season <= 2100),
  scoring_period_id smallint not null check (scoring_period_id > 0),
  team_id text not null,
  espn_player_id bigint not null references public.players (espn_player_id),
  nfl_team_id integer,
  lineup_slot_id smallint,
  actual_points numeric(10, 2),
  projected_points numeric(10, 2),
  projection_source_id integer,
  projection_split_type_id integer,
  injury_designation text,
  is_injured boolean,
  roster_evidence_status text not null check (roster_evidence_status = 'confirmed'),
  lineup_evidence_status text not null check (lineup_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  actual_score_evidence_status text not null check (actual_score_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  projection_evidence_status text not null check (projection_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  injury_evidence_status text not null check (injury_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  source text not null check (btrim(source) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  primary key (league_id, season, scoring_period_id, espn_player_id),
  foreign key (league_id, season, team_id)
    references public.league_teams (league_id, season, team_id)
    on delete cascade,
  foreign key (league_id, season, scoring_period_id)
    references public.player_data_coverage (league_id, season, scoring_period_id),
  check (
    (lineup_evidence_status = 'confirmed' and lineup_slot_id is not null)
    or (lineup_evidence_status <> 'confirmed' and lineup_slot_id is null)
  ),
  check (
    (actual_score_evidence_status = 'confirmed' and actual_points is not null)
    or (actual_score_evidence_status <> 'confirmed' and actual_points is null)
  ),
  check (actual_points is null or actual_points not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  check (
    (projection_evidence_status = 'confirmed'
      and projected_points is not null
      and projection_source_id is not null
      and projection_split_type_id is not null)
    or (projection_evidence_status <> 'confirmed'
      and projected_points is null
      and projection_source_id is null
      and projection_split_type_id is null)
  ),
  check (projected_points is null or projected_points not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)),
  check (
    (injury_evidence_status in ('confirmed', 'unverified')
      and injury_designation is not null
      and btrim(injury_designation) <> ''
      and is_injured is not null)
    or (injury_evidence_status <> 'confirmed'
      and injury_designation is null
      and is_injured is null)
  )
);

comment on table public.player_data_coverage is
  'Evidence status for one league season and scoring period. confirmed means the complete supported period is safe for the matching analytics; unverified means only partial or accuracy-unverified evidence exists. scoring_period_id = 0 records season-level availability, and positive values record weekly availability.';
comment on column public.player_data_coverage.scoring_period_id is
  'ESPN scoring period. Zero is reserved for a season-level coverage marker.';

create index player_week_entries_team_lookup
  on public.player_week_entries (league_id, season, team_id, scoring_period_id desc);
create index player_week_entries_player_lookup
  on public.player_week_entries (espn_player_id, season desc, scoring_period_id desc);

create table public.transactions (
  league_id text not null,
  season smallint not null check (season between 2026 and 2100),
  provider_event_id text not null check (btrim(provider_event_id) <> ''),
  event_at timestamptz not null,
  provider_type_code text not null check (btrim(provider_type_code) <> ''),
  normalized_type text check (normalized_type is null or normalized_type in ('add', 'drop', 'trade', 'waiver')),
  evidence_status text not null check (evidence_status in ('confirmed', 'unverified')),
  source text not null check (btrim(source) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  primary key (league_id, season, provider_event_id),
  foreign key (league_id, season)
    references public.league_seasons (league_id, season)
    on delete cascade,
  check (normalized_type is null or evidence_status = 'confirmed')
);

create index transactions_event_lookup
  on public.transactions (league_id, season desc, event_at desc);

create table public.transaction_assets (
  league_id text not null,
  season smallint not null,
  provider_event_id text not null,
  provider_asset_id text not null check (btrim(provider_asset_id) <> ''),
  espn_player_id bigint references public.players (espn_player_id),
  team_id text,
  lineup_slot_id smallint,
  source text not null check (btrim(source) <> ''),
  source_checksum text not null check (source_checksum ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  evidence_status text not null check (evidence_status in ('confirmed', 'unverified')),
  primary key (league_id, season, provider_event_id, provider_asset_id),
  foreign key (league_id, season, provider_event_id)
    references public.transactions (league_id, season, provider_event_id)
    on delete cascade,
  foreign key (league_id, season, team_id)
    references public.league_teams (league_id, season, team_id)
    on delete cascade
);

create index transaction_assets_player_lookup
  on public.transaction_assets (espn_player_id);
create index transaction_assets_team_lookup
  on public.transaction_assets (league_id, season desc, team_id);

alter table public.players enable row level security;
alter table public.league_draft_picks enable row level security;
alter table public.player_data_coverage enable row level security;
alter table public.player_week_entries enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_assets enable row level security;

revoke all on table public.players, public.league_draft_picks,
  public.player_data_coverage, public.player_week_entries,
  public.transactions, public.transaction_assets from public, anon, authenticated;

grant select on table public.players, public.league_draft_picks,
  public.player_data_coverage, public.player_week_entries to anon, authenticated;
grant all on table public.players, public.league_draft_picks,
  public.player_data_coverage, public.player_week_entries,
  public.transactions, public.transaction_assets to service_role;

create policy "Public players are readable"
  on public.players for select to anon, authenticated using (true);
create policy "Public draft picks are readable"
  on public.league_draft_picks for select to anon, authenticated using (true);
create policy "Public player coverage is readable"
  on public.player_data_coverage for select to anon, authenticated using (true);
create policy "Public player weeks are readable"
  on public.player_week_entries for select to anon, authenticated using (true);
create policy "Service transactions can write"
  on public.transactions for all to service_role using (true) with check (true);
create policy "Service transaction assets can write"
  on public.transaction_assets for all to service_role using (true) with check (true);

comment on table public.player_week_entries is
  'Direct weekly roster observations only. Entries cannot represent inferred ownership deltas or 2017 lineups.';
comment on table public.transactions is
  'Forward-captured provider events. Historical roster changes are not transaction records.';
