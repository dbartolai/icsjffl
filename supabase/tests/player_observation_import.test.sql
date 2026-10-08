begin;

select plan(12);

insert into public.league_seasons (league_id, season, league_name, team_count, is_complete) values
  ('import-league', 2020, 'Import League', 1, true),
  ('import-league', 2026, 'Import League', 1, false),
  ('import-league', 2027, 'Import League', 1, false);

insert into public.league_teams (league_id, season, team_id, team_name) values
  ('import-league', 2020, '1', 'One'),
  ('import-league', 2026, '1', 'One'),
  ('import-league', 2027, '1', 'One');

insert into public.players (
  espn_player_id, display_name, default_position_id, first_seen_season,
  last_seen_season, source, source_checksum, observed_at, evidence_status
) values (
  101, 'Current player', 2, 2026, 2026, 'espn', repeat('1', 64),
  '2026-10-08T00:00:00Z', 'confirmed'
);

insert into public.players (
  espn_player_id, display_name, default_position_id, first_seen_season,
  last_seen_season, source, source_checksum, observed_at, evidence_status
) values (
  101, 'Late historical name', 1, 2020, 2020, 'espn', repeat('2', 64),
  '2027-01-01T00:00:00Z', 'confirmed'
)
on conflict (espn_player_id) do update set
  display_name = excluded.display_name,
  default_position_id = excluded.default_position_id,
  first_seen_season = excluded.first_seen_season,
  last_seen_season = excluded.last_seen_season,
  source = excluded.source,
  source_checksum = excluded.source_checksum,
  observed_at = excluded.observed_at,
  evidence_status = excluded.evidence_status;

select is((select first_seen_season from public.players where espn_player_id = 101), 2020::smallint, 'historical input extends first seen');
select is((select last_seen_season from public.players where espn_player_id = 101), 2026::smallint, 'historical input does not reduce last seen');
select is((select display_name from public.players where espn_player_id = 101), 'Current player', 'a later historical fetch cannot replace current metadata');

insert into public.players (
  espn_player_id, display_name, default_position_id, first_seen_season,
  last_seen_season, source, source_checksum, observed_at, evidence_status
) values (
  101, 'Future current name', 3, 2027, 2027, 'espn', repeat('3', 64),
  '2025-01-01T00:00:00Z', 'confirmed'
)
on conflict (espn_player_id) do update set
  display_name = excluded.display_name,
  default_position_id = excluded.default_position_id,
  first_seen_season = excluded.first_seen_season,
  last_seen_season = excluded.last_seen_season,
  source = excluded.source,
  source_checksum = excluded.source_checksum,
  observed_at = excluded.observed_at,
  evidence_status = excluded.evidence_status;

select is((select first_seen_season from public.players where espn_player_id = 101), 2020::smallint, 'current after historical keeps earliest season');
select is((select last_seen_season from public.players where espn_player_id = 101), 2027::smallint, 'newer season extends last seen');
select is((select display_name from public.players where espn_player_id = 101), 'Future current name', 'newer season takes metadata precedence over fetch time');

insert into public.player_data_coverage (
  league_id, season, scoring_period_id, roster_evidence_status,
  lineup_evidence_status, actual_score_evidence_status,
  projection_evidence_status, injury_evidence_status,
  transaction_evidence_status, lineup_rule_evidence_status,
  lineup_slot_counts, reason, source, source_checksum, observed_at
) values (
  'import-league', 2026, 1, 'confirmed', 'confirmed', 'confirmed',
  'confirmed', 'unverified', 'confirmed', 'confirmed', '{"2": 2}',
  'Complete direct fixture response.', 'espn', repeat('4', 64), now()
);

insert into public.player_week_entries (
  league_id, season, scoring_period_id, team_id, espn_player_id,
  lineup_slot_id, actual_points, projected_points, projection_source_id,
  projection_split_type_id, injury_designation, is_injured,
  roster_evidence_status, lineup_evidence_status, actual_score_evidence_status,
  projection_evidence_status, injury_evidence_status,
  eligibility_evidence_status, eligible_lineup_slot_ids,
  source, source_checksum, observed_at
) values (
  'import-league', 2026, 1, '1', 101, 2, 10, 9, 1, 1, 'ACTIVE', false,
  'confirmed', 'confirmed', 'confirmed', 'confirmed', 'unverified',
  'confirmed', array[2, 23], 'espn', repeat('5', 64), now()
);

select is((select lineup_slot_counts->>'2' from public.player_data_coverage where league_id = 'import-league'), '2', 'period coverage retains direct lineup-slot counts');
select is((select eligible_lineup_slot_ids from public.player_week_entries where espn_player_id = 101), array[2, 23]::smallint[], 'weekly entry retains direct player eligibility');
select throws_ok(
  $$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, eligibility_evidence_status, eligible_lineup_slot_ids, source, source_checksum, observed_at) values ('import-league', 2026, 1, '1', 101, 'confirmed', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', array[2], 'espn', repeat('6', 64), now()) $$,
  '23514', null, 'unknown eligibility cannot carry a guessed slot list'
);
select throws_ok(
  $$ insert into public.player_data_coverage (league_id, season, scoring_period_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, transaction_evidence_status, lineup_rule_evidence_status, lineup_slot_counts, reason, source, source_checksum, observed_at) values ('import-league', 2026, 2, 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'confirmed', null, 'Bad rules.', 'espn', repeat('7', 64), now()) $$,
  '23514', null, 'confirmed lineup rules require direct slot counts'
);

set local role service_role;
select throws_ok(
  $$ select public.replace_player_period_snapshot(
    (select to_jsonb(coverage) from public.player_data_coverage coverage where league_id = 'import-league' and season = 2026 and scoring_period_id = 1),
    null
  ) $$,
  'P0001', 'A player period requires entries.', 'null entries are rejected before replacement'
);
select is(
  (select count(*) from public.player_week_entries where league_id = 'import-league' and season = 2026 and scoring_period_id = 1),
  1::bigint, 'a rejected null replacement preserves the prior snapshot'
);
reset role;

select * from finish();
rollback;
