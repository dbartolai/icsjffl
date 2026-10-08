begin;

select plan(13);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'commissioner@example.com', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.com', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.com', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitee@example.com', '', now(), '{}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'expired@example.com', '', now(), '{}', '{}', now(), now());

insert into public.league_memberships (league_id, user_id, role, team_id) values
  ('league-a', '10000000-0000-0000-0000-000000000001', 'commissioner', null),
  ('league-a', '10000000-0000-0000-0000-000000000002', 'member', 'team-1'),
  ('league-a', '10000000-0000-0000-0000-000000000003', 'member', 'team-2');

insert into public.league_seasons (
  league_id,
  season,
  league_name,
  team_count,
  is_complete
) values ('league-a', 2026, 'Test League', 5, false);

insert into public.league_teams (
  league_id,
  season,
  team_id,
  team_name
) values
  ('league-a', 2026, 'team-1', 'Team One'),
  ('league-a', 2026, 'team-2', 'Team Two'),
  ('league-a', 2026, 'team-3', 'Team Three'),
  ('league-a', 2026, 'team-4', 'Team Four'),
  ('league-a', 2026, 'team-5', 'Team Five');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select ok(
  private.can_act_as_team('league-a', 'team-1'),
  'member can act as their assigned team'
);

select ok(
  not private.can_act_as_team('league-a', 'team-2'),
  'member cannot act as another team'
);

select is(
  (select count(*) from public.league_memberships),
  1::bigint,
  'member cannot read another team membership'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select ok(
  private.can_act_as_team('league-a', 'team-1')
    and private.can_act_as_team('league-a', 'team-2'),
  'commissioner can act across the league'
);

select is(
  (select count(*) from public.league_memberships),
  3::bigint,
  'commissioner can read all league memberships'
);

select is(
  (
    select team_label
    from public.create_team_invite(
      'league-a',
      'team-3',
      repeat('a', 64),
      now() + interval '1 day'
    )
  ),
  'Team Three',
  'invite team label is resolved from the latest ESPN season'
);

select throws_ok(
  $$
    select *
    from public.create_team_invite(
      'league-a',
      'unknown-team',
      repeat('b', 64),
      now() + interval '1 day'
    )
  $$,
  'P0001',
  'Team is not in the latest ESPN season',
  'commissioner cannot invite an unknown team slot'
);

select throws_ok(
  $$
    select *
    from public.create_team_invite(
      'league-a',
      'team-1',
      repeat('e', 64),
      now() + interval '1 day'
    )
  $$,
  'P0001',
  'Team already has a member',
  'commissioner cannot invite a claimed team'
);

reset role;
insert into public.team_invites (
  league_id,
  team_id,
  token_hash,
  created_by,
  created_at,
  expires_at
) values
  ('league-a', 'team-3', repeat('c', 64), '10000000-0000-0000-0000-000000000001', now(), now() + interval '1 day'),
  ('league-a', 'team-4', repeat('d', 64), '10000000-0000-0000-0000-000000000001', now() - interval '2 days', now() - interval '1 day');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;

select lives_ok(
  $$ select * from public.accept_team_invite(repeat('c', 64)) $$,
  'active invite can be accepted once'
);

select throws_ok(
  $$ select * from public.accept_team_invite(repeat('c', 64)) $$,
  'P0001',
  'Invite has already been used',
  'accepted invite cannot be replayed'
);

reset role;
insert into public.team_invites (
  league_id,
  team_id,
  token_hash,
  created_by,
  created_at,
  expires_at
) values (
  'league-a',
  'team-5',
  repeat('f', 64),
  '10000000-0000-0000-0000-000000000001',
  now(),
  now() + interval '1 day'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.accept_team_invite(repeat('f', 64)) $$,
  'P0001',
  'User already belongs to this league',
  'one user cannot claim a second team in the league'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.accept_team_invite(repeat('d', 64)) $$,
  'P0001',
  'Invite has expired',
  'expired invite cannot be accepted'
);

select is(
  (
    select count(*)
    from public.league_memberships
    where user_id = '10000000-0000-0000-0000-000000000005'
  ),
  0::bigint,
  'expired invite does not create a membership'
);

select * from finish();
rollback;
