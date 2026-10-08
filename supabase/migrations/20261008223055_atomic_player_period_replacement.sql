create function public.replace_player_period_snapshot(
  p_coverage jsonb,
  p_entries jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  coverage public.player_data_coverage%rowtype;
begin
  select * into coverage
  from jsonb_populate_record(null::public.player_data_coverage, p_coverage);

  if coverage.league_id is null or coverage.season is null or coverage.scoring_period_id is null then
    raise exception 'Player period coverage key is required.';
  end if;
  if p_entries is null
    or jsonb_typeof(p_entries) is distinct from 'array'
    or jsonb_array_length(p_entries) = 0 then
    raise exception 'A player period requires entries.';
  end if;
  if exists (
    select 1
    from jsonb_populate_recordset(null::public.player_week_entries, p_entries) as entry
    where entry.league_id is distinct from coverage.league_id
      or entry.season is distinct from coverage.season
      or entry.scoring_period_id is distinct from coverage.scoring_period_id
  ) then
    raise exception 'Player entries must match the coverage key.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      coverage.league_id || ':' || coverage.season || ':' || coverage.scoring_period_id,
      0
    )
  );

  insert into public.player_data_coverage
  select * from jsonb_populate_record(null::public.player_data_coverage, p_coverage)
  on conflict (league_id, season, scoring_period_id) do update set
    roster_evidence_status = excluded.roster_evidence_status,
    lineup_evidence_status = excluded.lineup_evidence_status,
    actual_score_evidence_status = excluded.actual_score_evidence_status,
    projection_evidence_status = excluded.projection_evidence_status,
    injury_evidence_status = excluded.injury_evidence_status,
    transaction_evidence_status = excluded.transaction_evidence_status,
    lineup_rule_evidence_status = excluded.lineup_rule_evidence_status,
    lineup_slot_counts = excluded.lineup_slot_counts,
    reason = excluded.reason,
    source = excluded.source,
    source_checksum = excluded.source_checksum,
    observed_at = excluded.observed_at;

  delete from public.player_week_entries
  where league_id = coverage.league_id
    and season = coverage.season
    and scoring_period_id = coverage.scoring_period_id;

  insert into public.player_week_entries
  select * from jsonb_populate_recordset(null::public.player_week_entries, p_entries);
end;
$$;

revoke all on function public.replace_player_period_snapshot(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_player_period_snapshot(jsonb, jsonb) to service_role;
