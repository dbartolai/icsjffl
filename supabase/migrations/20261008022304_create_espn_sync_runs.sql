create table public.espn_sync_runs (
  run_id uuid primary key default gen_random_uuid(),
  league_id text not null,
  season smallint not null check (season between 2000 and 2100),
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  lock_expires_at timestamptz,
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  seasons_upserted integer check (
    seasons_upserted is null or seasons_upserted >= 0
  ),
  teams_upserted integer check (teams_upserted is null or teams_upserted >= 0),
  games_upserted integer check (games_upserted is null or games_upserted >= 0),
  snapshots_upserted integer check (
    snapshots_upserted is null or snapshots_upserted >= 0
  ),
  error_code text check (error_code is null or length(error_code) <= 64),
  check (lock_expires_at is not null or status <> 'running'),
  check (finished_at is null or finished_at >= started_at)
);

create unique index espn_sync_runs_one_active_run
  on public.espn_sync_runs (league_id, season)
  where status = 'running';

create index espn_sync_runs_latest_result
  on public.espn_sync_runs (league_id, season, started_at desc);

alter table public.espn_sync_runs enable row level security;

revoke all on table public.espn_sync_runs from public, anon, authenticated;
grant all on table public.espn_sync_runs to service_role;

comment on table public.espn_sync_runs is
  'Server-only ESPN sync status and lease metadata. Credentials and upstream payloads are never stored here.';
