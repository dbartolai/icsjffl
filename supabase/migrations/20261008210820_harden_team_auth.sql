create unique index league_memberships_one_commissioner_per_league
  on public.league_memberships (league_id)
  where role = 'commissioner';

drop function public.create_team_invite(text, text, text, text, timestamptz);
drop function private.create_team_invite(text, text, text, text, timestamptz);

create function private.create_team_invite(
  target_league_id text,
  target_team_id text,
  target_token_hash text,
  target_expires_at timestamptz
)
returns table (
  id uuid,
  league_id text,
  team_id text,
  team_label text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_team_label text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_league_commissioner(target_league_id) then
    raise exception 'Commissioner access required';
  end if;

  if btrim(target_league_id) = '' or btrim(target_team_id) = '' then
    raise exception 'League and team are required';
  end if;

  select team.team_name
  into resolved_team_label
  from public.league_teams team
  where team.league_id = btrim(target_league_id)
    and team.team_id = btrim(target_team_id)
    and team.season = (
      select max(latest_team.season)
      from public.league_teams latest_team
      where latest_team.league_id = btrim(target_league_id)
    )
  limit 1;

  if resolved_team_label is null then
    raise exception 'Team is not in the latest ESPN season';
  end if;

  if lower(target_token_hash) !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invite token hash';
  end if;

  if target_expires_at <= now()
    or target_expires_at > now() + interval '30 days' then
    raise exception 'Invite expiry must be within 30 days';
  end if;

  if exists (
    select 1
    from public.league_memberships membership
    where membership.league_id = target_league_id
      and membership.role = 'member'
      and membership.team_id = target_team_id
  ) then
    raise exception 'Team already has a member';
  end if;

  return query
  insert into public.team_invites (
    league_id,
    team_id,
    team_label,
    token_hash,
    created_by,
    expires_at
  ) values (
    btrim(target_league_id),
    btrim(target_team_id),
    resolved_team_label,
    lower(target_token_hash),
    (select auth.uid()),
    target_expires_at
  )
  returning
    team_invites.id,
    team_invites.league_id,
    team_invites.team_id,
    team_invites.team_label,
    team_invites.expires_at;
end;
$$;

create function public.create_team_invite(
  target_league_id text,
  target_team_id text,
  target_token_hash text,
  target_expires_at timestamptz
)
returns table (
  id uuid,
  league_id text,
  team_id text,
  team_label text,
  expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_team_invite(
    target_league_id,
    target_team_id,
    target_token_hash,
    target_expires_at
  );
$$;

revoke all on function private.create_team_invite(text, text, text, timestamptz)
  from public;
revoke all on function public.create_team_invite(text, text, text, timestamptz)
  from public, anon;
grant execute on function private.create_team_invite(text, text, text, timestamptz)
  to authenticated;
grant execute on function public.create_team_invite(text, text, text, timestamptz)
  to authenticated;

comment on function private.create_team_invite(text, text, text, timestamptz) is
  'Creates a team invite after commissioner authorization and latest-season team validation. The stored label is resolved from league_teams.';
