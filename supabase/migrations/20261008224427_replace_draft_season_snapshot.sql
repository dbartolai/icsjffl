create function public.replace_draft_season_snapshot(
  p_players jsonb,
  p_picks jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  draft_league_id text;
  draft_season smallint;
begin
  if p_players is null
    or jsonb_typeof(p_players) is distinct from 'array'
    or jsonb_array_length(p_players) = 0 then
    raise exception 'Draft players must be a nonempty array.';
  end if;
  if p_picks is null
    or jsonb_typeof(p_picks) is distinct from 'array'
    or jsonb_array_length(p_picks) = 0 then
    raise exception 'Draft picks must be a nonempty array.';
  end if;

  select min(pick.league_id), min(pick.season)
  into draft_league_id, draft_season
  from jsonb_populate_recordset(null::public.league_draft_picks, p_picks) as pick;

  if draft_league_id is null or draft_season is null
    or exists (
      select 1
      from jsonb_populate_recordset(null::public.league_draft_picks, p_picks) as pick
      where pick.league_id is distinct from draft_league_id
        or pick.season is distinct from draft_season
    ) then
    raise exception 'Draft picks must have one league and season.';
  end if;

  if exists (
    select 1
    from jsonb_populate_recordset(null::public.players, p_players) as player
    where player.first_seen_season is distinct from draft_season
      or player.last_seen_season is distinct from draft_season
  )
    or exists (
      select 1
      from jsonb_populate_recordset(null::public.players, p_players) as player
      group by player.espn_player_id
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_populate_recordset(null::public.league_draft_picks, p_picks) as pick
      full join jsonb_populate_recordset(null::public.players, p_players) as player
        on player.espn_player_id = pick.espn_player_id
      where pick.espn_player_id is null or player.espn_player_id is null
    ) then
    raise exception 'Draft players must exactly match the draft pick identities.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('draft:' || draft_league_id || ':' || draft_season, 0)
  );

  insert into public.players (
    espn_player_id, display_name, default_position_id, first_seen_season,
    last_seen_season, source, source_checksum, observed_at, evidence_status
  )
  select
    player.espn_player_id, player.display_name, player.default_position_id,
    player.first_seen_season, player.last_seen_season, player.source,
    player.source_checksum, player.observed_at, player.evidence_status
  from jsonb_populate_recordset(null::public.players, p_players) as player
  on conflict (espn_player_id) do update set
    display_name = excluded.display_name,
    default_position_id = excluded.default_position_id,
    first_seen_season = excluded.first_seen_season,
    last_seen_season = excluded.last_seen_season,
    source = excluded.source,
    source_checksum = excluded.source_checksum,
    observed_at = excluded.observed_at,
    evidence_status = excluded.evidence_status;

  delete from public.league_draft_picks
  where league_id = draft_league_id and season = draft_season;

  insert into public.league_draft_picks
  select * from jsonb_populate_recordset(null::public.league_draft_picks, p_picks);
end;
$$;

revoke all on function public.replace_draft_season_snapshot(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_draft_season_snapshot(jsonb, jsonb)
  to service_role;
