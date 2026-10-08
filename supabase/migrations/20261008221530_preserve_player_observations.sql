-- Player observations may arrive out of season order. Keep the known career
-- range while accepting identity metadata only from the newest observation.

create function public.preserve_player_observation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.last_seen_season < old.last_seen_season
      or (
        new.last_seen_season = old.last_seen_season
        and new.observed_at < old.observed_at
      ) then
      new.display_name := old.display_name;
      new.default_position_id := old.default_position_id;
      new.source := old.source;
      new.source_checksum := old.source_checksum;
      new.observed_at := old.observed_at;
      new.evidence_status := old.evidence_status;
    end if;
    new.first_seen_season := least(old.first_seen_season, new.first_seen_season);
    new.last_seen_season := greatest(old.last_seen_season, new.last_seen_season);
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_player_observation() from public, anon, authenticated;

create trigger preserve_player_observation_before_write
before insert or update on public.players
for each row execute function public.preserve_player_observation();

alter table public.player_data_coverage
  add column lineup_rule_evidence_status text not null default 'unavailable'
    check (lineup_rule_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  add column lineup_slot_counts jsonb;

alter table public.player_week_entries
  add column eligibility_evidence_status text not null default 'unavailable'
    check (eligibility_evidence_status in ('confirmed', 'unverified', 'inferred', 'unavailable')),
  add column eligible_lineup_slot_ids smallint[];

alter table public.player_data_coverage
  add check (
    (lineup_rule_evidence_status = 'confirmed' and lineup_slot_counts is not null)
    or (lineup_rule_evidence_status <> 'confirmed' and lineup_slot_counts is null)
  );

alter table public.player_week_entries
  add check (
    (eligibility_evidence_status in ('confirmed', 'unverified')
      and eligible_lineup_slot_ids is not null)
    or (eligibility_evidence_status not in ('confirmed', 'unverified')
      and eligible_lineup_slot_ids is null)
  );
