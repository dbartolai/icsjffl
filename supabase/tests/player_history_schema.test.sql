begin;

select plan(48);

insert into public.league_seasons (league_id, season, league_name, team_count, is_complete) values
  ('league-a', 2026, 'Test League', 2, false),
  ('league-a', 2017, 'Test League', 0, true);

insert into public.league_teams (league_id, season, team_id, team_name) values
  ('league-a', 2026, 'team-1', 'Team One'),
  ('league-a', 2026, 'team-2', 'Team Two'),
  ('league-a', 2017, 'team-1', 'Team One'),
  ('league-a', 2017, 'team-old', 'Old Team');

insert into public.players (espn_player_id, display_name, default_position_id, first_seen_season, last_seen_season, source, source_checksum, observed_at, evidence_status) values
  (1, 'Player One', 1, 2026, 2026, 'espn', repeat('0', 64), now(), 'confirmed'),
  (-2, 'Defense Two', 16, 2026, 2026, 'espn', repeat('1', 64), now(), 'confirmed');

insert into public.league_draft_picks (league_id, season, team_id, espn_player_id, round, round_pick, overall_pick, source, source_checksum, observed_at, evidence_status) values
  ('league-a', 2026, 'team-1', 1, 1, 1, 1, 'espn', repeat('2', 64), now(), 'confirmed');

insert into public.player_data_coverage (league_id, season, scoring_period_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, transaction_evidence_status, reason, source, source_checksum, observed_at) values
  ('league-a', 2026, 0, 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'confirmed', 'Season-level availability marker.', 'espn', repeat('9', 64), now()),
  ('league-a', 2026, 1, 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'unverified', 'unavailable', 'Direct weekly roster and box-score response.', 'espn', repeat('a', 64), now()),
  ('league-a', 2026, 2, 'confirmed', 'confirmed', 'unavailable', 'unavailable', 'unverified', 'unavailable', 'Direct weekly roster response.', 'espn', repeat('b', 64), now());

insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, nfl_team_id, lineup_slot_id, actual_points, projected_points, projection_source_id, projection_split_type_id, injury_designation, is_injured, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values
  ('league-a', 2026, 1, 'team-1', 1, 12, 0, 17.25, 15.50, 1, 1, 'ACTIVE', false, 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'unverified', 'espn', repeat('c', 64), now());

insert into public.transactions (league_id, season, provider_event_id, event_at, provider_type_code, normalized_type, evidence_status, source, source_checksum, observed_at) values
  ('league-a', 2026, 'event-1', now(), 'RAW_CODE', null, 'confirmed', 'espn', repeat('d', 64), now());

insert into public.transaction_assets (league_id, season, provider_event_id, provider_asset_id, espn_player_id, team_id, source, source_checksum, observed_at, evidence_status) values
  ('league-a', 2026, 'event-1', 'asset-1', -2, 'team-1', 'espn', repeat('e', 64), now(), 'confirmed');

select is((select count(*) from public.player_week_entries), 1::bigint, 'a direct weekly entry is stored once');
select is((select espn_player_id from public.transaction_assets where provider_asset_id = 'asset-1'), (-2)::bigint, 'negative ESPN player identifiers are accepted');
select is((select injury_designation from public.player_week_entries where espn_player_id = 1), 'ACTIVE', 'unverified injury designations are retained');
select is((select scoring_period_id from public.player_data_coverage where scoring_period_id = 0), 0::smallint, 'coverage accepts the season-level marker');

select throws_ok($$ insert into public.player_data_coverage (league_id, season, scoring_period_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, transaction_evidence_status, reason, source, source_checksum, observed_at) values ('league-a', 2017, 1, 'confirmed', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'Invalid weekly claim.', 'espn', repeat('f', 64), now()) $$, '23514', null, '2017 cannot claim confirmed weekly evidence');
select throws_ok($$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2017, 1, 'team-1', 1, 'confirmed', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'espn', repeat('f', 64), now()) $$, '23514', null, '2017 weekly entries are rejected');
select throws_ok($$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, lineup_slot_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 2, 'team-2', -2, 0, 'confirmed', 'inferred', 'unavailable', 'unavailable', 'unavailable', 'espn', repeat('f', 64), now()) $$, '23514', null, 'inferred lineup evidence cannot carry a lineup slot');
select throws_ok($$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 2, 'team-2', -2, 'confirmed', 'unavailable', 'unavailable', 'confirmed', 'unavailable', 'espn', repeat('f', 64), now()) $$, '23514', null, 'confirmed projections require value and ESPN source identifiers');
select throws_ok($$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, lineup_slot_id, actual_points, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 2, 'team-2', -2, 0, 'NaN', 'confirmed', 'confirmed', 'confirmed', 'unavailable', 'unavailable', 'espn', repeat('f', 64), now()) $$, '23514', null, 'weekly actual points reject NaN');
select throws_ok($$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, lineup_slot_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 1, 'team-2', 1, 0, 'confirmed', 'confirmed', 'unavailable', 'unavailable', 'unavailable', 'espn', repeat('f', 64), now()) $$, '23505', null, 'the same player cannot belong to two teams in one week');
select throws_ok($$ insert into public.league_draft_picks (league_id, season, team_id, espn_player_id, round, round_pick, overall_pick, source, source_checksum, observed_at, evidence_status) values ('league-a', 2026, 'team-2', -2, 1, 1, 2, 'espn', repeat('f', 64), now(), 'confirmed') $$, '23505', null, 'duplicate draft slots are rejected');
select throws_ok($$ insert into public.league_draft_picks (league_id, season, team_id, espn_player_id, round, round_pick, overall_pick, source, source_checksum, observed_at, evidence_status) values ('league-a', 2026, 'team-2', 1, 1, 2, 2, 'espn', repeat('f', 64), now(), 'confirmed') $$, '23505', null, 'a player cannot be drafted twice in one season');
select throws_ok($$ insert into public.league_draft_picks (league_id, season, team_id, espn_player_id, round, round_pick, overall_pick, source, source_checksum, observed_at, evidence_status) values ('league-a', 2026, 'team-old', -2, 1, 2, 2, 'espn', repeat('f', 64), now(), 'confirmed') $$, '23503', null, 'composite team foreign key rejects a team from another season');
select throws_ok($$ insert into public.transactions (league_id, season, provider_event_id, event_at, provider_type_code, normalized_type, evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 'inferred-event', now(), 'RAW_CODE', 'trade', 'unverified', 'espn', repeat('f', 64), now()) $$, '23514', null, 'an unverified event cannot claim an inferred transaction type');
select throws_ok($$ insert into public.transactions (league_id, season, provider_event_id, event_at, provider_type_code, evidence_status, source, source_checksum, observed_at) values ('league-a', 2025, 'old-event', now(), 'RAW_CODE', 'confirmed', 'espn', repeat('f', 64), now()) $$, '23514', null, 'transactions begin with the forward-captured 2026 feed');

select ok(has_table_privilege('anon', 'public.players', 'select'), 'anon has player read grant');
select ok(has_table_privilege('anon', 'public.league_draft_picks', 'select'), 'anon has draft read grant');
select ok(has_table_privilege('anon', 'public.player_data_coverage', 'select'), 'anon has coverage read grant');
select ok(has_table_privilege('anon', 'public.player_week_entries', 'select'), 'anon has weekly read grant');
select ok(has_table_privilege('authenticated', 'public.players', 'select'), 'authenticated has player read grant');
select ok(has_table_privilege('authenticated', 'public.league_draft_picks', 'select'), 'authenticated has draft read grant');
select ok(has_table_privilege('authenticated', 'public.player_data_coverage', 'select'), 'authenticated has coverage read grant');
select ok(has_table_privilege('authenticated', 'public.player_week_entries', 'select'), 'authenticated has weekly read grant');
select ok(not has_table_privilege('anon', 'public.transactions', 'select'), 'anon cannot read raw transactions');
select ok(not has_table_privilege('authenticated', 'public.transaction_assets', 'select'), 'authenticated cannot read raw transaction assets');
select is((select count(*) from pg_tables where schemaname = 'public' and tablename in ('players', 'league_draft_picks', 'player_data_coverage', 'player_week_entries', 'transactions', 'transaction_assets') and rowsecurity), 6::bigint, 'all player-history tables enable RLS');

set local role anon;
select is((select count(*) from public.players), 2::bigint, 'anon RLS reads players');
select is((select count(*) from public.league_draft_picks), 1::bigint, 'anon RLS reads drafts');
select is((select count(*) from public.player_data_coverage), 3::bigint, 'anon RLS reads coverage');
select is((select count(*) from public.player_week_entries), 1::bigint, 'anon RLS reads weekly entries');
select throws_ok($$ insert into public.players (espn_player_id, display_name, first_seen_season, last_seen_season) values (3, 'Blocked Player', 2026, 2026) $$, '42501', null, 'anon cannot insert');
select throws_ok($$ update public.players set display_name = 'Changed' where espn_player_id = 1 $$, '42501', null, 'anon cannot update');
select throws_ok($$ delete from public.players where espn_player_id = 1 $$, '42501', null, 'anon cannot delete');
select throws_ok($$ select * from public.transactions $$, '42501', null, 'anon cannot read raw transactions');
reset role;

set local role authenticated;
select is((select count(*) from public.players), 2::bigint, 'authenticated RLS reads players');
select is((select count(*) from public.league_draft_picks), 1::bigint, 'authenticated RLS reads drafts');
select is((select count(*) from public.player_data_coverage), 3::bigint, 'authenticated RLS reads coverage');
select is((select count(*) from public.player_week_entries), 1::bigint, 'authenticated RLS reads weekly entries');
select throws_ok($$ insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 2, 'team-2', -2, 'confirmed', 'unavailable', 'unavailable', 'unavailable', 'unavailable', 'espn', repeat('f', 64), now()) $$, '42501', null, 'authenticated cannot insert');
select throws_ok($$ update public.player_week_entries set actual_points = 0 $$, '42501', null, 'authenticated cannot update');
select throws_ok($$ delete from public.player_week_entries $$, '42501', null, 'authenticated cannot delete');
select throws_ok($$ select * from public.transactions $$, '42501', null, 'authenticated cannot read raw transactions');
reset role;

set local role service_role;
insert into public.players (espn_player_id, display_name, first_seen_season, last_seen_season, source, source_checksum, observed_at, evidence_status) values (1, 'Player One revised', 2026, 2026, 'espn', repeat('4', 64), now(), 'confirmed') on conflict (espn_player_id) do update set display_name = excluded.display_name;
insert into public.league_draft_picks (league_id, season, team_id, espn_player_id, round, round_pick, overall_pick, source, source_checksum, observed_at, evidence_status) values ('league-a', 2026, 'team-1', 1, 1, 1, 1, 'espn', repeat('5', 64), now(), 'confirmed') on conflict (league_id, season, overall_pick) do update set source_checksum = excluded.source_checksum;
insert into public.player_data_coverage (league_id, season, scoring_period_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, transaction_evidence_status, reason, source, source_checksum, observed_at) values ('league-a', 2026, 1, 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'unverified', 'unavailable', 'Injury designations are not historically verified.', 'espn', repeat('6', 64), now()) on conflict (league_id, season, scoring_period_id) do update set reason = excluded.reason;
insert into public.player_week_entries (league_id, season, scoring_period_id, team_id, espn_player_id, nfl_team_id, lineup_slot_id, actual_points, projected_points, projection_source_id, projection_split_type_id, injury_designation, is_injured, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, injury_evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 1, 'team-1', 1, 12, 0, 18.25, 16.50, 1, 1, 'ACTIVE', false, 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'unverified', 'espn', repeat('7', 64), now()) on conflict (league_id, season, scoring_period_id, espn_player_id) do update set actual_points = excluded.actual_points;
insert into public.transactions (league_id, season, provider_event_id, event_at, provider_type_code, normalized_type, evidence_status, source, source_checksum, observed_at) values ('league-a', 2026, 'event-1', now(), 'RAW_CODE', null, 'confirmed', 'espn', repeat('8', 64), now()) on conflict (league_id, season, provider_event_id) do update set source_checksum = excluded.source_checksum;
insert into public.transaction_assets (league_id, season, provider_event_id, provider_asset_id, espn_player_id, team_id, source, source_checksum, observed_at, evidence_status) values ('league-a', 2026, 'event-1', 'asset-1', -2, 'team-1', 'espn', repeat('9', 64), now(), 'confirmed') on conflict (league_id, season, provider_event_id, provider_asset_id) do update set source_checksum = excluded.source_checksum;
select is((select display_name from public.players where espn_player_id = 1), 'Player One revised', 'service role upserts players');
select is((select count(*) from public.league_draft_picks), 1::bigint, 'service role upserts draft picks');
select is((select reason from public.player_data_coverage where scoring_period_id = 1), 'Injury designations are not historically verified.', 'service role upserts coverage');
select is((select actual_points from public.player_week_entries where espn_player_id = 1), 18.25::numeric, 'service role upserts weekly entries');
select is((select count(*) from public.transactions where provider_event_id = 'event-1'), 1::bigint, 'service role upserts transactions');
select is((select count(*) from public.transaction_assets where provider_asset_id = 'asset-1'), 1::bigint, 'service role upserts transaction assets');
reset role;

select * from finish();
rollback;
