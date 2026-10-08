create schema if not exists private;

create table public.league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('commissioner', 'member')),
  team_id text,
  created_at timestamptz not null default now(),
  unique (league_id, user_id),
  check (
    (role = 'commissioner' and team_id is null)
    or (role = 'member' and team_id is not null and btrim(team_id) <> '')
  )
);

create unique index league_memberships_one_member_per_team
  on public.league_memberships (league_id, team_id)
  where role = 'member';

create index league_memberships_user_lookup
  on public.league_memberships (user_id, league_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  league_id text not null,
  team_id text not null check (btrim(team_id) <> ''),
  team_label text,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete restrict,
  check (expires_at > created_at),
  check ((accepted_at is null) = (accepted_by is null))
);

create index team_invites_league_lookup
  on public.team_invites (league_id, created_at desc);

alter table public.league_memberships enable row level security;
alter table public.team_invites enable row level security;

revoke all on table public.league_memberships from public, anon, authenticated;
revoke all on table public.team_invites from public, anon, authenticated;

grant select on table public.league_memberships to authenticated;
grant select on table public.team_invites to authenticated;

grant all on table public.league_memberships to service_role;
grant all on table public.team_invites to service_role;

create function private.is_league_commissioner(target_league_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.league_memberships membership
      where membership.league_id = target_league_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'commissioner'
    );
$$;

create function private.can_act_as_team(
  target_league_id text,
  target_team_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.league_memberships membership
      where membership.league_id = target_league_id
        and membership.user_id = (select auth.uid())
        and (
          membership.role = 'commissioner'
          or (
            membership.role = 'member'
            and membership.team_id = target_team_id
          )
        )
    );
$$;

create function private.create_team_invite(
  target_league_id text,
  target_team_id text,
  target_team_label text,
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
    nullif(btrim(target_team_label), ''),
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

create function private.inspect_team_invite(invite_token_hash text)
returns table (
  league_id text,
  team_id text,
  team_label text,
  expires_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    invite.league_id,
    invite.team_id,
    invite.team_label,
    invite.expires_at,
    case
      when invite.accepted_at is not null then 'used'
      when invite.expires_at <= now() then 'expired'
      when exists (
        select 1
        from public.league_memberships membership
        where membership.league_id = invite.league_id
          and membership.role = 'member'
          and membership.team_id = invite.team_id
      ) then 'unavailable'
      else 'active'
    end
  from public.team_invites invite
  where invite.token_hash = lower(invite_token_hash)
  limit 1;
end;
$$;

create function private.accept_team_invite(invite_token_hash text)
returns table (
  league_id text,
  team_id text,
  team_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.team_invites%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select *
  into invite
  from public.team_invites candidate
  where candidate.token_hash = lower(invite_token_hash)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if invite.accepted_at is not null then
    raise exception 'Invite has already been used';
  end if;

  if invite.expires_at <= now() then
    raise exception 'Invite has expired';
  end if;

  if exists (
    select 1
    from public.league_memberships membership
    where membership.league_id = invite.league_id
      and membership.user_id = (select auth.uid())
  ) then
    raise exception 'User already belongs to this league';
  end if;

  if exists (
    select 1
    from public.league_memberships membership
    where membership.league_id = invite.league_id
      and membership.role = 'member'
      and membership.team_id = invite.team_id
  ) then
    raise exception 'Team already has a member';
  end if;

  insert into public.league_memberships (league_id, user_id, role, team_id)
  values (invite.league_id, (select auth.uid()), 'member', invite.team_id);

  update public.team_invites
  set accepted_at = now(), accepted_by = (select auth.uid())
  where id = invite.id;

  return query
  select invite.league_id, invite.team_id, invite.team_label;
end;
$$;

create function public.create_team_invite(
  target_league_id text,
  target_team_id text,
  target_team_label text,
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
    target_team_label,
    target_token_hash,
    target_expires_at
  );
$$;

create function public.inspect_team_invite(invite_token_hash text)
returns table (
  league_id text,
  team_id text,
  team_label text,
  expires_at timestamptz,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.inspect_team_invite(invite_token_hash);
$$;

create function public.accept_team_invite(invite_token_hash text)
returns table (
  league_id text,
  team_id text,
  team_label text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.accept_team_invite(invite_token_hash);
$$;

revoke all on function private.is_league_commissioner(text) from public;
revoke all on function private.can_act_as_team(text, text) from public;
revoke all on function private.create_team_invite(text, text, text, text, timestamptz) from public;
revoke all on function private.inspect_team_invite(text) from public;
revoke all on function private.accept_team_invite(text) from public;
revoke all on function public.create_team_invite(text, text, text, text, timestamptz) from public, anon;
revoke all on function public.inspect_team_invite(text) from public, anon;
revoke all on function public.accept_team_invite(text) from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.is_league_commissioner(text) to authenticated;
grant execute on function private.can_act_as_team(text, text) to authenticated;
grant execute on function private.create_team_invite(text, text, text, text, timestamptz) to authenticated;
grant execute on function private.inspect_team_invite(text) to authenticated;
grant execute on function private.accept_team_invite(text) to authenticated;
grant execute on function public.create_team_invite(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.inspect_team_invite(text) to authenticated;
grant execute on function public.accept_team_invite(text) to authenticated;

create policy "Members can view their own membership"
  on public.league_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_league_commissioner(league_id))
  );

create policy "Commissioners can view league invites"
  on public.team_invites
  for select
  to authenticated
  using ((select private.is_league_commissioner(league_id)));

comment on table public.league_memberships is
  'League authorization source. Member team assignments can only be created by consuming an invite.';

comment on table public.team_invites is
  'One-time team invitations. Only SHA-256 token hashes are stored.';
