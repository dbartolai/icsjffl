begin;

select plan(12);

insert into public.league_seasons (league_id, season, league_name, team_count, is_complete) values
  ('draft-import', 2020, 'Draft import', 1, true),
  ('draft-import', 2026, 'Draft import', 1, false);
insert into public.league_teams (league_id, season, team_id, team_name) values
  ('draft-import', 2020, '1', 'Old team'),
  ('draft-import', 2026, '1', 'Current team');

select public.replace_draft_season_snapshot(
  jsonb_build_array(jsonb_build_object(
    'espn_player_id', 101, 'display_name', 'New name', 'default_position_id', 2,
    'first_seen_season', 2026, 'last_seen_season', 2026, 'source', 'espn:kona_player_info',
    'source_checksum', repeat('1', 64), 'observed_at', '2026-10-08T00:00:00Z',
    'evidence_status', 'confirmed'
  )),
  jsonb_build_array(jsonb_build_object(
    'league_id', 'draft-import', 'season', 2026, 'team_id', '1', 'espn_player_id', 101,
    'round', 1, 'round_pick', 1, 'overall_pick', 1, 'source', 'espn:mDraftDetail',
    'source_checksum', repeat('2', 64), 'observed_at', '2026-10-08T00:00:00Z',
    'evidence_status', 'confirmed'
  ))
);
select is((select count(*) from public.league_draft_picks where season = 2026), 1::bigint, 'writes a season draft');

select public.replace_draft_season_snapshot(
  jsonb_build_array(jsonb_build_object(
    'espn_player_id', 101, 'display_name', 'Old name', 'default_position_id', 1,
    'first_seen_season', 2020, 'last_seen_season', 2020, 'source', 'espn:kona_player_info',
    'source_checksum', repeat('3', 64), 'observed_at', '2026-10-09T00:00:00Z',
    'evidence_status', 'confirmed'
  )),
  jsonb_build_array(jsonb_build_object(
    'league_id', 'draft-import', 'season', 2020, 'team_id', '1', 'espn_player_id', 101,
    'round', 1, 'round_pick', 1, 'overall_pick', 1, 'source', 'espn:mDraftDetail',
    'source_checksum', repeat('4', 64), 'observed_at', '2026-10-09T00:00:00Z',
    'evidence_status', 'confirmed'
  ))
);
select is((select display_name from public.players where espn_player_id = 101), 'New name', 'reverse historical import preserves newer player metadata');
select is((select first_seen_season from public.players where espn_player_id = 101), 2020::smallint, 'historical import extends first seen season');
select is((select last_seen_season from public.players where espn_player_id = 101), 2026::smallint, 'historical import preserves last seen season');

select public.replace_draft_season_snapshot(
  jsonb_build_array(jsonb_build_object(
    'espn_player_id', -2, 'display_name', 'Defense', 'default_position_id', 16,
    'first_seen_season', 2026, 'last_seen_season', 2026, 'source', 'espn:kona_player_info',
    'source_checksum', repeat('5', 64), 'observed_at', '2026-10-10T00:00:00Z',
    'evidence_status', 'confirmed'
  )),
  jsonb_build_array(jsonb_build_object(
    'league_id', 'draft-import', 'season', 2026, 'team_id', '1', 'espn_player_id', -2,
    'round', 1, 'round_pick', 1, 'overall_pick', 1, 'source', 'espn:mDraftDetail',
    'source_checksum', repeat('6', 64), 'observed_at', '2026-10-10T00:00:00Z',
    'evidence_status', 'confirmed'
  ))
);
select is((select count(*) from public.league_draft_picks where season = 2026), 1::bigint, 'correction removes stale draft rows');
select is((select espn_player_id from public.league_draft_picks where season = 2026), (-2)::bigint, 'correction stores negative D/ST player IDs');

select public.replace_draft_season_snapshot(
  jsonb_build_array(jsonb_build_object(
    'espn_player_id', -2, 'display_name', 'Defense', 'default_position_id', 16,
    'first_seen_season', 2026, 'last_seen_season', 2026, 'source', 'espn:kona_player_info',
    'source_checksum', repeat('5', 64), 'observed_at', '2026-10-10T00:00:00Z',
    'evidence_status', 'confirmed'
  )),
  jsonb_build_array(jsonb_build_object(
    'league_id', 'draft-import', 'season', 2026, 'team_id', '1', 'espn_player_id', -2,
    'round', 1, 'round_pick', 1, 'overall_pick', 1, 'source', 'espn:mDraftDetail',
    'source_checksum', repeat('6', 64), 'observed_at', '2026-10-10T00:00:00Z',
    'evidence_status', 'confirmed'
  ))
);
select is((select count(*) from public.league_draft_picks where season = 2026), 1::bigint, 'repeated import is idempotent');

select throws_ok(
  $$ select public.replace_draft_season_snapshot('[]', '[{"league_id":"draft-import","season":2026,"team_id":"1","espn_player_id":-2,"round":1,"round_pick":1,"overall_pick":1,"source":"espn:mDraftDetail","source_checksum":"6666666666666666666666666666666666666666666666666666666666666666","observed_at":"2026-10-10T00:00:00Z","evidence_status":"confirmed"}]') $$,
  'P0001', 'Draft players must be a nonempty array.', 'missing player payload is rejected'
);
select is((select espn_player_id from public.league_draft_picks where season = 2026), (-2)::bigint, 'rejected replacement leaves prior draft intact');

set local role anon;
select throws_ok($$ select public.replace_draft_season_snapshot('[]', '[]') $$, '42501', null, 'anon cannot run draft replacement');
reset role;
set local role authenticated;
select throws_ok($$ select public.replace_draft_season_snapshot('[]', '[]') $$, '42501', null, 'authenticated cannot run draft replacement');
reset role;
select ok(has_function_privilege('service_role', 'public.replace_draft_season_snapshot(jsonb, jsonb)', 'execute'), 'service role can run draft replacement');

select * from finish();
rollback;
